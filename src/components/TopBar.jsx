import React from 'react';
import { btnBack } from '../styles/shared';
import { useMenu } from './MenuContext';

// Универсальная шапка: position:fixed к 430-фрейму Layout'а, top реактивно
// подстраивается через --vv-top (visualViewport — iOS keyboard fix в Layout).
// Слева — кнопка «назад» если onBack задан, иначе spacer 42x42 (чтобы
// заголовок оставался центрирован). Справа — `right` ReactNode (по
// умолчанию <MenuButton/>; в редакторах передают <SaveStatusBadge/>).
export default function TopBar({ onBack, title, right }) {
  const { openMenu } = useMenu();
  const rightNode = right !== undefined ? right : <MenuButton onClick={openMenu} />;

  return (
    <div style={{
      position: 'fixed',
      top: 'var(--vv-top, 0px)',
      left: '50%',
      // translateZ(0) выкидывает шапку в отдельный GPU-слой — без него
      // mobile-браузеры пересчитывают layout при каждом scroll/таче
      // (особенно с backdrop-filter), и шапка визуально «дрожит».
      // willChange закрепляет слой даже когда transform статичен.
      transform: 'translate3d(-50%, 0, 0)',
      willChange: 'transform',
      width: '100%',
      maxWidth: 430,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      paddingBottom: 12,
      paddingLeft: 20,
      paddingRight: 20,
      background: 'rgba(255,255,255,0.78)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(0,0,0,0.04)',
    }}>
      {onBack ? (
        <button onClick={onBack} style={btnBack} aria-label="Назад">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <div style={{ width: 42, height: 42, flexShrink: 0 }} />
      )}
      <h2 style={{
        flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700,
        color: '#1a1a2e', margin: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{title}</h2>
      <div style={{ minWidth: 42, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
        {rightNode}
      </div>
    </div>
  );
}

export function MenuButton({ onClick, unreadCount = 0 }) {
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={onClick}
        aria-label="Меню"
        style={{
          width: 42, height: 42, borderRadius: 14,
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(0,0,0,0.06)',
          cursor: 'pointer',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
        <div style={{ width: 18, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
        <div style={{ width: 14, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
        <div style={{ width: 18, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
      </button>
      {unreadCount > 0 && (
        <div style={{
          position: 'absolute', top: -2, right: -2, width: 10, height: 10,
          borderRadius: '50%', background: '#e67e22', border: '2px solid #fff',
        }} />
      )}
    </div>
  );
}
