import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Volume2, VolumeX, Clock, ChefHat, AlertCircle, RefreshCw } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import './KitchenDisplay.css';

// --- UI configuration ---
const TOTAL_TABLES = 21;
const SECTION_MAP = {
  topBarLounge: [1,2,3,4,5,6,7],
  lowerBarLounge: [8,9,10,11,12,13,14],
  restaurantArea: [15,16,17,18,19,20,21],
};
function KOTCard({ kot, onStatusChange }) {
  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="kot-card"
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--b2)',
        borderRadius: 10,
        padding: 14,
        color: 'var(--t1)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--t0)', letterSpacing: 0.5 }}>
          {kot.kotNo}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {kot.orderType && (
              <span style={{ fontSize: 10, fontWeight: 'bold', padding: '2px 8px', background: 'var(--a)', borderRadius: 20, color: 'var(--s0)', textTransform: 'uppercase' }}>
                {kot.orderType}
              </span>
            )}
            {kot.waiterName && (
              <span style={{ fontSize: 11, color: 'var(--t2)' }}>
                👤 {kot.waiterName}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, color: 'var(--a)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={13} />
            {formatTime(kot.createdAt)}
          </div>
        </div>
      </div>

      {/* Items list */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 8, overflow: 'hidden' }}>
        {kot.items.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '8px 12px',
              borderBottom: idx < kot.items.length - 1 ? '1px solid var(--b2)' : 'none',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t0)' }}>{item.name}</div>
              {item.notes && (
                <div style={{ fontSize: 11, color: '#f5c518', fontStyle: 'italic', marginTop: 2 }}>
                  ✎ Advice: {item.notes}
                </div>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--t0)', minWidth: 30, textAlign: 'right' }}>
              ×{item.quantity}
            </div>
          </div>
        ))}
      </div>

      {/* Order-level notes */}
      {kot.notes && (
        <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: '#f5c518', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{kot.notes}</span>
        </div>
      )}

      {/* KOT Status Action Buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, borderTop: '1px solid var(--b2)', paddingTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {kot.status === 'PENDING' && (
          <button 
            className="btn btn-blue btn-sm" 
            style={{ flex: 1 }} 
            onClick={() => onStatusChange(kot._id, 'PREPARING')}
          >
            Start Preparing
          </button>
        )}
        {kot.status === 'PREPARING' && (
          <button 
            className="btn btn-primary btn-sm" 
            style={{ flex: 1 }} 
            onClick={() => onStatusChange(kot._id, 'READY')}
          >
            Mark Ready
          </button>
        )}
        {kot.status === 'READY' && (
          <button 
            className="btn btn-success btn-sm" 
            style={{ flex: 1 }} 
            onClick={() => onStatusChange(kot._id, 'SERVED')}
          >
            Mark Served
          </button>
        )}
        <span 
          className={`badge ${
            kot.status === 'PENDING' ? 'b-red' : 
            kot.status === 'PREPARING' ? 'b-amber' : 
            'b-green'
          }`} 
          style={{ fontSize: 10, marginLeft: 'auto', alignSelf: 'center' }}
        >
          {kot.status}
        </span>
      </div>
    </div>
  );
}

export default function KitchenDisplay() {
  const { socket, role, can, updateKOTStatus } = useApp();
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedTable, setSelectedTable] = useState(null);

  const loadKOTs = async () => {
    try {
      const res = await authFetch(apiUrl('/api/kots/kitchen/display'));
      if (!res.ok) throw new Error('Failed to load KOTs');
      const data = await res.json();
      const activeKOTs = data.filter(kot => !['COMPLETED', 'SERVED'].includes(kot.status));
      setKots(activeKOTs);
    } catch (err) {
      console.error('Failed to load KOTs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (kotId, newStatus) => {
    try {
      await updateKOTStatus(kotId, newStatus);
      if (['COMPLETED', 'SERVED'].includes(newStatus)) {
        setKots(prev => prev.filter(k => k._id !== kotId));
      } else {
        setKots(prev => prev.map(k => k._id === kotId ? { ...k, status: newStatus } : k));
      }
    } catch (err) {
      console.error('Failed to update KOT status:', err);
    }
  };

  const playNotification = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {}
  };

  useEffect(() => {
    loadKOTs();

    if (socket) {
      socket.emit('join-kitchen');

      socket.on('NEW_KOT', (data) => {
        if (!['COMPLETED', 'SERVED'].includes(data.status)) {
          setKots(prev => {
            if (prev.some(k => k._id === data._id)) return prev;
            return [data, ...prev];
          });
          if (soundEnabled) playNotification();
        }
      });

      socket.on('KOT_UPDATED', (data) => {
        if (['COMPLETED', 'SERVED'].includes(data.status)) {
          setKots(prev => prev.filter(k => k._id !== data._id));
        } else {
          setKots(prev => prev.map(k => k._id === data._id ? { ...k, ...data } : k));
        }
      });

      socket.on('ORDER_COMPLETED', (data) => {
        if (data.tableNo) {
          setKots(prev => prev.filter(k => k.tableNo !== parseInt(data.tableNo)));
        }
      });

      return () => {
        socket.off('NEW_KOT');
        socket.off('KOT_UPDATED');
        socket.off('ORDER_COMPLETED');
      };
    }
  }, [socket, soundEnabled]);

  // Group KOTs by table number
  const kotsByTable = kots.reduce((acc, kot) => {
    const key = kot.tableNo;
    if (!acc[key]) acc[key] = [];
    acc[key].push(kot);
    return acc;
  }, {});

  // All table numbers (including empty ones)
  const allTableNos = Array.from({ length: TOTAL_TABLES }, (_, i) => (i + 1).toString());

  // Counts for top stats bar
  const activeTables = Object.keys(kotsByTable).length;
  const emptyTables = TOTAL_TABLES - activeTables;

  const tableNos = Object.keys(kotsByTable).sort((a, b) => parseInt(a) - parseInt(b));

  if (!can('kitchen')) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Access denied. Kitchen display is for staff only.</div>;
  }

  return (
    <div className="kitchen-display">
      {/* Top Stats Bar */}
      <div className="top-stats-bar">
        <div className="stat-item">Total Tables: {TOTAL_TABLES}</div>
        <div className="stat-item">Active: {activeTables}</div>
        <div className="stat-item">Empty: {emptyTables}</div>
      </div>
      {/* Page Header */}
      <div className="kitchen-header">
        <div className="kitchen-header-left">
          <ChefHat size={30} style={{ color: 'var(--a)' }} />
          <div>
            <h1 className="kitchen-title">Kitchen Display</h1>
            <p className="kitchen-subtitle">
              Today's KOT History — {kots.length} KOT{kots.length !== 1 ? 's' : ''} printed
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* Refresh button */}
          <button
            onClick={() => { setRefreshing(true); loadKOTs().finally(() => setRefreshing(false)); }}
            className="refresh-button"
            aria-label="Refresh KOTs"
          >
            <RefreshCw size={14} className={refreshing ? 'rotating' : ''} /> Refresh
          </button>

          {/* Sound toggle */}
          {/* <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{ padding: '8px 14px', background: soundEnabled ? 'var(--a)' : 'var(--s2)', color: soundEnabled ? 'var(--s0)' : 'var(--t1)', border: '1px solid var(--b2)', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            Sound {soundEnabled ? 'On' : 'Off'}
          </button> */}
        </div>
      </div>

      {/* Table selection and KOT display */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t2)' }}>Loading KOT history...</div>
      ) : tableNos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t2)' }}>
          <ChefHat size={56} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
          <p style={{ fontSize: 16 }}>No KOTs generated today</p>
        </div>
      ) : selectedTable ? (
        // --- Selected table view ---
        <div className="selected-table-view">
          <button className="back-button" onClick={() => setSelectedTable(null)}>
            ← Back to tables
          </button>
          <h2 className="selected-table-title">TABLE {selectedTable} – {kotsByTable[selectedTable].length} KOT{kotsByTable[selectedTable].length !== 1 ? 's' : ''}</h2>
          <div className="kitchen-kot-list custom-scroll" style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, paddingBottom: 20 }}>
            {kotsByTable[selectedTable]
              .slice()
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
              .map(kot => (
                <KOTCard key={kot._id} kot={kot} onStatusChange={handleStatusChange} />
              ))}
          </div>
        </div>
      ) : (
        // --- Sectioned Table view ---
        <>
          {['topBarLounge', 'lowerBarLounge', 'restaurantArea'].map(sectionKey => (
            <section key={sectionKey} className="tables-section">
              <h2 className="section-title">
                {sectionKey === 'topBarLounge' ? 'Top Bar Lounge' : sectionKey === 'lowerBarLounge' ? 'Lower Bar Lounge' : 'Restaurant Area'}
              </h2>
              <div className="tables-grid">
                {SECTION_MAP[sectionKey].map(tableNo => (
                  <div key={tableNo} className="kitchen-table-card" onClick={() => setSelectedTable(tableNo)}>
                    <div className="kitchen-table-header">
                      <span>TABLE {tableNo}</span>
                      <span className="count-badge">
                        {(kotsByTable[tableNo] || []).length} KOT{((kotsByTable[tableNo] || []).length) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
</div>
  );
}
