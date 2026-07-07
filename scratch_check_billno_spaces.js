const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected.');

  const orders = await Order.find({ businessDate: '2026-07-06' }).sort({ date: 1 });
  console.log('--- BillNo Details ---');
  for (const o of orders) {
    if (!o.billNo) {
      console.log(`ID: ${o._id} - Empty billNo`);
      continue;
    }
    const hasMatch = /^HTB-\d+$/.test(o.billNo);
    console.log({
      _id: o._id,
      billNo: o.billNo,
      length: o.billNo.length,
      escaped: JSON.stringify(o.billNo),
      matchesRegex: hasMatch
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
