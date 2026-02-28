import React, { useState, useRef } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import { createTracker } from '../lib/db';

const GREEN = '#27ae60';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block' };

function emptyPractice(daysCount) {
  return { title: '', iconNum: 1, firstDay: 1, lastDay: daysCount, durationMin: 10, _key: Date.now() + Math.random() };
}

export default function CreateTrackerPage({ user, onBack, onCreated }) {
  const [title, setTitle] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  const [avatarIcon, setAvatarIcon] = useState(1);
  const [avatarCustom, setAvatarCustom] = useState(null);
  const [practices, setPractices] = useState([emptyPractice(30)]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerTarget, setPickerTarget] = useState(null); // null | 'avatar' | index
  const fileRef = useRef();

  const updatePractice = (idx, field, val) => {
    setPractices((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };

  const removePractice = (idx) => {
    setPractices((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPractice = () => {
    setPractices((prev) => [...prev, emptyPractice(daysCount)]);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg')) {
      setError('Поддерживается только SVG');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAvatarCustom(ev.target.result);
      setAvatarIcon(null);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError('Введите название трекера'); return; }
    const days = parseInt(daysCount) || 30;
    const validPractices = practices.filter((p) => p.title.trim());
    if (validPractices.length === 0) { setError('Добавьте хотя бы одну практику'); return; }

    for (const p of validPractices) {
      const fd = parseInt(p.firstDay) || 1;
      const ld = Math.min(parseInt(p.lastDay) || days, days);
      if (fd < 1 || ld > days || fd > ld) {
        setError(`Практика "${p.title}": проверьте диапазон дней (1–${days})`);
        return;
      }
    }

    setLoading(true); setError('');
    const tracker = await createTracker(user.id, {
      title: title.trim(),
      avatarIcon: avatarCustom ? null : avatarIcon,
      avatarCustom,
      daysCount: days,
      practices: validPractices.map((p) => ({
        title: p.title.trim(),
        iconNum: p.iconNum,
        firstDay: parseInt(p.firstDay) || 1,
        lastDay: Math.min(parseInt(p.lastDay) || days, days),
        durationMin: Math.min(parseInt(p.durationMin) || 10, 1200),
      })),
    });
    setLoading(false);

    if (tracker) {
      onCreated(tracker);
    } else {
      setError('Не удалось создать трекер');
    }
  };

  const avatarSrc = avatarCustom || (avatarIcon ? getIconPath(avatarIcon) : null);

  return (
    <Layout>
      <div style={pageWrapper}>
        {/* Top bar */}
        <div style={topBar}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={topBarTitle}>Создать трекер</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Avatar + Title section */}
        <div style={{ ...glass, borderRadius: 18, padding: '20px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setPickerTarget('avatar')}
                style={{
                  width: 64, height: 64, borderRadius: 16,
                  border: `2px solid ${GREEN}`, background: '#fafafa',
                  cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ fontSize: 28 }}>🎯</span>
                )}
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  position: 'absolute', bottom: -4, right: -4,
                  width: 24, height: 24, borderRadius: 12,
                  background: GREEN, color: '#fff', border: 'none',
                  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >↑</button>
              <input ref={fileRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </div>

            {/* Title */}
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Название</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Мой трекер" style={inputStyle} />
            </div>
          </div>

          {/* Duration */}
          <label style={labelStyle}>Длительность (дней)</label>
          <input
            type="number" value={daysCount} min={1} max={365}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') { setDaysCount(''); return; }
              const n = parseInt(raw);
              if (!isNaN(n) && n >= 0) setDaysCount(n);
            }}
            onBlur={() => {
              const v = parseInt(daysCount);
              setDaysCount(isNaN(v) || v < 1 ? 1 : Math.min(v, 365));
            }}
            style={{ ...inputStyle, width: 100 }}
          />
        </div>

        {/* Practices section */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Практики
        </div>

        {practices.map((p, idx) => (
          <PracticeCard
            key={p._key}
            practice={p}
            index={idx}
            maxDay={daysCount}
            onUpdate={(field, val) => updatePractice(idx, field, val)}
            onRemove={() => removePractice(idx)}
            onPickIcon={() => setPickerTarget(idx)}
          />
        ))}

        {/* Add practice button */}
        <button
          onClick={addPractice}
          style={{
            width: '100%', padding: 14, borderRadius: 14,
            border: '2px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
            color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 20,
          }}
        >
          + Добавить практику
        </button>

        {/* Create button */}
        <button
          onClick={handleCreate} disabled={loading}
          style={{
            width: '100%', padding: 16, background: '#1a1a2e', color: '#fff',
            border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Создание...' : 'Создать трекер'}
        </button>

        {error && (
          <div style={{
            marginTop: 12, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: 14,
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Icon Picker modal */}
      {pickerTarget !== null && (
        <IconPicker
          value={pickerTarget === 'avatar' ? avatarIcon : practices[pickerTarget]?.iconNum}
          onChange={(num) => {
            if (pickerTarget === 'avatar') {
              setAvatarIcon(num);
              setAvatarCustom(null);
            } else {
              updatePractice(pickerTarget, 'iconNum', num);
            }
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </Layout>
  );
}

function PracticeCard({ practice, index, maxDay, onUpdate, onRemove, onPickIcon }) {
  const numChange = (field) => (e) => {
    const raw = e.target.value;
    if (raw === '') { onUpdate(field, ''); return; }
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 0) onUpdate(field, n);
  };

  const clamp = (field, min, max) => () => {
    const v = parseInt(practice[field]);
    onUpdate(field, isNaN(v) || v < min ? min : Math.min(v, max));
  };

  return (
    <div style={{ ...glass, borderRadius: 16, padding: '14px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>Практика {index + 1}</span>
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', fontSize: 18, color: '#ccc', cursor: 'pointer', padding: 2,
        }}>✕</button>
      </div>

      {/* Icon + Title row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <button
          onClick={onPickIcon}
          style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            border: '2px solid rgba(0,0,0,0.08)', background: '#fafafa',
            cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img src={getIconPath(practice.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>
        <input
          value={practice.title}
          onChange={(e) => onUpdate('title', e.target.value)}
          placeholder="Название практики"
          style={{ ...inputStyle, flex: 1 }}
        />
      </div>

      {/* Day range + Duration */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>С дня</label>
          <input type="number" value={practice.firstDay}
            onChange={numChange('firstDay')}
            onBlur={clamp('firstDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>По день</label>
          <input type="number" value={practice.lastDay}
            onChange={numChange('lastDay')}
            onBlur={clamp('lastDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>Минут</label>
          <input type="number" value={practice.durationMin}
            onChange={numChange('durationMin')}
            onBlur={clamp('durationMin', 1, 1200)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
      </div>
    </div>
  );
}
