import React from 'react';
import { Menu, ArrowLeft } from 'lucide-react';

/**
 * Reusable top navigation bar.
 * Props:
 * - title: string – page title
 * - onMenuClick: () => void – toggles side menu (optional)
 * - onBack: () => void – navigate back (optional)
 * - tableStats: { active?: number, complete?: number } – stats to display in pills
 * - hint: string – shortcut hint text (optional)
 */
export default function TopNavBar({ title, onMenuClick, onBack, tableStats = {}, hint = '' }) {
  return (
    <header className="humtum-bar">
      <div className="humtum-left">
        {onBack && (
          <button className="humtum-back" onClick={onBack} aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
        )}
        {onMenuClick && (
          <button className="humtum-menu" onClick={onMenuClick} aria-label="Open menu">
            <Menu size={18} />
          </button>
        )}
        {title && <div className="humtum-title"><h1>{title}</h1></div>}
      </div>
      <div className="humtum-meta">
        <div className="humtum-info-row">
          {hint && <div className="humtum-shortcut-pill">{hint}</div>}
          {('active' in tableStats) && <span className="stat-pill active-pill">Active {tableStats.active ?? 0}</span>}
          {('complete' in tableStats) && <span className="stat-pill complete-pill">Complete {tableStats.complete ?? 0}</span>}
        </div>
      </div>
    </header>
  );
}
