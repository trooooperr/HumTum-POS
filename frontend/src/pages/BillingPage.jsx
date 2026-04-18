import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Trash2, X, ShoppingCart, ChevronUp, ChevronDown } from 'lucide-react';

const PM = ['cash','card','upi'];

/* COMPACT TABLE PILL */
function TableCard({ id, isActive, status, num, onClick }) {
  return (
    <button className={`tcard-mini ${status}${isActive?' active':''}`} onClick={onClick}>
      <span className="tnum-mini">{num}</span>
      <div className={`tstatus-dot ${status}`}/>
    </button>
  );
}

/* IMAGE-FOCUS MENU ITEM */
function MenuItem({ item, qty, add, rem, stock }) {
  const src = item.imageUrl?.startsWith('http') ? item.imageUrl
    : `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0,1))}`;
  return (
    <div className={`mcard-modern${!item.available?' na':''}`}>
      <div className="mimg-container">
        <img className="mimg-big" src={src} alt={item.name} onError={e=>{e.target.src=`https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0,1))}`}}/>
        <div className="m-price-tag" style={{ position:'absolute', bottom:8, left:8, zIndex:5 }}>₹{item.price.toFixed(0)}</div>
        {!item.available && <div className="sold-out-badge-top" style={{ top: 8, left: 8, right: 'auto' }}>SOLD OUT</div>}
        {stock !== undefined && (
          <div className={`stock-badge ${stock <= 5 ? 'low' : ''}`} style={{ top: 8, right: 8 }}>
            Stock: {stock}
          </div>
        )}
      </div>
      <div className="mbody-modern">
        <div className="mname-modern">{item.name}</div>
        {item.available && (
          <div className="mctrl-modern">
            <button className="qbtn-m" onClick={()=>rem(item._id,'decrease')}>−</button>
           <span className="qnum-m" style={{ fontSize: '14px' }}>{qty}</span>
            <button className="qbtn-m" onClick={()=>add(item._id,'increase')}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}


function PayModal({ total, currency, onClose, onConfirm }) {
  const [paid, setPaid] = useState('');
  const p = parseFloat(paid) || 0;
  const isPrintOnly = p === 0;

  return (
    <div className="moverlay">
      <div className="settle-card animate-su" style={{ maxWidth: 380 }}>

        {/* Header */}
        <div className="settle-banner" style={{ padding: '18px 18px 20px' }}>
          <button 
            onClick={onClose} 
            className="iBtn"
            style={{ position: 'absolute', top: 10, right: 10 }}
          >
            <X size={16}/>
          </button>

          <div className="settle-label" style={{ fontSize: 12, color: 'var(--t2)' }}>
            Total Payable
          </div>

          <div className="settle-amount" style={{ marginTop: 4 }}>
            <span className="settle-currency">{currency}</span>
            {total.toLocaleString()}
          </div>
        </div>

        {/* Body */}
        <div className="settle-input-area" style={{ padding: '16px 18px' }}>

          <label 
            className="lbl" 
            style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 6, display: 'block' }}
          >
            Amount Received
          </label>
          <div>
            <input
              type="text"   
              inputMode="decimal"
              value={paid}
              onChange={(e) => setPaid(e.target.value)}
              placeholder={total.toFixed(0)}
              autoFocus
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                flex: 1,
                fontSize: 18,
                fontWeight: 900,
                color: 'var(--t1)'
              }}
            />
          </div>

          {/* Info */}
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t2)' }}>
            {isPrintOnly 
              ? 'No payment entered. Order will be held.' 
              : `Received ${currency}${p.toLocaleString()}`
            }
          </div>

        </div>

        {/* Footer */}
        <div 
          className="settle-footer"
          style={{ padding: '14px 18px', display: 'flex', gap: 8 }}
        >
          <button 
            className="btn btn-ghost btn-lg"
            style={{ flex: 1, borderRadius: 10 }}
            onClick={onClose}
          >
            Back
          </button>

          <button 
            className={`settle-btn-main ${isPrintOnly ? 'ghost' : ''}`}
            style={{ flex: 1, borderRadius: 10 }}
            onClick={() => onConfirm(p)}
          >
            {isPrintOnly ? 'Print' : 'Print'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default function BillingPage() {
  const { tableBills, activeTableId, selectTable, updateTableItem, clearTable, setTableField, billTotals, filteredMenu, categories, categoryFilter, setCategoryFilter, menuSearch, setMenuSearch, menuItems, inventory, getTableStatus, generateBill, settings, NUM_TABLES } = useApp();
  const [pm, setPm] = useState('cash');
  const [payModal, setPayModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);

  const table = tableBills[activeTableId] || { items:[], customerPhone:'', customerName:'' };
  const { subtotal, sgst, cgst, grandTotal, roundOff } = billTotals;
  const c = settings.currency;

  const [billError, setBillError] = useState('');

  const doGen = async paid => {
    setPayModal(false); setBusy(true); setBillError('');
    const r = await generateBill(pm, paid);
    setBusy(false);
    if (r.error) {
      setBillError(r.error);
      setTimeout(() => setBillError(''), 5000);
    } else {
      setMobileBillOpen(false);
    }
  };

  return (
    <div className="fi billing-layout">
      {/* 1. COMPACT TABLE STRIP */}
      <div className="table-strip-res">
        <div className="tgrid-res">
          {Array.from({length:NUM_TABLES},(_,i)=>{
            const id=`T${i+1}`, st=getTableStatus(id);
            return <TableCard key={id} id={id} isActive={activeTableId===id} status={st} num={i+1} onClick={()=>selectTable(id)}/>;
          })}
        </div>
      </div>

      <div className="billing-main-grid">
        {/* LEFT: MENU SECTION */}
        <div className="menu-side">
          <div className="filter-bar-sticky">
            <div className="search-wrap-mini">
              <Search size={14} />
              <input value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Search..." />
            </div>
            <div className="cat-scroll-mini">
              {categories.map(cat=>(
                <button key={cat} className={`cat-pill${categoryFilter===cat?' on':''}`} onClick={()=>setCategoryFilter(cat)}>{cat}</button>
              ))}
            </div>
          </div>

          <div className="items-grid-modern">
            {filteredMenu.map(item=>{
              const stockItem = inventory?.find(inv => inv.name.toLowerCase().trim() === item.name.toLowerCase().trim());
              return (
                <MenuItem key={item._id} item={item} qty={table.items.find(i=>i._id===item._id)?.quantity||0}
                  stock={stockItem?.stock}
                  add={(id,a)=>updateTableItem(activeTableId,id,a,menuItems)}
                  rem={(id,a)=>updateTableItem(activeTableId,id,a,menuItems)}/>
              );
            })}
          </div>
        </div>

        {/* RIGHT: BILL PANEL (Desktop) */}
        <div className={`bill-panel-res ${mobileBillOpen ? 'open' : 'closed'}`}>
          <div className="mobile-handle" onClick={() => setMobileBillOpen(!mobileBillOpen)}>
            <div className="h-indicator" />
          </div>


          <div className="bill-scroll-content">
            <div className="bill-header-row">
               <span>Table {activeTableId.substring(1)}</span>
               <button onClick={()=>clearTable(activeTableId)} className="trash-btn"><Trash2 size={14}/></button>
            </div>
            
            <input className="mini-input" value={table.customerName||''} onChange={e=>setTableField(activeTableId,'customerName',e.target.value)} placeholder="Customer Name" />
            <input className="mini-input" value={table.customerPhone||''} onChange={e=>setTableField(activeTableId,'customerPhone',e.target.value)} placeholder="Mobile No" maxLength={10}/>

            <div className="bill-items-scroller">
              {table.items.map(item=>(
                <div key={item._id} className="b-item-row">
                  <span className="b-item-name">{item.name}</span>
                  <div className="b-item-ctrl">
                    <button onClick={()=>updateTableItem(activeTableId,item._id,'decrease',menuItems)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={()=>updateTableItem(activeTableId,item._id,'increase',menuItems)}>+</button>
                  </div>
                  <span className="b-item-price">{c}{(item.price*item.quantity).toFixed(0)}</span>
                </div>
              ))}
            </div>


            <div className="bill-summary-card">
              <div className="s-row"><span>Subtotal</span><span>{c}{subtotal.toFixed(0)}</span></div>
              <div className="s-row"><span>Tax</span><span>{c}{(sgst+cgst).toFixed(0)}</span></div>
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

            <select className="pm-select-mini" value={pm} onChange={e=>setPm(e.target.value)}>
              {PM.map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>

            {billError && (
              <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'7px 11px', fontSize:11, color:'#EF4444', marginBottom:6 }}>
                ⚠️ {billError}
              </div>
            )}

            <button className="btn btn-primary btn-lg full-w" onClick={()=>setPayModal(true)} disabled={table.items.length===0 || busy}>
              {busy ? 'Processing…' : 'Generate Bill'}
            </button>
          </div>
        </div>
      </div>

      {payModal && <PayModal total={grandTotal} currency={c} onClose={()=>setPayModal(false)} onConfirm={doGen}/>}

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
  .billing-layout {height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
    
.table-strip-res {
  border-bottom: 1px solid var(--b1);
  padding: 6px 12px;
}
/* Laptop/Desktop */
@media (min-width: 1024px) {
  .table-strip-res {
    padding: 16px 30px;
  }
}
  .tgrid-res {
  display: flex;
  flex-wrap: nowrap; /* 🚀 FORCE ONE LINE ON DESKTOP */
  gap: 6px;
  padding-top: 6px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tcard-mini {
  flex: 1;
  min-width: 45px;
  height: 40px;
  border-radius: 10px;

  background: var(--s2);
  border: 1px solid var(--b1);

  display: flex;
  align-items: center;
  justify-content: center;

  position: relative;
  cursor: pointer;
}

/* DESKTOP */
@media (min-width: 1024px) {
  .tcard-mini {
    height: 44px;
    min-width: 50px;
  }
}

@media (max-width: 600px) {
  .tgrid-res {
    flex-wrap: wrap; 
  }

  .tcard-mini {
    flex: 0 0 calc((100% - 5 * 6px) / 6);
  }
}
  @media (max-width: 350px) {
  .tgrid-res {
    flex-wrap: wrap; 
  }

  .tcard-mini {
    flex: 0 0 calc((100% - 5 * 6px) / 6);
    height: 35px;
    min-width: 30px;
  }
}
      @media (min-width: 1024px) {
        .mname{
        font-size:12px; font-weight:600; color:var(--t0); line-height:1.3; margin-bottom:2px
      }
  }


        .tcard-mini.active { border-color: var(--a); background: var(--a); }
        .tcard-mini.active .tnum-mini { color: #000; }
        .tnum-mini { font-size: 14px; font-weight: 900; color: var(--t0); }
        .tstatus-dot { width: 5px; height: 5px; border-radius: 50%; position: absolute; top: 4px; right: 4px; }
        .tstatus-dot.occupied { background: var(--red); box-shadow: 0 0 5px var(--amber); }
        .tstatus-dot.free { background: var(--green); }

        .billing-main-grid {display: grid;  grid-template-columns: 1fr clamp(240px, 28vw, 320px); flex: 1; min-height: 0;}
        
        /* MENU SIDE */
        .menu-side { overflow-y: auto; padding: 12px; padding-bottom: 80px; }
        .filter-bar-sticky { position: sticky; top: -12px; background: var(--bg); z-index: 10; padding: 5px 0 12px; }
        .search-wrap-mini { display: flex; align-items: center; background: var(--s2); border-radius: 10px; padding: 0 10px; height: 36px; border: 1px solid var(--b1); margin-bottom: 8px; }
        .search-wrap-mini input { background: none; border: none; outline: none; color: var(--t0); flex: 1; font-size: 13px; margin-left: 8px; }
        .cat-scroll-mini { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; }
        .cat-pill { padding: 6px 12px; border-radius: 20px; background: var(--s3); color: var(--t2); border: none; font-size: 11px; font-weight: 700; white-space: nowrap; cursor: pointer; }
        .cat-pill.on { background: var(--a); color: var(--bg); }

        /* IMAGE-FIRST MENU CARDS */
.items-grid-modern {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
}

/* Mobile */
@media (max-width: 480px) {
  .items-grid-modern {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}

/* Tablet */
@media (min-width: 750px) {
  .items-grid-modern {
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  }
}

/* Laptop */
@media (min-width: 1024px) {
  .items-grid-modern {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }
}

        .mcard-modern { background: var(--s1); border-radius: 16px; overflow: hidden; border: 1px solid var(--b1); display: flex; flex-direction: column; }
        .mimg-container { position: relative; aspect-ratio: 1/1; width: 100%; background: #000; }
        .mimg-big { width: 100%; height: 100%; object-fit: cover; }
        .m-gradient-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 40%); display: flex; align-items: flex-end; padding: 8px; }
        .m-price-tag { background: var(--a); color: #000; font-size: 12px; font-weight: 900; padding: 2px 8px; border-radius: 6px; }
        .mname-modern { font-size: 12px; font-weight: 800; padding: 10px 10px 5px; color: var(--t0); height: 38px; overflow: hidden; line-height: 1.2; }
        .mctrl-modern { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px 12px; }
        .qbtn-m { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--b2); background: var(--s2); color: var(--t0); cursor: pointer; font-weight: 900; }
        @media (min-width: 1024px) {.qbtn-m { width: 28px; height: 28px;}}
        @media (min-width: 1024px) {.qnum-m {text-align:center; font-size:13px; font-weight:800;}}
        
        .main{
  padding:4px;
}

/* ================= MAIN LAYOUT FIX ================= */
.billing-main-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  flex: 1;
  min-height: 0; /* IMPORTANT */
  height: 100%;
  overflow: hidden; /* 🔥 prevents page expansion */
}

/* LEFT SIDE (MENU) */
.menu-side {
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 80px;
  min-height: 0;
}

/* ================= BILL PANEL FIX ================= */
.bill-panel-res {
  background: var(--s1);
  border-left: 1px solid var(--b1);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0; /* 🔥 CRITICAL */
  overflow: hidden; /* 🔥 prevents growth */
  position: relative;
}

/* CONTENT WRAPPER */
.bill-scroll-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0; /* 🔥 CRITICAL */
  overflow: hidden;
  padding: 15px;
}

/* ================= ONLY ITEMS SCROLL AREA ================= */
.bill-items-scroller {
  flex: 1;
  min-height: 0;          /* 🔥 VERY IMPORTANT */
  overflow-y: auto;       /* ONLY THIS SCROLLS */
  overflow-x: hidden;
  padding-right: 4px;
}

/* ================= MOBILE FIX (KEEP SAME BEHAVIOR) ================= */
@media (max-width: 750px) {
  .billing-main-grid {
    grid-template-columns: 1fr;
    overflow: hidden;
  }

  .bill-panel-res {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 75vh;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* 🔥 IMPORTANT */
    border-radius: 20px 20px 0 0;
    z-index: 100;
    transition: 0.3s;
  }

  .bill-panel-res.closed {
    transform: translateY(calc(100% - 60px));
  }

  .mobile-handle {
    display: block;
    padding: 10px 20px;
    cursor: pointer;
    background: var(--s2);
    border-bottom: 1px solid var(--b1);
    border-radius: 20px 20px 0 0;
  }
}

/* ================= FIX ROW (NO LAYOUT SHIFT) ================= */
.b-item-row {
  display: grid;
  grid-template-columns: 1fr auto 60px;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  padding: 6px 0;
}

/* ================= SCROLL CLEAN LOOK ================= */
.bill-items-scroller::-webkit-scrollbar {
  width: 4px;
}

.bill-items-scroller::-webkit-scrollbar-thumb {
  background: var(--b2);
  border-radius: 10px;
}

/* ================= BILL HEADER ================= */
.bill-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 800;
  margin-bottom: 8px;
}

.trash-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.12); /* light red circle */
  color: #ef4444;

  border: 1px solid rgba(239, 68, 68, 0.25);
  cursor: pointer;

  transition: 0.2s ease;
}

/* hover effect */
.trash-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  transform: scale(1.08);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.3);
}

