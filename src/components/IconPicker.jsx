import React, { useState } from 'react';
import ICON_CATEGORIES, { getIconPath } from '../data/iconCatalog';

const GREEN = '#27ae60';

export default function IconPicker({ value, onChange, onClose }) {
  const [activeCat, setActiveCat] = useState(0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        style={{
          width: '100%', maxWidth: 420, maxHeight: '75vh',
          background: '#fff', borderRadius: '24px 24px 0 0',
          padding: '16px 16px 24px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>Выберите значок</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 22, color: '#999', cursor: 'pointer', padding: 4,
          }}>✕</button>
        </div>

        {/* Category tabs */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8,
          WebkitOverflowScrolling: 'touch', flexShrink: 0,
        }}>
          {ICON_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveCat(i)}
              style={{
                padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                border: activeCat === i ? `2px solid ${GREEN}` : '2px solid rgba(0,0,0,0.08)',
                background: activeCat === i ? 'rgba(39,174,96,0.08)' : 'rgba(0,0,0,0.02)',
                color: activeCat === i ? GREEN : '#666',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Icons grid */}
        <div style={{
          flex: 1, overflowY: 'auto', paddingTop: 8,
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8,
          alignContent: 'start',
        }}>
          {ICON_CATEGORIES[activeCat].icons.map((num) => (
            <button
              key={num}
              onClick={() => { onChange(num); onClose(); }}
              style={{
                width: '100%', aspectRatio: '1', border: value === num ? `3px solid ${GREEN}` : '2px solid rgba(0,0,0,0.06)',
                borderRadius: 14, background: value === num ? 'rgba(39,174,96,0.08)' : '#fafafa',
                cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <img
                src={getIconPath(num)}
                alt={`icon ${num}`}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
