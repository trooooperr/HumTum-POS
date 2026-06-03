import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Search, Trash2, Printer, UtensilsCrossed } from 'lucide-react';
import './BillingPage.css';

const PM = ['cash', 'card', 'upi'];

/* COMPACT TABLE PILL */
function TableCard({ id, isActive, status, num, onClick }) {
  return (
    <button className={`tcard-mini ${status}${isActive ? ' active' : ''}`} onClick={onClick}>
      <span className="tnum-mini">{num}</span>
      <div className={`tstatus-dot ${status}`} />
    </button>
  );
}

function TableTile({ id, status, num, total, items, currency, onClick }) {
  const statusLabel = status === 'occupied' ? 'Running' : status === 'due' ? 'Due' : 'Free';

  return (
    <button className={`table-tile ${status}`} onClick={onClick}>
      <div className="table-tile-top">
        <span className="table-tile-number">T{num}</span>
        <span className={`table-tile-status ${status}`}>{statusLabel}</span>
      </div>
      <div className="table-tile-meta">
        <span>{items} item{items === 1 ? '' : 's'}</span>
        <strong>{currency}{total.toFixed(0)}</strong>
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
            title="Print Bill (Ctrl+B)"
          >
            <Printer size={13} />
            <span>Bill</span>
            <kbd>Ctrl B</kbd>
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
    tableBills, setTableBills, activeTableId, selectTable, updateTableItem, clearTable, setTableField,
    setItemNote,
    billTotals, filteredMenu, categories, categoryFilter, setCategoryFilter,
    menuSearch, setMenuSearch, inventory, workers, getTableStatus, settings, NUM_TABLES,
    openTableSession, createKOT, finalizeBill, completeOrder, socket, syncTableSession
  } = useApp();

  const [pm, setPm] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null); // Current order for this table
  const [kots, setKots] = useState([]); // KOTs for current order
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedWaiter, setSelectedWaiter] = useState('');
  const [billPanelWidth, setBillPanelWidth] = useState(360);
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

  useEffect(() => {
    if (table.items.length === 0 && selectedWaiter) {
      setSelectedWaiter('');
    }
  }, [table.items.length, selectedWaiter]);

  const tableList = Array.from({ length: NUM_TABLES }, (_, i) => {
    const id = `T${i + 1}`;
    const bill = tableBills[id] || { items: [] };
    const total = bill.items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
    return { id, num: i + 1, status: getTableStatus(id), items: bill.items.length, total };
  });
  const occupiedCount = tableList.filter(t => t.status !== 'free').length;

  const [billError, setBillError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 700 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (event) => {
      const container = billingGridRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(520, Math.max(320, rect.right - event.clientX));
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
      const response = await fetch(`/api/orders/table/${tableNo}/session`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('humtum_token_v2')}`
        }
      });

      let session;
      if (response.ok) {
        session = await response.json();
      } else if (response.status === 404) {
        session = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
      } else {
        throw new Error('Unable to load table session');
      }

      const orderId = session?.activeOrderId?._id || session?.activeOrderId || session?._id || session;
      if (!orderId) throw new Error('Unable to determine active order');

      // Map database pending items to local table format
      const dbPendingItems = (session?.pendingItems || []).map(i => ({
        _id: i.menuItemId?._id || i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        department: i.department || 'kitchen',
        note: i.notes || ''
      }));

      // Update local storage/state table bills
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

      setActiveOrder(orderId);
      setKots(session?.kotIds || []);

      // Update selectedWaiter and orderType from DB session
      if (session?.waiterName) {
        const waiter = waiterOptions.find(w => w.name === session.waiterName || w.userId?.name === session.waiterName);
        if (waiter) setSelectedWaiter(waiter._id);
      }
      if (session?.orderType) {
        setOrderType(session.orderType);
      }

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
      const orderId = await ensureActiveOrder();
      if (table.items.length === 0) {
        setBillError('Please add items first');
        return;
      }

      setBusy(true);
      const tableNo = parseInt(activeTableId.substring(1));

      // Create KOT
      const kot = await createKOT(
        orderId,
        tableNo,
        table.items.map(i => ({
          menuItemId: i._id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          department: i.department || 'kitchen',
          note: i.note || ''
        })),
        '',
        selectedWaiterObj?.name || '',
        orderType
      );

      // Add to KOT list
      setKots(prev => [...prev, kot]);

      // Print the KOT
      printKOTDocument(kot, tableNo);

      // Clear items for next KOT
      clearTable(activeTableId);

      // Clear pendingItems in DB session
      await syncTableSession(tableNo, [], 0, selectedWaiterObj?.name || '', orderType);

      setBillError('');
      setBusy(false);
    } catch (err) {
      setBillError(err.message);
      setBusy(false);
    }
  };

  // Print final bill
  const printFinalBill = async (paidAmount) => {
    try {
      const orderId = await ensureActiveOrder();
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
      printBillDocument(tableNo, { items: combinedItems.all }, grandTotal);

      // Mark order as complete
      await completeOrder(activeOrder._id || activeOrder);

      // Clear table
      clearTable(activeTableId);
      setActiveOrder(null);
      setKots([]);

      setBillError('');
      setBusy(false);
    } catch (err) {
      setBillError(err.message);
      setBusy(false);
    }
  };

  const printKOTDocument = (kot, tableNo) => {
    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <style>
            body { font-family: monospace; max-width: 80mm; margin: 0; padding: 0; }
            .header { text-align: center; font-weight: bold; margin-bottom: 10px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .item { display: flex; justify-content: space-between; margin: 4px 0; }
            .notes { font-size: 0.9em; margin: 10px 0; border: 1px solid #000; padding: 5px; }
          </style>
        </head>
        <body>
          <div class="header">KOT #${kot.kotNo}</div>
          <div>Table: T${tableNo}</div>
          <div>Time: ${new Date().toLocaleTimeString()}</div>
          <div class="divider"></div>
          ${kot.items.map(i => `<div class="item"><span>${i.quantity}x ${i.name}</span></div>${i.note ? `<div class="notes">Note: ${i.note}</div>` : ''}`).join('')}
          <div class="divider"></div>
          <div style="text-align: center; font-size: 0.85em;">${new Date().toLocaleDateString()}</div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const printBillDocument = (tableNo, table, total) => {
    const printWindow = window.open('', '_blank');
    const html = `
      <html>
        <head>
          <style>
            body { font-family: monospace; max-width: 80mm; margin: 0; padding: 10px; }
            .header { text-align: center; font-weight: bold; margin-bottom: 10px; font-size: 1.2em; }
            .subheader { text-align: center; font-size: 0.9em; margin-bottom: 10px; }
            .divider { border-top: 1px solid #000; margin: 8px 0; }
            .item { display: flex; justify-content: space-between; margin: 4px 0; }
            .summary { margin: 10px 0; }
            .total-line { display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; margin: 8px 0; }
            .footer { text-align: center; font-size: 0.8em; margin-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">${settings.restaurantName}</div>
          <div class="subheader">BILL</div>
          <div>Table: T${tableNo}</div>
          <div>Date: ${new Date().toLocaleDateString()}</div>
          <div class="divider"></div>
          ${table.items.map(i => `<div class="item"><span>${i.name}</span><span>${(i.price * i.quantity).toFixed(0)}</span></div>`).join('')}
          <div class="divider"></div>
          <div class="summary">
            <div class="item"><span>Subtotal</span><span>${subtotal.toFixed(0)}</span></div>
            <div class="item"><span>Tax</span><span>${(sgst + cgst).toFixed(0)}</span></div>
            <div class="total-line"><span>TOTAL</span><span>${total.toFixed(0)}</span></div>
          </div>
          <div class="divider"></div>
          <div class="footer">
            <p>${settings.thankYouMsg || 'Thank you for your visit!'}</p>
            <p>${settings.phone || ''}</p>
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
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
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(targetTag)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        printKOT();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
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
    return (
      <div className="fi billing-layout">
        <BillingNavBar
          activeTableId={null}
          occupiedCount={occupiedCount}
          totalTables={NUM_TABLES}
          onBack={null}
          onPrintKOT={null}
          onPrintBill={null}
        />
        <div className="table-picker-layout">
          <div className="table-picker-grid">
            {tableList.map(t => (
              <TableTile
                key={t.id}
                id={t.id}
                num={t.num}
                status={t.status}
                total={t.total}
                items={t.items}
                currency={c}
                onClick={() => selectTable(t.id)}
              />
            ))}
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

      {/* TABLE STRIP - show only on mobile */}
      {isMobile && (
        <div className="table-strip-res">
          <div className="tgrid-res">
            {tableList.map(t => (
              <TableCard
                key={t.id}
                id={t.id}
                isActive={activeTableId === t.id}
                status={t.status}
                num={t.num}
                onClick={() => selectTable(t.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div ref={billingGridRef} className="billing-main-grid" style={{ gridTemplateColumns: isMobile ? '1fr' : `minmax(260px, 1fr) ${billPanelWidth}px` }}>
        {/* LEFT: MENU SECTION */}
        <div className="menu-side">
          <div className="filter-bar-sticky">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="search-wrap-mini" style={{ margin: 0, flex: 1 }}>
                <Search size={14} />
                <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="Search menu..." ref={searchInputRef} />
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

        {/* RIGHT: BILL PANEL */}
        <div className={`bill-panel-res ${mobileBillOpen ? 'open' : 'closed'}`}>
          <div className="mobile-handle" onClick={() => setMobileBillOpen(!mobileBillOpen)}>
            <div className="h-indicator" />
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
            <input className="mini-input" value={table.customerName || ''} onChange={e => setTableField(activeTableId, 'customerName', e.target.value)} placeholder="Customer Name" />
            <input className="mini-input" value={table.customerPhone || ''} onChange={e => setTableField(activeTableId, 'customerPhone', e.target.value)} placeholder="Mobile No" maxLength={10} />

            <div className="bill-items-scroller">
              {/* New/Pending items section */}
              {combinedItems.pending.length > 0 && (
                <>
                  <div className="bill-section-heading">New / Unsent Items ({combinedItems.pending.length})</div>
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
                        placeholder="ADD Item Notes......"
                        value={item.note || ''}
                        onChange={e => setItemNote(activeTableId, item._id, e.target.value)}
                        rows={1}
                      />
                    </div>
                  ))}
                </>
              )}

              {/* Sent KOT items section */}
              {combinedItems.sent.length > 0 && (
                <>
                  <div className="bill-section-heading sent-heading">Sent to Kitchen / KOTs ({combinedItems.sent.length})</div>
                  {combinedItems.sent.map(item => (
                    <div key={`sent-${item._id}`} className="b-item-entry sent-item">
                      <div className="b-item-row">
                        <span className="b-item-name sent-name">
                          🍳 {item.name}
                        </span>
                        <div className="b-item-qty-badge">
                          Qty: {item.quantity}
                        </div>
                        <span className="b-item-price sent-price">
                          {c}{(item.price * item.quantity).toFixed(0)}
                        </span>
                      </div>
                      {item.note && (
                        <div className="sent-note">
                          ✎ Note: {item.note}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="section-divider" />
            <div className="bill-footer">
              <div className="bill-summary-card">
                <div className="s-row"><span>Subtotal</span><span>{c}{subtotal.toFixed(0)}</span></div>
                <div className="s-row"><span>Tax</span><span>{c}{(sgst + cgst).toFixed(0)}</span></div>
                {roundOff !== 0 && (
                  <div className="s-row" style={{ color: 'var(--t3)', fontSize: '11px', fontStyle: 'italic' }}>
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
              <div style={{ marginTop: 12, padding: 8, background: 'var(--bg2)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 6, color: 'var(--t2)' }}>
                  KOTs: {kots.length}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {kots.map((k, i) => (
                    <div key={i} style={{ fontSize: 10, background: 'var(--bg1)', padding: '3px 6px', borderRadius: 4 }}>
                      {k.kotNo || `KOT-${i + 1}`}
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
