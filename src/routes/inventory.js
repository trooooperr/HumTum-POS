const express = require('express');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const router = express.Router();

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

// GET ALL INVENTORY ITEMS
router.get('/', async (req, res) => {
  try {
    const cached = await getCache(INVENTORY_CACHE_KEY);
    if (cached) return res.json(cached);

    const items = await Inventory.find().sort({ category: 1, name: 1 });
    await setCache(INVENTORY_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) {
    console.error('INVENTORY GET ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET SINGLE INVENTORY ITEM
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE INVENTORY ITEM (auto-create menu item)
router.post('/', async (req, res) => {
  try {
    const { name, category, unit, stock, minStock, price } = req.body;
    // Create inventory item
    const invItem = new Inventory({
      name,
      category,
      unit,
      stock,
      minStock,
      price
    });
    const savedInv = await invItem.save();
    // Upsert menu item
    await MenuItem.findOneAndUpdate(
      { name },
      {
        name,
        category,
        price,
        available: stock > 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    res.status(201).json(savedInv);
  } catch (err) {
    console.error('INVENTORY CREATE ERROR:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// UPDATE INVENTORY ITEM
router.put('/:id', async (req, res) => {
  try {
    const updated = await Inventory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: 'Item not found' });
    // Also update menu item
    await MenuItem.findOneAndUpdate(
      { name: updated.name },
      {
        name: updated.name,
        category: updated.category,
        price: updated.price,
        available: updated.stock > 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    res.json(updated);
  } catch (err) {
    console.error('INVENTORY UPDATE ERROR:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// UPDATE INVENTORY STOCK (for bill operations)
router.patch('/:id/stock', async (req, res) => {
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
    res.json(updated);
  } catch (err) {
    console.error('INVENTORY STOCK UPDATE ERROR:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// DELETE INVENTORY ITEM
router.delete('/:id', async (req, res) => {
  try {
    const result = await Inventory.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
