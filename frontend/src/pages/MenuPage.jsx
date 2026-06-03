
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Plus, Pencil, Trash2, X, Search, Filter, AlertCircle, Check } from 'lucide-react';
import TopNavBar from '../components/TopNavBar';

/* ITEM MODAL */
function ItemModal({ item, onClose, onSave }) {
  const { settings } = useApp();
  const menuCategories = Array.isArray(settings.menuCategories) && settings.menuCategories.length > 0
    ? settings.menuCategories
    : ['General'];
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || menuCategories[0],
    price: item?.price || '',
    imageUrl: item?.imageUrl || '',
    available: item?.available !== false,
    shortcut: item?.shortcut || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.price || isNaN(form.price)) { setError('Valid price required'); return; }
    setSaving(true);
    try {
      await onSave({ ...form, price: parseFloat(form.price) });
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          <span>{item ? 'Edit Item' : 'Add Item'}</span>
          <button className="iBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="fgroup">
          <label className="lbl">Item Name</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chilli Paneer" />
        </div>
        <div className="frow2">
          <div className="fgroup"><label className="lbl">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {menuCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="fgroup"><label className="lbl">Price</label>
            <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <div className="frow2">
          <div className="fgroup"><label className="lbl">Shortcut</label>
            <input value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value.toLowerCase().trim() })}
              placeholder="e.g. cp, pn, ff" maxLength={10} />
            <span style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4 }}>Short code to quickly add this item (e.g., type 'cp' and press Enter)</span>
          </div>
        </div>
        {/* IMAGE URL INPUT ADDED HERE */}
        <div className="fgroup"><label className="lbl">Image URL</label>
          <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
            placeholder="https://images.unsplash.com/photo..." />
        </div>
        <div className="fgroup" style={{ marginBottom: 20 }}>
          <div className="menu-availability-row">
            <label className="lbl">Menu Availability</label>
            <label className="switch">
              <input
                type="checkbox"
                checked={form.available}
                onChange={e => setForm({ ...form, available: e.target.checked })}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>
        <div className="m-actions">
          <button className="btn btn-ghost " style={{ marginRight: '10px' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const { menuItems, saveMenuItem, deleteMenuItem, settings } = useApp();
  const menuCategories = Array.isArray(settings.menuCategories) && settings.menuCategories.length > 0
    ? settings.menuCategories
    : ['General'];
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [confirmDel, setConfirmDel] = useState(null); // stores ID of item being deleted

  const filtered = useMemo(() => {
    return menuItems.filter(i => {
      const ms = i.name.toLowerCase().includes(search.toLowerCase());
      const mc = catFilter === 'All' || i.category === catFilter;
      return ms && mc;
    });
  }, [menuItems, search, catFilter]);

  const cats = ['All', ...menuCategories];

  return (
    <div className="fi fade-in">


      {/* FILTER BAR - ALIGNED */}
      <div className="menu-filters-row">
        <div style={{ display: 'flex', flex: 1, gap: 8 }}>
          <div className="searchBox-unified" style={{ flex: 1 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search menu..."
            />
          </div>
          <div className="select-wrapper-unified hide-on-desktop" style={{ width: '110px', flexShrink: 0 }}>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ paddingLeft: '14px' }}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ADD ITEM BUTTON */}
        <button className="btn btn-primary menu-add-btn mobile-fab-btn" onClick={() => setModal('add')}>
          <Plus size={14} /> <span>Add Item</span>
        </button>
      </div>

      {/* DESKTOP CATEGORY CHIPS */}
      <div className="chipsWrap hide-on-mobile" style={{ marginTop: '0px' }}>
        {cats.map(c => (
          <button
            key={c}
            className={`chip ${catFilter === c ? 'on' : ''}`}
            onClick={() => setCatFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* MOBILE CARDS */}
      <div className="mobileView">
        {filtered.map(item => (
          <div key={item._id} className={`menu-mobile-card ${confirmDel === item._id ? 'deleting' : ''}`}>
            {confirmDel === item._id ? (
              <div className="del-confirm-overlay">
                <AlertCircle size={18} color="var(--red)" />
                <span>Delete "{item.name}"?</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-mini-ghost" onClick={() => setConfirmDel(null)}>No</button>
                  <button className="btn-mini-red" onClick={() => { deleteMenuItem(item._id); setConfirmDel(null); }}>Yes</button>
                </div>
              </div>
            ) : (
              <>
                {!item.available && (
                  <div className="sold-out-badge">SOLD OUT</div>
                )}
                <div className="menu-card-top">
                  <div><div className="menu-item-name">{item.name}</div><span className="badge-mini">{item.category}</span></div>
                  <div className="menu-item-price">₹{item.price.toFixed(0)}</div>
                </div>
                <div className="menu-card-bottom">
                  <label className="switch mini">
                    <input type="checkbox" checked={item.available} onChange={e => saveMenuItem({ available: e.target.checked }, item._id)} />
                    <span className="slider round"></span>
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="iBtn-round edit" onClick={() => setModal(item)}><Pencil size={12} /></button>
                    <button className="iBtn-round del" onClick={() => setConfirmDel(item._id)}><Trash2 size={12} /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* DESKTOP VIEW */}
      <div className="desktopView">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dtable">
            <thead>
              <tr><th>Item Name</th><th>Category</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'center' }}>Shortcut</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'center' }}>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item._id}>
                  <td style={{ fontWeight: 600 }}>{item.name}</td>
                  <td><span className="badge">{item.category}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>₹{item.price.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}><span className="menu-shortcut">{item.shortcut || '—'}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <label className="switch">
                      <input type="checkbox" checked={item.available} onChange={e => saveMenuItem({ available: e.target.checked }, item._id)} />
                      <span className="slider round"></span>
                    </label>
                    {!item.available && <span style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800, marginLeft: 5 }}>SOLD OUT</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {confirmDel === item._id ? (
                      <div className="row-del-confirm">
                        <button className="confirm-y" onClick={() => { deleteMenuItem(item._id); setConfirmDel(null); }}>Delete</button>
                        <button className="confirm-n" onClick={() => setConfirmDel(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                        <button className="iBtn" onClick={() => setModal(item)}><Pencil size={13} /></button>
                        <button className="iBtn" style={{ color: 'var(--red)' }} onClick={() => setConfirmDel(item._id)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && <ItemModal item={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSave={(data) => saveMenuItem(data, modal !== 'add' ? modal._id : null)} />}
    </div>
  );
}