const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

async function main() {
  const uri = process.env.CLOUD_MONGO_URI || process.env.LOCAL_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected.');

  // List all databases
  const admin = mongoose.connection.db.admin();
  const dbs = await admin.listDatabases();
  console.log('--- Databases on Cluster ---');
  for (const db of dbs.databases) {
    console.log(`- ${db.name} (Size: ${db.sizeOnDisk} bytes)`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
