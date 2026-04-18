import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { apiUrl, authFetch } from '../lib/api';

const AppContext = createContext(null);
const TABLES_KEY = 'humtum_table_bills_v2';
const AUTH_KEY   = 'humtum_auth_v2';
const TOKEN_KEY  = 'humtum_token_v2';

// ── Role hierarchy ──────────────────────────────────────────────
// admin > manager > staff  (admin can access all lower role views)
export const ROLE_HIERARCHY = {
  admin: {
    label: 'Admin',
    level: 3,
    color: '#FF8C00',
    permissions: ['billing','menu','orders','sales','workers','inventory','settings']
  },
  manager: {
    label: 'Manager',
    level: 2,
    color: '#3B82F6',
    permissions: ['billing','menu','orders','sales','inventory','settings']
  },
  staff: {
    label: 'Staff',
    level: 1,
    color: '#22C55E',
    permissions: ['billing','orders','inventory']
  },
};

const MENU_CACHE = 'ht_menu_cache';
const SETTINGS_CACHE = 'ht_settings_cache';
const WORKERS_CACHE = 'ht_workers_cache';
const INVENTORY_CACHE = 'ht_inventory_cache';

const NUM_TABLES = 12;

const DEFAULT_SETTINGS = {
  restaurantName:  'HumTum Bar & Restaurant',
  address:         'Rajendra Nagar, Gorakhpur',
  gstin:           '09AXFPG9491D1Z8',
  phone:           '',
  sgstRate:        2.5,
  cgstRate:        2.5,
  currency:        '₹',
  thankYouMsg:     'Thank you for visiting!',
  darkMode:        true,
  adminEmail:      '',
  senderEmail:     '',
};

function initTables() {
  const t = {};
  for (let i = 1; i <= NUM_TABLES; i++) {
    t[`T${i}`] = { items:[], discount:'', customerPhone:'', customerName:'', startTime:null, dueAmount:0 };
  }
  return t;
}

function loadTableBills() {
  try {
    const raw = localStorage.getItem(TABLES_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const base = initTables();
      return { ...base, ...saved };
    }
  } catch {}
  return initTables();
}

function saveTableBills(bills) {
  try { localStorage.setItem(TABLES_KEY, JSON.stringify(bills)); } catch {}
}

