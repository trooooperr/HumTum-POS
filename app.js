const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { isRedisHealthy } = require('./src/lib/redis');
const { requireAuth, allowCronSecret } = require('./src/middleware/auth');

const app = express();

app.disable('x-powered-by');

// ── Security headers ────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // Allow inline styles/scripts in frontend
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));

// ── Body parsing ────────────────────────────────────────────────
app.use(bodyParser.json({ limit: '2mb' }));

// ── Rate limiting on auth endpoints ─────────────────────────────
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minutes
  max: 50,                      // 50 attempts per window
  message: { error: 'Too many login attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public routes (no auth required) ────────────────────────────
app.use('/api/auth', authLimiter, require('./src/routes/auth'));

// ── Health checks (no auth required) ────────────────────────────
app.get('/api/health', async (req, res) => {
  const redis = await isRedisHealthy();
  res.json({
    status: 'ok',
    redis,
    uptime: process.uptime(),
  });
});

app.get('/ready', (req, res) => {
  res.json({ ready: true });
});

// ── Protected API routes (auth required) ────────────────────────
const { router: reportsRouter } = require('./src/routes/reports');

app.use('/api/menu',      requireAuth, require('./src/routes/menu'));
app.use('/api/orders',    requireAuth, require('./src/routes/orders'));app.use('/api/kots',      requireAuth, require('./src/routes/kots'));app.use('/api/workers',   requireAuth, require('./src/routes/workers'));
app.use('/api/reports',   allowCronSecret, reportsRouter);
app.use('/api/settings',  requireAuth, require('./src/routes/settings'));
app.use('/api/inventory', requireAuth, require('./src/routes/inventory'));
app.use('/api/admin',    requireAuth, require('./src/routes/admin'));
app.use('/api/print',     requireAuth, require('./src/routes/print'));

// ── Static files (frontend dist) ────────────────────────────────
const frontendDist = path.join(__dirname, 'frontend', 'dist');

app.use(express.static(frontendDist));

app.get('*', (req, res) => {
  const file = path.join(frontendDist, 'index.html');

  if (fs.existsSync(file)) {
    return res.sendFile(file);
  }

  res.json({ message: 'API running only' });
});

module.exports = app;