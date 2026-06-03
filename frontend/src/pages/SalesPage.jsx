import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { apiUrl, authFetch } from '../lib/api';
import { TrendingUp, Zap, ArrowRight, CalendarDays } from 'lucide-react';

const WrappedTick = ({ x, y, payload }) => {
  const words = payload.value.split(' ');
  const lineHeight = 12;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill="var(--t1)" fontSize={10}>
        {words.map((word, index) => (
          <tspan key={index} x={0} dy={index === 0 ? 0 : lineHeight}>
            {word}
          </tspan>
        ))}
      </text>
    </g>
  );
};


const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tip-head">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tip-row">
          <span className="tip-dot" style={{ background: p.color || 'var(--blue)' }}></span>
          <span className="tip-label" style={{ color: 'var(--t1)' }}>{p.name}:</span>
          <span className="tip-val mono" style={{ color: 'var(--t0)' }}>
            {p.name === 'Qty' ? p.value : `₹${p.value?.toLocaleString('en-IN')}`}
          </span>
        </div>
      ))}
    </div>
  );
};

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
    <div className="sales-date-field">
      <span className="sales-date-label">{label}</span>
      <div className="sales-date-input-wrapper">
        <input
          type="date"
          value={value}
          onChange={onChange}
          className="d-input unified-date-input"
          ref={inputRef}
        />
        <CalendarDays size={13} className="sales-calendar-icon" onClick={triggerPicker} />
      </div>
    </div>
  );
}

