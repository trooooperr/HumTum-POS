const mongoose = require('mongoose');

const inventoryDailyReportSchema = new mongoose.Schema({
  businessDate: { type: String, required: true, index: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: { type: String, required: true },
  category: { type: String, required: true },
  unit: { type: String, required: true },
  openingStock: { type: Number, default: 0 },
  addedStock: { type: Number, default: 0 }, // Manual additions/adjustments
  soldStock: { type: Number, default: 0 },   // Deductions from sales (stored as positive number)
  closingStock: { type: Number, default: 0 },
  isAlcoholic: { type: Boolean, default: false }
}, { timestamps: true });

inventoryDailyReportSchema.index({ businessDate: 1, inventoryId: 1 }, { unique: true });

module.exports = mongoose.model('InventoryDailyReport', inventoryDailyReportSchema);
