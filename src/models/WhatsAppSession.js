const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

// Add index on key for faster lookups
whatsappSessionSchema.index({ key: 1 });

module.exports = mongoose.model('WhatsAppSession', whatsappSessionSchema);
