import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { apiUrl, authFetch } from '../lib/api';
import io from 'socket.io-client';

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
    permissions: ['billing','menu','orders','sales','workers','inventory','settings','kitchen']
  },
  manager: {
    label: 'Manager',
    level: 2,
    color: '#B8860B',
    permissions: ['billing','menu','orders','sales','inventory','settings','kitchen']
  },
  staff: {
    label: 'Staff',
    level: 1,
    color: '#22C55E',
    permissions: ['billing','orders','inventory','kitchen']
  },
};

const MENU_CACHE = 'ht_menu_cache';
const SETTINGS_CACHE = 'ht_settings_cache';
const WORKERS_CACHE = 'ht_workers_cache';
const INVENTORY_CACHE = 'ht_inventory_cache';

const NUM_TABLES = 20;

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
  directPrinting:  false,
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
    if (!res.ok) { console.log(`API ${res.status}: ${url}`); return null; }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`Fetch failed: ${url}`, err.message);
    return null;
  }
}

export function AppProvider({ children }) {
  // ── Auth ────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
  });

  // ── Socket.IO ────────────────────────────────────────────────────
  const [socket, setSocket] = useState(null);
  
  useEffect(() => {
    if (!currentUser) {
      if (socket) socket.disconnect();
      setSocket(null);
      return;
    }

    const newSocket = io(window.location.origin, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket'], // Force websocket to fix Render disconnect loops
      auth: {
        token: localStorage.getItem(TOKEN_KEY),
      }
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket.IO connected');
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
    });

    newSocket.on('INVENTORY_UPDATED', (data) => {
      if (data && data.inventory) {
        setInventory(data.inventory);
        setMenuItems(prev => prev.map(item => {
          const match = data.inventory.find(inv => inv.name?.toLowerCase().trim() === item.name?.toLowerCase().trim());
          return match ? { ...item, available: match.stock > 0 } : item;
        }));
        localStorage.setItem(INVENTORY_CACHE, JSON.stringify(data.inventory));
      }
    });

    newSocket.on('TABLE_SESSION_UPDATED', () => {
      safeFetch(apiUrl('/api/orders/sessions/active')).then(setActiveSessions);
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) newSocket.disconnect();
    };
  }, [currentUser]);

  // ── KOT & Table Session State ───────────────────────────────────
  const [kotSessions, setKotSessions] = useState({}); // { tableNo: { kots: [], status, etc } }
  const [currentSession, setCurrentSession] = useState(null); // { tableNo, orderId, activeKots, etc }
  const [kots, setKots] = useState([]);

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
  const [menuItems,    setMenuItems]    = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [workers,      setWorkers]      = useState([]);
  const [inventory,    setInventory]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const applyInventoryUpdate = useCallback((nextInventory) => {
    if (!Array.isArray(nextInventory)) return;
    setInventory(nextInventory);
    setMenuItems(prev => prev.map(item => {
      const match = nextInventory.find(inv => inv.name?.toLowerCase().trim() === item.name?.toLowerCase().trim());
      return match ? { ...item, available: match.stock > 0 } : item;
    }));
    localStorage.setItem(INVENTORY_CACHE, JSON.stringify(nextInventory));
  }, []);

  // ── Tables — persist to localStorage ────────────────────────────
  const [tableBills, _setTableBills] = useState(loadTableBills);
  const setTableBills = useCallback((updater) => {
    _setTableBills(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTableBills(next);
      return next;
    });
  }, []);

  const [activeTableId,   setActiveTableId]   = useState(null);
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
        safeFetch(apiUrl('/api/orders/sessions/active')),
      ]);

      if (results[0].status === 'fulfilled' && Array.isArray(results[0].value)) {
        setMenuItems(results[0].value);
      }
      if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) {
        setOrderHistory([...results[1].value].sort((a,b)=>new Date(b.date)-new Date(a.date)));
      }
      if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
        setWorkers(results[2].value);
      }
      if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) {
        setInventory(results[3].value);
      }
      if (results[4].status === 'fulfilled' && results[4].value && !Array.isArray(results[4].value)) {
        setSettings(results[4].value);
      }
      if (results[5].status === 'fulfilled' && Array.isArray(results[5].value)) {
        setActiveSessions(results[5].value);
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

    const drinkItems = inv
      .filter(i => {
        // Only merge if not already in menu to avoid duplicates
        return !menu.some(m => m.name.toLowerCase() === i.name.toLowerCase());
      })
      .map(i => ({ 
        ...i, 
        department: 'bar',
        imageUrl: getImg(i),
        available: i.stock > 0, 
        isInventory: true 
      }));
    
    const processedMenu = menu.map(m => ({
      ...m,
      department: m.department || 'kitchen',
      imageUrl: getImg(m),
      available: m.available !== false,
      isInventory: false
    }));

    return [...processedMenu, ...drinkItems];
  }, [menuItems, inventory]);

  // ── Filtered menu ────────────────────────────────────────────────
  const filteredMenu = useMemo(() => {
    return allSellableItems.filter(item => {
      const mc = categoryFilter === 'All' || item.category === categoryFilter;
      const query = menuSearch.toLowerCase();
      const ms = item.name.toLowerCase().includes(query) || (item.shortcut || '').toLowerCase().includes(query);
      return mc && ms;
    });
  }, [allSellableItems, categoryFilter, menuSearch]);

  const categories = useMemo(() => {
    const cats = allSellableItems.map(i => i.category).filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [allSellableItems]);

  // ── Table helpers ────────────────────────────────────────────────
  const selectTable = useCallback((id) => setActiveTableId(id), []);

  const updateTableItem = useCallback((tableId, itemId, action) => {
    if (!tableId) return;

    setTableBills(prev => {
      const current = prev[tableId] || { 
        items: [], discount: '', customerPhone: '', customerName: '', startTime: null, dueAmount: 0 
      };

      const tableItems = [...current.items];
      const idx = tableItems.findIndex(i => String(i._id) === String(itemId));
      const masterItem = allSellableItems.find(i => String(i._id) === String(itemId));

      if (action === 'increase') {
        if (idx >= 0) {
          tableItems[idx] = { ...tableItems[idx], quantity: (tableItems[idx].quantity || 0) + 1 };
        } else if (masterItem) {
          tableItems.push({ ...masterItem, quantity: 1 });
        }
        if (!current.startTime) current.startTime = new Date().toISOString();
      } else if (action === 'decrease' && idx >= 0) {
        if (tableItems[idx].quantity <= 1) tableItems.splice(idx, 1);
        else tableItems[idx] = { ...tableItems[idx], quantity: tableItems[idx].quantity - 1 };
      } else if (action === 'remove' && idx >= 0) {
        tableItems.splice(idx, 1);
      }

      return { ...prev, [tableId]: { ...current, items: tableItems } };
    });
  }, [setTableBills, allSellableItems]);

  const clearTable = useCallback((tableId) => {
    setTableBills(prev => ({
      ...prev,
      [tableId]: { items:[], discount:'', customerPhone:'', customerName:'', startTime:null, dueAmount:0 }
    }));
  }, [setTableBills]);

  const setItemNote = useCallback((tableId, itemId, note) => {
    if (!tableId) return;
    setTableBills(prev => {
      const current = prev[tableId] || { items: [] };
      const tableItems = [...current.items];
      const idx = tableItems.findIndex(i => String(i._id) === String(itemId));
      if (idx >= 0) {
        tableItems[idx] = { ...tableItems[idx], note };
      }
      return { ...prev, [tableId]: { ...current, items: tableItems } };
    });
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


  const getTableStatus = useCallback((tableId) => {
    const tableNo = parseInt(tableId.substring(1));
    const session = activeSessions.find(s => s.tableNo === tableNo);
    const t = tableBills[tableId];
    
    let kotItemsCount = 0;
    if (session && Array.isArray(session.kotIds)) {
      session.kotIds.forEach(kot => {
        if (Array.isArray(kot.items)) {
          kot.items.forEach(item => {
            kotItemsCount += item.quantity;
          });
        }
      });
    }
    
    let pendingItemsCount = 0;
    if (t && t.items && t.items.length > 0) {
      pendingItemsCount = t.items.length;
    } else if (session && Array.isArray(session.pendingItems)) {
      pendingItemsCount = session.pendingItems.length;
    }
    
    const hasItems = (kotItemsCount + pendingItemsCount) > 0;
    const isDue = (session?.activeOrderId?.dueAmount > 0) || (t && t.dueAmount > 0);
    
    if (isDue) return 'due';
    if (hasItems) return 'occupied';
    
    return 'free';
  }, [tableBills, activeSessions]);

  const getTableInfo = useCallback((tableId) => {
    const tableNo = parseInt(tableId.substring(1));
    const session = activeSessions.find(s => s.tableNo === tableNo);
    const localBill = tableBills[tableId] || { items: [] };

    let kotItemsCount = 0;
    let kotTotal = 0;
    if (session && Array.isArray(session.kotIds)) {
      session.kotIds.forEach(kot => {
        if (Array.isArray(kot.items)) {
          kot.items.forEach(item => {
            kotItemsCount += item.quantity;
            kotTotal += (item.price || 0) * item.quantity;
          });
        }
      });
    }

    let pendingItemsCount = 0;
    let pendingTotal = 0;
    if (localBill.items && localBill.items.length > 0) {
      localBill.items.forEach(item => {
        pendingItemsCount += item.quantity;
        pendingTotal += (item.price || 0) * item.quantity;
      });
    } else if (session && Array.isArray(session.pendingItems)) {
      session.pendingItems.forEach(item => {
        pendingItemsCount += item.quantity;
        pendingTotal += (item.price || 0) * item.quantity;
      });
    }

    return {
      itemsCount: kotItemsCount + pendingItemsCount,
      totalAmount: kotTotal + pendingTotal
    };
  }, [tableBills, activeSessions]);

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

      const savedResponse = await res.json();
      const { inventory: nextInventory, ...saved } = savedResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);
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
  }, [tableBills, activeTableId, orderHistory, billTotals, clearTable, setTableField, applyInventoryUpdate]);

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

  // settleOrder removed — payments consolidated in finalizeBill/generateBill flows

  // ── KOT Functions ───────────────────────────────────────────────
  const openTableSession = useCallback(async (tableNo, waiterName = '', orderType = 'dine-in') => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/table/${tableNo}/open`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waiterName, orderType })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to open table');
      }
      const session = await res.json();
      setCurrentSession(session);
      setActiveSessions(prev => {
        const filtered = prev.filter(s => s.tableNo !== session.tableNo);
        return [...filtered, session];
      });
      if (socket) {
        socket.emit('join-table', tableNo);
        socket.emit('table-updated', { tableNo, senderId: socket.id });
      }
      return session;
    } catch (err) {
      console.error('Open table error:', err);
      throw err;
    }
  }, [socket]);

  const syncTableSession = useCallback(async (tableNo, pendingItems, totalAmount, waiterName = '', orderType = 'dine-in') => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/table/${tableNo}/session`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingItems, totalAmount, waiterName, orderType })
      });
      if (!res.ok) throw new Error('Failed to sync session');
      const session = await res.json();
      if (session.message) return null; // Harmless race condition (session already completed)
      
      setCurrentSession(session);
      setActiveSessions(prev => {
        const filtered = prev.filter(s => s.tableNo !== session.tableNo);
        return [...filtered, session];
      });
      if (socket) {
        socket.emit('table-updated', { tableNo, senderId: socket.id });
      }
      return session;
    } catch (err) {
      console.error('Sync session error:', err);
    }
  }, [socket]);

  const createKOT = useCallback(async (orderId, tableNo, items, notes = '', waiterName = '', orderType = 'dine-in') => {
    try {
      const res = await authFetch(apiUrl('/api/kots'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, tableNo, items, notes, waiterName, orderType })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to create KOT');
      }
      const kotResponse = await res.json();
      const { inventory: nextInventory, ...kot } = kotResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);
      setKots(prev => [kot, ...prev]);
      if (socket) socket.emit('kot-created', kot);
      return kot;
    } catch (err) {
      console.error('Create KOT error:', err);
      throw err;
    }
  }, [socket, applyInventoryUpdate]);

  const updateKOTStatus = useCallback(async (kotId, status) => {
    try {
      const res = await authFetch(apiUrl(`/api/kots/${kotId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update KOT');
      const updated = await res.json();
      setKots(prev => prev.map(k => k._id === kotId ? updated : k));
      if (socket) socket.emit('kot-status-updated', updated);
      return updated;
    } catch (err) {
      console.error('Update KOT error:', err);
      throw err;
    }
  }, [socket]);

  const finalizeBill = useCallback(async (orderId, items, subtotal, sgst, cgst, discount, roundOff, grandTotal, waiterName = '', orderType = 'dine-in', customerName = '', customerPhone = '') => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/finalize-bill`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, subtotal, sgst, cgst, discount, roundOff, grandTotal, waiterName, orderType, customerName, customerPhone })
      });
      if (!res.ok) throw new Error('Failed to finalize bill');
      const orderResponse = await res.json();
      const { inventory: nextInventory, ...order } = orderResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);
      setOrderHistory(prev => {
        const historyArray = Array.isArray(prev) ? prev : [];
        const exists = historyArray.some(o => o._id === orderId);
        if (exists) {
          return historyArray.map(o => o._id === orderId ? order : o);
        } else {
          return [order, ...historyArray];
        }
      });
      return order;
    } catch (err) {
      console.error('Finalize bill error:', err);
      throw err;
    }
  }, [applyInventoryUpdate]);

  const completeOrder = useCallback(async (orderId) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/complete`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to complete order');
      const order = await res.json();
      setOrderHistory(prev => {
        const historyArray = Array.isArray(prev) ? prev : [];
        const exists = historyArray.some(o => o._id === orderId);
        if (exists) {
          return historyArray.map(o => o._id === orderId ? order : o);
        } else {
          return [order, ...historyArray];
        }
      });
      if (socket && order.tableNo) socket.emit('order-completed', { tableNo: order.tableNo, orderId });
      return order;
    } catch (err) {
      console.error('Complete order error:', err);
      throw err;
    }
  }, [socket]);

  return (
    <AppContext.Provider value={{
      currentUser, login, logout,
      forgotPassword, resetPassword,
      role, can, canAccessRole, ROLE_HIERARCHY,
      settings, setSettings, saveSettings,
      activeSection, setActiveSection,
      sidebarOpen, setSidebarOpen,
      menuItems, orderHistory, workers,
      inventory, setInventory,
      saveInventoryItem, deleteInventoryItem,
      loading, error, loadData,
      tableBills, setTableBills, activeTableId, selectTable,
      updateTableItem, clearTable, setTableField, setItemNote,
      allSellableItems, billTotals, filteredMenu, categories,
      categoryFilter, setCategoryFilter,
      menuSearch, setMenuSearch,
      getTableStatus, generateBill,
      activeSessions, getTableInfo,
      invoiceOrder, setInvoiceOrder,
      saveMenuItem, deleteMenuItem,
      saveWorker, deleteWorker, updateWorkerStatus,
      toast, showToast,
      NUM_TABLES,
      // Socket.IO & KOT functions
      socket,
      kotSessions, currentSession, kots,
      openTableSession, syncTableSession, createKOT, updateKOTStatus, finalizeBill, completeOrder,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
