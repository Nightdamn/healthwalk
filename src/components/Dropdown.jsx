import React, { useState } from 'react';

// Custom dropdown styled like the role selector in TrainerCabinet:
// rounded button with chevron, popup with overlay close, current item highlighted.
export default function Dropdown({ value, onChange, options, color = '#1a1a2e', disabled = false, fullWidth = false, fontSize = 13 }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value) || options[0];

  return (
    <div style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block' }}
         onClick={e => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: fullWidth ? '100%' : 'auto',
          padding: '8px 32px 8px 12px',
          borderRadius: 12,
          border: '1.5px solid rgba(0,0,0,0.08)',
          background: 'rgba(255,255,255,0.85)',
          color, fontSize, fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
          opacity: disabled ? 0.5 : 1,
          textAlign: 'left',
          position: 'relative',
        }}
      >
        {current?.label || ''}
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          fontSize: 9, color: '#888', transition: 'transform 0.15s',
        }}>▼</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
               style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 19 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: fullWidth ? 0 : 'auto',
            zIndex: 20, marginTop: 4, minWidth: '100%',
            background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            {options.map(opt => {
              const active = opt.value === value;
              const optColor = opt.color || color;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (opt.value !== value) onChange(opt.value);
                  }}
                  style={{
                    width: '100%', padding: '10px 14px', border: 'none',
                    background: active ? `${optColor}10` : '#fff',
                    fontSize, fontWeight: active ? 600 : 400,
                    color: optColor, cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {active && <span style={{ fontSize: 11 }}>✓</span>}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
