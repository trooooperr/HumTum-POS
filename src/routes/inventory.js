const express = require('express');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

// GET ALL INVENTORY ITEMS (Allowed for all authenticated staff)
router.get('/', async (req, res) => {
  try {
    const items = await Inventory.find().sort({ category: 1, name: 1 });
    await setCache(INVENTORY_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) {
    console.error('INVENTORY GET ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET SINGLE INVENTORY ITEM (Allowed for all authenticated staff)
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE INVENTORY ITEM (Admin/Manager only)
router.post(
  '/',
  requireRole(['admin', 'manager']),
  // Validation middleware
  (req, res, next) => {
    const { name, category, unit, stock, minStock, price } = req.body;
    if (!name || !category || !unit) {
      return res.status(400).json({ message: 'Name, category, and unit are required.' });
    }
    if (price == null || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ message: 'Price must be a non‑negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
      const { name, category, unit, stock, minStock, price, isAlcoholic } = req.body;
      const shortcut = (req.body.shortcut || '').toLowerCase().trim();
      const invItem = new Inventory({
        name,
        category,
        unit,
        stock,
        minStock,
        price,
        shortcut,
        isAlcoholic: !!isAlcoholic,
        isAlcohol: !!isAlcoholic
      });
      const savedInv = await invItem.save();
      await MenuItem.findOneAndUpdate(
        { name },
        { name, category, price, available: stock > 0, shortcut },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInv = await Inventory.find().sort({ category: 1, name: 1 });
        req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
      }
      res.status(201).json(savedInv);
    } catch (err) {
      console.error('INVENTORY CREATE ERROR:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// UPDATE INVENTORY ITEM (Admin/Manager only)
router.put(
  '/:id',
  requireRole(['admin', 'manager']),
  // Validation middleware for price
  (req, res, next) => {
    const { price } = req.body;
    if (price != null && (isNaN(price) || Number(price) < 0)) {
      return res.status(400).json({ message: 'Price must be a non‑negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
      if (req.body.isAlcoholic !== undefined) {
        req.body.isAlcoholic = !!req.body.isAlcoholic;
        req.body.isAlcohol = !!req.body.isAlcoholic;
      }
      const updated = await Inventory.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ message: 'Item not found' });
      await MenuItem.findOneAndUpdate(
        { name: updated.name },
        {
          name: updated.name,
          category: updated.category,
          price: updated.price,
          available: updated.stock > 0,
          shortcut: (updated.shortcut || '').toLowerCase().trim(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInv = await Inventory.find().sort({ category: 1, name: 1 });
        req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
      }
      res.json(updated);
    } catch (err) {
      console.error('INVENTORY UPDATE ERROR:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// UPDATE INVENTORY STOCK (Admin/Manager only)
router.patch('/:id/stock', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { quantityChange } = req.body;
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    item.stock = Math.max(0, item.stock + quantityChange);
    const updated = await item.save();
    // Sync menu item availability
    await MenuItem.findOneAndUpdate(
      { name: item.name },
      { available: updated.stock > 0 }
    );
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      const allInv = await Inventory.find().sort({ category: 1, name: 1 });
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json(updated);
  } catch (err) {
    console.error('INVENTORY STOCK UPDATE ERROR:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// DELETE INVENTORY ITEM (Admin/Manager only)
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await Inventory.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      const allInv = await Inventory.find().sort({ category: 1, name: 1 });
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
