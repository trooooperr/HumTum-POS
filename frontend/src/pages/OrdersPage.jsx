import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Search, CalendarDays, X, ShoppingCart } from 'lucide-react';
import InvoiceModal from '../components/InvoiceModal';
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

export default function OrdersPage() {
  const { orderHistory, setInvoiceOrder, invoiceOrder, settings } = useApp();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const c = settings.currency;
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);

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

  const totalDue = filtered.reduce((s, o) => s + (o.dueAmount || 0), 0);

  const payBadge = (mode) => {
    const cls = { cash: 'badge-cash', card: 'badge-card', upi: 'badge-upi' };
    return <span className={`badge ${cls[mode] || 'badge-cash'}`}>{mode?.toUpperCase()}</span>;
  };

  return (
    <div className="fi fade-in orders-container">


      {/* FILTER BAR - FIXED ALIGNMENT */}
      <div className="orders-filters-row">
        <div className="search-wrapper-unified">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search bill no. or customer..."
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
                  <div className="bill-no-tag">HTB-${(o.billNo || '').split('-').pop()}</div>
                  <div className="card-meta">{new Date(o.date).toLocaleDateString()} · Table {o.tableNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-total">{c}{o.grandTotal.toFixed(0)}</div>
                  {payBadge(o.paymentMode)}
                </div>
              </div>
              <div className="card-footer-info">
                <span className="cust-name-card">{o.customerName || 'Walk-in Customer'}</span>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                  onClick={(e) => { e.stopPropagation(); setInvoiceOrder(o); }}
                >
                  View Bill
                </button>
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
                  <td style={{ fontWeight: 700 }}>HTB-${(o.billNo || '').split('-').pop()}</td>
                  <td style={{ textAlign: 'center' }}>T{o.tableNo}</td>
                  <td className="td-date">{o.customerName || 'Walk-in Customer'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--a)' }}>{c}{o.grandTotal.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>{payBadge(o.paymentMode)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setInvoiceOrder(o)}>View Bill</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

