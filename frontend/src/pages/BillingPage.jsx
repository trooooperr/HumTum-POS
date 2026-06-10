import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Search, Trash2, Printer, UtensilsCrossed, X, Menu } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
const PM = ['cash', 'card', 'upi'];
const qz = window.qz;

/* COMPACT TABLE PILL */
function TableCard({ id, isActive, status, num, onClick }) {
  return (
    <button className={`tcard-mini ${status}${isActive ? ' active' : ''}`} onClick={onClick}>
      <span className="tnum-mini">{num}</span>
      <div className={`tstatus-dot ${status}`} />
    </button>
  );
}

function TableTile({ id, status, num, total, items, currency, onClick, isVip }) {
  const isOccupied = status === 'occupied';
  const isDue = status === 'due';
  const isFree = !isOccupied && !isDue;
  const statusLabel = isOccupied ? 'Active' : isDue ? 'Due' : 'Free';

  return (
    <button
      className={`table-tile ${status}${isVip ? ' vip-tile' : ''}`}
      onClick={onClick}
    >
      {isVip && <div className="vip-shimmer" />}
      <div className="table-tile-inner">
        <div className="table-tile-header">
          <div className="table-tile-icon">
            {isVip && <span className="vip-crown">♛</span>}
            <span className="table-tile-number">T{num}</span>
          </div>
          <span className={`table-tile-status ${status}`}>{statusLabel}</span>
        </div>
        {isVip && <span className="vip-label">VIP</span>}
        <div className="table-tile-footer">
          {isFree ? (
            <span className="table-tile-free-hint">Tap to open</span>
          ) : (
            <>
              <span className="table-tile-items">{items} item{items !== 1 ? 's' : ''}</span>
              <strong className="table-tile-amount">{currency}{total.toFixed(0)}</strong>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/* IMAGE-FOCUS MENU ITEM */
function MenuItem({ item, qty, add, rem, stock, minStock }) {
  const src = item.imageUrl?.startsWith('http') ? item.imageUrl
    : `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0, 1))}`;
  return (
    <div className={`mcard-modern${!item.available ? ' na' : ''}`}>
      <div className="mimg-container">
        <img className="mimg-big" src={src} alt={item.name} onError={e => { e.target.src = `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0, 1))}` }} />
        <div className="m-price-tag" style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 5 }}>₹{item.price.toFixed(0)}</div>
        {!item.available && <div className="sold-out-badge-top" style={{ top: 8, left: 8, right: 'auto' }}>SOLD OUT</div>}
        {stock !== undefined && stock > 0 && (
          <div className={`stock-badge ${stock <= (minStock || 5) ? 'low' : ''}`} style={{ top: 8, right: 8 }}>
            Stock: {stock}
          </div>
        )}
      </div>
      <div className="mbody-modern">
        <div className="mname-modern">{item.name}</div>
        {item.available && (
          <div className="mctrl-modern">
            <button className="qbtn-m" onClick={() => rem(String(item._id), 'decrease')}>−</button>
            <span className="qnum-m" style={{ fontSize: '14px' }}>{qty}</span>
            <button className="qbtn-m" onClick={() => add(String(item._id), 'increase')}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// PayModal and settle UI removed — printing handled directly via doGen/printFinalBill

/* ─── BILLING NAV BAR ─────────────────────────────────────────── */
function BillingNavBar({
  activeTableId, occupiedCount, totalTables,
  onBack, onPrintKOT, onPrintBill,
  pendingCount = 0, allCount = 0, busy = false
}) {
  const vacantCount = totalTables - occupiedCount;
  return (
    <div className="billing-navbar">
      {/* LEFT: Back + Title */}
      <div className="bnav-left">
        {onBack && (
          <button className="bnav-back-btn" onClick={onBack} title="Back to Tables (Esc)">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="bnav-title-group">
          <UtensilsCrossed size={16} className="bnav-icon" />
          <span className="bnav-title">Billing</span>
          {activeTableId && (
            <span className="bnav-table-badge">Table {activeTableId.substring(1)}</span>
          )}
        </div>
      </div>

      {/* CENTER: Shortcuts */}
      {activeTableId && (
        <div className="bnav-shortcuts">
          <button
            className="bnav-shortcut-btn kot"
            onClick={onPrintKOT}
            disabled={pendingCount === 0 || busy}
            title="Print KOT (Ctrl+K)"
          >
            <Printer size={13} />
            <span>KOT</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="bnav-shortcut-btn bill"
            onClick={onPrintBill}
            disabled={allCount === 0 || busy}
            title="Print Bill (Ctrl+Enter)"
          >
            <Printer size={13} />
            <span>Bill</span>
            <kbd>Ctrl ↵</kbd>
          </button>
          <div className="bnav-shortcut-btn esc" title="Back to Tables (Esc)" onClick={onBack}>
            <span>Esc</span>
            <kbd>↩</kbd>
          </div>
        </div>
      )}

      {/* RIGHT: Stats */}
      <div className="bnav-stats">
        <div className="bnav-stat occupied">
          <span className="bnav-stat-dot occ-dot" />
          <div>
            <div className="bnav-stat-num">{occupiedCount}</div>
            <div className="bnav-stat-label">Active</div>
          </div>
        </div>
        <div className="bnav-stat vacant">
          <span className="bnav-stat-dot vac-dot" />
          <div>
            <div className="bnav-stat-num">{vacantCount}</div>
            <div className="bnav-stat-label">Vacant</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const {
    tableBills, setTableBills, activeTableId, selectTable,
    updateTableItem: updateTableItemRaw,
    clearTable: clearTableRaw,
    setTableField: setTableFieldRaw,
    setItemNote: setItemNoteRaw,
    allSellableItems,
    billTotals, filteredMenu, categories, categoryFilter, setCategoryFilter,
    menuSearch, setMenuSearch, inventory, workers, getTableStatus, getTableInfo, settings, NUM_TABLES,
    openTableSession, createKOT, finalizeBill, completeOrder, socket, syncTableSession,
    setSidebarOpen, showToast
  } = useApp();

  const [pm, setPm] = useState('cash');
  const [tableSearch, setTableSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null); // Current order for this table
  const [kots, setKots] = useState([]); // KOTs for current order
  
  // Wrap state setters and actions to track user edit timestamps
  const lastEditRef = useRef({}); // { tableId: timestamp }
  
  const recordLocalEdit = (tableId) => {
    if (tableId) {
      lastEditRef.current[tableId] = Date.now();
    }
  };

  const [orderType, setOrderTypeRaw] = useState('dine-in');
  const [selectedWaiter, setSelectedWaiterRaw] = useState('');

  const setOrderType = (val) => {
    recordLocalEdit(activeTableId);
    setOrderTypeRaw(val);
  };

  const setSelectedWaiter = (val) => {
    recordLocalEdit(activeTableId);
    setSelectedWaiterRaw(val);
  };

  const updateTableItem = (tableId, itemId, action) => {
    recordLocalEdit(tableId);
    updateTableItemRaw(tableId, itemId, action);
  };

  const clearTable = (tableId) => {
    recordLocalEdit(tableId);
    clearTableRaw(tableId);
  };

  const setTableField = (tableId, field, val) => {
    recordLocalEdit(tableId);
    setTableFieldRaw(tableId, field, val);
  };

  const setItemNote = (tableId, itemId, note) => {
    recordLocalEdit(tableId);
    setItemNoteRaw(tableId, itemId, note);
  };

  const [billPanelWidth, setBillPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const searchInputRef = useRef(null);
  const billingGridRef = useRef(null);

  const table = tableBills[activeTableId] || { items: [], customerPhone: '', customerName: '', discount: '' };
  const c = settings.currency;
  const waiterOptions = useMemo(() => {
    return (workers || []).filter(w => {
      const role = String(w.role || '').toLowerCase();
      return role.includes('waiter') || role.includes('staff') || role.includes('server');
    });
  }, [workers]);

  const selectedWaiterObj = useMemo(() => {
    return waiterOptions.find(w => w._id === selectedWaiter) || null;
  }, [waiterOptions, selectedWaiter]);

  // Group sent KOT items and pending items
  const combinedItems = useMemo(() => {
    const sentMap = {};
    (kots || []).forEach(kot => {
      (kot.items || []).forEach(item => {
        const id = item.menuItemId?._id || item.menuItemId;
        const key = id || item.name;
        if (sentMap[key]) {
          sentMap[key].quantity += item.quantity;
        } else {
          sentMap[key] = {
            _id: id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            isSent: true,
            note: item.notes || ''
          };
        }
      });
    });

    const pending = (table.items || []).map(item => ({
      ...item,
      isSent: false
    }));

    return {
      sent: Object.values(sentMap),
      pending,
      all: [...Object.values(sentMap), ...pending]
    };
  }, [kots, table.items]);

  // Combined totals
  const totals = useMemo(() => {
    const subtotal = combinedItems.all.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
    const sgst = subtotal * (settings.sgstRate / 100);
    const cgst = subtotal * (settings.cgstRate / 100);
    const dv = (table.discount || '').trim();
    const discountAmount = Math.round(dv.endsWith('%')
      ? subtotal * (parseFloat(dv) / 100) || 0
      : parseFloat(dv) || 0);
    const rawTotal = subtotal + sgst + cgst - discountAmount;
    const grandTotal = Math.max(0, Math.round(rawTotal));
    const roundOff = grandTotal - rawTotal;
    return { subtotal, sgst, cgst, discountAmount, grandTotal, roundOff };
  }, [combinedItems.all, table.discount, settings]);

  const { subtotal, sgst, cgst, discountAmount, grandTotal, roundOff } = totals;

  const tableList = Array.from({ length: NUM_TABLES }, (_, i) => {
    const id = `T${i + 1}`;
    const info = getTableInfo(id);
    return { id, num: i + 1, status: getTableStatus(id), items: info.itemsCount, total: info.totalAmount };
  });
  const occupiedCount = tableList.filter(t => t.status !== 'free').length;

  const [billError, setBillError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 750 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (event) => {
      const container = billingGridRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(600, Math.max(420, rect.right - event.clientX));
      setBillPanelWidth(newWidth);
    };
    const onMouseUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);


  // When table is selected, load/open session
  const ensureActiveOrder = async (tableIdOverride) => {
    const targetTableId = tableIdOverride || activeTableId;
    if (!targetTableId) return null;
    const tableNo = parseInt(targetTableId.substring(1));

    try {
      const response = await authFetch(apiUrl(`/api/orders/table/${tableNo}/session`));

      let session;
      if (response.ok) {
        session = await response.json();
      } else if (response.status === 404) {
        session = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
      } else {
        throw new Error('Unable to load table session');
      }

      const orderId = session?.activeOrderId?._id || session?.activeOrderId;
      if (!orderId) {
        const newSession = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
        const newOrderId = newSession?.activeOrderId?._id || newSession?.activeOrderId;
        if (!newOrderId) throw new Error('Unable to determine active order');
        setActiveOrder(newOrderId);
        return newOrderId;
      }

      // Map database pending items to local table format
      const dbPendingItems = (session?.pendingItems || []).map(i => ({
        _id: i.menuItemId?._id || i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        department: i.department || 'kitchen',
        note: i.notes || ''
      }));

      // Update local storage/state table bills if not edited recently
      const lastEdit = lastEditRef.current[targetTableId] || 0;
      const timeSinceLastEdit = Date.now() - lastEdit;

      if (timeSinceLastEdit >= 2500) {
        setTableBills(prev => ({
          ...prev,
          [targetTableId]: {
            ...prev[targetTableId],
            items: dbPendingItems,
            customerName: session?.activeOrderId?.customerName || prev[targetTableId]?.customerName || '',
            customerPhone: session?.activeOrderId?.customerPhone || prev[targetTableId]?.customerPhone || '',
            discount: session?.activeOrderId?.discount?.toString() || prev[targetTableId]?.discount || ''
          }
        }));

        // Update selectedWaiter and orderType from DB session
        if (session?.waiterName) {
          const waiter = waiterOptions.find(w => w.name === session.waiterName || w.userId?.name === session.waiterName);
          setSelectedWaiterRaw(waiter ? waiter._id : '');
        } else {
          setSelectedWaiterRaw('');
        }
        if (session?.orderType) {
          setOrderTypeRaw(session.orderType);
        } else {
          setOrderTypeRaw('dine-in');
        }
      }

      setActiveOrder(orderId);
      setKots(session?.kotIds || []);

      return orderId;
    } catch (err) {
      console.error('Load session error:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (!activeTableId) {
      setActiveOrder(null);
      setKots([]);
      return;
    }
    const loadTableSession = async () => {
      try {
        await ensureActiveOrder();
      } catch (err) {
        console.error('Load session error:', err);
      }
    };
    loadTableSession();
  }, [activeTableId]);

  // Sync changes to backend session
  useEffect(() => {
    if (!activeTableId || !activeOrder) return;
    const tableNo = parseInt(activeTableId.substring(1));

    const delayDebounceFn = setTimeout(() => {
      const pendingItemsForDb = (table.items || []).map(i => ({
        menuItemId: i._id || i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        department: i.department || 'kitchen',
        notes: i.note || ''
      }));

      syncTableSession(
        tableNo,
        pendingItemsForDb,
        totals.grandTotal,
        selectedWaiterObj?.name || '',
        orderType
      ).catch(() => { });
    }, 800); // 800ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [table.items, selectedWaiterObj, orderType, activeTableId, activeOrder, totals.grandTotal]);

  // Listen to real-time socket events for current table
  useEffect(() => {
    if (!activeTableId || !socket) return;
    const tableNo = parseInt(activeTableId.substring(1));

    socket.emit('join-table', tableNo);

    const handleUpdate = () => {
      ensureActiveOrder().catch(() => { });
    };

    socket.on('KOT_UPDATED', handleUpdate);
    socket.on('NEW_KOT', handleUpdate);
    socket.on('TABLE_UPDATED', handleUpdate);
    socket.on('ORDER_COMPLETED', handleUpdate);

    return () => {
      socket.off('KOT_UPDATED', handleUpdate);
      socket.off('NEW_KOT', handleUpdate);
      socket.off('TABLE_UPDATED', handleUpdate);
      socket.off('ORDER_COMPLETED', handleUpdate);
    };
  }, [activeTableId, socket]);

  // Print KOT
  const printKOT = async () => {
    try {
      const orderId = activeOrder || await ensureActiveOrder();
      if (table.items.length === 0) {
        setBillError('Please add items first');
        return;
      }

      setBusy(true);
      const tableNo = parseInt(activeTableId.substring(1));

      const itemsToSubmit = table.items.map(i => {
        const master = allSellableItems.find(m => String(m._id) === String(i._id) || m.name === i.name);
        const isInv = i.isInventory || master?.isInventory || false;
        return {
          menuItemId: i._id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          department: isInv ? 'bar' : (master?.department || i.department || 'kitchen'),
          note: i.note || ''
        };
      });

      const barItems = itemsToSubmit.filter(i => i.department === 'bar');
      const kitchenItems = itemsToSubmit.filter(i => i.department !== 'bar');

      // Create separate KOTs for Kitchen and Bar to ensure separate KOT numbers
      if (kitchenItems.length > 0) {
        const kot = await createKOT(
          orderId, tableNo, kitchenItems, '', selectedWaiterObj?.name || '', orderType
        );
        setKots(prev => [...prev, kot]);
        printKOTDocument(kot, tableNo);
      }

      if (barItems.length > 0) {
        const kot = await createKOT(
          orderId, tableNo, barItems, '', selectedWaiterObj?.name || '', orderType
        );
        setKots(prev => [...prev, kot]);
        printKOTDocument(kot, tableNo);
      }

      // Clear items for next KOT
      clearTable(activeTableId);

      // Clear pendingItems in DB session
      await syncTableSession(tableNo, [], 0, selectedWaiterObj?.name || '', orderType);

      setBillError('');
      setBusy(false);
      setMobileBillOpen(false); // Close mobile bill panel
    } catch (err) {
      setBillError(err.message);
      setBusy(false);
    }
  };

  // Print final bill
  const printFinalBill = async (paidAmount) => {
    try {
      const orderId = activeOrder || await ensureActiveOrder();
      if (!orderId) return;

      setBusy(true);

      const tableNo = parseInt(activeTableId.substring(1));

      // Finalize bill (combines all KOTs and leftover items)
      await finalizeBill(
        orderId,
        combinedItems.all,
        subtotal,
        sgst,
        cgst,
        discountAmount,
        roundOff,
        grandTotal,
        selectedWaiterObj?.name || '',
        orderType,
        table.customerName || '',
        table.customerPhone || ''
      );

      // Print bill
      printBillDocument(tableNo, { items: combinedItems.all }, grandTotal, selectedWaiterObj?.name || '');

      // Mark order as complete
      await completeOrder(orderId);

      // Clear table
      clearTable(activeTableId);
      setActiveOrder(null);
      setKots([]);
      setSelectedWaiter('');

      setBillError('');
      setBusy(false);
      setMobileBillOpen(false); // Close mobile bill panel
    } catch (err) {
      setBillError(err.message);
      setBusy(false);
    }
  };

  // Helper: fire a print job (tries backend direct print first if directPrinting is enabled, falls back to/uses browser dialog otherwise)
  const firePrint = async (html, documentType = 'document', printerName = '') => {
    const runBrowserPrint = () => {
      try {
        let iframe = document.getElementById('print-iframe');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'print-iframe';
          iframe.style.position = 'fixed';
          iframe.style.right = '0';
          iframe.style.bottom = '0';
          iframe.style.width = '1px';
          iframe.style.height = '1px';
          iframe.style.opacity = '0';
          iframe.style.pointerEvents = 'none';
          document.body.appendChild(iframe);
        }
        
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        
        // Wait for images / assets to load and print
        setTimeout(() => {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }, 500);
      } catch (printErr) {
        console.error('Browser print failed:', printErr);
        showToast('Browser printing failed', 'error');
      }
    };

    // QZ Tray local printing
    if (settings.qzTrayEnabled) {
      try {
        if (!qz.websocket.isActive()) {
          await qz.websocket.connect({ retries: 2, delay: 1 });
        }
        const targetPrinter = printerName || null;
        const config = qz.configs.create(targetPrinter);
        const printData = [{
          type: 'html',
          format: 'plain',
          data: html
        }];
        await qz.print(config, printData);
        showToast(`Print sent to ${targetPrinter || 'default'} via QZ Tray`, 'success');
        return;
      } catch (err) {
        showToast('QZ Tray disconnected, falling back to browser print...', 'error');
        runBrowserPrint();
        return;
      }
    }

    // If QZ Tray is disabled, fall back to standard browser printing (with dialog)
    runBrowserPrint();
  };

  // Build KOT HTML for a given subset of items and target printer label
  const buildKOTHtml = (kot, tableNo, items, printerLabel) => `
    <html>
      <head>
        <title>${printerLabel}</title>
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body { font-family: monospace; width: 72mm; margin: 0; padding: 0; font-size: 12px; }
          .header { text-align: center; font-weight: bold; margin-bottom: 6px; font-size: 11px; }
          .sub { text-align: center; font-size: 11px; margin-bottom: 4px; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          .item { display: flex; justify-content: space-between; margin: 3px 0; }
          .qty { font-weight: bold; min-width: 24px; }
          .note { font-size: 10px; margin: 0 0 4px 8px; border-left: 2px solid #000; padding-left: 4px; }
        </style>
      </head>
      <body>
        <div class="header" style="font-size: 14px;">${printerLabel.toUpperCase()} KOT</div>
        <div class="header">${kot.kotNo} &nbsp;&nbsp;|&nbsp;&nbsp; Table: ${tableNo}</div>
        <div class="sub">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        <div class="divider"></div>
        ${items.map(i => `
          <div class="item"><span>${i.name}</span><span class="qty">${i.quantity}</span></div>
          ${i.note ? `<div class="note">Note: ${i.note}</div>` : ''}
        `).join('')}
        <div class="divider"></div>
      </body>
    </html>
  `;

  // Print KOT — splits items by department and fires separate print jobs
  const printKOTDocument = (kot, tableNo) => {
    const barItems     = (kot.items || []).filter(i => (i.department || 'kitchen') === 'bar');
    const kitchenItems = (kot.items || []).filter(i => (i.department || 'kitchen') !== 'bar');

    // Kitchen printer KOT (food/menu items)
    if (kitchenItems.length > 0) {
      firePrint(buildKOTHtml(kot, tableNo, kitchenItems, settings.kitchenPrinterName || 'KITCHEN'), 'document', settings.kitchenPrinterName || '');
    }

    // Bar printer KOT (bar/inventory items) — fired 600ms after kitchen to sequence dialogs
    if (barItems.length > 0) {
      setTimeout(() => {
        firePrint(buildKOTHtml(kot, tableNo, barItems, settings.barPrinterName || 'BAR'), 'document', settings.barPrinterName || '');
      }, 600);
    }
  };

  const printBillDocument = (tableNo, table, total, waiterName = '') => {
    // Generate bill number similar to InvoiceModal
    const tempBillNo = 'HTB-' + String(Date.now()).slice(-5);
    
    const html = `
      <html>
        <head>
          <title>${settings.barPrinterName || 'BAR'} BILL</title>
          <style>
            @page { size: 80mm auto; margin: 2mm; }
            body { font-family: 'Courier New', Courier, monospace; width: 74mm; margin: 0; padding: 0; font-size: 11px; color: #000; line-height: 1.2; }
            .center { text-align: center; }
            .brand { font-size: 16px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; }
            .address { font-size: 10px; margin-bottom: 6px; line-height: 1.2; }
            .dash-line { border-top: 1px dashed #000; margin: 6px 0; }
            .thick-line { border-top: 2px solid #000; margin: 4px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 10px; }
            .item-header { font-size: 10px; font-weight: 900; display: flex; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
            .item-row { display: flex; margin-bottom: 3px; align-items: flex-start; font-size: 10px; }
            .col-name { flex: 1; padding-right: 4px; text-transform: uppercase; }
            .col-qty { width: 30px; text-align: center; }
            .col-amt { width: 55px; text-align: right; font-weight: bold; }
            .footer-msg { font-size: 10px; margin-top: 10px; font-weight: bold; font-style: italic; }
            .qr-code { width: 70px; height: 70px; margin: 8px auto 2px; display: block; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="brand">${settings.restaurantName || 'HUMTUM'}</div>
            ${settings.address ? `<div class="address">${settings.address}</div>` : ''}
            ${settings.gstin ? `<div class="address" style="margin-top:-4px">GSTIN: ${settings.gstin}</div>` : ''}
          </div>

          <div class="dash-line"></div>

          <div class="row"><span>BILL: ${tempBillNo}</span><span>TABLE: ${tableNo}</span></div>
          <div class="row">DATE: ${new Date().toLocaleString('en-IN')}</div>
          ${waiterName ? `<div class="row">WAITER: ${waiterName.toUpperCase()}</div>` : ''}

          <div class="dash-line"></div>

          <div class="item-header">
            <span class="col-name">ITEM</span>
            <span class="col-qty">QTY</span>
            <span class="col-amt">AMT</span>
          </div>

          ${table.items.map(i => `
            <div class="item-row">
              <span class="col-name">${i.name}</span>
              <span class="col-qty">${i.quantity}</span>
              <span class="col-amt">${(i.price * i.quantity).toFixed(0)}</span>
            </div>
          `).join('')}

          <div class="dash-line"></div>

          <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          ${(sgst + cgst) > 0 ? `<div class="row"><span>Taxes</span><span>${(sgst + cgst).toFixed(2)}</span></div>` : ''}
          ${discountAmount > 0 ? `<div class="row"><span>Discount</span><span>-${discountAmount.toFixed(2)}</span></div>` : ''}
          ${roundOff !== 0 ? `<div class="row"><span>Round Off</span><span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span></div>` : ''}

          <div class="thick-line"></div>
          
          <div class="row" style="font-size: 14px; font-weight: 900; margin: 4px 0;">
            <span>TOTAL PAYABLE</span>
            <span>Rs. ${total.toFixed(0)}</span>
          </div>

          <div class="thick-line"></div>

          <div class="center">
            <!-- Dummy QR Code image: replace URL with real payment integration later -->
            <img class="qr-code" src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=dummy@upi&pn=HUMTUM&am=${total.toFixed(0)}" alt="QR Code" />
            <div style="font-size: 9px; margin-top: 2px;">SCAN TO PAY</div>
            
            <div class="footer-msg">${settings.thankYouMsg || 'THANK YOU FOR VISITING!'}</div>
          </div>
        </body>
      </html>
    `;
    firePrint(html, 'document', settings.barPrinterName || '');
  };

  const doGen = async paid => {
    await printFinalBill(paid);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        selectTable(null);
        return;
      }
      if (e.defaultPrevented) return;
      const targetTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        printKOT();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doGen(0);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setMenuSearch(prev => prev.slice(0, -1));
        searchInputRef.current?.focus();
        return;
      }
      if (/^[a-zA-Z0-9 ]$/.test(e.key)) {
        e.preventDefault();
        setMenuSearch(prev => prev + e.key);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [printKOT, doGen, selectTable]);
  if (!activeTableId) {
    const ZONES = [
      { name: 'Bottom Lounge', range: [1, 6], color: 'zone-bottom' },
      { name: 'Top Lounge',    range: [7, 12],  color: 'zone-top' },
      { name: 'Restaurant',    range: [13, 18], color: 'zone-rest' },
      { name: 'VIP',    range: [19, 20], color: 'zone-vip' },
    ];

    return (
      <div className="fi table-picker-container">
        {/* TOP NAVBAR FOR MOBILE/HAMBURGER AND HUMTUM BRANDING */}
        <header className="humtum-bar tp-navbar">
          <div className="humtum-left">
            <button
              className="hnav-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="hnav-title-group">
              <span className="hnav-title">Dining Layout</span>
            </div>
          </div>
          <div className="hnav-stats">
            <div className="hnav-stat">
              <span className="hnav-stat-dot occ-dot" />
              <div>
                <div className="hnav-stat-num">{occupiedCount}</div>
                <div className="hnav-stat-label">Active</div>
              </div>
            </div>
            <div className="hnav-stat">
              <span className="hnav-stat-dot vac-dot" />
              <div>
                <div className="hnav-stat-num">{NUM_TABLES - occupiedCount}</div>
                <div className="hnav-stat-label">Vacant</div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Layout Body */}
        <div className="table-picker-page">
          {/* Desktop-only Header */}
          <div className="tp-desktop-header">
            <div className="tp-header-title-group">
              <h1 className="tp-header-title">Dining Layout</h1>
              <p className="tp-header-subtitle">Select a table to manage orders, bills, and real-time KOTs</p>
            </div>
            <div className="tp-header-stats">
              <div className="tp-stat-item occupied">
                <span className="tp-stat-dot" />
                <span className="tp-stat-val">{occupiedCount}</span>
                <span className="tp-stat-lbl">Active</span>
              </div>
              <div className="tp-stat-item free">
                <span className="tp-stat-dot" />
                <span className="tp-stat-val">{NUM_TABLES - occupiedCount}</span>
                <span className="tp-stat-lbl">Free</span>
              </div>
              <div className="tp-stat-item total">
                <span className="tp-stat-val">{NUM_TABLES}</span>
                <span className="tp-stat-lbl">Total</span>
              </div>
            </div>
          </div>

          {/* Subtitle / Helper info (mobile only) */}
          <div className="tp-picker-info-mobile">
            <p className="tp-header-subtitle" style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--t2)' }}>
              Select a table to manage orders, bills, and real-time KOTs
            </p>
          </div>

          {/* Zone sections — 2×2 block grid */}
          <div className="tp-zones-grid">
            {ZONES.map(zone => {
              const zoneTables = tableList.filter(t => t.num >= zone.range[0] && t.num <= zone.range[1]);
              const zoneActive = zoneTables.filter(t => t.status !== 'free').length;
              const isVip = zone.color === 'zone-vip';
              const isRest = zone.color === 'zone-rest';
              const isFullWidth = isVip || isRest;
              return (
                <div key={zone.name} className={`tp-zone ${zone.color}${isFullWidth ? ' tp-zone-full' : ''}`}>
                  <div className="tp-zone-header">
                    <div className="tp-zone-title-group">
                      <span className="tp-zone-name">{zone.name}</span>
                      <span className="tp-zone-sub">Tables T{zone.range[0]}–T{zone.range[1]}</span>
                    </div>
                    <div className="tp-zone-badge">
                      {zoneActive > 0 && <span className="tp-zone-active-count">{zoneActive} active</span>}
                    </div>
                  </div>
                  <div className={`tp-zone-grid${isVip ? ' tp-zone-grid-vip' : isRest ? ' tp-zone-grid-rest' : ''}`}>
                    {zoneTables.map(t => (
                      <TableTile
                        key={t.id}
                        id={t.id}
                        num={t.num}
                        status={t.status}
                        total={t.total}
                        items={t.items}
                        currency={c}
                        onClick={() => selectTable(t.id)}
                        isVip={isVip}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="fi billing-layout">
      {/* BILLING NAVBAR */}
      <BillingNavBar
        activeTableId={activeTableId}
        occupiedCount={occupiedCount}
        totalTables={NUM_TABLES}
        onBack={() => selectTable(null)}
        onPrintKOT={printKOT}
        onPrintBill={() => doGen(0)}
        pendingCount={combinedItems.pending.length}
        allCount={combinedItems.all.length}
        busy={busy}
      />


      <div ref={billingGridRef} className="billing-main-grid" style={{ gridTemplateColumns: isMobile ? '1fr' : `minmax(350px, 1fr) auto ${billPanelWidth}px` }}>
        {/* LEFT: MENU SECTION */}
        <div className="menu-side">
          <div className="filter-bar-sticky">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="search-wrap-mini" style={{ margin: 0, flex: 1 }}>
                <Search size={16} className="search-icon" />
                <input
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="Search menu..."
                  ref={searchInputRef}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredMenu.length > 0) {
                        const firstAvailableItem = filteredMenu.find(item => item.available !== false);
                        if (firstAvailableItem) {
                          updateTableItem(activeTableId, firstAvailableItem._id, 'increase');
                          setMenuSearch('');
                        }
                      }
                    }
                  }}
                />
                {menuSearch && (
                  <button className="search-clear-btn" onClick={() => { setMenuSearch(''); searchInputRef.current?.focus(); }} title="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="cat-scroll-mini">
              {categories.map(cat => (
                <button key={cat} className={`cat-pill${categoryFilter === cat ? ' on' : ''}`} onClick={() => setCategoryFilter(cat)}>{cat}</button>
              ))}
            </div>
          </div>

          <div className="items-grid-modern">
            {filteredMenu.map(item => {
              const stockItem = inventory?.find(inv => inv.name.toLowerCase().trim() === item.name.toLowerCase().trim());
              return (
                <MenuItem key={item._id} item={item} qty={table.items.find(i => String(i._id) === String(item._id))?.quantity || 0}
                  stock={stockItem?.stock}
                  minStock={stockItem?.minStock}
                  add={(id, a) => updateTableItem(activeTableId, id, a)}
                  rem={(id, a) => updateTableItem(activeTableId, id, a)} />
              );
            })}
          </div>
        </div>

        {/* RESIZE HANDLE */}
        {!isMobile && (
          <div 
            className={`resize-handle ${isResizing ? 'resizing' : ''}`} 
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />
        )}

        {/* RIGHT: BILL PANEL */}
        <div className={`bill-panel-res ${mobileBillOpen ? 'open' : 'closed'}`}>
          <div className="mobile-handle" onClick={() => setMobileBillOpen(!mobileBillOpen)}>
            <div className="h-indicator" />
            {isMobile && (
              <div className="mobile-handle-summary">
                <span className="summary-items">🛒 {combinedItems.all.reduce((s, i) => s + i.quantity, 0)} Items</span>
                <span className="summary-total">Total: {c}{grandTotal.toFixed(0)}</span>
              </div>
            )}
          </div>

          <div className="bill-scroll-content">
            <div className="bill-header-row">
              <span>Table {activeTableId ? activeTableId.substring(1) : ''}</span>
              {activeTableId && <button onClick={() => clearTable(activeTableId)} className="trash-btn"><Trash2 size={14} /></button>}
            </div>

            <div className="order-meta-row">
              <div className="order-type-group">
                {['dine-in', 'takeaway', 'delivery'].map(type => (
                  <button
                    key={type}
                    className={`type-pill${orderType === type ? ' active' : ''}`}
                    onClick={() => setOrderType(type)}
                    type="button"
                  >
                    {type.replace('-', ' ').toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="waiter-select-wrap">
                <div className="order-meta-label">Waiter</div>
                <select className="mini-input mini-select" value={selectedWaiter} onChange={e => setSelectedWaiter(e.target.value)}>
                  <option value="" disabled>Select waiter</option>
                  {waiterOptions.map(w => (
                    <option key={w._id} value={w._id}>{w.name || w.userId?.name || w.role || 'Staff'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="section-divider" />
            <input className="mini-input customer-input" value={table.customerName || ''} onChange={e => setTableField(activeTableId, 'customerName', e.target.value)} placeholder="Customer Name" />
            <input className="mini-input customer-input" value={table.customerPhone || ''} onChange={e => setTableField(activeTableId, 'customerPhone', e.target.value)} placeholder="Mobile No" maxLength={10} />

            <div className="food-items-label">Food Items</div>
            <div className="bill-items-scroller">
              {/* Unified flat item list — all selected items stay visible */}
              {combinedItems.all.length === 0 && (
                <div style={{ color: 'var(--t2)', fontSize: 12, textAlign: 'center', paddingTop: 12 }}>No items added yet</div>
              )}

              {/* Sent (KOT-printed) items — read-only, shown first */}
              {combinedItems.sent.map((item, idx) => (
                <div key={item._id || idx} className="b-item-entry">
                  <div className="b-item-row">
                    <span className="b-item-name">{item.name}</span>
                    <div className="b-item-ctrl">
                      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{item.quantity}×</span>
                    </div>
                    <span className="b-item-price">{c}{(item.price * item.quantity).toFixed(0)}</span>
                  </div>
                </div>
              ))}

              {/* Pending items — editable with +/− */}
              {combinedItems.pending.map(item => (
                <div key={item._id} className="b-item-entry">
                  <div className="b-item-row">
                    <span className="b-item-name">{item.name}</span>
                    <div className="b-item-ctrl">
                      <button onClick={() => updateTableItem(activeTableId, item._id, 'decrease')}>−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateTableItem(activeTableId, item._id, 'increase')}>+</button>
                    </div>
                    <span className="b-item-price">{c}{(item.price * item.quantity).toFixed(0)}</span>
                  </div>
                  <textarea
                    className="item-note"
                    placeholder="Note..."
                    value={item.note || ''}
                    onChange={e => setItemNote(activeTableId, item._id, e.target.value)}
                    rows={1}
                  />
                </div>
              ))}
            </div>

            <div className="section-divider" />
            <div className="bill-footer">
              <div className="bill-summary-card">
                <div className="s-row"><span>Subtotal</span><span>{c}{subtotal.toFixed(0)}</span></div>
                <div className="s-row"><span>Tax</span><span>{c}{(sgst + cgst).toFixed(0)}</span></div>
                {roundOff !== 0 && (
                  <div className="s-row" style={{ color: 'var(--t3)', fontSize: '12px', fontStyle: 'italic' }}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                  </div>
                )}
                <div className="s-row">
                  <span>Discount</span>
                  <input
                    className="mini-input"
                    style={{ width: 80, textAlign: 'right' }}
                    value={table.discount || ''}
                    onChange={e => setTableField(activeTableId, 'discount', e.target.value)}
                    placeholder="0 or 10%"
                  />
                </div>
                <div className="s-row total-big"><span>Total</span><span>{c}{grandTotal.toFixed(0)}</span></div>
              </div>

              <select className="pm-select-mini" value={pm} onChange={e => setPm(e.target.value)}>
                {PM.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>

              {billError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '7px 11px', fontSize: 11, color: '#EF4444', marginBottom: 6 }}>
                  ⚠️ {billError}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="btn btn-ghost btn-lg"
                  style={{ flex: 1 }}
                  onClick={printKOT}
                  disabled={combinedItems.pending.length === 0 || busy}
                >
                  <Printer size={14} /> Print KOT
                </button>
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                  onClick={() => doGen(0)}
                  disabled={combinedItems.all.length === 0 || busy}
                >
                  {busy ? 'Processing…' : 'Print Bill'}
                </button>
              </div>
            </div>

            {/* KOT History */}
            {kots.length > 0 && (
  <div className="kot-history">
    <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: 'var(--t1)' }}>
      KOT History ({kots.length})
    </div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {kots.map((k, i) => (
        <div key={i} style={{ fontSize: 11, background: 'var(--s1)', border: '1px solid var(--b1)', padding: '3px 6px', borderRadius: 4, color: 'var(--t0)', fontWeight: 600 }}>
          {k.kotNo || `KOT-${i + 1}`} · {new Date(k.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
        </div>
      ))}
    </div>
  </div>
)}
          </div>
        </div>
      </div>
    </div>
  );
}
