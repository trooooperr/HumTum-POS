import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, CalendarDays, X, ShoppingCart } from 'lucide-react';
import InvoiceModal from '../components/InvoiceModal';

function DateField({ value, onChange, inputRef, label }) {
  const triggerPicker = () => {
    if (inputRef?.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        inputRef.current.showPicker();
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className="date-field">
      <span className="date-field-label">{label}</span>
      <input
        type="date"
        value={value}
        onChange={onChange}
        className="date-picker-clean unified-date-input"
        ref={inputRef}
      />
      <button
        type="button"
        className="calendar-trigger"
        aria-label={`Open ${label} date picker`}
        onClick={triggerPicker}
      >
        <CalendarDays size={15} />
      </button>
    </div>
  );
}

function SettleModal({ order, currency, onClose, onSettle }) {
  const [paid, setPaid] = useState('');
  const [mode, setMode] = useState('cash');
  const [busy, setBusy] = useState(false);
  const { showToast } = useApp();
  const p = parseFloat(paid) || 0;

  const handleSettle = async (amt) => {
    const finalAmount = amt || p;
    if (finalAmount <= 0) return;
    setBusy(true);
    try {
      await onSettle(order._id, finalAmount, mode);
      showToast(`Settled ${currency}${finalAmount.toLocaleString()}`, 'success');
      onClose();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="moverlay">
      <div className="settle-card animate-su" style={{ maxWidth: 360 }}>
        
        {/* Banner Area (Minimalist) */}
        <div className="settle-banner" style={{ borderBottom: '1px solid var(--b0)', padding: '18px 20px' }}>
          <button 
            onClick={onClose} 
            className="iBtn" 
            style={{ position: 'absolute', top: 12, right: 12, opacity: 0.6 }}
          >
            <X size={16}/>
          </button>
          
          <div className="settle-label" style={{ fontSize: 11, marginBottom: 4 }}>Balance Due</div>
          <div className="settle-amount" style={{ fontSize: 28, color: 'var(--red)' }}>
            <span style={{ fontSize: 16, marginRight: 2, opacity: 0.7 }}>{currency}</span>
            {order.dueAmount.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 4, letterSpacing: 0.5, fontWeight: 700 }}>{order.billNo?.startsWith('HTB-') ? order.billNo : 'HTB-'+order.billNo}</div>
        </div>

        {/* Form Body */}
        <div className="settle-input-area" style={{ padding: '16px 20px' }}>
          
          <div style={{ marginBottom: 16 }}>
            <div className="settle-mode-row">
              {['cash','card','upi'].map(m => (
                <button 
                  key={m} 
                  className={`settle-mode-btn ${mode === m ? 'on' : ''}`}
                  onClick={() => setMode(m)}
                  style={{ height: 32, fontSize: 9, borderRadius: 8 }}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="lbl" style={{ fontSize: 10, color: 'var(--t2)', marginBottom: 6, display: 'block' }}>Payment Received</label>
            <div>
              <input 
                type="text"
                inputMode="decimal"
                value={paid} 
                onChange={e => setPaid(e.target.value)} 
                placeholder={order.dueAmount.toString()}
                autoFocus
                style={{ fontSize: 18, fontWeight: 600 }}
              />
            </div>
          </div>
        </div>

        {/* Actions (Tighter) */}
        <div className="settle-footer" style={{ padding: '14px 20px', gap: 8 }}>
          <button className="btn btn-ghost btn-lg" style={{ flex: 1, borderRadius: 10, fontSize: 12 }} onClick={onClose}>Back</button>
          <button 
            className="settle-btn-main" 
            style={{ flex: 2, borderRadius: 10, fontSize: 13, height: 44 }}
            onClick={() => handleSettle(order.dueAmount)}
            disabled={busy}
          >
            {busy ? '...' : `Settle Full`}
          </button>
        </div>
        {p > 0 && p < order.dueAmount && (
           <button 
           className="settle-btn-main" 
           style={{ width: 'calc(100% - 40px)', margin: '0 20px 20px', borderRadius: 10, fontSize: 11, height: 36, background: 'var(--s3)', color: 'var(--t1)' }}
           onClick={() => handleSettle()}
           disabled={busy}
         >
           Partial: {currency}{p.toLocaleString()}
         </button>
        )}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { orderHistory, setInvoiceOrder, invoiceOrder, settings, settleOrder } = useApp();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [settleTgt, setSettleTgt] = useState(null);
  const c = settings.currency;
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);

  const filtered = useMemo(() => {
    return (Array.isArray(orderHistory) ? orderHistory : []).filter(o => {
      const d = new Date(o.date);
      const matchDate = (!startDate || d >= new Date(startDate)) && (!endDate || d <= new Date(endDate + 'T23:59:59'));
      const matchSearch = !search || o.billNo?.toLowerCase().includes(search.toLowerCase()) || o.customerName?.toLowerCase().includes(search.toLowerCase());
      return matchDate && matchSearch;
    });
  }, [orderHistory, search, startDate, endDate]);

  const totalDue = filtered.reduce((s, o) => s + (o.dueAmount || 0), 0);

  const payBadge = (mode) => {
    const cls = { cash: 'badge-cash', card: 'badge-card', upi: 'badge-upi' };
    return <span className={`badge ${cls[mode] || 'badge-cash'}`}>{mode?.toUpperCase()}</span>;
  };

  return (
    <div className="fi fade-in orders-container">
      {/* HEADER SECTION */}
      <div className="orders-header">
        <div>
          <div className="ph-title">Order History</div>
        </div>
      </div>

      {/* FILTER BAR - FIXED ALIGNMENT */}
      <div className="orders-filters-row">
        <div className="search-wrapper-unified">
          <Search size={16} className="search-icon-inside" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bill no. or customer..."
            className="search-input-unified"
          />
        </div>

<div 
  className="date-group-unified"
  style={{
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    position: 'relative'
  }}
>
  {/* From */}
  <div style={{ flex: 1 }}>
    <DateField 
      label="From" 
      value={startDate} 
      onChange={e => setStartDate(e.target.value)} 
      inputRef={startInputRef} 
    />
  </div>

  {/* To */}
  <div style={{ flex: 1 }}>
    <DateField 
      label="To" 
      value={endDate} 
      onChange={e => setEndDate(e.target.value)} 
      inputRef={endInputRef} 
    />
  </div>

  {/* Clear Button */}
  {(startDate || endDate || search) && (
    <button 
      className="clear-filter-btn" 
      onClick={() => { 
        setSearch(''); 
        setStartDate(''); 
        setEndDate(''); 
      }}
      style={{
        height: 36,
        width: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        marginBottom: 2, // aligns with input baseline
        opacity: 0.8,
        transition: 'all 0.2s ease'
      }}
    >
      <X size={13} />
    </button>
  )}
</div>
      </div>

      {/* MOBILE LIST VIEW */}
      <div className="mobile-orders-list">
        {filtered.length === 0 ? <div className="empty-msg">No orders found</div> : 
          filtered.map(o => (
            <div key={o._id} className="order-mobile-card" onClick={() => setInvoiceOrder(o)}>
              <div className="order-card-row">
                <div>
                  <div className="bill-no-tag">{o.billNo?.startsWith('HTB-') ? o.billNo : 'HTB-'+o.billNo}</div>
                  <div className="card-meta">{new Date(o.date).toLocaleDateString()} · Table {o.tableNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-total">{c}{o.grandTotal.toFixed(0)}</div>
                  {payBadge(o.paymentMode)}
                </div>
              </div>
              <div className="card-footer-info">
                <span className="cust-name-card">{o.customerName || 'Walk-in Customer'}</span>
                {o.dueAmount > 0 ? (
                  <span className="due-tag-card">Due: {c}{o.dueAmount.toFixed(0)}</span>
                ) : (
                  <span className="paid-tag-card">Paid</span>
                )}
              </div>
            </div>
          ))
        }
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="desktop-orders-table">
        <div className="card-table-wrapper">
          <table className="dtable">
            <thead>
              <tr>
                <th>Date</th><th>Bill No.</th><th style={{ textAlign: 'center' }}>Table</th>
                <th>Customer</th><th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Due</th><th style={{ textAlign: 'center' }}>Mode</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o._id}>
                  <td className="td-date">{new Date(o.date).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 700 }}>{o.billNo?.startsWith('HTB-') ? o.billNo : 'HTB-'+o.billNo}</td>
                  <td style={{ textAlign: 'center' }}>T{o.tableNo}</td>
                  <td className="td-date">{o.customerName || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--amber)' }}>{c}{o.grandTotal.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', color: o.dueAmount > 0 ? 'var(--red)' : 'inherit', fontWeight: 700 }}>
                    {o.dueAmount > 0 ? `${c}${o.dueAmount.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{payBadge(o.paymentMode)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setInvoiceOrder(o)}>View</button>
                      {o.dueAmount > 0 && (
                        <button className="btn btn-primary btn-sm" style={{ padding:'0 8px', fontSize:11 }} onClick={() => setSettleTgt(o)}>Settle</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {invoiceOrder && <InvoiceModal />}
      {settleTgt && (
        <SettleModal 
          order={settleTgt} 
          currency={c} 
          onClose={() => setSettleTgt(null)} 
          onSettle={settleOrder}
        />
      )}

      <style>{`
        .orders-container { padding-bottom: 20px; }
        .orders-title { fontSize: 22px; fontWeight: 800; color: var(--t0); }
        .orders-subtitle { fontSize: 12px; color: var(--t2); margin-top: 2px; }
        .due-text { color: var(--red); margin-left: 8px; font-weight: 600; }

        /* FILTER BAR CSS */
        .orders-filters-row { 
          display: flex; 
          gap: 12px; 
          margin: 18px 0; 
          align-items: center; 
          width: 100%;
        }

        .search-wrapper-unified {
          display: flex; 
          align-items: center; 
          background: var(--s2); 
          border: 1px solid var(--b1); 
          border-radius: 12px; 
          height: 44px; 
          padding: 0 14px; 
          flex: 1;
        }
        .search-icon-inside { color: var(--t3); margin-right: 10px; }
        .search-input-unified { background: none; border: none; outline: none; color: var(--t0); flex: 1; font-size: 14px; }

        .date-group-unified { 
          display: flex;
          gap: 12px; 
          width: auto;
          flex-wrap: wrap;
        }
        .date-field {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 44px;
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 12px;
          padding: 0 12px;
          box-shadow: inset 0 1px 0 var(--b0);
          min-width: 180px;
        }
        .date-field-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--t3);
          white-space: nowrap;
        }
        .date-picker-clean {
          background: none;
          border: none;
          color: var(--t0);
          outline: none;
          font-size: 13px;
          font-weight: 300;
          cursor: pointer;
          width: 100px;
          padding: 0;
          box-shadow: none;
        }
        .unified-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
        }
        .unified-date-input {
 
          color-scheme: light;
        }
        .lm .unified-date-input {
          color-scheme: light;
        }
        body:not(.lm) .unified-date-input {
          color-scheme: dark;
        }
        .calendar-trigger {
          width: 28px;
          height: 28px;
          border: 1px solid var(--b1);
          border-radius: 8px;
          background: var(--s2);
          color: var(--t1);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .calendar-trigger:hover {
          background: var(--s3);
          color: var(--t0);
          border-color: var(--b2);
        }
        .clear-filter-btn { background: var(--s3); border: 1px solid var(--b2); border-radius: 10px; width: 44px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--t1); }

        /* MOBILE LIST CSS */
        .mobile-orders-list { display: block; }
        .order-mobile-card { 
          background: var(--s1); 
          border: 1px solid var(--b1); 
          border-radius: 16px; 
          padding: 15px; 
          margin-bottom: 12px; 
          cursor: pointer;
        }
        .order-card-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .bill-no-tag { font-weight: 800; font-size: 14px; color: var(--t0); }
        .card-meta { font-size: 11px; color: var(--t2); }
        .card-total { font-weight: 800; color: var(--amber); font-size: 17px; }
        .card-footer-info { display: flex; justify-content: space-between; border-top: 1px dashed var(--b1); padding-top: 10px; align-items: center; }
        .cust-name-card { font-size: 12px; color: var(--t1); font-weight: 500; }
        .due-tag-card { color: var(--red); font-size: 12px; font-weight: 700; }
        .paid-tag-card { color: var(--green); font-size: 11px; font-weight: 800; text-transform: uppercase; }

        /* WHATSAPP DARK MODE FIX */
        .method-text-fix { color: var(--t0) !important; font-weight: 600; font-size: 12px; }

        .desktop-orders-table { display: none; }
        .card-table-wrapper { background: var(--s1); border: 1px solid var(--b1); border-radius: var(--rl); overflow: hidden; }

        @media (min-width: 768px) {
          .mobile-orders-list { display: none; }
          .desktop-orders-table { display: block; }
          .orders-filters-row { flex-direction: row; }
        }

        @media (max-width: 750px) {
          .orders-filters-row { flex-direction: column; align-items: stretch; }
          .date-group-unified { width: 100%; }
        }

/* 2. Update the Date Group for Mobile */
@media (max-width: 750px) {
  .orders-filters-row { 
    flex-direction: column; 
    align-items: stretch; 
  }

  .date-group-unified { 
    width: 100%; 
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px; 
    height: auto;
  }

  .date-field { 
    width: 100%;
    overflow: hidden;
  }

  .clear-filter-btn {
    height: 44px;
    width: 100%;
  }
}
      `}</style>
    </div>
  );
}
