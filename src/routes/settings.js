const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');

const SETTINGS_CACHE_KEY = 'settings:current';
const FIXED_SENDER_EMAIL = process.env.GMAIL_SENDER || '2k23.cs2312451@gmail.com';

const DEFAULTS = {
  senderEmail: FIXED_SENDER_EMAIL,
  senderPassword: process.env.GMAIL_APP_PASSWORD || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
};

function cleanString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

function cleanCategoryList(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  return value
    .map(item => cleanString(item))
    .filter(Boolean)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function addCategory(list, category) {
  const next = cleanCategoryList(list) || [];
  const clean = cleanString(category);
  if (!clean) return { error: 'Category required' };
  if (!next.some(item => item.toLowerCase() === clean.toLowerCase())) {
    next.push(clean);
  }
  return { categories: next };
}

function removeCategory(list, category) {
  const clean = cleanString(category);
  if (!clean) return { error: 'Category required' };
  const categories = (cleanCategoryList(list) || []).filter(item => item.toLowerCase() !== clean.toLowerCase());
  return { categories };
}

function normalizeSettings(data) {
  return {
    ...data.toObject(),
    restaurantName: data.restaurantName || '',
    address: data.address || '',
    gstin: data.gstin || '',
    phone: data.phone || '',
    sgstRate: Number(data.sgstRate) || 0,
    cgstRate: Number(data.cgstRate) || 0,
    currency: data.currency || '₹',
    thankYouMsg: data.thankYouMsg || '',
    darkMode: data.darkMode !== false,
    inventoryCategories: cleanCategoryList(data.inventoryCategories) || [],
    menuCategories: cleanCategoryList(data.menuCategories) || [],
    senderEmail: FIXED_SENDER_EMAIL,
    adminEmail: data.adminEmail || DEFAULTS.adminEmail,
  };
}

async function getOrCreateSettings() {
  const existing = await Settings.findOne();
  if (existing) {
    if (existing.senderEmail !== FIXED_SENDER_EMAIL) {
      existing.senderEmail = FIXED_SENDER_EMAIL;
      await existing.save();
    }
    return existing;
  }

  return Settings.create({ senderEmail: FIXED_SENDER_EMAIL });
}

// Add Inventory Category (Admin only)
router.post('/inventory-category', requireRole('admin'), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = addCategory(settings.inventoryCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.inventoryCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.inventoryCategories);
});

// Remove Inventory Category (Admin only)
router.delete('/inventory-category', requireRole('admin'), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = removeCategory(settings.inventoryCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.inventoryCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.inventoryCategories);
});


// Add Menu Category (Admin only)
router.post('/menu-category', requireRole('admin'), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = addCategory(settings.menuCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.menuCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.menuCategories);
});

// Remove Menu Category (Admin only)
router.delete('/menu-category', requireRole('admin'), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = removeCategory(settings.menuCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.menuCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.menuCategories);
});


// GET settings (All authenticated users can read settings)
router.get('/', async (req, res) => {
  const cached = await getCache(SETTINGS_CACHE_KEY);
  if (cached) return res.json(cached);

  const data = await getOrCreateSettings();
  const normalized = normalizeSettings(data);
  await setCache(SETTINGS_CACHE_KEY, normalized, 300);
  res.json(normalized);
});

// UPDATE settings (Admin only)
router.put('/', requireRole('admin'), async (req, res) => {
  const settings = await getOrCreateSettings();

  if (req.body.restaurantName !== undefined) settings.restaurantName = cleanString(req.body.restaurantName);
  if (req.body.address !== undefined) settings.address = cleanString(req.body.address);
  if (req.body.gstin !== undefined) settings.gstin = cleanString(req.body.gstin).toUpperCase();
  if (req.body.phone !== undefined) settings.phone = cleanString(req.body.phone);
  if (req.body.sgstRate !== undefined) settings.sgstRate = cleanNumber(req.body.sgstRate, settings.sgstRate);
  if (req.body.cgstRate !== undefined) settings.cgstRate = cleanNumber(req.body.cgstRate, settings.cgstRate);
  if (req.body.currency !== undefined) settings.currency = cleanString(req.body.currency, '₹').slice(0, 4) || '₹';
  if (req.body.thankYouMsg !== undefined) settings.thankYouMsg = cleanString(req.body.thankYouMsg);
  if (req.body.darkMode !== undefined) settings.darkMode = !!req.body.darkMode;
  if (req.body.adminEmail !== undefined) settings.adminEmail = cleanString(req.body.adminEmail).toLowerCase();

  const inventoryCategories = cleanCategoryList(req.body.inventoryCategories);
  if (inventoryCategories) settings.inventoryCategories = inventoryCategories;

  const menuCategories = cleanCategoryList(req.body.menuCategories);
  if (menuCategories) settings.menuCategories = menuCategories;

  settings.senderEmail = FIXED_SENDER_EMAIL;
  await settings.save();
  const normalized = normalizeSettings(settings);
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(normalized);
});

module.exports = router;
