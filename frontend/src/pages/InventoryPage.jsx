import React, { useState, useEffect } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';

const UNITS = ['Bottles','Cans','Litre','ml','Kg','Gram','Pieces'];

/* STATUS */
const getStatus = (i)=>{
  if(i.stock===0) return { text:'Out of Stock', cls:'b-red' };
  if(i.stock<=i.minStock) return { text:'Low Stock', cls:'b-amber' };
  return { text:'In Stock', cls:'b-green' };
};

/* MODAL */


function StockModal({ item, onClose, onSave }) {
  const { settings } = useApp();
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const [form, setForm] = useState(item || {
    name:'', category: categories[0] || '', unit:'Bottles', stock:0, minStock:5, price:''
  });
  const [error, setError] = useState(null);

  // If categories change and no category selected, set default
  useEffect(() => {
    if (!form.category && categories.length > 0) {
      setForm(f => ({ ...f, category: categories[0] }));
    }
  }, [categories]);

  const set = (k,v)=>setForm(f=>({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.name || !form.category || !form.unit) {
      setError('Name, category, and unit are required.');
      return;
    }
    const data = {
      ...form,
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      price: Number(form.price) || 0
    };
    setError(null);
    // Await onSave and only close if successful
    await onSave(data, setError, onClose);
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          {item ? 'Edit Item' : 'Add Item'}
          <button className="iBtn" onClick={onClose}><X size={16}/></button>
        </div>

        <div className="fgroup">
          <label className="lbl">Item Name</label>
          <input value={form.name} onChange={e=>set('name',e.target.value)} />
        </div>

        <div className="frow2">
          <div className="fgroup">
            <label className="lbl">Stock</label>
            <input type="number" value={form.stock} onChange={e=>set('stock',e.target.value)} />
          </div>
          <div className="fgroup">
            <label className="lbl">Min Stock</label>
            <input type="number" value={form.minStock} onChange={e=>set('minStock',e.target.value)} />
          </div>
        </div>

        <div className="frow2">
          <div className="fgroup">
            <label className="lbl">Category</label>
            <select value={form.category} onChange={e=>set('category',e.target.value)}>
              {categories.map(c=><option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="fgroup">
            <label className="lbl">Unit</label>
            <select value={form.unit} onChange={e=>set('unit',e.target.value)}>
              {UNITS.map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="fgroup">
          <label className="lbl">Price</label>
          <input type="number" value={form.price} onChange={e=>set('price',e.target.value)} />
        </div>

        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

/* MAIN */
export default function InventoryPage() {
  const { settings, role, can } = useApp();
  const isAdmin = role === 'admin' || role === 'manager';
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const [inventory, setInventory] = useState([]);
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');

  useEffect(() => {
    authFetch(apiUrl('/api/inventory')).then(r=>{
      if (!r.ok) throw new Error('Failed to fetch inventory');
      return r.json();
    }).then(data => {
      setInventory(Array.isArray(data) ? data : []);
    }).catch((err) => {
      setInventory([]);
      alert('Failed to load inventory: ' + err.message);
    });
  }, []);

  const adjust = async (id, val) => {
    // Optimistic local state update
    const previousInventory = inventory;
    setInventory(prev => prev.map(i => 
      i._id === id ? { ...i, stock: Math.max(0, i.stock + val) } : i
    ));

    try {
      const res = await authFetch(apiUrl(`/api/inventory/${id}/stock`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantityChange: val })
      });
      if (!res.ok) throw new Error('Failed to update stock');
      
      const updated = await res.json();
      // Sync with final server state
      setInventory(prev => prev.map(i => i._id === id ? updated : i));
      if (window.updateMenuContext) window.updateMenuContext();
    } catch (err) {
      setInventory(previousInventory); // Rollback
      console.error('Stock update error', err);
    }
  };

  const handleSave = async (data, setModalError, closeModal) => {
    const previousInventory = inventory;
    
    // Minimal optimistic local update for edits
    if (data._id) {
       setInventory(prev => prev.map(i => i._id === data._id ? { ...i, ...data } : i));
    }
    
    if (closeModal) closeModal(); // Close UI immediately

    try {
      let res;
      if (data._id) {
        res = await authFetch(apiUrl(`/api/inventory/${data._id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await authFetch(apiUrl('/api/inventory'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }
      
      if (!res.ok) {
        setInventory(previousInventory); // Rollback
        let errMsg = 'Failed to save';
        try {
          const text = await res.text();
          errMsg = JSON.parse(text).message || errMsg;
        } catch {}
        alert(errMsg);
        return;
      }
      
      const saved = await res.json();
      // Apply the final saved object
      setInventory(prev => {
        if (data._id) return prev.map(i => i._id === data._id ? saved : i);
        return [...prev, saved];
      });
      
      if (window.updateMenuContext) window.updateMenuContext();
    } catch (err) {
      setInventory(previousInventory);
      console.error('Save error', err);
      alert('Save failed: ' + err.message);
    }
  }

  const drinkCats = ['alcohol', 'beer', 'soda', 'liquor', 'soft drink', 'can', 'cold drink', 'beverages', 'spirits', 'wine', 'whiskey', 'vodka', 'rum', 'gin'];
  const filtered = inventory.filter(i => {
    const nameMatch = i.name && i.name.toLowerCase().includes(search.toLowerCase());
    const catMatch  = (cat === 'All' || i.category === cat);
    const isDrink   = drinkCats.some(dc => i.category?.toLowerCase().includes(dc));
    return nameMatch && catMatch && isDrink;
  });

  return (
    <div className="fi">

      {/* HEADER */}
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
        <h2 className="ph-title">Inventory</h2>
        {isAdmin && (
          <button className="btn btn-primary" onClick={()=>setModal('add')}>
            <Plus size={16}/> Add
          </button>
        )}
      </div>

      {/* SEARCH */}
      <div className="searchBox">
        <Search size={14}/>
        <input
          placeholder="Search items..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
        />
      </div>

      {/* CATEGORY */}
      <div className="chipsWrap">
        <button
          key="All"
          className={`chip ${cat==='All'?'on':''}`}
          onClick={()=>setCat('All')}
        >
          All
        </button>
        {categories.map(c=>(
          <button
            key={c}
            className={`chip ${cat===c?'on':''}`}
            onClick={()=>setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* MOBILE */}
      <div className="mobileView">
        {filtered.map(i=>{
          const s = getStatus(i);
          const open = expanded===i._id;

          return (
            <div key={i._id} className="invCard">

              <div className="invTop">
                <div>
                  <div className="invName">{i.name}</div>
                  <div className="invMeta">{i.category} • {i.unit}</div>
                </div>

                <div className="invRight">
                  <div className="invStock">{i.stock}</div>
                  <span className={`badge ${s.cls}`}>{s.text}</span>
                </div>
              </div>

              {isAdmin ? (
                <div className="invActions">
                  <button className="btn btn-danger btn-sm" onClick={()=>adjust(i._id,-1)}>-</button>
                  <button className="btn btn-success btn-sm" onClick={()=>adjust(i._id,1)}>+</button>
                  <button className="btn btn-blue btn-sm" onClick={()=>setModal(i)}>Edit</button>
                </div>
              ) : (
                <div className="invActions view-only-label" style={{ padding: '4px 0', fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                  Read-only Access
                </div>
              )}

              <div className="expand" onClick={()=>setExpanded(open?null:i._id)}>
                {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} 
              </div>

              {open && (
                <div className="invDetails">
                  <span>Min: {i.minStock}</span>
                  <span>₹{i.price}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DESKTOP */}
      <div className="desktopView">
        <table className="dtable">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Stock</th>
              <th>Status</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {filtered.map(i=>{
              const s = getStatus(i);
              return (
                <tr key={i._id}>
                  <td>{i.name}</td>
                  <td>{i.category}</td>
                  <td>{i.unit}</td>
                  <td>{i.stock}</td>
                  <td><span className={`badge ${s.cls}`}>{s.text}</span></td>
                  {isAdmin && (
                    <td className="action-cell">
                      <button className="btn btn-danger btn-sm" onClick={()=>adjust(i._id,-1)}>-</button>
                      <button className="btn btn-success btn-sm" onClick={()=>adjust(i._id,1)}>+</button>
                      <button className="btn btn-blue btn-sm" onClick={()=>setModal(i)}>Edit</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {modal && (
        <StockModal
          item={modal==='add'?null:modal}
          onClose={()=>setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* CSS */}
      <style>{`
      .dtable {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 🔥 IMPORTANT */
}

.dtable th,
.dtable td {
  text-align: left;
  padding: 14px 16px;
  vertical-align: middle;
}

.dtable th {
  font-size: 11px;
  color: var(--t2);
  font-weight: 700;
  text-transform: uppercase;
}

.dtable td {
  font-size: 13px;
  color: var(--t0);
}

/* Last column alignment (Actions) */
.dtable th:last-child,
.dtable td:last-child {
  text-align: right;
}

/* Action buttons container */
.action-cell {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
        .searchBox{
          display:flex;
          align-items:center;
          gap:6px;
          background:var(--s2);
          border:1px solid var(--b1);
          padding:5px 10px;
          border-radius:var(--r);
          margin-bottom:12px;
        }

        .searchBox input{
          border:none;
          background:none;
          outline:none;
          flex:1;
          font-size:12px;
          color:var(--t0);
        }

        .chipsWrap{
          display:flex;
          flex-wrap:wrap;
          gap:6px;
          margin-bottom:20px;
        }

        .mobileView{display:block}
        .desktopView{display:none}

        .invCard{
          background:var(--s1);
          border:1px solid var(--b1);
          border-radius:var(--rl);
          padding:10px;
          margin-bottom:8px;
        }

        .invTop{
          display:flex;
          justify-content:space-between;
          margin-bottom:6px;
        }

        .invName{font-size:14px;font-weight:600}
        .invMeta{font-size:11px;color:var(--t2)}

        .invRight{text-align:right}
        .invStock{font-size:15px;font-weight:700}

        .badge{
        font-size:10.5px;
        font-weight:800;
        letter-spacing:0.4px;
        text-transform:uppercase;
        padding:3px 8px;
        border-radius:6px;
      }

        .invActions{
          display:flex;
          gap:6px;
          margin-top:6px;
        }

        .expand{
          display:flex;
          justify-content:center;
          margin-top:4px;
          cursor:pointer;
        }

        .invDetails{
          display:flex;
          justify-content:space-between;
          margin-top:4px;
          font-size:10px;
          color:var(--t1);
        }

        @media(min-width:768px){
          .mobileView{display:none}
          .desktopView{display:block}

          .dtable td{font-size:13px}
          .dtable th{font-size:11px}
          .badge{font-size:11px}
        }
      `}</style>
    </div>
  );
}
