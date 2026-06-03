import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Save, Check, Send, KeyRound, ShieldAlert, Users, Trash2, RefreshCw } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import './SettingsPage.css';

export default function SettingsPage() {
  const { settings, setSettings, saveSettings, currentUser, orderHistory, workers, loadData } = useApp();
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
  const [resetBusy, setResetBusy] = useState(false);
  const [forceReset, setForceReset] = useState(true);

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
        localStorage.setItem('humtum_auth_v2', JSON.stringify(data.user));
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

  const invCategories = Array.isArray(form.inventoryCategories) ? form.inventoryCategories : [];
  const menuCategories = Array.isArray(form.menuCategories) ? form.menuCategories : [];

  // Inventory category state
  const [invCatInput, setInvCatInput] = useState('');
  const [invCatError, setInvCatError] = useState('');
  // Menu category state
  const [menuCatInput, setMenuCatInput] = useState('');
  const [menuCatError, setMenuCatError] = useState('');

  useEffect(() => {
    setForm({ ...settings });
    setEmail({ adminEmail: settings.adminEmail || '' });
  }, [settings]);


  // Inventory category handlers (with context sync)
  const handleAddInvCategory = () => {
    const cat = invCatInput.trim();
    if (!cat) return setInvCatError('Category required');
    const prev = form.inventoryCategories || [];
    if (prev.includes(cat)) return setInvCatError('Already exists');

    setInvCatError('');
    const next = [...prev, cat];
    setForm({ ...form, inventoryCategories: next });
    setSettings({ ...settings, inventoryCategories: next });
    setInvCatInput('');
  };
  const handleRemoveInvCategory = (cat) => {
    const prev = form.inventoryCategories || [];
    const next = prev.filter(c => c !== cat);
    setForm({ ...form, inventoryCategories: next });
    setSettings({ ...settings, inventoryCategories: next });
  };

  // Menu category handlers (with context sync)
  const handleAddMenuCategory = () => {
    const cat = menuCatInput.trim();
    if (!cat) return setMenuCatError('Category required');
    const prev = form.menuCategories || [];
    if (prev.includes(cat)) return setMenuCatError('Already exists');

    setMenuCatError('');
    const next = [...prev, cat];
    setForm({ ...form, menuCategories: next });
    setSettings({ ...settings, menuCategories: next });
    setMenuCatInput('');
  };
  const handleRemoveMenuCategory = (cat) => {
    const prev = form.menuCategories || [];
    const next = prev.filter(c => c !== cat);
    setForm({ ...form, menuCategories: next });
    setSettings({ ...settings, menuCategories: next });
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
            adminEmail: email.adminEmail.trim(),
          },
          settings: form,
          inventory: [],
        })
      });
      const d = await r.json();
      setSendResult(d.success
        ? { ok: true, msg: `✅ Report sent to ${d.recipient || email.adminEmail} (${d.ordersCount || 0} orders)` }
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
    <div className="fi settings-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '16px' }}>

        <button className="btn btn-primary settings-save-btn" onClick={handleSaveSettings} disabled={saved === 'saving'}>
          {saved === 'saving' ? <><RefreshCw size={14} />Saving</> : saved ? <><Check size={14} />Saved</> : <><Save size={14} />Save Settings</>}
        </button>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Business Info</h2>
              <p>Printed invoice and restaurant identity details.</p>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field settings-wide">
              <label>Restaurant Name</label>
              <input value={form.restaurantName || ''} onChange={e => set('restaurantName', e.target.value)} placeholder="HumTum Bar & Restaurant" />
            </div>
            <div className="settings-field settings-wide">
              <label>Address</label>
              <input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="Restaurant address" />
            </div>
            <div className="settings-field">
              <label>GSTIN</label>
              <input value={form.gstin || ''} onChange={e => set('gstin', e.target.value)} placeholder="GST number" />
            </div>
            <div className="settings-field">
              <label>Phone</label>
              <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Phone number" />
            </div>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Tax & Billing</h2>
              <p>Rates and receipt copy used during billing.</p>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <label>SGST Rate %</label>
              <input type="number" min="0" step="0.01" value={form.sgstRate ?? 0} onChange={e => set('sgstRate', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="settings-field">
              <label>CGST Rate %</label>
              <input type="number" min="0" step="0.01" value={form.cgstRate ?? 0} onChange={e => set('cgstRate', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="settings-field settings-wide">
              <label>Thank You Message</label>
              <input value={form.thankYouMsg || ''} onChange={e => set('thankYouMsg', e.target.value)} placeholder="Thank you for visiting!" />
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={!!form.darkMode} onChange={e => set('darkMode', e.target.checked)} />
              <span>Use dark mode by default</span>
            </label>
          </div>
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Menu Categories</h2>
              <p>Control category filters shown on menu and billing screens.</p>
            </div>
          </div>
          <div className="category-input-row">
            <input value={menuCatInput} onChange={e => setMenuCatInput(e.target.value)} placeholder="Add menu category" />
            <button className="btn btn-primary" onClick={handleAddMenuCategory}>Add</button>
          </div>
          {menuCatError && <div className="settings-error">{menuCatError}</div>}
          <div className="category-list">
            {menuCategories.map(cat => (
              <div key={cat} className="category-chip">
                <span>{cat}</span>
                <button type="button" onClick={() => handleRemoveMenuCategory(cat)} aria-label={`Remove ${cat}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {menuCategories.length === 0 && <div className="settings-empty">No menu categories yet.</div>}
          </div>
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Inventory Categories</h2>
              <p>Maintain inventory groups for stock and reporting.</p>
            </div>
          </div>
          <div className="category-input-row">
            <input value={invCatInput} onChange={e => setInvCatInput(e.target.value)} placeholder="Add inventory category" />
            <button className="btn btn-primary" onClick={handleAddInvCategory}>Add</button>
          </div>
          {invCatError && <div className="settings-error">{invCatError}</div>}
          <div className="category-list">
            {invCategories.map(cat => (
              <div key={cat} className="category-chip">
                <span>{cat}</span>
                <button type="button" onClick={() => handleRemoveInvCategory(cat)} aria-label={`Remove ${cat}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {invCategories.length === 0 && <div className="settings-empty">No inventory categories yet.</div>}
          </div>
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Daily Report</h2>
              <p>Send today&apos;s summary to the configured administrator email.</p>
            </div>
          </div>

          {summary && (
            <div className="settings-kpi-grid">
              <div className="settings-kpi">
                <span>Revenue</span>
                <strong>{c}{summary.revenue?.toFixed(0) || 0}</strong>
              </div>
              <div className="settings-kpi">
                <span>Orders</span>
                <strong>{summary.ordersCount || 0}</strong>
              </div>
              <div className="settings-kpi">
                <span>Dues</span>
                <strong>{c}{summary.due?.toFixed(0) || 0}</strong>
              </div>
            </div>
          )}

          <div className="settings-fields settings-report-fields">
            <div className="settings-field">
              <label>Sender Email</label>
              <input value={form.senderEmail || settings.senderEmail || ''} readOnly className="settings-readonly" />
            </div>
            <div className="settings-field">
              <label>Admin Email</label>
              <input value={email.adminEmail || ''} onChange={e => setE('adminEmail', e.target.value)} placeholder="owner@company.com" />
            </div>
          </div>
          <div className="settings-actions">
            <button className="btn btn-ghost" onClick={handleSaveEmail}>Save Email</button>
            <button className="btn btn-primary" onClick={handleSendReport} disabled={sending}>
              {sending ? 'Sending...' : <><Send size={14} />Send Report</>}
            </button>
          </div>
          {sendResult && <div className={`settings-result ${sendResult.ok ? 'ok' : 'bad'}`}>{sendResult.msg}</div>}
        </section>

        <section className="settings-card settings-full settings-security-card">
          <div className="settings-card-head">
            <div>
              <h2>Account & Security</h2>
              <p>Manage your profile, update passwords, and control team access.</p>
            </div>
            <ShieldAlert size={20} />
          </div>

          {/* My Profile */}
          <div className="settings-subsection">
            <h3 className="settings-subsection-title">My Profile</h3>
            <div className="profile-row-pro">
              <div className="settings-field">
                <label>Username</label>
                <input value={profileForm.username} onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>New Password</label>
                <input type="password" value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current password" />
              </div>
              <button className="btn btn-primary settings-grid-action" onClick={handleUpdateProfile}>
                {profileSaved ? <><Check size={14} />Updated</> : 'Update Profile'}
              </button>
            </div>
            {profileError && <p className="settings-error">{profileError}</p>}
          </div>

          {/* Staff & Manager Password Reset (admin only) */}
          {currentUser?.role === 'admin' && (
            <div className="settings-subsection">
              <h3 className="settings-subsection-title">Staff & Manager Passwords</h3>
              <div className="staff-reset-grid">
                <div className="settings-field">
                  <label>Select Account</label>
                  <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                    <option value="">Select target</option>
                    <option value="staff_team">All Staff</option>
                    <option value="manager_team">Manager Account</option>
                  </select>
                </div>

                <div className="settings-field settings-password-field">
                  <label>Update Password</label>
                  <div>
                    <KeyRound size={15} />
                    <input type="password" value={newStaffPwd} onChange={e => setNewStaffPwd(e.target.value)} placeholder="Set 6+ chars" />
                  </div>
                </div>

                <label className="settings-toggle staff-force-toggle">
                  <input type="checkbox" checked={forceReset} onChange={e => setForceReset(e.target.checked)} />
                  <span>Force reset on next login</span>
                </label>

                <button className="btn btn-primary settings-grid-action" onClick={handleStaffReset} disabled={resetBusy || !selectedStaffId}>
                  {resetBusy ? 'Updating...' : 'Update Accounts'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