/* ================= INPUTS ================= */
.mini-input {
  width: 100%;
  height: 36px;
  border-radius: 8px;
  border: 1px solid var(--b1);
  background: var(--s2);
  color: var(--t0);
  padding: 0 10px;
  margin-bottom: 6px;
  font-size: 12px;
}

/* ================= TABLE STYLE BILL ITEMS ================= */
.b-item-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;

  gap: 10px;
  padding: 8px 6px;

  border-bottom: 1px solid var(--b1);
  font-size: 12px;
}

/* ITEM NAME */
.b-item-name {
  font-weight: 700;
  color: var(--t0);

  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* QTY CONTROL */
.b-item-ctrl {
  display: flex;
  align-items: center;
  gap: 6px;

  background: var(--s2);
  border-radius: 8px;
  padding: 3px 6px;
}

.b-item-ctrl button {
  border: none;
  font-weight: 900;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 6px;
}

/* RED (− remove) */
.b-item-ctrl button:first-child {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* GREEN (+ add) */
.b-item-ctrl button:last-child {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

/* hover effect */
.b-item-ctrl button:hover {
  transform: scale(1.1);
}

.b-item-ctrl span {
  min-width: 18px;
  text-align: center;
  font-weight: 700;
}

/* PRICE */
.b-item-price {
  text-align: right;
  font-weight: 800;
  color: var(--a);
  min-width: 55px;
}

/* ================= SUMMARY CARD ================= */
.bill-summary-card {
  background: var(--s2);
  border-radius: 12px;
  padding: 10px;
  margin: 10px 0;
  border: 1px solid var(--b1);
}

.s-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 4px;
}

.total-big {
  font-size: 16px;
  font-weight: 900;
  color: var(--a);
  border-top: 1px dashed var(--b1);
  margin-top: 6px;
  padding-top: 6px;
}

/* ================= PAYMENT ================= */
.pm-select-mini {
  width: 100%;
  height: 38px;
  border-radius: 8px;
  background: var(--s2);
  border: 1px solid var(--b1);
  color: var(--t0);
  margin-bottom: 8px;
  font-weight: 700;
  padding: 0 10px;
}

/* ================= BUTTON ================= */
.btn-lg {
  height: 42px;
  font-size: 13px;
  font-weight: 800;
  border-radius: 10px;
}

/* ================= DESKTOP ================= */
@media (min-width: 1024px) {
  .billing-main-grid {
    grid-template-columns: 1fr clamp(240px, 28vw, 320px);
  }
}

/* ================= MOBILE BOTTOM SHEET ================= */
@media (max-width: 750px) {

  .billing-main-grid {
    grid-template-columns: 1fr;
  }

  .bill-panel-res {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;

    max-height: 75vh;

    border-radius: 18px 18px 0 0;
    z-index: 100;

    display: flex;
    flex-direction: column;

    transform: translateY(calc(100% - 60px));
    transition: transform 0.3s ease;
  }

  .bill-panel-res.open {
    transform: translateY(0);
  }

  .mobile-handle {
  padding: 10px;
  background: var(--s2);
  border-bottom: 1px solid var(--b1);
  border-radius: 16px 16px 0 0;
  cursor: pointer;
  display: flex;
  justify-content: center;
}

.h-indicator {
  width: 35px;
  height: 4px;
  background: var(--b2);
  border-radius: 10px;
}

  .summary-flex {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
  }

  .summary-total {
    color: var(--a);
    font-weight: 900;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .rot {
    transform: rotate(180deg);
  }
}

/* ================= CLEAN UI TOUCH ================= */
.b-item-row:hover {
  background: rgba(255,255,255,0.03);
}

/* Hover effect */
.tcard-mini:hover {
  transform: translateY(-2px);
  border-color: var(--a);
}

/* Active table */
.tcard-mini.active {
  background: var(--a);
  color: #000;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.6);
}

/* Table number */
.tnum-mini {
  font-size: 15px;
  font-weight: 900;
}

/* Status dot */
.tstatus-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  position: absolute;
  top: 6px;
  right: 6px;
}

.tstatus-dot.occupied {
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.tstatus-dot.free {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
}
.mhead-pro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--b2);
}
.settle-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  color: var(--t0);
}
.settle-icon { color: var(--gold); }
.close-btn-pro {
  background: none; border: none; color: var(--t2); cursor: pointer;
  padding: 4px; border-radius: 50%; display: flex; align-items: center;
}
.close-btn-pro:hover { background: var(--b2); color: var(--t0); }

