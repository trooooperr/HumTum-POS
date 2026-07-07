const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('./src/models/Order');

async function generateNextBillNo(businessDateStr) {
  // Fetch all orders from this business day that have a valid billNo format
  const todayOrders = await Order.find({
    businessDate: businessDateStr,
    billNo: { $regex: /^HTB-\d+$/ }
  }).select('billNo');

  console.log(`Querying businessDate: "${businessDateStr}"`);
  console.log(`Found ${todayOrders.length} orders:`);
  for (const o of todayOrders) {
    console.log(` - ID: ${o._id}, billNo: "${o.billNo}"`);
  }

  let nextNumber = 1;
  if (todayOrders.length > 0) {
    const numbers = todayOrders.map(o => {
      const match = o.billNo.match(/HTB-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    nextNumber = Math.max(...numbers) + 1;
  }
  return `HTB-${nextNumber.toString().padStart(3, '0')}`;
}

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected.');

  const res = await generateNextBillNo('2026-07-06');
  console.log('Generated Next Bill No:', res);

  await mongoose.disconnect();
}

main().catch(console.error);
