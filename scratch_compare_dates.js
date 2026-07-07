const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');
const { getBusinessDateString } = require('./src/lib/businessDay');

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected.');

  const orders = await Order.find({ businessDate: '2026-07-06' }).sort({ date: 1 });
  console.log('--- Date Comparison ---');
  for (const o of orders) {
    if (!o.billNo) continue;
    const computedStr = getBusinessDateString(o.date);
    console.log({
      billNo: o.billNo,
      customer: o.customerName.trim(),
      storedBusinessDate: o.businessDate,
      computedBusinessDate: computedStr,
      isMatch: o.businessDate === computedStr,
      dateUTC: o.date.toISOString(),
      updatedAtUTC: o.updatedAt.toISOString(),
    });
  }

  await mongoose.disconnect();
}

main().catch(console.error);