export default function SalesPage() {
  const { settings } = useApp();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [range, setRange] = useState('month');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);

  const [analytics, setAnalytics] = useState({ revenue: 0, count: 0, dailyData: [], topItems: [] });
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let start = startDate;
    let end = endDate;
    const now = new Date();

    if (range === 'today') {
      start = end = todayStr;
    } else if (range === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      start = weekAgo.toISOString().slice(0, 10);
      end = todayStr;
    } else if (range === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = firstDay.toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end = lastDay.toISOString().slice(0, 10);
    } else if (range === 'all') {
      start = '2020-01-01';
      end = '2099-12-31';
    }

    setLoading(true);
    authFetch(apiUrl(`/api/reports/analytics?startDate=${start}&endDate=${end}`))
      .then(res => res.json())
      .then(data => {
        if (data.revenue !== undefined) {
          setAnalytics(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch analytics:', err);
        setLoading(false);
      });
  }, [range, startDate, endDate, todayStr]);

  const handleDateChange = (type, val) => {
    setRange('custom');
    if (type === 'start') setStartDate(val);
    else setEndDate(val);
  };

  return (
    <div className="fi sales-page">
      <div className="sales-header-res">
        <div className="unified-pill-box filter-pills">
          {['today', 'week', 'month', 'all'].map(f => (
            <button key={f} className={`f-pill ${range === f ? 'active' : ''}`} onClick={() => setRange(f)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <div className={`unified-pill-box date-box-res ${range === 'custom' ? 'active-border' : ''}`} style={{ gap: 12, paddingLeft: 12, paddingRight: 12 }}>
          <DateField label="From" value={startDate} onChange={e => handleDateChange('start', e.target.value)} inputRef={startInputRef} />
          <ArrowRight size={14} style={{ color: 'var(--t2)', flexShrink: 0 }} />
          <DateField label="To" value={endDate} onChange={e => handleDateChange('end', e.target.value)} inputRef={endInputRef} />
        </div>
      </div>

      <div className="kpi-row-2">
        <div className="kpi" style={{ 'color': 'var(--t0)' }}>
          <div className="kpi-label">Revenue</div>
          <div className="kpi-value mono">{loading ? '...' : `₹${(analytics?.revenue || 0).toLocaleString('en-IN')}`}</div>
        </div>
        <div className="kpi" style={{ 'color': 'var(--t0)' }}>
          <div className="kpi-label">Orders</div>
          <div className="kpi-value mono">{loading ? '...' : (analytics?.count || 0)}</div>
        </div>
      </div>

      <div className="charts-equal-row">
        <div className="card chart-box">
          <div className="chart-info"><Zap size={16} style={{ color: 'var(--a)' }} /><span>Revenue Growth</span></div>
          <ResponsiveContainer width="100%" height={280}>
            {loading ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>Loading...</div> : (
              <AreaChart data={analytics.dailyData} margin={{ left: -25, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--a)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--a)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--b1)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--t1)', fontSize: 10 }} axisLine={{ stroke: 'var(--b2)' }} />
                <YAxis tick={{ fill: 'var(--t1)', fontSize: 10 }} axisLine={{ stroke: 'var(--b2)' }} />
                <Tooltip content={<Tip />} cursor={{ stroke: 'var(--a)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="var(--a)" strokeWidth={2.5} fill="url(#areaGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="card chart-box">
          <div className="chart-info"><TrendingUp size={16} style={{ color: 'var(--blue)' }} /><span>Top Items Sold</span></div>
          <ResponsiveContainer width="100%" height={280}>
            {loading ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>Loading...</div> : (
              <BarChart data={analytics.topItems} layout="vertical" margin={{ left: -35, right: 10, top: 10, bottom: 0 }}>
                <XAxis type="number" axisLine={{ stroke: 'var(--b2)' }} tick={{ fill: 'var(--t1)', fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={95} tick={<WrappedTick />} axisLine={{ stroke: 'var(--b2)' }} />
                <Tooltip content={<Tip />} cursor={{ fill: 'var(--s2)', opacity: 0.4 }} />
                {/* Changed color to var(--blue) */}
                <Bar dataKey="qty" name="Qty" radius={[0, 4, 4, 0]} barSize={18} fill="var(--blue)" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      <style>{`
        .sales-page { display: flex; flex-direction: column; gap: 20px; }
        .sales-header-res { 
          display: flex; 
          align-items: center; 
          flex-wrap: wrap; 
          gap: 12px; 
          width: 100%;
          justify-content: flex-end; /* Aligns items to right on desktop */
        }

        .ph-left { text-align: left; }
        .unified-pill-box { 
          display: flex; 
          align-items: center; 
          background: var(--s2); 
          padding: 4px 8px; 
          border-radius: 14px; 
          border: 1px solid var(--b1); 
          height: 48px; 
        }
        
        .active-border { border-color: var(--a) !important; box-shadow: 0 0 0 1px var(--a); }

        .f-pill { border: none; background: none; color: var(--t2); padding: 8px 16px; border-radius: 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .f-pill.active { background: var(--a); color: #000; }

        .d-input {
          background: none;
          border: none;
          color: var(--t0);
          font-size: 12px;
          outline: none;
          min-width: 0;
          width: 100%;
          padding: 0;
          box-shadow: none;
        }
        .unified-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
          position: absolute;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
        .unified-date-input {
          flex: 1;
          color-scheme: dark;
          font-family: inherit;
          cursor: pointer;
        }
        .lm .unified-date-input {
          color-scheme: light;
        }
        .sales-date-field {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .sales-date-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--t2);
          white-space: nowrap;
        }
        .sales-date-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 8px;
          padding: 0 10px;
          height: 34px;
          min-width: 120px;
        }
        .sales-calendar-icon {
          color: var(--t2);
          cursor: pointer;
        }
        .sales-calendar-icon:hover { color: var(--a); }

        .kpi-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .charts-equal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .chart-box { padding: 24px; background: var(--s1); border: 1px solid var(--b1); border-radius: var(--rl); min-width: 0; overflow: hidden; }
        .chart-info { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--t0); margin-bottom: 20px; }

        .chart-tip { background: var(--s2); border: 1px solid var(--b2); padding: 12px; border-radius: 10px; }

        @media (max-width: 750px) { 
          .sales-header-res {
            flex-direction: column;
            align-items: stretch;
            justify-content: center;
            gap: 16px;
          }
          .filter-pills {
            width: 100%; 
            justify-content: space-between; 
            flex-wrap: wrap;
            gap: 8px;
            height: auto;
            padding: 8px;
          }
          .f-pill {
            flex: 1;
            text-align: center;
          }
          .date-box-res { 
            flex-direction: row;
            align-items: center;
            gap: 8px; 
            height: auto; 
            padding: 8px; 
            width: 100%;
          }
          .sales-date-field {
            flex: 1;
            justify-content: center;
          }
          .sales-date-input-wrapper {
            flex: 1;
            max-width: none;
            min-width: 0;
            padding: 0 4px;
          }
          .sales-date-label { display: none; }
          .chart-box {
            padding: 16px;
          }
        }

        @media (max-width: 1024px) { 
          .charts-equal-row { grid-template-columns: 1fr; } 
        }
        
        @media (max-width: 480px) {
          .kpi-row-2 { grid-template-columns: 1fr 1fr; gap: 8px; }
          .kpi-row-2 .kpi-label { font-size: 10px; }
          .kpi-row-2 .kpi-value { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
