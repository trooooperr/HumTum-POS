const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  category:  { type: String, required: true },
  price:     { type: Number, required: true },
  available: { type: Boolean, default: true },
  imageUrl:  { type: String, default: '' },
  department: { type: String, default: 'kitchen', enum: ['kitchen', 'bar', 'dessert', 'other'] },
  shortcut:  { type: String, default: '', lowercase: true, trim: true },
}, { timestamps: true });

// Create a unique index only for non-empty shortcuts
menuItemSchema.index({ shortcut: 1 }, { unique: true, sparse: true, partialFilterExpression: { shortcut: { $ne: '' } } });

module.exports = mongoose.model('MenuItem', menuItemSchema);
