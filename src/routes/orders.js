const express = require('express');
const Order = require('../models/Order');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const router = express.Router();
const ORDERS_CACHE_KEY = 'orders:all';
const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';
const TableSession = require('../models/TableSession');
const KOT = require('../models/KOT');
const { getBusinessDayBoundary, getISTHour } = require('../lib/businessDay');
const {
  aggregateQuantities,
  broadcastInventoryUpdate,
  buildInventoryDelta,
  deductInventoryForItems,
} = require('../lib/inventoryStock');


// Shift date to the previous business day if IST time is before 5 AM
function getBusinessDate(originalDate = new Date()) {
  const d = new Date(originalDate);
  const istHour = getISTHour(d);
  if (istHour < 5) {
    d.setDate(d.getDate() - 1);
  }
  return d;
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

    const orders = await Order.find({
      grandTotal: { $gt: 0 }
    }).sort({ date: -1 });
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
    
    // Check if table is already open, heal duplicate/orphaned sessions
    const activeSessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } }).populate('activeOrderId');
    let existingSession = null;
    for (const session of activeSessions) {
      if (!session.activeOrderId || !session.activeOrderId.isActive) {
        // Clean up orphaned or inactive session
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!existingSession) {
          existingSession = session;
        } else {
          // Clean up duplicate session
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }

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
      date: getBusinessDate(),
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
    const sessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } })
      .populate('kotIds')
      .populate('activeOrderId');
    
    let activeSession = null;
    for (const session of sessions) {
      if (!session.activeOrderId || !session.activeOrderId.isActive) {
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!activeSession) {
          activeSession = session;
        } else {
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }
    
    if (!activeSession) {
      // Return 200 instead of 404 to prevent harmless frontend network errors
      return res.status(200).json({ message: 'No active session' });
    }
    
    res.json(activeSession);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── UPDATE TABLE SESSION (Sync pending items) ──────────────────
router.put('/table/:tableNo/session', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const { pendingItems, totalAmount, waiterName, orderType } = req.body;
    
    const sessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } });
    let activeSession = null;
    for (const session of sessions) {
      if (!session.activeOrderId) {
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!activeSession) {
          activeSession = session;
        } else {
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }
    
    if (!activeSession) {
      // Return 200 instead of 404 to prevent harmless frontend network errors during checkout race conditions
      return res.status(200).json({ message: 'No active session found (likely completed)' });
    }

    const session = await TableSession.findByIdAndUpdate(
      activeSession._id,
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
    
    res.json(session);
  } catch (err) { 
    console.error('Update Table Session Error:', err);
    res.status(400).json({ message: err.message }); 
  }
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
      date: getBusinessDate(orderData.date ? new Date(orderData.date) : new Date()),
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
    if (orderData.tableNo) {
      await TableSession.findOneAndUpdate(
        { tableNo: orderData.tableNo, status: { $ne: 'COMPLETED' } },
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
    }

    const response = saved.toObject();
    if (directOrderInventory) response.inventory = directOrderInventory;
    res.status(201).json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── FINALIZE BILL (called when printing final bill) ─────────────
router.patch('/:id/finalize-bill', async (req, res) => {
  try {
    const { items, subtotal, sgst, cgst, discount, roundOff, grandTotal, waiterName, orderType, customerName, customerPhone, paymentMode, cashAmount, upiAmount } = req.body;

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
    if (paymentMode !== undefined) order.paymentMode = paymentMode;
    if (cashAmount !== undefined) order.cashAmount = parseFloat(cashAmount) || 0;
    if (upiAmount !== undefined) order.upiAmount = parseFloat(upiAmount) || 0;

    const saved = await order.save();

    let updatedInventory = null;

    if (!order.inventoryFinalized && Array.isArray(items) && items.length > 0) {
      try {
        const deductedKots = await KOT.find({
          orderId: order._id,
          tableNo: order.tableNo,
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
    await TableSession.findOneAndDelete({ activeOrderId: order._id });
    res.json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET FULL ORDER HISTORY (including completed) ────────────────────
router.get('/history/all', async (req, res) => {
  try {
    const orders = await Order.find({ isActive: false, grandTotal: { $gt: 0 } }).sort({ date: -1 }).populate('kotIds');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SETTLE PAYMENT (old flow preserved for compatibility) ───────
router.patch('/:id/settle', async (req, res) => {
  try {
    const { paidAmount, paymentMode, cashAmount, upiAmount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (paidAmount !== undefined) {
      order.paidAmount = (order.paidAmount || 0) + parseFloat(paidAmount || 0);
      order.dueAmount  = Math.max(0, order.grandTotal - order.paidAmount);
    }
    
    if (paymentMode) {
      order.paymentMode = paymentMode;
    }
    if (cashAmount !== undefined) order.cashAmount = parseFloat(cashAmount) || 0;
    if (upiAmount !== undefined) order.upiAmount = parseFloat(upiAmount) || 0;
    
    // Mark order as paid when full payment received
    if (order.dueAmount <= 0) {
      order.orderStatus = 'PAID';
      order.isActive = false;
    }
    
    const saved = await order.save();

    // Update table session
    await TableSession.findOneAndUpdate(
      { activeOrderId: order._id },
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
    await TableSession.findOneAndDelete({ activeOrderId: order._id });

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

router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await Order.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Order not found' });
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'Order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── CANCEL TABLE SESSION (CLR – wipe table without saving to history) ───
router.delete('/table/:tableNo/cancel', async (req, res) => {
  try {
    const tableNo = parseInt(req.params.tableNo);

    // Find the active session for this table
    const sessions = await TableSession.find({ tableNo, status: { $ne: 'COMPLETED' } });

    for (const session of sessions) {
      const orderId = session.activeOrderId;

      // Delete all KOTs linked to this order
      if (orderId) {
        await KOT.deleteMany({ orderId });
        // Delete the order itself (no history kept)
        await Order.findByIdAndDelete(orderId);
      }

      // Delete the session
      await TableSession.findByIdAndDelete(session._id);
    }

    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ success: true, message: `Table ${tableNo} cleared` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Reset all bills and counters ─────────────────────────
router.post('/admin/reset-bills', requireRole(['admin']), async (req, res) => {
  try {
    await Order.deleteMany({});
    // Invalidate all relevant cache keys
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'All bills and counters have been reset.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
