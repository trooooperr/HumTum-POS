require('dotenv').config();

const mongoose = require('mongoose'); // Fresh start
const cron = require('node-cron');

const app = require('./app');
const { connectRedis, setCache } = require('./src/lib/redis');
const Settings = require('./src/models/Settings');
const { seedDefaultUsers } = require('./src/routes/auth');
const { sendDailyReportInternal } = require('./src/routes/reports');

const PORT = process.env.PORT || 3000;
const REPORT_TIME = process.env.REPORT_CRON || '55 23 * * *';

const mongoUri =
  process.env.USE_LOCAL_DB === 'true'
    ? (process.env.LOCAL_MONGO_URI || 'mongodb://localhost:27017/humtum-bar-pos')
    : process.env.CLOUD_MONGO_URI;

if (!mongoUri) {
  console.error('No MongoDB URI found');
  process.exit(1);
}

function scheduleDailyReport() {
  cron.schedule(REPORT_TIME, async () => {
    console.log('⏰ Running scheduled daily report...');
    try {
      await sendDailyReportInternal();
      console.log('✅ Scheduled report sent successfully.');
    } catch (err) {
      console.error('❌ Failed to send scheduled report:', err.message);
    }
  }, { timezone: "Asia/Kolkata" });

  console.log(`Cron scheduled: ${REPORT_TIME}`);
}

// ── Cache warmup on startup ─────────────────────────────────────
async function warmupCache() {
  try {
    const MenuItem = require('./src/models/MenuItem');
    const Inventory = require('./src/models/Inventory');
    const Worker = require('./src/models/Worker');
    
    const [menuItems, settings, inventory, workers] = await Promise.all([
      MenuItem.find().sort({ category: 1, name: 1 }),
      (async () => {
        const existing = await Settings.findOne();
        return existing || Settings.create({});
      })(),
      Inventory.find().sort({ category: 1, name: 1 }),
      Worker.find().sort({ name: 1 })
    ]);

    await Promise.all([
      setCache('menu:all', menuItems, 300),
      setCache('settings:current', settings, 300),
      setCache('inventory:all', inventory, 300),
      setCache('workers:all', workers, 300)
    ]);
    console.log('🔥 Cache warmed up');
  } catch (err) {
    console.log('Cache warmup skipped:', err.message);
  }
}

async function startServer() {
  try {
    console.log('🚀 Starting HumTum POS Backend...');

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000,
      family: 4,
    });
    console.log('✅ MongoDB connected');

    // await seedDefaultUsers();
    await connectRedis();
    await warmupCache();

    app.listen(PORT, () => {
      console.log(`📡 Server running on port ${PORT}`);
    });

    scheduleDailyReport();
  } catch (err) {
    console.error('❌ Server startup failed:', err.message);
    process.exit(1);
  }
}

startServer();
