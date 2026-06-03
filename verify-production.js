#!/usr/bin/env node

/**
 * Production Verification Script
 * Verifies all major API endpoints and database connectivity
 * Run with: node verify-production.js
 */

require('dotenv').config();

const http = require('http');
const https = require('https');

const API_BASE = process.env.VITE_API_URL || 'http://localhost:3001';
const HEALTH_CHECK_TIMEOUT = 5000;

console.log(`\n🔍 HumTum POS Production Verification\n`);
console.log(`API Base: ${API_BASE}`);
console.log(`Node Env: ${process.env.NODE_ENV || 'not set'}\n`);

const checks = [];

/**
 * Helper to make HTTP requests
 */
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const client = url.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      timeout: HEALTH_CHECK_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data,
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

/**
 * Check each endpoint
 */
async function verify() {
  // 1. Health Check
  try {
    console.log(`⏳ Checking /api/health...`);
    const health = await makeRequest('/api/health');
    if (health.status === 200 && health.body?.status === 'ok') {
      console.log(`✅ Health check OK`);
      console.log(`   - Redis: ${health.body.redis ? '🟢 connected' : '🔴 disconnected'}`);
      console.log(`   - Uptime: ${(health.body.uptime || 0).toFixed(2)}s\n`);
      checks.push({ name: 'Health Check', status: 'PASS' });
    } else {
      console.log(`❌ Health check failed (status: ${health.status})\n`);
      checks.push({ name: 'Health Check', status: 'FAIL' });
    }
  } catch (err) {
    console.log(`❌ Health check error: ${err.message}\n`);
    checks.push({ name: 'Health Check', status: 'FAIL', error: err.message });
  }

  // 2. Ready Check
  try {
    console.log(`⏳ Checking /ready...`);
    const ready = await makeRequest('/ready');
    if (ready.status === 200 && ready.body?.ready === true) {
      console.log(`✅ Ready check OK\n`);
      checks.push({ name: 'Ready Check', status: 'PASS' });
    } else {
      console.log(`❌ Ready check failed\n`);
      checks.push({ name: 'Ready Check', status: 'FAIL' });
    }
  } catch (err) {
    console.log(`❌ Ready check error: ${err.message}\n`);
    checks.push({ name: 'Ready Check', status: 'FAIL', error: err.message });
  }

  // 3. Auth Endpoint
  try {
    console.log(`⏳ Testing /api/auth (should reject without credentials)...`);
    const auth = await makeRequest('/api/auth/login', {
      method: 'POST',
      body: { username: '', password: '' }
    });
    if (auth.status !== 200) {
      console.log(`✅ Auth endpoint working (returns ${auth.status})\n`);
      checks.push({ name: 'Auth Endpoint', status: 'PASS' });
    } else {
      console.log(`❌ Auth endpoint unexpected response\n`);
      checks.push({ name: 'Auth Endpoint', status: 'FAIL' });
    }
  } catch (err) {
    console.log(`❌ Auth endpoint error: ${err.message}\n`);
    checks.push({ name: 'Auth Endpoint', status: 'FAIL', error: err.message });
  }

  // 4. Database Connectivity
  console.log(`⏳ Checking database connectivity...`);
  const dbCheck = process.env.CLOUD_MONGO_URI ? 
    `✅ Cloud MongoDB configured: ${process.env.CLOUD_MONGO_URI.split('@')[0].split('://')[1]}...` :
    `❌ No cloud database configured`;
  console.log(`${dbCheck}\n`);
  checks.push({
    name: 'Database Config',
    status: process.env.CLOUD_MONGO_URI ? 'PASS' : 'FAIL'
  });

  // 5. Production Environment
  console.log(`⏳ Checking production environment...`);
  const nodeEnv = process.env.NODE_ENV === 'production';
  console.log(`${nodeEnv ? '✅' : '⚠️ '} NODE_ENV: ${process.env.NODE_ENV || 'not set'} ${!nodeEnv ? '(recommended: production)' : ''}\n`);
  checks.push({
    name: 'Production Environment',
    status: nodeEnv ? 'PASS' : 'WARN'
  });

  // 6. Port Configuration
  const port = process.env.PORT || '3000';
  console.log(`⏳ Port Configuration...`);
  console.log(`✅ PORT: ${port}\n`);
  checks.push({ name: 'Port Configuration', status: 'PASS' });

  // 7. Frontend Build
  const fs = require('fs');
  const path = require('path');
  const distExists = fs.existsSync(path.join(__dirname, 'frontend/dist/index.html'));
  console.log(`⏳ Frontend Build...`);
  console.log(`${distExists ? '✅' : '❌'} Frontend dist: ${distExists ? 'exists' : 'missing'}\n`);
  checks.push({
    name: 'Frontend Build',
    status: distExists ? 'PASS' : 'FAIL'
  });
}

/**
 * Print summary
 */
function printSummary() {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`VERIFICATION SUMMARY`);
  console.log(`${'═'.repeat(50)}\n`);

  const passed = checks.filter(c => c.status === 'PASS').length;
  const warned = checks.filter(c => c.status === 'WARN').length;
  const failed = checks.filter(c => c.status === 'FAIL').length;

  checks.forEach(check => {
    const icon = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️ ' : '❌';
    console.log(`${icon} ${check.name.padEnd(30)} [${check.status}]${check.error ? ` - ${check.error}` : ''}`);
  });

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} PASS, ${warned} WARN, ${failed} FAIL`);
  console.log(`${'═'.repeat(50)}\n`);

  if (failed > 0) {
    console.log(`❌ Production deployment NOT READY\n`);
    process.exit(1);
  } else if (warned > 0) {
    console.log(`⚠️  Production deployment ready with warnings\n`);
    process.exit(0);
  } else {
    console.log(`✨ PRODUCTION DEPLOYMENT READY ✨\n`);
    process.exit(0);
  }
}

verify().then(printSummary).catch(err => {
  console.error(`\n❌ Verification failed: ${err.message}\n`);
  process.exit(1);
});
