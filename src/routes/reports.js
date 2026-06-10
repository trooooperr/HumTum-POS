const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Inventory = require('../models/Inventory');
const Settings = require('../models/Settings');
const nodemailer = require('nodemailer');
const { getCache, setCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { getBusinessDayBounds } = require('../lib/businessDay');

const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';

async function getPersistedSettings() {
  const existing = await Settings.findOne();
  return existing || Settings.create({});
}

function resolveEmailConfig(persisted, incoming = {}) {
  const authEmail =
    process.env.SMTP_USER ||
    process.env.GMAIL_SENDER ||
    incoming.authEmail ||
    persisted?.senderEmail ||
    '';

  return {
    authEmail,
    senderEmail: process.env.GMAIL_SENDER || incoming.senderEmail || persisted?.senderEmail || authEmail,
    senderPassword: incoming.senderPassword || persisted?.senderPassword || process.env.GMAIL_APP_PASSWORD || '',
    adminEmail: incoming.adminEmail || persisted?.adminEmail || process.env.ADMIN_EMAIL || '',
  };
}

function assertEmailConfig(emailConfig) {
  if (!emailConfig.authEmail) {
    throw new Error('Missing sender email. Set GMAIL_SENDER in .env.');
  }
  if (!emailConfig.senderPassword) {
    throw new Error('Missing Gmail app password. Set GMAIL_APP_PASSWORD in .env.');
  }
  if (!emailConfig.adminEmail) {
    throw new Error('Missing recipient email. Set ADMIN_EMAIL in .env or Settings.');
  }
}

function createTransport(emailConfig) {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: emailConfig.authEmail,
        pass: emailConfig.senderPassword,
      },
    });
  }

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: emailConfig.authEmail,
      pass: emailConfig.senderPassword,
    },
  });
}

