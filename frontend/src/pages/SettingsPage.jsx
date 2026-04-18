import React, { useState, useEffect, useMemo } from 'react';
import { useApp, ROLE_HIERARCHY } from '../context/AppContext';
import { Save, Check, Send, KeyRound, ShieldAlert, Users, Trash2 } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';

const RC = { admin: '#F59E0B', manager: '#3B82F6', staff: '#10B981' };

export default function SettingsPage() {
  const { settings, saveSettings, currentUser, orderHistory, workers } = useApp();
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [email, setEmail] = useState({ adminEmail: settings.adminEmail || '' });
  const setE = (k, v) => setEmail(prev => ({ ...prev, [k]: v }));
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const { showToast } = useApp();

  // STAFF MANAGEMENT (RESET PASSWORDS)
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [newStaffPwd, setNewStaffPwd] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [forceReset, setForceReset] = useState(true);

  // Sync email when worker is selected
  useEffect(() => {
    if (selectedStaffId) {
      const w = workers?.find(w => w.userId?._id === selectedStaffId || w.userId === selectedStaffId);
      setNewStaffEmail(w?.email || '');
    } else {
      setNewStaffEmail('');
    }
  }, [selectedStaffId, workers]);

  const canManageRole = (targetRole) => {
    if (!targetRole) return true;
    const vRole = currentUser.role?.toLowerCase() || 'staff';
    const tRole = targetRole?.toLowerCase() || 'staff';

    const vLevel = ROLE_HIERARCHY[vRole]?.level || 0;
    // Map granular roles (Waiter, etc) to Level 1 if not explicitly in hierarchy
    const tLevel = ROLE_HIERARCHY[tRole]?.level || 1;

    return vLevel > tLevel;
  };

  const handleStaffReset = async () => {
    if (!selectedStaffId) return showToast('Please select a staff member', 'error');
    if (newStaffPwd.length < 6) return showToast('Password must be at least 6 characters', 'error');

    const worker = workers?.find(w => w.userId?._id === selectedStaffId || w.userId === selectedStaffId);
    setResetBusy(true);
    try {
      const res = await authFetch(apiUrl(`/api/auth/reset-worker-password/${selectedStaffId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: newStaffPwd || undefined,
          forceReset
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to update');
      showToast(`Account for ${worker?.name || 'Staff'} updated`);
      setNewStaffPwd('');
      setSelectedStaffId('');
      setNewStaffEmail('');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setResetBusy(false);
    }
  };

  const summary = useMemo(() => {
    if (!orderHistory) return null;
    const today = new Date().toLocaleDateString();
    const todayOrders = orderHistory.filter(o => new Date(o.date).toLocaleDateString() === today);
    return {
      revenue: todayOrders.reduce((s, o) => s + o.grandTotal, 0),
      ordersCount: todayOrders.length,
      due: todayOrders.reduce((s, o) => s + (o.dueAmount || 0), 0)
    };
  }, [orderHistory]);

  const [profileForm, setProfileForm] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    password: '',
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    setProfileForm({
      username: currentUser?.username || '',
      email: currentUser?.email || '',
      password: '',
    });
  }, [currentUser]);

  const handleUpdateProfile = async () => {
    setProfileError('');
    try {
      const res = await authFetch(apiUrl('/api/auth/profile'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      const auth = JSON.parse(localStorage.getItem('humtum_auth_v2'));
      if (auth) {
        auth.user = data.user;
        localStorage.setItem('humtum_auth_v2', JSON.stringify(auth));
      }
      setProfileSaved(true);
      setProfileForm(f => ({ ...f, password: '' })); // Clear password field
      setTimeout(() => setProfileSaved(false), 3000);
      // Wait a moment then reload to refresh currentUser via AppContext
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setProfileError(e.message);
    }
  };

  const invCategories = Array.isArray(settings.inventoryCategories) ? settings.inventoryCategories : [];
  const menuCategories = Array.isArray(settings.menuCategories) ? settings.menuCategories : [];

  // Inventory category state
  const [invCatInput, setInvCatInput] = useState('');
  const [invCatEdit, setInvCatEdit] = useState(null); // {old, new}
  const [invCatError, setInvCatError] = useState('');
  // Menu category state
  const [menuCatInput, setMenuCatInput] = useState('');
  const [menuCatEdit, setMenuCatEdit] = useState(null); // {old, new}
  const [menuCatError, setMenuCatError] = useState('');

  useEffect(() => {
    setForm({ ...settings });
  }, [settings]);


  // Inventory category handlers (with context sync)
  const handleAddInvCategory = async () => {
    const cat = invCatInput.trim();
    if (!cat) return setInvCatError('Category required');
    if (invCategories.includes(cat)) return setInvCatError('Already exists');

    setInvCatError('');
    const prev = invCategories;
    setInvCatInput('');

    try {
      const res = await authFetch(apiUrl('/api/settings/inventory-category'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat })
      });
      if (!res.ok) throw new Error('Failed to add');
      const savedCats = await res.json();
      await saveSettings({ ...settings, inventoryCategories: savedCats });
    } catch (e) {
      setInvCatError(e.message || 'Failed to add');
    }
  };
  const handleRemoveInvCategory = async (cat) => {
    const prev = invCategories;

    try {
      const res = await authFetch(apiUrl('/api/settings/inventory-category'), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat })
      });
      if (!res.ok) throw new Error('Failed to remove');
      const savedCats = await res.json();
      await saveSettings({ ...settings, inventoryCategories: savedCats });
    } catch (e) {
      setInvCatError(e.message || 'Failed to remove');
    }
  };

  // Menu category handlers (with context sync)
  const handleAddMenuCategory = async () => {
    const cat = menuCatInput.trim();
    if (!cat) return setMenuCatError('Category required');
    if (menuCategories.includes(cat)) return setMenuCatError('Already exists');

    setMenuCatError('');
    const prev = menuCategories;
    setMenuCatInput('');

    try {
      const res = await authFetch(apiUrl('/api/settings/menu-category'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat })
      });
      if (!res.ok) throw new Error('Failed to add');
      const savedCats = await res.json();
      await saveSettings({ ...settings, menuCategories: savedCats });
    } catch (e) {
      setMenuCatError(e.message || 'Failed to add');
    }
  };
  const handleRemoveMenuCategory = async (cat) => {
    const prev = menuCategories;

    try {
      const res = await authFetch(apiUrl('/api/settings/menu-category'), {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat })
      });
      if (!res.ok) throw new Error('Failed to remove');
      const savedCats = await res.json();
      await saveSettings({ ...settings, menuCategories: savedCats });
    } catch (e) {
      setMenuCatError(e.message || 'Failed to remove');
    }
  };



  const handleSaveEmail = async () => {
    try {
      await saveSettings({ ...settings, adminEmail: email.adminEmail });
      showToast('Email settings saved successfully');
    } catch (e) {
      showToast('Error saving email: ' + e.message, 'error');
    }
  };

  const handleSendReport = async () => {
    if (!email.adminEmail) {
      setSendResult({ ok: false, msg: 'Fill admin email first. Sender email is fixed.' });
      return;
    }
    setSending(true); setSendResult(null);
    try {
      const r = await authFetch(apiUrl('/api/reports/send-daily'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailConfig: {
            senderEmail: '2k23.cs2312451@gmail.com',
            adminEmail: email.adminEmail.trim(),
          },
          settings: form,
          inventory: [],
        })
      });
      const d = await r.json();
      setSendResult(d.success
        ? { ok: true, msg: `✅ Report sent to ${email.adminEmail} (${d.ordersCount} orders)` }
        : { ok: false, msg: `❌ ${d.error}` }
      );
    } catch (e) {
      setSendResult({ ok: false, msg: `❌ ${e.message}` });
    }
    setSending(false);
  };

  const handleSaveSettings = async () => {
    try {
      setSaved('saving');
      const data = { ...form, ...email };
      await saveSettings(data);
      setSaved(true);
      showToast('Settings saved successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaved(false);
      showToast(e.message || 'Failed to save settings', 'error');
    }
  };

  const c = form.currency;

  return (
    <div className="fi" style={{ padding: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div className="ph">
          <div className="ph-title">Settings</div>
          <div className="ph-sub">Business configuration & email reports</div>
        </div>
        <button className="btn btn-primary" onClick={handleSaveSettings} style={{ minWidth: 120 }}>
          {saved ? <><Check size={12} />Saved</> : <><Save size={12} />Save</>}
        </button>
      </div>



      <div className="settings-grid">

        {/* INVENTORY CATEGORY MANAGEMENT */}
        <div className="card card-p settings-full category-card">
          <div className="sdiv">🗂️ Inventory Categories</div>
          <div className="cat-input-row">
            <input className="cat-input" value={invCatInput} onChange={e => setInvCatInput(e.target.value)} placeholder="Add inventory category" />
            <button className="btn btn-primary" onClick={handleAddInvCategory}>Add</button>
          </div>
          {invCatError && <div className="cat-error">{invCatError}</div>}
          <div className="cat-list">
            {invCategories.map(cat => (
              <div key={cat} className="cat-chip">
                {invCatEdit && invCatEdit.old === cat ? (
                  <>


                  </>
                ) : (
                  <>
                    <span>{cat}</span>
                    <button className="btn btn-xs btn-danger" onClick={() => handleRemoveInvCategory(cat)}>Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* MENU CATEGORY MANAGEMENT */}
        <div className="card card-p settings-full category-card">
          <div className="sdiv">🍽️ Menu Categories</div>
          <div className="cat-input-row">
            <input className="cat-input" value={menuCatInput} onChange={e => setMenuCatInput(e.target.value)} placeholder="Add menu category" />
            <button className="btn btn-primary" onClick={handleAddMenuCategory}>Add</button>
          </div>
          {menuCatError && <div className="cat-error">{menuCatError}</div>}
          <div className="cat-list">
            {menuCategories.map(cat => (
              <div key={cat} className="cat-chip">
                {menuCatEdit && menuCatEdit.old === cat ? (
                  <>
                  </>
                ) : (
                  <>
                    <span>{cat}</span>
                    <button className="btn btn-xs btn-danger" onClick={() => handleRemoveMenuCategory(cat)}>Remove</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-p">
          <div className="sdiv">🏪 Business Info</div>
          <div className="fgroup"><label className="lbl">Restaurant Name</label><input value={form.restaurantName} onChange={e => set('restaurantName', e.target.value)} /></div>
          <div className="fgroup"><label className="lbl">Address</label><input value={form.address} onChange={e => set('address', e.target.value)} /></div>
          <div className="frow2" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="fgroup" style={{ flex: 1 }}><label className="lbl">GSTIN</label><input value={form.gstin} onChange={e => set('gstin', e.target.value)} /></div>
            <div className="fgroup" style={{ flex: 1 }}><label className="lbl">Phone</label><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
          </div>
        </div>

        <div className="card card-p">
          <div className="sdiv">💰 Tax & Billing</div>
          <div className="frow2" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div className="fgroup" style={{ flex: 1 }}><label className="lbl">SGST Rate %</label><input type="number" value={form.sgstRate} onChange={e => set('sgstRate', parseFloat(e.target.value) || 0)} /></div>
            <div className="fgroup" style={{ flex: 1 }}><label className="lbl">CGST Rate %</label><input type="number" value={form.cgstRate} onChange={e => set('cgstRate', parseFloat(e.target.value) || 0)} /></div>
          </div>
        </div>

        <div className="card card-p settings-full">
          <div className="sdiv">📧 Gmail Daily Report</div>

          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 16 }}>
              {[
                { label: "Revenue", value: `${c}${summary.revenue?.toFixed(0) || 0}` },
                { label: "Orders", value: summary.ordersCount || 0 },
                { label: "Dues", value: `${c}${summary.due?.toFixed(0) || 0}` },
              ].map(k => (
                <div key={k.label} className="kpi" style={{ padding: '10px', background: 'var(--s1)', color: 'var(--t0)', border: '1px solid var(--b1)', borderRadius: 10 }}>
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ fontSize: 16 }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          <div className="email-grid">
            <div className="fgroup">
              <label className="lbl">Sender Email</label>
              <input value="2k23.cs2312451@gmail.com" readOnly style={{ background: 'var(--s2)', color: 'var(--t1)', cursor: 'not-allowed' }} />
            </div>
            <div className="fgroup">
              <label className="lbl">Admin Email</label>
              <input value={email.adminEmail || ''} onChange={e => setE('adminEmail', e.target.value)} placeholder="owner@company.com" />
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button className="btn btn-ghost" onClick={handleSaveEmail}>
              Save Email Settings
            </button>
            <button className="btn btn-primary" onClick={handleSendReport} disabled={sending}>
              {sending ? 'Sending…' : 'Send Report'}
            </button>
          </div>

          {sendResult && (
            <div style={{ marginTop: 10, padding: 10, borderRadius: 8, fontSize: 12 }}>
              {sendResult.msg}
            </div>
          )}
        </div>

        {/* STAFF & MANAGER SECURITY (ADMIN ONLY) */}
        {currentUser.role === 'admin' && (
          <div className="card card-p settings-full" style={{ background: 'linear-gradient(135deg, var(--s1) 0%, rgba(255, 193, 7, 0.03) 100%)', border: '1px solid var(--b2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
              <ShieldAlert size={18} style={{ color: '#FFC107' }} />
              <div className="sdiv" style={{ marginBottom: 0 }}>Staff & Manager Security</div>
            </div>

            <div className="staff-reset-grid">
              <div className="fgroup">
                <label className="lbl">Select Account</label>
                <select
                  className="cat-input"
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  style={{ width: '100%', height: 42 }}
                >
                  <option value="">-- Select Target --</option>
                  <option value="staff_team">All Staff (Team Password)</option>
                  <option value="manager_team">Manager Account</option>
                </select>
              </div>


              <div className="fgroup">
                <label className="lbl">Update Password</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
                  <input
                    className="cat-input"
                    type="password"
                    value={newStaffPwd}
                    onChange={e => setNewStaffPwd(e.target.value)}
                    placeholder="Set 6+ chars"
                    style={{ paddingLeft: 34, height: 42 }}
                  />
                </div>
              </div>

              <div className="fgroup">
                <button 
  className="btn btn-primary"
  onClick={handleStaffReset} 
  disabled={resetBusy || !selectedStaffId}
  style={{ height: 42, width: '100%' }}
>
  {resetBusy ? 'Updating...' : 'Update Staff & Manager'}
</button>
              </div>
            </div>

            <div style={{ marginTop: 15, padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px dashed var(--b1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--t2)' }}>
                <Users size={12} />
                <span><b>Security Notice:</b> This tool forces a password update for subordinated staff. They will be alerted on their next login attempt.</span>
              </div>
            </div>
          </div>
        )}

        {/* PROFILE SECTION */}
        <div className="card card-p settings-full" style={{ border: '1px solid var(--b2)' }}>
          <div className="sdiv">👤 My Profile & Security</div>
          <div className="profile-row-pro">
            <div className="fgroup" style={{ flex: 1 }}>
              <label className="lbl">Username</label>
              <input value={profileForm.username} onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="fgroup" style={{ flex: 1 }}>
              <label className="lbl">New Password</label>
              <input type="password" value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
            </div>
            <div className="profile-btn-wrap" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={handleUpdateProfile} style={{ height: 40, minWidth: 140 }}>
                {profileSaved ? '✅ Updated!' : 'Update Profile'}
              </button>
            </div>
          </div>
          {profileError && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 10 }}>{profileError}</p>}
        </div>

      </div>
      <style>{`
/* CATEGORY MANAGEMENT MODERN STYLES */
.category-card {
  background: var(--s1);
  border-radius: 18px;
  box-shadow: 0 2px 8px 0 rgba(0,0,0,0.04);
  padding-bottom: 18px;
}
.cat-input-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.cat-input {
  flex: 1;
  border-radius: 8px;
  border: 1px solid var(--b1);
  padding: 8px 12px;
  background: var(--s2);
  color: var(--t0);
  font-size: 15px;
  transition: border 0.2s;
}
.cat-input:focus {
  outline: none;
  border-color: var(--amber);
  background: var(--s2);
}
.cat-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}
.cat-chip {
  background: var(--s2);
  color: var(--t1);
  border-radius: 16px;
  padding: 5px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 1px 4px 0 rgba(0,0,0,0.03);
  font-size: 14px;
  min-height: 32px;
}
.cat-edit-input {
  border-radius: 8px;
  border: 1px solid var(--b1);
  padding: 4px 8px;
  font-size: 14px;
  background: var(--s1);
  color: var(--t0);
}
.cat-error {
  color: var(--red);
  margin-bottom: 8px;
  font-size: 13px;
}

/* MAIN GRID */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

/* FORCE FULL WIDTH CARDS */
.settings-full {
  grid-column: 1 / -1;
}

/* LAPTOP (your issue area) */
@media (max-width: 1200px) {
  .settings-grid {
    grid-template-columns: 1fr 1fr;
  }
}

/* TABLET */
@media (max-width: 900px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

/* MOBILE */
@media (max-width: 600px) {
  .settings-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

/* IMPROVE CARD HEIGHT CONSISTENCY */
.card {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.profile-row-pro {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
@media (max-width: 768px) {
  .profile-row-pro {
    flex-direction: column;
    gap: 12px;
  }
  .profile-btn-wrap {
    width: 100%;
  }
  .profile-btn-wrap button {
    width: 100%;
  }
}

.email-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 768px) {
  .email-grid {
    grid-template-columns: 1fr;
  }

  .cat-input-row {
    flex-direction: column;
    align-items: stretch;
  }
}

.staff-reset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr; /* FIXED */
  gap: 12px;
  margin-top: 10px;
  align-items: end; /* IMPORTANT */
}

@media (max-width: 900px) {
  .staff-reset-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}

`}</style>
    </div>
  );
}
