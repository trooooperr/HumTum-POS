require('dotenv').config();

const mongoose = require('mongoose'); // Fresh start
const cron = require('node-cron');
const http = require('http');
const socketIO = require('socket.io');

const app = require('./app');
const { connectRedis, setCache } = require('./src/lib/redis');
const Settings = require('./src/models/Settings');
const { seedDefaultUsers } = require('./src/routes/auth');
const { sendDailyReportInternal } = require('./src/routes/reports');

const PORT = Number(process.env.PORT || 3000);
const REPORT_TIME = process.env.REPORT_CRON || '55 23 * * *';

// Create HTTP server with Socket.IO
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: true, credentials: true }
});

let mongoUri =
  process.env.USE_LOCAL_DB === 'true'
    ? (process.env.LOCAL_MONGO_URI || 'mongodb://localhost:27017/humtum-bar-pos')
    : process.env.CLOUD_MONGO_URI;

let memoryServer = null;

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

async function shutdownResources() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  } catch (err) {
    console.error('Mongo shutdown error:', err.message);
  }

  try {
    if (memoryServer) {
      await memoryServer.stop();
    }
  } catch (err) {
    console.error('Memory Mongo shutdown error:', err.message);
  }
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
    console.log('Cache warmup failed:', err.message);
  }
}

async function seedDemoData() {
  try {
    const MenuItem = require('./src/models/MenuItem');
    const Inventory = require('./src/models/Inventory');
    const Worker = require('./src/models/Worker');
    const Settings = require('./src/models/Settings');

    // 1. Settings
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        restaurantName: 'HumTum Bar & Club',
        address: '123 Main Street, Sector 1, City',
        gstin: '07AAAAA1111A1Z1',
        phone: '9999999999',
        sgstRate: 2.5,
        cgstRate: 2.5,
        currency: '₹',
        thankYouMsg: 'Thank you for visiting HumTum!',
        darkMode: true,
        menuCategories: ['Spirits','Beer','Wine','Food','Mixers'],
        inventoryCategories: ['Spirits','Beer','Wine','Food','Mixers']
      });
      console.log('✅ Default settings created');
    }

    // 2. Menu Items
    const menuCount = await MenuItem.countDocuments();
    if (menuCount === 0) {
      const demoMenu = [


        { name: "Chicken Lollipop", category: "Food", price: 340, department: "kitchen", shortcut: "cl" },


      ];
      await MenuItem.insertMany(demoMenu);
      console.log('✅ Demo menu items seeded');
    }

    // 3. Inventory Items
    const invCount = await Inventory.countDocuments();
    if (invCount === 0) {
      const demoInv = [
        { name: "Jack Daniel's", category: "Spirits", unit: "Bottles", stock: 15, minStock: 3, price: 2800, shortcut: "jd" },
        { name: "Kingfisher Ultra", category: "Beer", unit: "Bottles", stock: 100, minStock: 20, price: 120, shortcut: "ku" },
        { name: "Corona Extra", category: "Beer", unit: "Bottles", stock: 60, minStock: 15, price: 180, shortcut: "ce" },
        { name: "Coca Cola", category: "Mixers", unit: "Cans", stock: 200, minStock: 30, price: 20, shortcut: "cc" },
        { name: "Tonic Water", category: "Mixers", unit: "Bottles", stock: 120, minStock: 20, price: 35, shortcut: "tw" },
        { name: "Fresh Lime Soda", category: "Mixers", unit: "Bottles", stock: 80, minStock: 15, price: 30, shortcut: "fls" }
      ];
      await Inventory.insertMany(demoInv);
      console.log('✅ Demo inventory items seeded');
    }

    const menuTopUps = [
      { name: "Chicken Lollipop", category: "Food", price: 340, department: "kitchen", shortcut: "cl" },
      { name: "Fresh Lime Soda", category: "Mixers", price: 90, department: "bar", shortcut: "fls" },
      { name: "Peanut Masala", category: "Food", price: 120, department: "kitchen", shortcut: "pm" },
      { name: "Crispy Corn", category: "Food", price: 210, department: "kitchen", shortcut: "crc" }
    ];

    for (const item of menuTopUps) {
      const exists = await MenuItem.findOne({ name: item.name });
      if (exists) continue;

      const shortcutTaken = item.shortcut ? await MenuItem.findOne({ shortcut: item.shortcut }) : null;
      await MenuItem.create(shortcutTaken ? { ...item, shortcut: '' } : item);
    }

    const inventoryTopUps = [
      { name: "Tonic Water", category: "Mixers", unit: "Bottles", stock: 120, minStock: 20, price: 35, shortcut: "tw" },
      { name: "Fresh Lime Soda", category: "Mixers", unit: "Bottles", stock: 80, minStock: 15, price: 30, shortcut: "fls" }
    ];

    for (const item of inventoryTopUps) {
      const exists = await Inventory.findOne({ name: item.name });
      if (!exists) await Inventory.create(item);
    }

    // 4. Workers
    const workerCount = await Worker.countDocuments();
    if (workerCount === 0) {
      const demoWorkers = [
        { name: 'Rohan Sharma', role: 'Staff', salary: 15000, contact: '9876543210', email: 'rohan@example.com' },
        { name: 'Amit Verma', role: 'Staff', salary: 16000, contact: '9876543211', email: 'amit@example.com' },
        { name: 'Sanjay Kumar', role: 'Staff', salary: 18000, contact: '9876543212', email: 'sanjay@example.com' }
      ];
      await Worker.insertMany(demoWorkers);
      console.log('✅ Demo staff workers seeded');
    }

  } catch (err) {
    console.error('❌ Demo data seeding failed:', err.message);
  }
}

