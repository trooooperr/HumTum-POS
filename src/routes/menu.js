const express = require('express');
const MenuItem = require('../models/MenuItem');
const Inventory = require('../models/Inventory');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const router = express.Router();

const MENU_CACHE_KEY = 'menu:all';
const INVENTORY_CACHE_KEY = 'inventory:all';

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const cached = await getCache(MENU_CACHE_KEY);
    if (cached) return res.json(cached);

    const items = await MenuItem.find().sort({ category: 1, name: 1 });
    await setCache(MENU_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Sync menu from inventory (optional endpoint)
router.post('/sync', async (req, res) => {
  try {
    const inventory = await Inventory.find();
    for (const inv of inventory) {
      await MenuItem.findOneAndUpdate(
        { name: inv.name },
        {
          name: inv.name,
          category: inv.category,
          price: inv.sellingPrice || inv.costPrice,
          available: inv.stock > 0,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    await deleteCache([MENU_CACHE_KEY, INVENTORY_CACHE_KEY]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const item = new MenuItem(req.body);
    const saved = await item.save();
    await deleteCache(MENU_CACHE_KEY);
    res.status(201).json(saved);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await MenuItem.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Item not found' });
    await deleteCache(MENU_CACHE_KEY);
    res.json(updated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await MenuItem.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache(MENU_CACHE_KEY);
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
