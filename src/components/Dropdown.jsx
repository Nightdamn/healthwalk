import React, { useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

// Custom dropdown styled like the role selector in TrainerCabinet:
// rounded button with chevron, popup with overlay close, current item highlighted.
// option.icon (необязательный) — src картинки-аватара слева от подписи,
// и в выбранном значении, и в списке.
//
// Список рендерится порталом в body с position: fixed. Плитки glass
// (backdrop-filter) создают свой слой, и absolute-список внутри них
// проваливался под следующую плитку. Позиция считается от кнопки и
// пересчитывается при прокрутке/ресайзе; не влезает вниз — открывается вверх.
const OptIcon = ({ src }) => src ? (
  <img src={src} alt="" style={{ width: 20, height: 20, borderRadius: 5, objectFit: 'contain', flexShrink: 0, background: '#fafafa' }} />
) : null;

const GAP = 4;
const EDGE = 8; // отступ от края экрана

export default function Dropdown({ value, onChange, options, color = '#1a1a2e', disabled = false, fullWidth = false, fontSize = 13 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find(o => o.value === value) || options[0];
  const hasIcons = options.some(o => o.icon);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const listH = listRef.current?.scrollHeight || 0;
      const below = window.innerHeight - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      const up = listH > below && above > below;
      setPos({
        left: Math.max(EDGE, Math.min(r.left, window.innerWidth - EDGE - r.width)),
        minWidth: r.width,
        width: fullWidth ? r.width : undefined,
        maxHeight: Math.max(120, up ? above : below),
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, fullWidth, options.length]);

  return (
    <div style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block' }}
         onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
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
          ...(hasIcons ? { display: 'flex', alignItems: 'center', gap: 8 } : {}),
        }}
      >
        {hasIcons && <OptIcon src={current?.icon} />}
        {current?.label || ''}
        <span style={{
          position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          fontSize: 9, color: '#888', transition: 'transform 0.15s',
        }}>▼</span>
      </button>

      {open && createPortal(
        <>
          <div onClick={() => setOpen(false)}
               style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }} />
          <div ref={listRef} style={{
            position: 'fixed', zIndex: 10001,
            ...(pos || { top: 0, left: 0 }),
            visibility: pos ? 'visible' : 'hidden',
            overflowY: 'auto',
            background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
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
                  <OptIcon src={opt.icon} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