.pay-banner-pro {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05));
  margin: 20px;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  border: 1px solid rgba(245, 158, 11, 0.2);
}
.pay-banner-label { font-size: 11px; text-transform: uppercase; color: var(--gold); font-weight: 700; letter-spacing: 0.05em; margin-bottom: 4px; }
.pay-banner-total { font-size: 32px; font-weight: 900; color: var(--t0); font-family: monospace; }

.fgroup-settle { padding: 0 20px 20px; }
.settle-label { display: block; font-size: 11px; color: var(--t2); margin-bottom: 8px; font-weight: 600; text-transform: uppercase; }
.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}
.input-currency {
  position: absolute;
  left: 14px;
  color: var(--t2);
  font-weight: 700;
}
.fgroup-settle input {
  width: 100%;
  background: var(--b2);
  border: 1px solid var(--b3);
  border-radius: 10px;
  padding: 12px 12px 12px 30px;
  color: var(--t0);
  font-size: 18px;
  font-weight: 700;
  transition: all 0.2s;
}
.fgroup-settle input:focus { border-color: var(--gold); outline: none; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15); }
.settle-hint { font-size: 10px; color: var(--t3); margin-top: 8px; text-align: center; }

.settle-actions {
  display: flex;
  gap: 12px;
  padding: 0 20px 20px;
}
.btn-cancel-pro {
  flex: 1;
  background: var(--b2);
  border: 1px solid var(--b3);
  color: var(--t1);
  padding: 12px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
}
.btn-confirm-pro {
  flex: 2;
  padding: 12px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-confirm-pro.solid { background: var(--gold); color: #000; border: none; }
.btn-confirm-pro.solid:hover { background: #fbbf24; transform: translateY(-1px); }
.btn-confirm-pro.ghost { background: none; border: 2px solid var(--gold); color: var(--gold); }
.btn-confirm-pro.ghost:hover { background: rgba(245, 158, 11, 0.1); }

@keyframes fade-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in { animation: fade-in 0.2s ease-out; }
.sold-out-badge-top {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  padding: 4px 10px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  z-index: 10;
  border: 1px solid rgba(255,255,255,0.2);
}
.stock-badge {
  position: absolute;
  bottom: 10px;
  left: 10px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255,255,255,0.1);
  z-index: 5;
}
`}</style>
    </div>
  );
}