async function safeFetch(url) {
  try {
    const res = await authFetch(url);
    if (!res.ok) { console.error(`API ${res.status}: ${url}`); return []; }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Fetch failed: ${url}`, err.message);
    return [];
  }
}

export function AppProvider({ children }) {
  // ── Auth ────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
  });

  // ── Settings ────────────────────────────────────────────────────
  const [settings, _setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE);
      return cached ? { ...DEFAULT_SETTINGS, ...JSON.parse(cached) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const setSettings = useCallback((updater) => {
    _setSettings(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
      return next;
    });
  }, []);

  const saveSettings = useCallback(async (updates) => {
    const previousSettings = settings;
    // Optimistic update
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
      return next;
    });

    try {
      const res = await authFetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to save settings');
      const saved = await res.json();
      // Sync with server response
      setSettings(prev => {
        const next = { ...DEFAULT_SETTINGS, ...prev, ...saved };
        localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
        return next;
      });
      return saved;
    } catch (err) {
      // Rollback on error
      setSettings(previousSettings);
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(previousSettings));
      console.error('Save settings error', err);
      throw err;
    }
  }, [settings]);

  useEffect(() => {
    // Only fetch settings if logged in
    if (!currentUser) return;
    (async () => {
      try {
        const res = await authFetch(apiUrl('/api/settings'));
        if (res.ok) {
          const data = await res.json();
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        }
      } catch {}
    })();
    // Expose menu context update for InventoryPage
    window.updateMenuContext = (menuData) => {
      if (menuData) setMenuItems(menuData);
      else authFetch(apiUrl('/api/menu')).then(r=>r.json()).then(setMenuItems).catch(()=>{});
    };
    return () => { delete window.updateMenuContext; };
  }, [currentUser]);

  // ── UI ──────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('billing');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);

  // ── Data ────────────────────────────────────────────────────────
  const [menuItems,    setMenuItems]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(MENU_CACHE)) || []; } catch { return []; }
  });
  const [orderHistory, setOrderHistory] = useState([]);
  const [workers,      setWorkers]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(WORKERS_CACHE)) || []; } catch { return []; }
  });
  const [inventory,    setInventory]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(INVENTORY_CACHE)) || []; } catch { return []; }
  });
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // ── Tables — persist to localStorage ────────────────────────────
  const [tableBills, _setTableBills] = useState(loadTableBills);
  const setTableBills = useCallback((updater) => {
    _setTableBills(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTableBills(next);
      return next;
    });
  }, []);

  const [activeTableId,   setActiveTableId]   = useState('T1');
  const [categoryFilter,  setCategoryFilter]  = useState('All');
  const [menuSearch,      setMenuSearch]      = useState('');
  const [invoiceOrder,    setInvoiceOrder]    = useState(null);
  
  // ── Notifications ───────────────────────────────────────────────
  const [toast, setToast] = useState(null); // { msg, type }
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Auth helpers ────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { error: data.error || 'Invalid username or password' };
      }

      // Store token and user info
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
      setCurrentUser(data.user);
      return { success: true };
    } catch (err) {
      return { error: 'Network error. Please check your connection.' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
  }, []);

  // ── Forgot Password ───────────────────────────────────────────
  const forgotPassword = useCallback(async (email) => {
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to send OTP' };
      return { success: true, message: data.message };
    } catch (err) {
      return { error: 'Network error' };
    }
  }, []);

  const resetPassword = useCallback(async (email, otp, newPassword) => {
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to reset password' };
      return { success: true, message: data.message };
    } catch (err) {
      return { error: 'Network error' };
    }
  }, []);

  const isFetching = React.useRef(false);
  const loadData = useCallback(async (isSilent = false) => {
    if (isFetching.current) return;
    isFetching.current = true;
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        safeFetch(apiUrl('/api/menu')),
        safeFetch(apiUrl('/api/orders')),
        safeFetch(apiUrl('/api/workers')),
        safeFetch(apiUrl('/api/inventory')),
        safeFetch(apiUrl('/api/settings')),
      ]);

      if (results[0].status === 'fulfilled') {
        setMenuItems(results[0].value);
        localStorage.setItem(MENU_CACHE, JSON.stringify(results[0].value));
      }
      if (results[1].status === 'fulfilled') setOrderHistory([...results[1].value].sort((a,b)=>new Date(b.date)-new Date(a.date)));
      if (results[2].status === 'fulfilled') {
        setWorkers(results[2].value);
        localStorage.setItem(WORKERS_CACHE, JSON.stringify(results[2].value));
      }
      if (results[3].status === 'fulfilled') {
        setInventory(results[3].value);
        localStorage.setItem(INVENTORY_CACHE, JSON.stringify(results[3].value));
      }
      if (results[4].status === 'fulfilled' && results[4].value && !Array.isArray(results[4].value)) {
        setSettings(results[4].value);
      }

    } catch (err) {
      if (!isSilent) setError('Failed to load data');
    } finally {
      if (!isSilent) setLoading(false);
      isFetching.current = false;
    }
  }, [setMenuItems, setWorkers, setInventory, setSettings]);

  const role = (currentUser?.role || 'staff').toLowerCase();
  const can = useCallback((action) => {
    return ROLE_HIERARCHY[role]?.permissions?.includes(action) || false;
  }, [role]);

  const canAccessRole = useCallback((targetRole) => {
    const myLevel  = ROLE_HIERARCHY[role]?.level || 0;
    const tgtLevel = ROLE_HIERARCHY[targetRole?.toLowerCase()]?.level || 0;
    return myLevel >= tgtLevel;
  }, [role]);

  // ── Table helpers ────────────────────────────────────────────────
  const selectTable = useCallback((id) => setActiveTableId(id), []);

  const updateTableItem = useCallback(async (tableId, itemId, action, items) => {
    setTableBills(prev => {
      const table = { ...prev[tableId], items: [...prev[tableId].items] };
      const idx   = table.items.findIndex(i => i._id === itemId);
      const item  = (Array.isArray(items) ? items : []).find(i => i._id === itemId);
      if (action === 'increase') {
        if (idx >= 0) table.items[idx] = { ...table.items[idx], quantity: table.items[idx].quantity + 1 };
        else if (item) table.items.push({ ...item, quantity: 1 });
        if (!table.startTime) table.startTime = new Date().toISOString();
      } else if (action === 'decrease') {
        if (idx >= 0) {
          if (table.items[idx].quantity <= 1) table.items.splice(idx, 1);
          else table.items[idx] = { ...table.items[idx], quantity: table.items[idx].quantity - 1 };
        }
      } else if (action === 'remove') {
        if (idx >= 0) table.items.splice(idx, 1);
      }
      return { ...prev, [tableId]: table };
    });
  }, [setTableBills]);

  const clearTable = useCallback((tableId) => {
    setTableBills(prev => ({
      ...prev,
      [tableId]: { items:[], discount:'', customerPhone:'', customerName:'', startTime:null, dueAmount:0 }
    }));
  }, [setTableBills]);

  const setTableField = useCallback((tableId, field, val) => {
    setTableBills(prev => ({ ...prev, [tableId]: { ...prev[tableId], [field]: val } }));
  }, [setTableBills]);

  // ── Bill totals ──────────────────────────────────────────────────
  const billTotals = useMemo(() => {
    const table    = tableBills[activeTableId] || { items:[], discount:'' };
    const subtotal = table.items.reduce((s,i) => s + i.price * i.quantity, 0);
    const sgst     = subtotal * (settings.sgstRate / 100);
    const cgst     = subtotal * (settings.cgstRate / 100);
    const dv       = (table.discount || '').trim();
    const discountAmount = Math.round(dv.endsWith('%')
      ? subtotal * (parseFloat(dv)/100) || 0
      : parseFloat(dv) || 0);
    const rawTotal = subtotal + sgst + cgst - discountAmount;
    const grandTotal = Math.round(Math.max(0, rawTotal));
    const roundOff = (grandTotal - rawTotal);
    return { subtotal, sgst, cgst, discountAmount, grandTotal, roundOff };
  }, [tableBills, activeTableId, settings]);

  // ── All sellable items (Menu + Inventory drink items) ─────────────
  const allSellableItems = useMemo(() => {
    const menu = menuItems || [];
    const inv  = inventory || [];

    const getImg = (item) => {
      if (item.imageUrl && item.imageUrl.startsWith('http')) return item.imageUrl;
      const cat = item.category?.toLowerCase() || '';
      if (cat.includes('beer')) return 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=320';
      if (cat.includes('liquor')) return 'https://images.unsplash.com/photo-1527281400683-19dd761dc442?w=320';
      if (cat.includes('soft') || cat.includes('can')) return 'https://images.unsplash.com/photo-1622708782522-d19597a94c21?w=320';
      if (cat.includes('main') || cat.includes('starter')) return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=320';
      return `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name?.slice(0,1) || 'I')}`;
    };

    const drinkItems = inv.map(i => ({ 
      ...i, 
      imageUrl: getImg(i),
      available: i.stock > 0, 
      isInventory: true 
    }));
    
    const processedMenu = menu.map(m => ({
      ...m,
      imageUrl: getImg(m),
      available: m.available !== false,
      isInventory: false
    }));

    return [...processedMenu, ...drinkItems];
  }, [menuItems, inventory]);

  const filteredMenu = useMemo(() => {
    return allSellableItems.filter(item => {
      const mc = categoryFilter === 'All' || item.category === categoryFilter;
      const ms = item.name.toLowerCase().includes(menuSearch.toLowerCase());
      return mc && ms;
    });
  }, [allSellableItems, categoryFilter, menuSearch]);

  const categories = useMemo(() => {
    const mc = Array.isArray(settings.menuCategories) ? settings.menuCategories : [];
    const ic = Array.isArray(settings.inventoryCategories) ? settings.inventoryCategories : [];
    return ['All', ...new Set([...mc, ...ic])];
  }, [settings]);

  const getTableStatus = useCallback((tableId) => {
    const t = tableBills[tableId];
    if (!t || t.items.length === 0) return 'free';
    if (t.dueAmount > 0) return 'due';
    return 'occupied';
  }, [tableBills]);

  // ── Generate bill (with proper error handling) ──────────────────
  const generateBill = useCallback(async (paymentMode, paidAmount) => {
    const table = tableBills[activeTableId];
    if (!table || table.items.length === 0) return { error: 'No items in bill' };

    const { subtotal, sgst, cgst, discountAmount, grandTotal, roundOff } = billTotals;
    const paid = parseFloat(paidAmount) || grandTotal;
    const due  = Math.max(0, grandTotal - paid);

    const orderData = {
      tableNo: parseInt(activeTableId.substring(1)),
      items:   table.items.map(i => ({ name:i.name, quantity:i.quantity, price:i.price })),
      subtotal, sgst, cgst,
      discount:      discountAmount,
      roundOff,
      grandTotal,
      paidAmount:    paid,
      dueAmount:     due,
      paymentMode,
      date:          new Date().toISOString(),
      customerPhone: table.customerPhone || '',
      customerName:  table.customerName  || '',
    };

    try {
      const res = await authFetch(apiUrl('/api/orders'), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(orderData)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Server error (${res.status})`);
      }

      const saved = await res.json();
      setOrderHistory(prev => [saved, ...(Array.isArray(prev)?prev:[])]);
      setInvoiceOrder(saved);
      // ← Table cleared ONLY here, after successful DB save
      if (due === 0) clearTable(activeTableId);
      else setTableField(activeTableId, 'dueAmount', due);
      return { success:true, order:saved };
    } catch (err) {
      console.error('Generate bill error:', err);
      return { error: err.message || 'Failed to generate bill' };
    }
  }, [tableBills, activeTableId, orderHistory, billTotals, clearTable, setTableField]);

  // ── Menu CRUD ────────────────────────────────────────────────────
  const saveMenuItem = useCallback(async (data, id) => {
    const previousMenu = menuItems;
    if (id) {
      // Optimistic update for toggles/edits
      setMenuItems(prev => prev.map(i => i._id === id ? { ...i, ...data } : i));
    }

    try {
      const method = id ? 'PUT' : 'POST';
      const url    = id ? apiUrl(`/api/menu/${id}`) : apiUrl('/api/menu');
      const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      
      if (!res.ok) throw new Error('Failed to save menu item');
      
      const saved = await res.json();
      setMenuItems(prev => id ? prev.map(i => i._id === id ? saved : i) : [...prev, saved]);
      return saved;
    } catch (err) {
      if (id) setMenuItems(previousMenu); // Rollback
      console.error('Save menu item error:', err);
      throw err;
    }
  }, [menuItems]);

  const deleteMenuItem = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/menu/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setMenuItems(prev => prev.filter(i=>i._id!==id));
  }, []);

  // ── Worker CRUD ──────────────────────────────────────────────────────
  const saveWorker = useCallback(async (data, id) => {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? apiUrl(`/api/workers/${id}`) : apiUrl('/api/workers');
    const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to save worker');
    const saved = await res.json();
    setWorkers(prev => id ? prev.map(w=>w._id===id?saved:w) : [...prev, saved]);
    return saved;
  }, []);

  const deleteWorker = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/workers/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setWorkers(prev => prev.filter(w=>w._id!==id));
  }, []);

  const updateWorkerStatus = useCallback((id, isActive) => {
    setWorkers(prev => prev.map(w => {
      if (w.userId?._id === id || w.userId === id) {
        return { ...w, userId: { ...w.userId, isActive } };
      }
      return w;
    }));
  }, []);

  const saveInventoryItem = useCallback(async (data, id) => {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? apiUrl(`/api/inventory/${id}`) : apiUrl('/api/inventory');
    const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to save inventory');
    const saved = await res.json();
    setInventory(prev => id ? prev.map(i=>i._id===id?saved:i) : [...prev, saved]);
    return saved;
  }, []);

  const deleteInventoryItem = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/inventory/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setInventory(prev => prev.filter(i=>i._id!==id));
  }, []);

  const settleOrder = useCallback(async (orderId, paidAmount, paymentMode) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/settle`), {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ paidAmount, paymentMode })
      });
      if (!res.ok) throw new Error('Failed to settle order');
      const saved = await res.json();
      setOrderHistory(prev => prev.map(o => o._id === orderId ? saved : o));
      return saved;
    } catch (err) {
      console.error('Settle order error:', err);
      throw err;
    }
  }, []);

  return (
    <AppContext.Provider value={{
      currentUser, login, logout,
      forgotPassword, resetPassword,
      role, can, canAccessRole, ROLE_HIERARCHY,
      settings, saveSettings,
      activeSection, setActiveSection,
      sidebarOpen, setSidebarOpen,
      menuItems, orderHistory, workers,
      inventory, setInventory,
      saveInventoryItem, deleteInventoryItem,
      loading, error, loadData,
      tableBills, activeTableId, selectTable,
      updateTableItem, clearTable, setTableField,
      allSellableItems, billTotals, filteredMenu, categories,
      categoryFilter, setCategoryFilter,
      menuSearch, setMenuSearch,
      getTableStatus, generateBill, settleOrder,
      invoiceOrder, setInvoiceOrder,
      saveMenuItem, deleteMenuItem,
      saveWorker, deleteWorker, updateWorkerStatus,
      toast, showToast,
      NUM_TABLES,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
