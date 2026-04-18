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
    
    let [menuItems, settings, inventory, workers] = await Promise.all([
      MenuItem.find().sort({ category: 1, name: 1 }),
      (async () => {
        const existing = await Settings.findOne();
        return existing || Settings.create({});
      })(),
      Inventory.find().sort({ category: 1, name: 1 }),
      Worker.find().sort({ name: 1 })
    ]);

    // Baseline seeding if DB is completely empty (as requested)
    if (menuItems.length === 0 && inventory.length === 0) {
      console.log('🌱 Seeding minimal baseline items...');
      
      const baseInv = [
        {
          _id: '69e31dd2571632505776a074',
          name: "Glenfiddich 12y",
          category: "Liquor",
          unit: "ml",
          stock: 91,
          minStock: 10,
          price: 550,
          imageUrl: "https://mir-s3-cdn-cf.behance.net/project_modules/fs/743563117834309.6105f884a44b9.png"
        },
        {
          _id: '69e31dd2571632505776a076',
          name: "Coke Can",
          category: "Soft Drinks",
          unit: "Can",
          stock: 11,
          minStock: 10,
          price: 80,
          imageUrl: "https://images.pexels.com/photos/7429792/pexels-photo-7429792.jpeg?cs=srgb&dl=pexels-marta-dzedyshko-7429792.jpg&fm=jpg"
        },
        {
          _id: '69e31dd2571632505776a07e',
          name: "Sting Energy",
          category: "Energy Drinks",
          unit: "Bottle",
          stock: 86,
          minStock: 10,
          price: 40,
          imageUrl: "https://fabnews.live/wp-content/uploads/2023/11/Sting-Red_Cambodia-Can_Hero-1.jpg"
        },
        {
          _id: '69e31dd3571632505776a080',
          name: "Jaljeera Soda",
          category: "Cold Drinks",
          unit: "Bottle",
          stock: 67,
          minStock: 10,
          price: 60,
          imageUrl: "https://www.chefkunalkapur.com/wp-content/uploads/2022/03/Jal-Jeera-recipe.jpg"
        }
      ];

      const baseMenu = [
        {
          _id: '69e31dd1571632505776a060',
          name: "Chicken Fried Rice",
          category: "Main Course",
          price: 320,
          available: true,
          imageUrl: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500"
        },
        {
          _id: '69e31dd2571632505776a062',
          name: "Malai Kofta",
          category: "Main Course",
          price: 310,
          available: true,
          imageUrl: "https://thumbs.dreamstime.com/b/malai-kofta-curry-black-bowl-dark-slat-background-top-view-indian-dish-178783490.jpg"
        },
        {
          _id: '69e31dd2571632505776a064',
          name: "Garlic Naan",
          category: "Main Course",
          price: 55,
          available: true,
          imageUrl: "https://t4.ftcdn.net/jpg/07/18/16/87/360_F_718168709_mc2zfZw46fQxI81if0XfGkRly7aID8M8.jpg"
        },
        {
          _id: '69e31dd2571632505776a066',
          name: "Chicken Biryani",
          category: "Main Course",
          price: 399,
          available: true,
          imageUrl: "https://lifeloveandgoodfood.com/wp-content/uploads/2023/03/chicken_fried_rice-1.jpg"
        },
        {
          _id: '69e3b8a3629452b778264798',
          name: "sxsacxascaa",
          category: "Starters",
          price: 1122,
          available: true,
          imageUrl: ""
        }
      ];

      await Promise.all([
        Inventory.insertMany(baseInv),
        MenuItem.insertMany(baseMenu)
      ]);

      // Re-fetch after seeding
      [menuItems, inventory] = await Promise.all([
        MenuItem.find().sort({ category: 1, name: 1 }),
        Inventory.find().sort({ category: 1, name: 1 })
      ]);
    }

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
