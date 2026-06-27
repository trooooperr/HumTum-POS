import React, { useState, useEffect } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import TopNavBar from '../components/TopNavBar';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const UNITS = ['Bottles', 'Cans', 'Litre', 'ml', 'Kg', 'Gram', 'Pieces'];

/* STATUS */
const getStatus = (i) => {
  if (i.stock === 0) return { text: 'Out of Stock', cls: 'b-red' };
  if (i.stock <= i.minStock) return { text: 'Low Stock', cls: 'b-amber' };
  return { text: 'In Stock', cls: 'b-green' };
};

/* MODAL */

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
        <CalendarDownIcon />
      </button>
    </div>
  );
}

function CalendarDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h18" /><path d="M21 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" /><path d="M16 2v4M8 2v4" /></svg>;
}


function StockModal({ item, onClose, onSave }) {
  const { settings } = useApp();
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const [form, setForm] = useState(() => {
    if (item) {
      return { ...item, isAlcoholic: !!(item.isAlcoholic || item.isAlcohol) };
    }
    return {
      name: '', category: categories[0] || 'General', unit: 'Bottles', stock: 0, minStock: 5, price: '', shortcut: '', isAlcoholic: false
    };
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // If categories change and no category selected, set default
  useEffect(() => {
    if (!form.category && categories.length > 0) {
      setForm(f => ({ ...f, category: categories[0] || 'General' }));
    }
  }, [categories]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (saving) return;
    if (!form.name || !form.category || !form.unit) {
      setError('Name, category, and unit are required.');
      return;
    }
    const data = {
      ...form,
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      price: Number(form.price) || 0,
      shortcut: (form.shortcut || '').toLowerCase().trim(),
      isAlcoholic: !!form.isAlcoholic
    };
    setError(null);
    setSaving(true);
    try {
      await onSave(data, setError, onClose);
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          {item ? 'Edit Item' : 'Add Item'}
          <button className="iBtn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="fgroup">
          <label className="lbl">Item Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="frow2">
          <div className="fgroup">
            <label className="lbl">Stock</label>
            <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)} />
          </div>
          <div className="fgroup">
            <label className="lbl">Min Stock</label>
            <input type="number" value={form.minStock} onChange={e => set('minStock', e.target.value)} />
          </div>
        </div>

        <div className="frow2">
          <div className="fgroup">
            <label className="lbl">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="fgroup">
            <label className="lbl">Unit</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="fgroup">
          <label className="lbl">Price</label>
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
        </div>

        <div className="fgroup" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
          <input 
            type="checkbox" 
            id="isAlcoholic"
            checked={!!form.isAlcoholic} 
            onChange={e => set('isAlcoholic', e.target.checked)} 
            style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
          />
          <label htmlFor="isAlcoholic" style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>Alcoholic Item</label>
        </div>

        <div className="fgroup">
          <label className="lbl">Shortcut</label>
          <input value={form.shortcut} onChange={e => set('shortcut', e.target.value.toLowerCase().trim())}
            placeholder="e.g. cp, pn, ff" maxLength={10} />
          <span className="modal-hint" style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4, display: 'block' }}>Short code to quickly add this item</span>
        </div>

        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : item ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* MAIN */
export default function InventoryPage() {
  const { settings, role, can, inventory, setInventory, deleteInventoryItem, reorderInventoryItems } = useApp();
  const isAdmin = role === 'admin' || role === 'manager';
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);
  const [cat, setCat] = useState(() => categories[0] || 'General');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(cat)) {
      setCat(categories[0]);
    }
  }, [categories, cat]);

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
  };

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
        } catch { }
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

  const filtered = inventory.filter(i => {
    const nameMatch = i.name && i.name.toLowerCase().includes(search.toLowerCase());
    const catMatch = i.category === cat;
    return nameMatch && catMatch;
  });

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.index === destination.index) return;

    const itemsOfCategory = Array.from(filtered);
    const [removed] = itemsOfCategory.splice(source.index, 1);
    itemsOfCategory.splice(destination.index, 0, removed);

    const orderedIds = itemsOfCategory.map(item => item._id);
    reorderInventoryItems(orderedIds);
  };

  const handleShiftItem = async (index, direction) => {
    if (direction === 'up' && index > 0) {
      const newItems = [...filtered];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderInventoryItems(orderedIds);
    } else if (direction === 'down' && index < filtered.length - 1) {
      const newItems = [...filtered];
      [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderInventoryItems(orderedIds);
    }
  };

  return (
    <div className="fi inventory-page">



      {/* FILTER BAR - unified with OrdersPage */}
      <div className="orders-filters-row">
        <div style={{ display: 'flex', flex: 1, gap: 8 }}>
          <div className="search-wrapper-unified" style={{ flex: 1 }}>
  <Search size={16} className="search-icon" />
  <input
    value={search}
    onChange={e => setSearch(e.target.value)}
    placeholder="Search items..."
    className="search-input-unified"
  />
  {search && (
    <button className="search-clear-btn" onClick={() => setSearch('')} title="Clear search">
      <X size={14} />
    </button>
  )}
</div>
          <div className="select-wrapper-unified hide-on-desktop" style={{ width: '110px', flexShrink: 0 }}>
            <select value={cat} onChange={e => setCat(e.target.value)} style={{ paddingLeft: '14px' }}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {isAdmin && (
          <button
            className="btn btn-primary search-add-btn mobile-fab-btn"
            onClick={() => setModal('add')}
          >
            <Plus size={14} className="add-icon" />
            <span>Add</span>
          </button>
        )}
      </div>

      {/* CATEGORY */}
      <div className="chipsWrap hide-on-mobile">
        {categories.map(c => (
          <button
            key={c}
            className={`chip ${cat === c ? 'on' : ''}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* MOBILE */}
      <div className="mobileView">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="inventory-mobile-list">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {filtered.map((i, index) => {
                  const s = getStatus(i);
                  const open = expanded === i._id;

                  return (
                    <Draggable key={i._id} draggableId={i._id} index={index} isDragDisabled={!isAdmin || !!search}>
                      {(provided) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className="invCard"
                          style={{
                            ...provided.draggableProps.style,
                            cursor: (!isAdmin || !!search) ? 'default' : 'grab'
                          }}
                        >
                          <div className="invTop">
                            <div>
                              <div className="invName">{i.name}</div>
                              {i.shortcut && <div className="invShortcutRow">Shortcut: <span className="invShortcut">{i.shortcut}</span></div>}
                              <div className="invMeta">{i.category} • ₹{i.price}</div>
                              <div style={{ marginTop: 4 }}>
                                <span className={`badge ${i.isAlcoholic || i.isAlcohol ? 'b-red' : 'b-green'}`} style={{ fontSize: 10 }}>
                                  {i.isAlcoholic || i.isAlcohol ? 'Alcoholic' : 'Non-Alcoholic'}
                                </span>
                              </div>
                            </div>

                            <div className="invRight">
                              <div className="invStock">{i.stock}</div>
                              <span className={`badge ${s.cls}`}>{s.text}</span>
                            </div>
                          </div>

                          {isAdmin ? (
                            <div className="invActions">
                              <button className="btn btn-danger btn-icon-sm" onClick={() => adjust(i._id, -1)}>-</button>
                              <button className="btn btn-success btn-icon-sm" onClick={() => adjust(i._id, 1)}>+</button>
                              <div style={{ display: 'flex', gap: 4, margin: '0 8px' }}>
                                <button className="iBtn-round" disabled={index === 0 || !!search} onClick={() => handleShiftItem(index, 'up')} title="Move up" style={{ fontSize: 10, cursor: index === 0 || !!search ? 'not-allowed' : 'pointer', opacity: (index === 0 || !!search) ? 0.3 : 1 }}>▲</button>
                                <button className="iBtn-round" disabled={index === filtered.length - 1 || !!search} onClick={() => handleShiftItem(index, 'down')} title="Move down" style={{ fontSize: 10, cursor: index === filtered.length - 1 || !!search ? 'not-allowed' : 'pointer', opacity: (index === filtered.length - 1 || !!search) ? 0.3 : 1 }}>▼</button>
                              </div>
                              <button className="btn btn-blue btn-sm" onClick={() => setModal(i)}>Edit</button>
                              <button className="btn btn-icon-sm btn-danger" onClick={() => setConfirmDelete(i._id)} title="Delete item"><Trash2 size={14} /></button>
                            </div>
                          ) : (
                            <div className="invActions view-only-label" style={{ padding: '4px 0', fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                              Read-only Access
                            </div>
                          )}

                          <div className="expand hide-mobile" onClick={() => setExpanded(open ? null : i._id)}>
                            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>

                          {open && (
                            <div className="invDetails">
                              <span>Min: {i.minStock}</span>
                              <span>₹{i.price}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* DESKTOP */}
      <div className="desktopView">
        <div className="card-table-wrapper">
          <table className="dtable">
            <thead>
              <tr>
                <th>Item</th>
                <th>Shortcut</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Classification</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="inventory-desktop-list">
                {(provided) => (
                  <tbody ref={provided.innerRef} {...provided.droppableProps}>
                    {filtered.map((i, index) => {
                      const s = getStatus(i);
                      return (
                        <Draggable key={i._id} draggableId={i._id} index={index} isDragDisabled={!isAdmin || !!search}>
                          {(provided) => (
                            <tr
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                ...provided.draggableProps.style,
                                cursor: (!isAdmin || !!search) ? 'default' : 'grab'
                              }}
                            >
                              <td>{i.name}</td>
                              <td>{i.shortcut ? <span className="invShortcut">{i.shortcut}</span> : '—'}</td>
                              <td>{i.category}</td>
                              <td>₹{i.price}</td>
                              <td>{i.stock}</td>
                              <td>
                                <span className={`badge ${i.isAlcoholic || i.isAlcohol ? 'b-red' : 'b-green'}`}>
                                  {i.isAlcoholic || i.isAlcohol ? 'Alcoholic' : 'Non-Alcoholic'}
                                </span>
                              </td>
                              <td><span className={`badge ${s.cls}`}>{s.text}</span></td>
                               {isAdmin && (
                                 <td className="action-cell">
                                   <button className="btn btn-danger btn-icon-sm" onClick={() => adjust(i._id, -1)}>-</button>
                                   <button className="btn btn-success btn-icon-sm" onClick={() => adjust(i._id, 1)}>+</button>
                                   <span style={{ margin: '0 2px', color: 'var(--b1)' }}>|</span>
                                   <button className="btn btn-icon-sm" disabled={index === 0 || !!search} onClick={() => handleShiftItem(index, 'up')} title="Move up" style={{ opacity: (index === 0 || !!search) ? 0.3 : 1 }}>▲</button>
                                   <button className="btn btn-icon-sm" disabled={index === filtered.length - 1 || !!search} onClick={() => handleShiftItem(index, 'down')} title="Move down" style={{ opacity: (index === filtered.length - 1 || !!search) ? 0.3 : 1 }}>▼</button>
                                   <span style={{ margin: '0 2px', color: 'var(--b1)' }}>|</span>
                                   <button className="btn btn-blue btn-sm" onClick={() => setModal(i)}>Edit</button>
                                   <button className="btn btn-icon-sm btn-danger" onClick={() => setConfirmDelete(i._id)} title="Delete item"><Trash2 size={14} /></button>
                                 </td>
                               )}
                            </tr>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </tbody>
                )}
              </Droppable>
            </DragDropContext>
          </table>
        </div>
      </div>

      {/* MODAL */}
      {modal && (
        <StockModal
          item={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {confirmDelete && (
        <div className="moverlay">
          <div className="mbox">
            <div className="mhead">Delete Inventory Item</div>
            <p>Are you sure you want to delete this item?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                try {
                  await deleteInventoryItem(confirmDelete);
                } catch (e) {
                  alert(e.message || 'Failed to delete item');
                } finally {
                  setConfirmDelete(null);
                }
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