async function startServer() {
  try {
    console.log('🚀 Starting HumTum POS Backend...');

    // Determine MongoDB connection URI
    // Prefer cloud URI if provided; fall back to in-memory only when explicitly requested
    if (process.env.USE_MEMORY_DB === 'true') {
      console.log('📦 Starting in-memory MongoDB database server...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      mongoUri = memoryServer.getUri();
      console.log('✅ In-memory MongoDB URI:', mongoUri);
    } else if (process.env.CLOUD_MONGO_URI) {
      mongoUri = process.env.CLOUD_MONGO_URI;
      console.log('🔗 Connecting to cloud MongoDB URI');
    } else {
      console.error('❌ No MongoDB URI configured. Set CLOUD_MONGO_URI or enable USE_MEMORY_DB.');
      process.exit(1);
    }


    if (!mongoUri) {
      console.error('No MongoDB URI found');
      process.exit(1);
    }

    // Basic sanity checks for placeholder URIs
    if (mongoUri.includes('<') || mongoUri.includes('cluster>') || mongoUri.includes('example.com')) {
      console.error('❌ CLOUD_MONGO_URI appears to be a placeholder. Please set a valid connection string in your .env file.');
      console.error('   Example (SRV): mongodb+srv://<user>:<password>@cluster0.abcd123.mongodb.net/myDB');
      console.error('   If DNS SRV lookups fail in your environment, you can use the standard connection format:');
      console.error('   mongodb://host1:27017,host2:27017/?replicaSet=rs0');
      process.exit(1);
    }

    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 30000,
        family: 4,
      });
    } catch (connErr) {
      console.error('❌ MongoDB connection error:', connErr.message);
      if (connErr.message && connErr.message.includes('querySrv')) {
        console.error('   The driver failed to perform a DNS SRV lookup for your mongodb+srv URI.');
        console.error('   Possible causes: network/DNS blocking, invalid cluster name, or using a placeholder URI.');
        console.error('   Quick fixes:');
        console.error('     - Ensure CLOUD_MONGO_URI in your .env is a valid, credentialed connection string.');
        console.error('     - If DNS SRV is not available in your environment, use the non-SRV mongodb:// host list form.');
        console.error('     - As a temporary workaround, start with a local DB by setting USE_LOCAL_DB=true in .env');
      }
      await shutdownResources();
      process.exit(1);
    }
    console.log('✅ MongoDB connected');
    // ----- Index sanity for TableSession -----
    (async () => {
      try {
        const coll = mongoose.connection.db.collection('tablesessions');
        // Remove old unique index on `tableId` if it exists
        await coll.dropIndex('tableId_1').catch(() => {});
        // Ensure a non‑unique compound index on tableNo + status (already defined in schema, but reconfirm)
        await coll.createIndex({ tableNo: 1, status: 1 });
        console.log('✅ TableSession indexes verified');
      } catch (idxErr) {
        console.error('⚠️ Index setup error:', idxErr.message);
      }
    })();

    await seedDefaultUsers();
    // Demo data disabled - using cloud database in production
    // await seedDemoData();
    await connectRedis();
    await warmupCache();

    // ── Store io in app.locals for access in routes ────────────────
    app.locals.io = io;

    // ── Socket.IO setup ────────────────────────────────────────
    io.on('connection', (socket) => {
      console.log('👤 Client connected:', socket.id);

      // Join kitchen namespace for KDS
      socket.on('join-kitchen', () => {
        socket.join('kitchen');
        console.log('👨‍🍳 Kitchen staff joined:', socket.id);
      });

      // Join table namespace for updates
      socket.on('join-table', (tableNo) => {
        socket.join(`table:${tableNo}`);
        console.log(`🪑 Joined table ${tableNo}:`, socket.id);
      });

      // Broadcast new KOT to kitchen
      socket.on('kot-created', (data) => {
        io.to('kitchen').emit('NEW_KOT', data);
        console.log('🎫 New KOT broadcast to kitchen:', data.kotNo);
      });

      // Broadcast KOT status update
      socket.on('kot-status-updated', (data) => {
        io.to('kitchen').emit('KOT_UPDATED', data);
        io.to(`table:${data.tableNo}`).emit('KOT_UPDATED', data);
      });

      // Broadcast KOT ready notification
      socket.on('kot-ready', (data) => {
        io.to('kitchen').emit('KOT_READY', data);
        io.to(`table:${data.tableNo}`).emit('KOT_READY', data);
      });

      // Broadcast table session updates
      socket.on('table-updated', (data) => {
        io.to(`table:${data.tableNo}`).emit('TABLE_UPDATED', data);
      });

      // Broadcast payment completion
      socket.on('payment-completed', (data) => {
        io.to(`table:${data.tableNo}`).emit('PAYMENT_COMPLETED', data);
        io.to('kitchen').emit('PAYMENT_COMPLETED', data);
      });

      // Broadcast order completion
      socket.on('order-completed', (data) => {
        io.to('kitchen').emit('ORDER_COMPLETED', data);
        io.to(`table:${data.tableNo}`).emit('ORDER_COMPLETED', data);
      });

      socket.on('disconnect', () => {
        console.log('❌ Client disconnected:', socket.id);
      });
    });

    server.once('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error(`   Stop the existing process with: lsof -ti :${PORT} | xargs kill`);
        console.error('   Or change PORT in .env, for example: PORT=3001');
      } else {
        console.error('❌ Server listen error:', err.message);
      }
      await shutdownResources();
      process.exit(1);
    });

    server.listen(PORT, () => {
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🔗 Socket.IO ready for real-time updates`);
      scheduleDailyReport();
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err.message);
    await shutdownResources();
    process.exit(1);
  }
}

startServer();

// Export io and server for use in routes/other modules
module.exports = { app, server, io };
