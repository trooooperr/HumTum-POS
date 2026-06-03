const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: { type: String,required: true,unique: true,trim: true,index: true },
  category: { type: String, required: true, index: true },
  unit: { type: String, required: true },
  stock: { type: Number, required: true, default: 0, min: 0 },
  minStock: { type: Number, required: true, default: 5, min: 0 },
  price: { type: Number, required: true, default: 0, min: 0 },
  shortcut: { type: String, default: '', lowercase: true, trim: true }
},{ timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);
