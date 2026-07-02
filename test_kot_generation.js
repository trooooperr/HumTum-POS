require('dotenv').config();
const mongoose = require('mongoose');
const KOT = require('./src/models/KOT');
const { getBusinessDayBoundary, getISTHour } = require('./src/lib/businessDay');

async function testGeneration() {
  const uri = process.env.CLOUD_MONGO_URI;
  await mongoose.connect(uri);
  console.log('Connected to DB.');

  // Test at different hypothetical dates/times
  // 1. Let's test at July 2nd, 2:00 AM IST
  // 2. Let's test at July 2nd, 7:40 AM UTC (1:10 PM IST)
  
  const testTimes = [
    { name: 'July 2nd, 1:17 AM IST (representing KOT-049 epoch)', time: new Date('2026-07-01T19:47:32.883Z') },
    { name: 'July 2nd, 1:10 PM IST (representing KOT-065 epoch)', time: new Date('2026-07-02T07:40:50.956Z') },
  ];

  for (const t of testTimes) {
    console.log(`\n--- Testing for: ${t.name} ---`);
    console.log(`Time (UTC):`, t.time.toISOString());
    
    // We mock Date.now() / new Date() inside the boundary functions
    const mockNow = t.time;
    
    // Mock getBusinessDayBoundary specifically for this mockNow
    const getMockBoundary = () => {
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const getMockISTHour = (d) => {
        const istTime = new Date(d.getTime() + IST_OFFSET_MS);
        return istTime.getUTCHours();
      };
      
      const istHour = getMockISTHour(mockNow);
      const istNow = new Date(mockNow.getTime() + IST_OFFSET_MS);
      const boundary = new Date(Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate(),
        5, 0, 0, 0
      ));
      boundary.setTime(boundary.getTime() - IST_OFFSET_MS);

      if (istHour < 5) {
        boundary.setDate(boundary.getDate() - 1);
      }
      return boundary;
    };

    const boundary = getMockBoundary();
    console.log('Mocked Boundary (UTC):', boundary.toISOString());
    console.log('Mocked Boundary (IST):', new Date(boundary.getTime() + 5.5 * 60 * 60 * 1000).toISOString());

    // Format business day date string
    const yyyy = boundary.getFullYear();
    const mm = String(boundary.getMonth() + 1).padStart(2, '0');
    const dd = String(boundary.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    console.log('Generated dateStr:', dateStr);

    // Let's find what the latest KOT would be in the DB at this moment (we simulate by filtering createdAt <= mockNow)
    const latestKOT = await KOT.findOne({
      createdAt: { $gte: boundary, $lte: mockNow }
    }).sort({ createdAt: -1 });

    console.log('Latest KOT in DB for this business day:', latestKOT ? { kotNo: latestKOT.kotNo, createdAt: latestKOT.createdAt } : 'NULL');
    
    let nextCount = 1;
    if (latestKOT && latestKOT.kotNo) {
      const parts = latestKOT.kotNo.split('-');
      if (parts.length === 2) {
        nextCount = parseInt(parts[1], 10) + 1;
      }
    }
    console.log(`Generated KOT Number: KOT-${nextCount.toString().padStart(3, '0')}`);
  }

  await mongoose.connection.close();
}

testGeneration().catch(console.error);
