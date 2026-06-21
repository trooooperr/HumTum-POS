const express = require('express');
const MenuItem = require('../models/MenuItem');
const Inventory = require('../models/Inventory');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

const MENU_CACHE_KEY = 'menu:all';
const INVENTORY_CACHE_KEY = 'inventory:all';

// Get all menu items (Staff and above can view menu)
router.get('/', async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1, name: 1 });
    await setCache(MENU_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get all shortcuts
router.get('/shortcuts/all', async (req, res) => {
  try {
    const items = await MenuItem.find({ shortcut: { $ne: '' } }).select('name shortcut category price');
    const shortcuts = items.map(item => ({
      shortcut: item.shortcut,
      name: item.name,
      category: item.category,
      price: item.price,
      id: item._id
    }));
    res.json(shortcuts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get item by shortcut
router.get('/shortcut/:code', async (req, res) => {
  try {
    const item = await MenuItem.findOne({ shortcut: req.params.code.toLowerCase() });
    if (!item) return res.status(404).json({ message: 'Shortcut not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Sync menu from inventory (Admin/Manager only)
router.post('/sync', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const inventory = await Inventory.find();
    for (const inv of inventory) {
      await MenuItem.findOneAndUpdate(
        { name: inv.name },
        {
          name: inv.name,
          category: inv.category,
          price: inv.price,
          available: inv.stock > 0,
          shortcut: inv.shortcut || '',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    await deleteCache([MENU_CACHE_KEY, INVENTORY_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create menu item (Admin/Manager only)
router.post('/', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const data = req.body;
    if (data.shortcut) data.shortcut = data.shortcut.toLowerCase().trim();
    const item = new MenuItem(data);
    const saved = await item.save();
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.status(201).json(saved);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Update menu item (Admin/Manager only)
router.put('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const data = req.body;
    if (data.shortcut) data.shortcut = data.shortcut.toLowerCase().trim();
    const updated = await MenuItem.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Item not found' });
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json(updated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Delete menu item (Admin/Manager only)
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await MenuItem.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
