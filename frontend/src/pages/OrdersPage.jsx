import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Search, CalendarDays, X } from 'lucide-react';
import TopNavBar from '../components/TopNavBar';

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

/* Centered Payment Edit Modal (prevents overflow/clipping bugs) */
function PaymentEditModal({ order, currency, onSave, onClose }) {
  const [mode, setMode] = useState(order.paymentMode || 'cash');
  const [cashAmt, setCashAmt] = useState(order.cashAmount ? String(order.cashAmount) : '');
  const [upiAmt, setUpiAmt] = useState(order.upiAmount ? String(order.upiAmount) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let cash = 0, upi = 0;
      if (mode === 'cash') {
        cash = order.grandTotal;
        upi = 0;
      } else if (mode === 'upi') {
        cash = 0;
        upi = order.grandTotal;
      } else if (mode === 'split') {
        cash = parseFloat(cashAmt) || 0;
        upi = parseFloat(upiAmt) || 0;
        // Simple tolerance check to verify total sums up
        if (Math.abs(cash + upi - order.grandTotal) > 0.02) {
          alert(`Split amounts (₹${(cash + upi).toFixed(0)}) must equal the grand total (₹${order.grandTotal.toFixed(0)})`);
          setSaving(false);
          return;
        }
      }
      await onSave(order._id, mode, cash, upi);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="mbox" style={{ maxWidth: '340px', width: '92%', padding: '20px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--t0)' }}>
            HTB-{(order.billNo || '').split('-').pop()} Payment
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--t1)', marginBottom: 16 }}>
          Grand Total: <span style={{ fontWeight: 800, color: 'var(--a)' }}>{currency}{order.grandTotal.toFixed(0)}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['cash', 'upi', 'split'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); if (m !== 'split') { setCashAmt(''); setUpiAmt(''); } }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: mode === m ? '2px solid var(--a)' : '1px solid var(--b2)',
                background: mode === m ? 'rgba(245,158,11,0.12)' : 'var(--s2)',
                color: mode === m ? 'var(--a)' : 'var(--t1)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {m === 'split' ? 'SPLIT' : m.toUpperCase()}
            </button>
          ))}
        </div>

        {mode === 'split' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Cash {currency}</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={cashAmt}
                onChange={e => {
                  const v = e.target.value;
                  setCashAmt(v);
                  if (v !== '') setUpiAmt(Math.max(0, order.grandTotal - (parseFloat(v) || 0)).toFixed(0));
                  else setUpiAmt('');
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>UPI {currency}</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={upiAmt}
                onChange={e => {
                  const v = e.target.value;
                  setUpiAmt(v);
                  if (v !== '') setCashAmt(Math.max(0, order.grandTotal - (parseFloat(v) || 0)).toFixed(0));
                  else setCashAmt('');
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)',
              background: 'var(--s2)', color: 'var(--t1)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
              background: 'var(--a)', color: '#000', fontSize: 13, fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { orderHistory, setInvoiceOrder, invoiceOrder, settings, deleteOrder, updateOrderPayment, role, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingPaymentOrder, setEditingPaymentOrder] = useState(null); // Full order object being edited
  const c = settings.currency;
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);

  const handleDeleteOrder = async (id, billNo) => {
    const displayBillNo = billNo ? `HTB-${billNo.split('-').pop()}` : 'this order';
    if (window.confirm(`Are you sure you want to delete order ${displayBillNo}?`)) {
      try {
        await deleteOrder(id);
        showToast('Order deleted successfully', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete order', 'error');
      }
    }
  };

  const handlePaymentSave = async (orderId, paymentMode, cashAmount, upiAmount) => {
    try {
      await updateOrderPayment(orderId, paymentMode, cashAmount, upiAmount);
      showToast('Payment mode updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update payment', 'error');
    }
  };

  const filtered = useMemo(() => {
    return (Array.isArray(orderHistory) ? orderHistory : []).filter(o => {
      const d = new Date(o.date);
      const matchDate = (!startDate || d >= new Date(startDate)) && (!endDate || d <= new Date(endDate + 'T23:59:59'));
      const matchSearch = !search ||
        (o.billNo && o.billNo.toLowerCase().includes(search.toLowerCase())) ||
        (o.customerName || 'Walk-in Customer').toLowerCase().includes(search.toLowerCase());
      return matchDate && matchSearch;
    });
  }, [orderHistory, search, startDate, endDate]);

  const payBadge = (mode, order) => {
    const cls = { cash: 'badge-cash', card: 'badge-card', upi: 'badge-upi', split: 'badge-split' };

    const handleBadgeClick = (e) => {
      e.stopPropagation();
      setEditingPaymentOrder(order);
    };

    if (mode === 'split' && order) {
      return (
        <span
          className="badge badge-split"
          style={{ cursor: 'pointer' }}
          onClick={handleBadgeClick}
          title={`Cash: ${c}${(order.cashAmount||0).toFixed(0)}, UPI: ${c}${(order.upiAmount||0).toFixed(0)}`}
        >
          SPLIT (C:{(order.cashAmount||0).toFixed(0)} U:{(order.upiAmount||0).toFixed(0)})
        </span>
      );
    }
    return (
      <span
        className={`badge ${cls[mode] || 'badge-cash'}`}
        style={{ cursor: 'pointer' }}
        onClick={handleBadgeClick}
      >
        {mode?.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="fi fade-in orders-container">


      {/* FILTER BAR - FIXED ALIGNMENT */}
      <div className="orders-filters-row">
        <div className="search-wrapper-unified">
          <Search size={16} className="search-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bill no. or customer..."
            className="search-input-unified"
          />
          {search && (
            <button className="search-clear-btn" onClick={() => { setSearch(''); }} title="Clear search">
              <X size={14} />
            </button>
          )}
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
                  <div className="bill-no-tag">HTB-{(o.billNo || '').split('-').pop()}</div>
                  <div className="card-meta">{new Date(o.date).toLocaleDateString()} · Table {o.tableNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-total">{c}{o.grandTotal.toFixed(0)}</div>
                  {payBadge(o.paymentMode, o)}
                </div>
              </div>
              <div className="card-footer-info">
                <span className="cust-name-card">{o.customerName || 'Walk-in Customer'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                    onClick={(e) => { e.stopPropagation(); setInvoiceOrder(o); }}
                  >
                    View Bill
                  </button>
                  {role === 'admin' && (
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                      onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o._id, o.billNo); }}
                    >
                      Delete
                    </button>
                  )}
                </div>
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
                <th style={{ textAlign: 'center' }}>Mode</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o._id}>
                  <td className="td-date">{new Date(o.date).toLocaleDateString()}</td>
                  <td style={{ fontWeight: 700 }}>HTB-{(o.billNo || '').split('-').pop()}</td>
                  <td style={{ textAlign: 'center' }}>T{o.tableNo}</td>
                  <td className="td-date">{o.customerName || 'Walk-in Customer'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--a)' }}>{c}{o.grandTotal.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>{payBadge(o.paymentMode, o)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setInvoiceOrder(o)}>View Bill</button>
                      {role === 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrder(o._id, o.billNo)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Edit Modal Overlay */}
      {editingPaymentOrder && (
        <PaymentEditModal
          order={editingPaymentOrder}
          currency={c}
          onSave={handlePaymentSave}
          onClose={() => setEditingPaymentOrder(null)}
        />
      )}
    </div>
  );
}
