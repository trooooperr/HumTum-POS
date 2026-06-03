const mongoose = require('mongoose');

const tableSessionSchema = new mongoose.Schema({
  tableNo:      { type: Number, required: true, index: true },
  activeOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  status:       {
    type: String,
    enum: ['OPEN', 'KOT_SENT', 'PREPARING', 'READY', 'BILLING', 'PAID', 'COMPLETED'],
    default: 'OPEN',
    index: true
  },
  kotIds:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'KOT' }], // All KOTs for this session
  openedAt:     { type: Date, default: Date.now, index: true },
  lastActivityAt: { type: Date, default: Date.now },
  paymentReceived: { type: Boolean, default: false },
  totalAmount:  { type: Number, default: 0 },
  waiterName:    { type: String, default: '' },
  orderType:     { type: String, enum: ['dine-in', 'takeaway', 'delivery'], default: 'dine-in' },
  // Store items added during session for atomicity
  pendingItems: [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name:       { type: String },
    quantity:   { type: Number },
    price:      { type: Number },
    department: { type: String, default: 'kitchen' },
    notes:      { type: String, default: '' }
  }],
}, { timestamps: true });

tableSessionSchema.index({ tableNo: 1, status: 1 });

module.exports = mongoose.model('TableSession', tableSessionSchema);
