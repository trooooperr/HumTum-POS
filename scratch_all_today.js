const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected to Database.');

  // Find all orders for businessDate '2026-07-06'
  const orders = await Order.find({ businessDate: '2026-07-06' }).sort({ date: 1 });
  console.log('--- All Orders for 2026-07-06 ---');
  for (const o of orders) {
    console.log({
      _id: o._id,
      billNo: o.billNo,
      tableNo: o.tableNo,
      customerName: o.customerName,
      grandTotal: o.grandTotal,
      businessDate: o.businessDate,
      date: o.date,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      isActive: o.isActive,
      orderStatus: o.orderStatus
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