// ── Build the HTML email report ──────────────────────────────────
function buildReportHTML({ date, orders, settings, inventory }) {
  const total   = orders.reduce((s,o)=>s+o.grandTotal,0);
  const paid    = orders.reduce((s,o)=>s+(o.paidAmount||o.grandTotal),0);
  const due     = orders.reduce((s,o)=>s+(o.dueAmount||0),0);
  const pmMap   = {};
  orders.forEach(o=>{ pmMap[o.paymentMode]=(pmMap[o.paymentMode]||0)+o.grandTotal; });
  const itemMap = {};
  orders.forEach(o=>o.items?.forEach(i=>{ itemMap[i.name]=(itemMap[i.name]||0)+i.quantity; }));
  const topItems = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const lowStock = inventory.filter(i=>i.stock<=i.minStock);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F8FAFC;color:#1E293B;margin:0;padding:0}
  .wrap{max-width:640px;margin:0 auto;padding:40px 20px}
  .header{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;box-shadow:0 4px 12px rgba(0,0,0,0.03)}
  .header h1{margin:0;font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-0.02em}
  .header p{margin:8px 0 0;font-size:14px;color:#64748B}
  .kpi-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .kpi{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:20px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.02)}
  .kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#64748B;margin-bottom:8px;font-weight:700}
  .kpi-value{font-size:24px;font-weight:800;color:#0F172A}
  .kpi-green{color:#10B981}.kpi-amber{color:#D97706}.kpi-red{color:#EF4444}.kpi-blue{color:#2563EB}
  .section{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 4px rgba(0,0,0,0.02)}
  .section h3{font-size:13px;font-weight:700;margin:0 0 16px;color:#475569;text-transform:uppercase;letter-spacing:0.05em}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{padding:10px 12px;text-align:left;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #F1F5F9}
  td{padding:12px;border-bottom:1px solid #F1F5F9;color:#334155}
  tr:last-child td{border-bottom:none}
  .badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700}
  .low{background:#FEF2F2;color:#EF4444;border:1px solid #FEE2E2}
  .ok{background:#F0FDF4;color:#10B981;border:1px solid #DCFCE7}
  .footer{text-align:center;font-size:12px;color:#94A3B8;margin-top:32px;padding-top:24px;border-top:1px solid #E2E8F0}
  .alert-box{background:#FFFBEB;border:1px solid #FEF3C7;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400E}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>${settings.restaurantName||'HumTum'}</h1>
    <p>Daily Sales Report · ${new Date(date).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-value kpi-amber">${settings.currency||'₹'}${total.toFixed(0)}</div></div>
    <div class="kpi"><div class="kpi-label">Orders</div><div class="kpi-value kpi-green">${orders.length}</div></div>
    <div class="kpi"><div class="kpi-label">Pending Dues</div><div class="kpi-value kpi-red">${settings.currency||'₹'}${due.toFixed(0)}</div></div>
  </div>

  ${due>0?`<div class="alert-box">⚠️ <b>${settings.currency||'₹'}${due.toFixed(2)}</b> in outstanding dues — follow up with customers.</div>`:''}

  <div class="section">
    <h3>📊 Payment Breakdown</h3>
    <table><thead><tr><th>Mode</th><th>Amount</th><th>Share</th></tr></thead><tbody>
      ${Object.entries(pmMap).map(([mode,amt])=>`<tr><td>${mode.toUpperCase()}</td><td style="font-family:monospace">${settings.currency||'₹'}${amt.toFixed(2)}</td><td>${total>0?((amt/total)*100).toFixed(0):0}%</td></tr>`).join('')}
    </tbody></table>
  </div>

  <div class="section">
    <h3>🏆 Top 5 Selling Items</h3>
    <table><thead><tr><th>#</th><th>Item</th><th>Qty Sold</th></tr></thead><tbody>
      ${topItems.length===0?'<tr><td colspan="3" style="text-align:center;color:#525870">No sales today</td></tr>':topItems.map(([name,qty],i)=>`<tr><td style="color:#F59E0B;font-weight:700">${i+1}</td><td>${name}</td><td style="font-family:monospace;font-weight:700">${qty}</td></tr>`).join('')}
    </tbody></table>
  </div>

  ${inventory.length>0?`<div class="section">
    <h3>📦 Inventory Status (${inventory.length} items)</h3>
    ${lowStock.length>0?`<div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:7px;padding:8px 12px;margin-bottom:10px;font-size:12px;color:#EF4444"><b>Low Stock Alert:</b> ${lowStock.map(i=>i.name).join(', ')}</div>`:''}
    <table><thead><tr><th>Item</th><th>Stock</th><th>Min</th><th>Status</th></tr></thead><tbody>
      ${inventory.slice(0,10).map(i=>`<tr><td>${i.name}</td><td style="font-family:monospace">${i.stock} ${i.unit}</td><td style="font-family:monospace;color:#525870">${i.minStock}</td><td><span class="badge ${i.stock<=i.minStock?'low':'ok'}">${i.stock<=i.minStock?'Low Stock':'OK'}</span></td></tr>`).join('')}
    </tbody></table>
  </div>`:''}

  <div class="section">
    <h3>📋 Today's Orders (${orders.length})</h3>
    <table><thead><tr><th>Bill No</th><th>Table</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
      ${orders.slice(0,15).map(o=>`<tr><td style="font-family:monospace">HTG-${o.billNo}</td><td>T${o.tableNo}</td><td style="font-family:monospace">${settings.currency||'₹'}${o.grandTotal.toFixed(2)}</td><td>${o.paymentMode?.toUpperCase()}</td></tr>`).join('')}
      ${orders.length>15?`<tr><td colspan="4" style="text-align:center;color:#525870">+${orders.length-15} more orders</td></tr>`:''}
    </tbody></table>
  </div>

  <div class="footer">
    Auto-generated by ${settings.restaurantName||'HumTum'}<br/>
    ${settings.address||''}
  </div>
</div>
</body>
</html>`;
}
// ── Standalone function for internal use (e.g. cron) ───────────
async function sendDailyReportInternal(options = {}) {
  const persistedSettings = await getPersistedSettings();
  const resolvedEmailConfig = resolveEmailConfig(persistedSettings, options.emailConfig);
  assertEmailConfig(resolvedEmailConfig);
  const resolvedSettings = {
    ...persistedSettings.toObject(),
    ...options.settings,
    restaurantName: options.settings?.restaurantName || persistedSettings.restaurantName || process.env.RESTAURANT_NAME || 'HumTum',
    currency: options.settings?.currency || persistedSettings.currency || '₹',
  };

  const { start, end } = getBusinessDayBounds();
  const orders = await Order.find({ date: { $gte: start, $lt: end } });
  const inventory = await Inventory.find().sort({ category: 1, name: 1 });

  const html = buildReportHTML({ date: start, orders, settings: resolvedSettings, inventory });
  const transporter = createTransport(resolvedEmailConfig);
  await transporter.verify();

  const result = await transporter.sendMail({
    from:    `"${resolvedSettings.restaurantName || 'HumTum POS'}" <${resolvedEmailConfig.senderEmail}>`,
    replyTo: resolvedEmailConfig.senderEmail,
    to:      resolvedEmailConfig.adminEmail,
    subject: `📊 Daily Report — ${resolvedSettings.restaurantName || 'HumTum'} — ${new Date().toLocaleDateString('en-IN')}`,
    html,
  });

  return {
    ...result,
    recipient: resolvedEmailConfig.adminEmail,
    ordersCount: orders.length,
  };
}

router.post('/send-daily', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { emailConfig, settings } = req.body;
    const result = await sendDailyReportInternal({ emailConfig, settings });
    res.json({
      success:true,
      message:'Report sent',
      recipient: result.recipient,
      ordersCount: result.ordersCount,
    });
  } catch (err) {
    console.error('Email error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to send email.' });
  }
});

router.get('/daily-summary', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const cached = await getCache(REPORT_SUMMARY_CACHE_KEY);
    if (cached) return res.json(cached);

    const { start, end } = getBusinessDayBounds();
    const orders = await Order.find({ date: { $gte: start, $lt: end } });
    const total    = orders.reduce((s,o)=>s+o.grandTotal,0);
    const due      = orders.reduce((s,o)=>s+(o.dueAmount||0),0);
    const pmMap    = {};
    orders.forEach(o=>{ pmMap[o.paymentMode]=(pmMap[o.paymentMode]||0)+o.grandTotal; });
    const summary = { ordersCount:orders.length, revenue:total, due, paymentBreakdown:pmMap, date:start };
    await setCache(REPORT_SUMMARY_CACHE_KEY, summary, 120);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate required' });
    
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const end = new Date(endDate);
    end.setHours(23,59,59,999);

    const match = { date: { $gte: start, $lte: end } };

    // 1. Basic Stats
    const statsResult = await Order.aggregate([
      { $match: match },
      { $group: { _id: null, revenue: { $sum: "$grandTotal" }, count: { $sum: 1 } } }
    ]);
    const stats = statsResult[0] || { revenue: 0, count: 0 };

    // 2. Daily Data
    const dailyResult = await Order.aggregate([
      { $match: match },
      { $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "Asia/Kolkata" } },
          sales: { $sum: "$grandTotal" }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dailyData = dailyResult.map(d => {
      const dateParts = d._id.split('-');
      const day = dateParts[2];
      const month = months[parseInt(dateParts[1], 10) - 1];
      return { name: `${day} ${month}`, sales: d.sales };
    });

    // 3. Top Items
    const topItemsResult = await Order.aggregate([
      { $match: match },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", qty: { $sum: "$items.quantity" } } },
      { $sort: { qty: -1 } },
      { $limit: 10 }
    ]);
    const topItems = topItemsResult.map(item => ({ name: item._id, qty: item.qty }));

    res.json({
      revenue: stats.revenue || 0,
      count: stats.count || 0,
      dailyData,
      topItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, sendDailyReportInternal };
