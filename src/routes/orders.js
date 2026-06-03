const express = require('express');
const Order = require('../models/Order');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const router = express.Router();
const ORDERS_CACHE_KEY = 'orders:all';
const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';
const TableSession = require('../models/TableSession');
const KOT = require('../models/KOT');
const {
  aggregateQuantities,
  broadcastInventoryUpdate,
  buildInventoryDelta,
  deductInventoryForItems,
} = require('../lib/inventoryStock');

// Helper to get the 3 AM boundary for the current business day
function getBusinessDayBoundary() {
  const now = new Date();
  const boundary = new Date(now);
  boundary.setHours(3, 0, 0, 0);
  if (now.getHours() < 3) {
    boundary.setDate(boundary.getDate() - 1);
  }
  return boundary;
}

// Generate new Bill No based on boundary
async function generateNextBillNo() {
  const boundary = getBusinessDayBoundary();
  const latestOrder = await Order.findOne({ createdAt: { $gte: boundary } })
    .sort({ createdAt: -1 })
    .select('billNo');
    
  let nextNumber = 1;
  if (latestOrder && latestOrder.billNo) {
    const match = latestOrder.billNo.match(/HTB-(\d+)/);
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }
  return `HTB-${nextNumber.toString().padStart(3, '0')}`;
}

