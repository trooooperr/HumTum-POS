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

async function updateMenuAvailability() {
  const menuItems = await MenuItem.find();
  const inventoryItems = await Inventory.find();
  
  const inventoryById = new Map(inventoryItems.map(i => [i._id.toString(), i]));
  const inventoryByName = new Map(inventoryItems.map(i => [i.name.trim().toLowerCase(), i]));

  const ops = [];
  for (const menuItem of menuItems) {
    let isAvailable = true;

    if (menuItem.trackStock && menuItem.inventoryId) {
      const inv = inventoryById.get(menuItem.inventoryId.toString());
      if (inv && inv.trackStock !== false) {
        isAvailable = inv.stock >= (menuItem.stockDeductionQty || 1);
      }
    } else {
      const inv = inventoryByName.get(menuItem.name.trim().toLowerCase());
      if (inv && inv.trackStock !== false) {
        isAvailable = inv.stock > 0;
      }
    }

    if (menuItem.available !== isAvailable) {
      ops.push({
        updateOne: {
          filter: { _id: menuItem._id },
          update: { $set: { available: isAvailable } }
        }
      });
    }
  }

  if (ops.length) {
    await MenuItem.bulkWrite(ops, { ordered: false });
  }
}

async function getInventorySnapshot() {
  const items = await Inventory.find();
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
}

async function deductInventoryForItems(items = []) {
  const quantities = aggregateQuantities(items);
  const names = [...quantities.keys()];
  if (!names.length) return getInventorySnapshot();

  const menuItems = await MenuItem.find({ name: { $in: names } });
  const menuItemMap = new Map(menuItems.map(m => [m.name.trim().toLowerCase(), m]));

  const linkedInvIds = menuItems
    .filter(m => m.trackStock && m.inventoryId)
    .map(m => m.inventoryId);

  const inventoryItems = await Inventory.find({
    $or: [
      { name: { $in: names } },
      { _id: { $in: linkedInvIds } }
    ]
  });

  const inventoryById = new Map();
  const inventoryByName = new Map();
  for (const inv of inventoryItems) {
    inventoryById.set(inv._id.toString(), inv);
    inventoryByName.set(inv.name.trim().toLowerCase(), inv);
  }

  const ops = [];
  for (const [name, quantity] of quantities.entries()) {
    const menuItem = menuItemMap.get(name.trim().toLowerCase());
    
    if (menuItem && menuItem.trackStock && menuItem.inventoryId) {
      const invIdStr = menuItem.inventoryId.toString();
      const inv = inventoryById.get(invIdStr);
      if (inv && inv.trackStock !== false) {
        const deductQty = quantity * (menuItem.stockDeductionQty || 1);
        ops.push({
          updateOne: {
            filter: { _id: inv._id },
            update: [
              { $set: { stock: { $max: [0, { $subtract: ['$stock', deductQty] }] } } }
            ]
          }
        });
      }
    } else {
      const inv = inventoryByName.get(name.trim().toLowerCase());
      if (inv && inv.trackStock !== false) {
        ops.push({
          updateOne: {
            filter: { _id: inv._id },
            update: [
              { $set: { stock: { $max: [0, { $subtract: ['$stock', quantity] }] } } }
            ]
          }
        });
      }
    }
  }

  if (ops.length) {
    await Inventory.bulkWrite(ops, { ordered: false });
  }
  await updateMenuAvailability();
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
  updateMenuAvailability,
};
