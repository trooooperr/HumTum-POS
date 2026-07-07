const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Order = require('./src/models/Order');
const TableSession = require('./src/models/TableSession');

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected!');

  const orders = await Order.find({ tableNo: 7 }).sort({ createdAt: -1 }).limit(5);
  console.log('Last orders for Table 7:');
  for (const o of orders) {
    console.log({
      _id: o._id,
      billNo: o.billNo,
      isActive: o.isActive,
      orderStatus: o.orderStatus,
      grandTotal: o.grandTotal,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      businessDate: o.businessDate,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    });
  }

  const session = await TableSession.findOne({ tableNo: 7 });
  console.log('TableSession for Table 7:');
  console.log(session);

  await mongoose.disconnect();
}

main().catch(console.error);
