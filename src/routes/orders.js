const express = require('express');
const Order = require('../models/Order');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const router = express.Router();
const ORDERS_CACHE_KEY = 'orders:all';
const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';

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
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});
const Inventory = require('../models/Inventory');

router.post('/', async (req, res) => {
  try {
    const orderData = req.body;

    // Automatic Bill Number Generation (10 AM Business Day Boundary)
    const now = new Date();
    const operationalDate = new Date(now);
    // If before 10 AM, it's part of the previous operational day
    if (now.getHours() < 10) {
      operationalDate.setDate(operationalDate.getDate() - 1);
    }

    // Bounds for operational day count (10 AM to 10 AM)
    const start = new Date(operationalDate);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // --- ATOMIC BILL NUMBER GENERATION (Redis-based for concurrency safety) ---
    const dateStr = operationalDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const redisCounterKey = `bill_counter:${dateStr}`;
    
    // Increment atomically and get the new count
    const count = await (async () => {
      const redis = require('../lib/redis');
      const client = await redis.connectRedis();
      if (!client) {
        // Fallback to DB count if Redis is down (less safe but preserves uptime)
        return await Order.countDocuments({ date: { $gte: start, $lt: end } }) + 1;
      }
      return await client.incr(redisCounterKey);
    })();
    
    // Format: HTB-001
    orderData.billNo = `${count.toString().padStart(3, '0')}`;

    const order = new Order(orderData);
    const saved = await order.save();

    // --- ATOMIC INVENTORY UPDATE (Bulk write for performance) ---
    if (Array.isArray(order.items) && order.items.length > 0) {
      const bulkOps = order.items.map(item => ({
        updateOne: {
          filter: { name: item.name },
          update: { $inc: { stock: -Math.abs(item.quantity) } }
        }
      }));

      try {
        await Inventory.bulkWrite(bulkOps, { ordered: false });
      } catch (bulkErr) {
        console.error('Inventory bulk update error:', bulkErr.message);
        // We continue anyway as the order is already saved
      }
    }

    res.status(201).json(saved);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(400).json({ message: err.message }); }
});
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
    
    const saved = await order.save();
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json(saved);
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

module.exports = router;