router.get('/', async (req, res) => {
  try {
    const cached = await getCache(ORDERS_CACHE_KEY);
    if (cached) return res.json(cached);

    const orders = await Order.find().sort({ date: -1 });
    await setCache(ORDERS_CACHE_KEY, orders, 180);
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('kotIds');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── OPEN TABLE SESSION ──────────────────────────────────────────
router.post('/table/:tableNo/open', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const { waiterName, orderType } = req.body;
    
    // Check if table is already open
    const existingSession = await TableSession.findOne({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } }).populate('activeOrderId');
    if (existingSession) {
      return res.status(200).json(existingSession);
    }

    // Clean up any old completed sessions for this table to prevent Duplicate Key errors
    await TableSession.deleteMany({ tableNo: parseInt(tableNo), status: 'COMPLETED' });

    // Generate sequential bill number based on daily 3 AM boundary
    const billNo = await generateNextBillNo();

    // Create initial order
    const order = new Order({
      billNo,
      tableNo: parseInt(tableNo),
      items: [],
      subtotal: 0,
      sgst: 0,
      cgst: 0,
      discount: 0,
      roundOff: 0,
      grandTotal: 0,
      paidAmount: 0,
      dueAmount: 0,
      paymentMode: 'cash',
      orderStatus: 'OPEN',
      isActive: true,
      date: new Date(),
      waiterName: waiterName || '',
      orderType: orderType || 'dine-in'
    });
    const savedOrder = await order.save();

    // Create new session
    const session = new TableSession({
      tableNo: parseInt(tableNo),
      activeOrderId: savedOrder._id,
      status: 'OPEN',
      openedAt: new Date(),
      lastActivityAt: new Date(),
      waiterName: waiterName || '',
      orderType: orderType || 'dine-in'
    });

    const savedSession = await session.save();
    const sessionObj = savedSession.toObject();
    sessionObj.activeOrderId = savedOrder.toObject();
    
    res.status(201).json(sessionObj);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── GET ALL ACTIVE SESSIONS ─────────────────────────────────────
router.get('/sessions/active', async (req, res) => {
  try {
    const sessions = await TableSession.find({ status: { $ne: 'COMPLETED' } })
      .populate('kotIds')
      .populate('activeOrderId');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET TABLE SESSION ───────────────────────────────────────────
router.get('/table/:tableNo/session', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const session = await TableSession.findOne({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } })
      .populate('kotIds')
      .populate('activeOrderId');
    
    if (!session) return res.status(404).json({ message: 'No active session' });
    res.json(session);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── UPDATE TABLE SESSION (Sync pending items) ──────────────────
router.put('/table/:tableNo/session', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const { pendingItems, totalAmount, waiterName, orderType } = req.body;
    
    const session = await TableSession.findOneAndUpdate(
      { tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } },
      { 
        $set: { 
          pendingItems: pendingItems || [],
          totalAmount: totalAmount || 0,
          waiterName: waiterName || '',
          orderType: orderType || 'dine-in',
          lastActivityAt: new Date()
        } 
      },
      { new: true }
    ).populate('activeOrderId').populate('kotIds');
    
    if (!session) return res.status(404).json({ message: 'No active session found for this table' });
    res.json(session);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── CREATE ORDER (called when opening table) ────────────────────
router.post('/', async (req, res) => {
  try {
    const orderData = req.body;

    // Generate sequential bill number based on daily 3 AM boundary
    orderData.billNo = await generateNextBillNo();
    
    const isDirectOrder = Array.isArray(orderData.items) && orderData.items.length > 0;

    // New KOT workflow: don't deduct inventory yet, only create order if items empty
    const order = new Order({
      ...orderData,
      orderStatus: orderData.orderStatus || (isDirectOrder ? (orderData.dueAmount === 0 ? 'COMPLETED' : 'OPEN') : 'OPEN'),
      isActive: true,
      items: orderData.items || [],
      inventoryFinalized: isDirectOrder,
      ...(isDirectOrder && { inventoryFinalizedAt: new Date() })
    });
    const saved = await order.save();

    let directOrderInventory = null;
    if (isDirectOrder) {
      try {
        directOrderInventory = await deductInventoryForItems(orderData.items);
        broadcastInventoryUpdate(req, directOrderInventory, {
          orderId: saved._id,
          source: 'DIRECT_ORDER'
        });
      } catch (bulkErr) {
        console.error('Inventory bulk update error in POST /:', bulkErr.message);
      }
    }

    // Create/update table session
    await TableSession.findOneAndUpdate(
      { tableNo: orderData.tableNo },
      {
        $set: { 
          status: isDirectOrder && orderData.dueAmount === 0 ? 'COMPLETED' : 'OPEN', 
          activeOrderId: saved._id,
          lastActivityAt: new Date(),
          totalAmount: orderData.grandTotal || 0
        }
      },
      { upsert: true, new: true }
    );

    const response = saved.toObject();
    if (directOrderInventory) response.inventory = directOrderInventory;
    res.status(201).json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── FINALIZE BILL (called when printing final bill) ─────────────
router.patch('/:id/finalize-bill', async (req, res) => {
  try {
    const { items, subtotal, sgst, cgst, discount, roundOff, grandTotal, waiterName, orderType, customerName, customerPhone } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Update order with final calculations (combine all KOT items)
    order.items = items;
    order.subtotal = subtotal;
    order.sgst = sgst;
    order.cgst = cgst;
    order.discount = discount;
    order.roundOff = roundOff;
    order.grandTotal = grandTotal;
    order.orderStatus = 'COMPLETED';
    order.isActive = false;
    if (waiterName !== undefined) order.waiterName = waiterName;
    if (orderType !== undefined) order.orderType = orderType;
    if (customerName !== undefined) order.customerName = customerName;
    if (customerPhone !== undefined) order.customerPhone = customerPhone;

    const saved = await order.save();

    let updatedInventory = null;

    if (!order.inventoryFinalized && Array.isArray(items) && items.length > 0) {
      try {
        const deductedKots = await KOT.find({
          orderId: order._id,
          inventoryDeducted: true
        }).select('items');
        const alreadyDeducted = aggregateQuantities(deductedKots.flatMap(kot => kot.items || []));
        const deltaItems = buildInventoryDelta(items, alreadyDeducted);

        if (deltaItems.length > 0) {
          updatedInventory = await deductInventoryForItems(deltaItems);
          broadcastInventoryUpdate(req, updatedInventory, {
            orderId: req.params.id,
            source: 'FINAL_BILL'
          });
        }

        order.inventoryFinalized = true;
        order.inventoryFinalizedAt = new Date();
        await order.save();
      } catch (bulkErr) {
        console.error('Inventory finalization error:', bulkErr.message);
      }
    }

    const response = saved.toObject();
    if (updatedInventory) response.inventory = updatedInventory;
    response.inventoryFinalized = order.inventoryFinalized;
    response.inventoryFinalizedAt = order.inventoryFinalizedAt;
    res.json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET FULL ORDER HISTORY (including completed) ────────────────────
router.get('/history/all', async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ date: -1 }).populate('kotIds');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SETTLE PAYMENT (old flow preserved for compatibility) ───────
router.patch('/:id/settle', async (req, res) => {
  try {
    const { paidAmount, paymentMode } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (paidAmount !== undefined) {
      order.paidAmount = (order.paidAmount || 0) + parseFloat(paidAmount || 0);
      order.dueAmount  = Math.max(0, order.grandTotal - order.paidAmount);
    }
    
    if (paymentMode) {
      order.paymentMode = paymentMode;
    }
    
    // Mark order as paid when full payment received
    if (order.dueAmount <= 0) {
      order.orderStatus = 'PAID';
      order.isActive = false;
    }
    
    const saved = await order.save();

    // Update table session
    await TableSession.findOneAndUpdate(
      { tableNo: order.tableNo },
      { 
        $set: { 
          paymentReceived: true, 
          status: 'PAID',
          lastActivityAt: new Date()
        }
      }
    );

    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json(saved);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── COMPLETE ORDER & CLEAR TABLE ────────────────────────────────
router.patch('/:id/complete', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Mark order as completed
    order.orderStatus = 'COMPLETED';
    order.isActive = false;
    const saved = await order.save();

    // Mark table session as completed and delete it to free the table index
    await TableSession.findOneAndDelete({ tableNo: order.tableNo });

    res.json(saved);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET ACTIVE ORDERS ───────────────────────────────────────────
router.get('/active/all', async (req, res) => {
  try {
    const orders = await Order.find({ isActive: true }).sort({ date: -1 }).populate('kotIds');
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await Order.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Order not found' });
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'Order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── ADMIN: Reset all bills and counters ──────────────────────────────────────
router.post('/admin/reset-bills', async (req, res) => {
  try {
    // Delete all orders
    await Order.deleteMany({});
    // Clear Redis bill counters
    const redis = require('../lib/redis');
    const client = await redis.connectRedis();
    if (client) {
      const keys = await client.keys('bill_counter:*');
      for (const key of keys) await client.del(key);
    }
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'All bills and counters have been reset.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
