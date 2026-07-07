const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected.');

  // Find all completed/paid orders since July 1st
  const orders = await Order.find({
    isActive: false,
    billNo: { $regex: /^HTB-\d+$/ }
  }).sort({ date: 1 });

  console.log('--- Order History Timeline ---');
  for (const o of orders) {
    console.log({
      billNo: o.billNo,
      customer: o.customerName.trim() || '(No Name)',
      grandTotal: o.grandTotal,
      businessDate: o.businessDate,
      dateUTC: o.date.toISOString(),
      createdAtUTC: o.createdAt.toISOString(),
      updatedAtUTC: o.updatedAt.toISOString(),
      status: o.orderStatus
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
