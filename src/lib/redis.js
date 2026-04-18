const { Redis } = require('@upstash/redis');

let client = null;

/**
 * Create Redis Client (Upstash)
 */
function createRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.log('⚠️ Upstash Redis not configured → Redis disabled');
    return null;
  }

  console.log('🔌 Upstash Redis initialized');

  return new Redis({
    url,
    token,
  });
}

/**
 * Connect Redis (no real connection needed in Upstash)
 */
async function connectRedis() {
  if (client) return client;

  try {
    client = createRedisClient();
    return client;
  } catch (err) {
    console.error('❌ Redis init failed:', err.message);
    client = null;
    return null;
  }
}

/**
 * Health check
 */
async function isRedisHealthy() {
  try {
    if (!client) return false;

    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get cache
 * NOTE: Upstash REST client already returns parsed JSON objects,
 *       so we do NOT need JSON.parse here.
 */
async function getCache(key) {
  try {
    if (!client) return null;
    const prefix = process.env.REDIS_PREFIX || '';
    const val = await client.get(prefix + key);
    if (val === null || val === undefined) return null;

    // Upstash returns already-parsed objects when data was stored as JSON string.
    // If it's already an object/array, return directly. Otherwise try parse.
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return val; }
    }
    return val;
  } catch (e) {
    return null;
  }
}

/**
 * Set cache
 */
async function setCache(key, value, ttl = 300) {
  try {
    if (!client) return;
    const prefix = process.env.REDIS_PREFIX || '';
    await client.set(prefix + key, JSON.stringify(value), {
      ex: ttl,
    });
  } catch (e) {}
}

/**
 * Delete cache — supports single key or array of keys
 */
async function deleteCache(keys) {
  try {
    if (!client) return;

    const keyArray = Array.isArray(keys) ? keys : [keys];
    const prefix = process.env.REDIS_PREFIX || '';
    await Promise.all(keyArray.map(k => client.del(prefix + k)));
  } catch (e) {}
}

module.exports = {
  connectRedis,
  isRedisHealthy,
  getCache,
  setCache,
  deleteCache,
};