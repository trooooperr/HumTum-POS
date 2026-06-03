const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { deleteCache } = require('./redis');

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

function itemKey(item) {
  return (item?.name || '').trim();
}

function aggregateQuantities(items = []) {
  const quantities = new Map();

  for (const item of items) {
    const name = itemKey(item);
    const quantity = Math.abs(Number(item?.quantity) || 0);
    if (!name || quantity <= 0) continue;
    quantities.set(name, (quantities.get(name) || 0) + quantity);
  }

  return quantities;
}

function itemsFromQuantityMap(quantities) {
  return [...quantities.entries()].map(([name, quantity]) => ({ name, quantity }));
}

async function updateMenuAvailability(names) {
  if (!names.length) return;

  const inventoryItems = await Inventory.find({ name: { $in: names } }).select('name stock');
  const ops = inventoryItems.map(item => ({
    updateOne: {
      filter: { name: item.name },
      update: { $set: { available: item.stock > 0 } }
    }
  }));

  if (ops.length) await MenuItem.bulkWrite(ops, { ordered: false });
}

async function getInventorySnapshot() {
  return Inventory.find().sort({ category: 1, name: 1 });
}

async function deductInventoryForItems(items = []) {
  const quantities = aggregateQuantities(items);
  const names = [...quantities.keys()];
  if (!names.length) return getInventorySnapshot();

  const ops = [...quantities.entries()].map(([name, quantity]) => ({
    updateOne: {
      filter: { name },
      update: [
        { $set: { stock: { $max: [0, { $subtract: ['$stock', quantity] }] } } }
      ]
    }
  }));

  await Inventory.bulkWrite(ops, { ordered: false });
  await updateMenuAvailability(names);
  await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
  return getInventorySnapshot();
}

function buildInventoryDelta(finalItems = [], alreadyDeducted = new Map()) {
  const finalQuantities = aggregateQuantities(finalItems);
  const delta = new Map();

  for (const [name, quantity] of finalQuantities.entries()) {
    const remaining = quantity - (alreadyDeducted.get(name) || 0);
    if (remaining > 0) delta.set(name, remaining);
  }

  return itemsFromQuantityMap(delta);
}

function broadcastInventoryUpdate(req, inventory, extra = {}) {
  if (!req.app.locals.io || !inventory) return;
  req.app.locals.io.emit('INVENTORY_UPDATED', {
    inventory,
    ...extra,
    timestamp: new Date()
  });
}

module.exports = {
  aggregateQuantities,
  buildInventoryDelta,
  broadcastInventoryUpdate,
  deductInventoryForItems,
  getInventorySnapshot,
};
