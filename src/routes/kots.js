const express = require('express');
const router = express.Router();
const KOT = require('../models/KOT');
const Order = require('../models/Order');
const TableSession = require('../models/TableSession');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const {
  broadcastInventoryUpdate,
  deductInventoryForItems,
} = require('../lib/inventoryStock');

// ── GENERATE KOT NUMBER ─────────────────────────────────────────
async function generateKOTNo() {
  const redis = require('../lib/redis');
  const { getBusinessDayBoundary } = require('../lib/businessDay');
  const boundary = getBusinessDayBoundary();

  // Format business day date string, e.g. "2026-06-09"
  const yyyy = boundary.getFullYear();
  const mm = String(boundary.getMonth() + 1).padStart(2, '0');
  const dd = String(boundary.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const kotCounterKey = `kot_seq:${dateStr}`;
  try {
    const client = await redis.connectRedis();
    if (client) {
      let count = await client.incr(kotCounterKey);
      if (count === 1) {
        await client.expire(kotCounterKey, 172800); // 48 hours expiration
        // Sync with DB in case Redis was flushed or restarted
        const latestKOT = await KOT.findOne({ createdAt: { $gte: boundary } }).sort({ createdAt: -1 });
        if (latestKOT && latestKOT.kotNo) {
          const parts = latestKOT.kotNo.split('-');
          if (parts.length === 2) {
            const dbCount = parseInt(parts[1], 10);
            if (dbCount >= 1) {
              await client.set(kotCounterKey, dbCount + 1);
              count = dbCount + 1;
            }
          }
        }
      }
      return `KOT-${count.toString().padStart(3, '0')}`;
    }
  } catch (err) {
    console.error('Redis KOT counter error:', err.message);
  }

  // Fallback: Find the latest KOT for today and increment its number
  const latestKOT = await KOT.findOne({ createdAt: { $gte: boundary } }).sort({ createdAt: -1 });
  let nextCount = 1;
  if (latestKOT && latestKOT.kotNo) {
    const parts = latestKOT.kotNo.split('-');
    if (parts.length === 2) {
      nextCount = parseInt(parts[1], 10) + 1;
    }
  }
  return `KOT-${nextCount.toString().padStart(3, '0')}`;
}

// ── GET ALL KOTs FOR A TABLE ────────────────────────────────────
router.get('/table/:tableNo', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const kots = await KOT.find({ tableNo: parseInt(tableNo) }).sort({ createdAt: -1 });
    res.json(kots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET KOT BY ID ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const kot = await KOT.findById(req.params.id).populate('orderId').populate('items.menuItemId');
    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    res.json(kot);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CREATE NEW KOT ──────────────────────────────────────────────
// Called when adding items and printing first KOT
router.post('/', async (req, res) => {
  try {
    const { orderId, tableNo, items, notes, waiterName, orderType } = req.body;
    
    // Validate order exists and is for this table
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.tableNo !== tableNo) return res.status(400).json({ message: 'Table mismatch' });

    // Generate KOT number
    const kotNo = await generateKOTNo();

    // Group items by department — trust the department sent from the frontend.
    // Only fall back to MenuItem lookup if no department was provided.
    const departmentQueues = {};
    for (const item of items) {
      let dept = item.department; // Use what the client sent
      if (!dept) {
        // Fallback: look up the menu item
        const menuItem = await MenuItem.findById(item.menuItemId).catch(() => null);
        dept = menuItem?.department || 'kitchen';
      }
      // Ensure the item carries the resolved department forward
      item.department = dept;
      departmentQueues[dept] = 'PENDING';
    }

    // Create KOT
    const kot = new KOT({
      kotNo,
      orderId,
      tableNo,
      items,
      notes: notes || '',
      waiterName: waiterName || order.waiterName || '',
      orderType: orderType || order.orderType || 'dine-in',
      departmentQueues,
      status: 'PENDING'
    });

    const saved = await kot.save();

    let updatedInventory = null;
    try {
      updatedInventory = await deductInventoryForItems(items);
      saved.inventoryDeducted = true;
      saved.inventoryDeductedAt = new Date();
      await saved.save();
      broadcastInventoryUpdate(req, updatedInventory, {
        orderId,
        kotId: saved._id,
        source: 'KOT'
      });
    } catch (inventoryErr) {
      console.error('Inventory deduction error in POST /api/kots:', inventoryErr.message);
    }

    // Add KOT to order
    await Order.findByIdAndUpdate(orderId, {
      $push: { kotIds: saved._id },
      orderStatus: 'KOT_SENT'
    });

    // Update or create table session
    await TableSession.findOneAndUpdate(
      { activeOrderId: orderId },
      {
        $set: { status: 'KOT_SENT', lastActivityAt: new Date(), totalAmount: order.grandTotal },
        $push: { kotIds: saved._id }
      },
      { upsert: true, new: true }
    );

    const response = saved.toObject();
    if (updatedInventory) response.inventory = updatedInventory;
    res.status(201).json(response);
    
    // Invalidate cache
    await deleteCache([`kots:table:${tableNo}`, `order:${orderId}`]);
  } catch (err) {
    console.error("POST /api/kots Error:", err);
    res.status(400).json({ message: err.message });
  }
});

// ── UPDATE KOT STATUS ──────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const kot = await KOT.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(status === 'PREPARING' && { startedAt: new Date() }),
        ...(status === 'READY' && { readyAt: new Date() }),
        ...(status === 'SERVED' && { servedAt: new Date() }),
        ...(status === 'COMPLETED' && { completedAt: new Date() })
      },
      { new: true }
    );

    if (!kot) return res.status(404).json({ message: 'KOT not found' });

    res.json(kot);
    
    // Invalidate cache
    await deleteCache([`kots:table:${kot.tableNo}`]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── UPDATE KOT DEPARTMENT QUEUE STATUS ──────────────────────────
router.patch('/:id/department/:dept', async (req, res) => {
  try {
    const { status } = req.body;
    const { id, dept } = req.params;
    
    const kot = await KOT.findById(id);
    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    
    if (!kot.departmentQueues) kot.departmentQueues = new Map();
    kot.departmentQueues.set(dept, status);
    
    await kot.save();
    res.json(kot);
    
    await deleteCache([`kots:table:${kot.tableNo}`]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── INCREMENT PRINT COUNT ──────────────────────────────────────
router.patch('/:id/print', async (req, res) => {
  try {
    const kot = await KOT.findByIdAndUpdate(
      req.params.id,
      { $inc: { printCount: 1 } },
      { new: true }
    );

    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    res.json(kot);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── GET KITCHEN DISPLAY (Full KOT History for Today) ─────────────
router.get('/kitchen/display', async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now);
    if (start.getHours() < 10) start.setDate(start.getDate() - 1);
    start.setHours(10, 0, 0, 0);

    const kots = await KOT.find({ createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .populate('items.menuItemId');
    
    res.json(kots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
