import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Trash2, X, ShoppingCart, ChevronUp, ChevronDown, Printer, MoreVertical } from 'lucide-react';

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

export default function BillingPage() {
  const {
    tableBills, activeTableId, selectTable, updateTableItem, clearTable, setTableField,
    setItemNote,
    billTotals, allSellableItems, filteredMenu, categories, categoryFilter, setCategoryFilter,
    menuSearch, setMenuSearch, inventory, getTableStatus, settings, NUM_TABLES, workers,
    openTableSession, createKOT, finalizeBill, completeOrder
  } = useApp();

  const [pm, setPm] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null); // Current order for this table
  const [kots, setKots] = useState([]); // KOTs for current order
  const [orderType, setOrderType] = useState('dine-in');
  const [selectedWaiter, setSelectedWaiter] = useState('');

  const table = tableBills[activeTableId] || { items: [], customerPhone: '', customerName: '' };
  const { subtotal, sgst, cgst, grandTotal, roundOff } = billTotals;
  const c = settings.currency;
  const waiterOptions = useMemo(() => {
    return (workers || []).filter(w => {
      const role = String(w.role || '').toLowerCase();
      return role.includes('waiter') || role.includes('staff') || role.includes('server');
    });
  }, [workers]);

  const selectedWaiterObj = useMemo(() => {
    return waiterOptions.find(w => w._id === selectedWaiter) || waiterOptions[0] || null;
  }, [waiterOptions, selectedWaiter]);

  useEffect(() => {
    if (!selectedWaiter && selectedWaiterObj) {
      setSelectedWaiter(selectedWaiterObj._id);
    }
  }, [selectedWaiterObj, selectedWaiter]);

  const [billError, setBillError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 700 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 700);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const ensureActiveOrder = async () => {
    if (activeOrder) return activeOrder;
    if (!activeTableId) throw new Error('Select a table first');
    const tableNo = parseInt(activeTableId.substring(1));

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
      setActiveOrder(orderId);
      setKots(session?.kotIds || []);
      return orderId;
    } catch (err) {
      console.error('Load session error:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (!activeTableId) return;
    const loadTableSession = async () => {
      try {
        await ensureActiveOrder();
      } catch (err) {
        console.error('Load session error:', err);
      }
    };
    loadTableSession();
  }, [activeTableId]);

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

      // Finalize bill (combines all KOTs)
      await finalizeBill(
        orderId,
        table.items,
        subtotal,
        sgst,
        cgst,
        billTotals.discountAmount,
        roundOff,
        grandTotal
      );

      // Print bill
      printBillDocument(tableNo, table, grandTotal);

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

  return (
    <div className="fi billing-layout">
      {/* TABLE STRIP - show only on mobile */}
      {isMobile && (
        <div className="table-strip-res">
          <div className="tgrid-res">
            {Array.from({ length: NUM_TABLES }, (_, i) => {
              const id = `T${i + 1}`, st = getTableStatus(id);
              return <TableCard key={id} id={id} isActive={activeTableId === id} status={st} num={i + 1} onClick={() => selectTable(id)} />;
            })}
          </div>
        </div>
      )}

      <div className="billing-main-grid">
        {/* LEFT: MENU SECTION */}
        <div className="menu-side">
          <div className="filter-bar-sticky">
            <div className="search-wrap-mini">
              <Search size={14} />
              <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="Search..." />
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

            <input className="mini-input" value={table.customerName || ''} onChange={e => setTableField(activeTableId, 'customerName', e.target.value)} placeholder="Customer Name" />
            <input className="mini-input" value={table.customerPhone || ''} onChange={e => setTableField(activeTableId, 'customerPhone', e.target.value)} placeholder="Mobile No" maxLength={10} />

            <div className="bill-items-scroller">
              {table.items.map(item => (
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
                    placeholder="Item note (appears on KOT)"
                    value={item.note || ''}
                    onChange={e => setItemNote(activeTableId, item._id, e.target.value)}
                    rows={2}
                  />
                </div>
              ))}
            </div>

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
                className="btn btn-secondary btn-lg"
                style={{ flex: 1 }}
                onClick={printKOT}
                disabled={table.items.length === 0 || busy}
              >
                <Printer size={14} /> Print KOT
              </button>
              <button
                className="btn btn-primary btn-lg"
                style={{ flex: 1 }}
                onClick={() => doGen(0)}
                disabled={table.items.length === 0 || busy}
              >
                {busy ? 'Processing…' : 'Print Bill'}
              </button>
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

      {/* Pay modal removed */}

      <style>{`
      #root, .fi {
        margin: 0;
        padding: 0;
        height: 100%;
      }
      
      body {
        margin: 0;
        padding: 0;
      }

      .billing-layout {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      `}</style>
    </div>
  );
}
