const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');

async function main() {
  // Try explicitly connecting to /humtumbar database path
  const baseUri = process.env.CLOUD_MONGO_URI;
  if (!baseUri) {
    console.log('No CLOUD_MONGO_URI in .env');
    return;
  }

  // Parse and inject /humtumbar database name before the query parameters
  const parts = baseUri.split('?');
  const uriWithDb = parts[0].replace(/\/$/, '') + '/humtumbar' + (parts[1] ? '?' + parts[1] : '');

  console.log('Connecting to:', uriWithDb.replace(/:[^@]+@/, ':****@')); // hide password in console
  await mongoose.connect(uriWithDb);
  console.log('Connected to /humtumbar database.');

  const count = await Order.countDocuments({});
  console.log(`Total orders in /humtumbar: ${count}`);

  if (count > 0) {
    const orders = await Order.find({ businessDate: '2026-07-06' }).sort({ date: 1 });
    console.log('--- Orders in /humtumbar for 2026-07-06 ---');
    for (const o of orders) {
      console.log({
        billNo: o.billNo,
        customer: o.customerName,
        grandTotal: o.grandTotal,
        date: o.date
      });
    }
  }

  await mongoose.disconnect();
}

main().catch(console.error);
