const express = require('express');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { updateMenuAvailability } = require('../lib/inventoryStock');
const router = express.Router();

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

const sortInventoryItems = async (items) => {
  const Settings = require('../models/Settings');
  const settings = await Settings.findOne();
  const inventoryCategories = settings ? (settings.inventoryCategories || []) : [];
  
  items.sort((a, b) => {
    const catAIndex = inventoryCategories.indexOf(a.category);
    const catBIndex = inventoryCategories.indexOf(b.category);
    
    const indexA = catAIndex === -1 ? 999999 : catAIndex;
    const indexB = catBIndex === -1 ? 999999 : catBIndex;
    
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    return a.name.localeCompare(b.name);
  });
  return items;
};

// GET ALL INVENTORY ITEMS (Allowed for all authenticated staff)
router.get('/', async (req, res) => {
  try {
    const rawItems = await Inventory.find();
    const items = await sortInventoryItems(rawItems);
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
      const { name, category, unit, stock, minStock, price, isAlcoholic, trackStock } = req.body;
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
        isAlcohol: !!isAlcoholic,
        trackStock: trackStock !== false
      });
      const savedInv = await invItem.save();
      await MenuItem.findOneAndUpdate(
        { name },
        { name, category, price, available: trackStock === false ? true : (stock > 0), shortcut, department: 'bar' },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInvRaw = await Inventory.find();
        const allInv = await sortInventoryItems(allInvRaw);
        req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
      }
      res.status(201).json(savedInv);
    } catch (err) {
      console.error('INVENTORY CREATE ERROR:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// Reorder inventory items (Admin/Manager only)
router.put('/reorder', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: 'orderedIds array is required' });
    }
    const bulkOps = orderedIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map((id, index) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { order: index } }
        }
      }));
    if (bulkOps.length > 0) {
      await Inventory.bulkWrite(bulkOps);
    }
    await deleteCache(INVENTORY_CACHE_KEY);
    if (req.app.locals.io) {
      const allInvRaw = await Inventory.find();
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
          available: updated.trackStock === false ? true : (updated.stock > 0),
          shortcut: (updated.shortcut || '').toLowerCase().trim(),
          department: 'bar',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInvRaw = await Inventory.find();
        const allInv = await sortInventoryItems(allInvRaw);
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
    await updateMenuAvailability();
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      const allInvRaw = await Inventory.find();
      const allInv = await sortInventoryItems(allInvRaw);
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
      const allInvRaw = await Inventory.find();
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
