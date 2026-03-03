import React, { useState, useRef } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import { createCourseWithActivities } from '../lib/db';

const GREEN = '#27ae60';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block' };

function emptyActivity(daysCount) {
  return { label: '', iconNum: 'body/1', firstDay: 1, lastDay: daysCount, durationMin: 10, _key: Date.now() + Math.random() };
}

export default function CreateCoursePage({ user, onBack, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  const [avatarIcon, setAvatarIcon] = useState('body/1');
  const [avatarCustom, setAvatarCustom] = useState(null);
  const [activities, setActivities] = useState([emptyActivity(30)]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pickerTarget, setPickerTarget] = useState(null);
  const fileRef = useRef();

  const updateActivity = (idx, field, val) => {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));
  };
  const removeActivity = (idx) => setActivities(prev => prev.filter((_, i) => i !== idx));
  const addActivity = () => setActivities(prev => [...prev, emptyActivity(daysCount)]);

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg')) { setError('Поддерживается только SVG'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setAvatarCustom(ev.target.result); setAvatarIcon(null); };
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!title.trim()) { setError('Введите название курса'); return; }
    const days = parseInt(daysCount) || 30;
    const valid = activities.filter(a => a.label.trim());
    if (valid.length === 0) { setError('Добавьте хотя бы одну активность'); return; }

    for (const a of valid) {
      const fd = parseInt(a.firstDay) || 1;
      const ld = Math.min(parseInt(a.lastDay) || days, days);
      if (fd < 1 || ld > days || fd > ld) {
        setError(`Активность "${a.label}": проверьте диапазон дней (1–${days})`);
        return;
      }
    }

    setLoading(true); setError('');
    const course = await createCourseWithActivities(user.id, {
      title: title.trim(),
      description: description.trim(),
      avatarIcon: avatarCustom ? null : avatarIcon,
      avatarCustom,
      daysCount: days,
      activities: valid.map(a => ({
        label: a.label.trim(),
        iconNum: a.iconNum,
        firstDay: parseInt(a.firstDay) || 1,
        lastDay: Math.min(parseInt(a.lastDay) || days, days),
        durationMin: Math.min(parseInt(a.durationMin) || 10, 1200),
      })),
    });
    setLoading(false);

    if (course?.error) setError(course.error);
    else if (course?.id) onCreated(course);
    else setError('Не удалось создать курс');
  };

  const avatarSrc = avatarCustom || (avatarIcon ? getIconPath(avatarIcon) : null);

  return (
    <Layout>
      <div style={pageWrapper}>
        <div style={topBar}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={topBarTitle}>Создать курс</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Avatar + Title + Description */}
        <div style={{ ...glass, borderRadius: 18, padding: '20px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setPickerTarget('avatar')} style={{
                width: 64, height: 64, borderRadius: 16, border: `2px solid ${GREEN}`,
                background: '#fafafa', cursor: 'pointer', padding: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: 28 }}>📚</span>}
              </button>
              <button onClick={() => fileRef.current?.click()} style={{
                position: 'absolute', bottom: -4, right: -4, width: 24, height: 24,
                borderRadius: 12, background: GREEN, color: '#fff', border: 'none',
                fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>↑</button>
              <input ref={fileRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Название курса</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Мой курс" style={inputStyle} />
            </div>
          </div>

          <label style={labelStyle}>Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание курса..." rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />

          <label style={labelStyle}>Длительность (дней)</label>
          <input type="number" value={daysCount} min={1} max={365}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') { setDaysCount(''); return; }
              const n = parseInt(raw);
              if (!isNaN(n) && n >= 0) setDaysCount(n);
            }}
            onBlur={() => {
              const v = parseInt(daysCount);
              setDaysCount(isNaN(v) || v < 1 ? 1 : Math.min(v, 365));
            }}
            style={{ ...inputStyle, width: 100 }} />
        </div>

        {/* Activities */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Активности
        </div>

        {activities.map((a, idx) => (
          <ActivityCard key={a._key} activity={a} index={idx} maxDay={daysCount}
            onUpdate={(f, v) => updateActivity(idx, f, v)}
            onRemove={() => removeActivity(idx)}
            onPickIcon={() => setPickerTarget(idx)} />
        ))}

        <button onClick={addActivity} style={{
          width: '100%', padding: 14, borderRadius: 14,
          border: '2px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
          color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 20,
        }}>+ Добавить активность</button>

        <button onClick={handleCreate} disabled={loading} style={{
          width: '100%', padding: 16, background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
        }}>{loading ? 'Создание...' : 'Создать курс'}</button>

        {error && (
          <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>

      {pickerTarget !== null && (
        <IconPicker
          value={pickerTarget === 'avatar' ? avatarIcon : activities[pickerTarget]?.iconNum}
          onChange={num => {
            if (pickerTarget === 'avatar') { setAvatarIcon(num); setAvatarCustom(null); }
            else updateActivity(pickerTarget, 'iconNum', num);
          }}
          onClose={() => setPickerTarget(null)} />
      )}
    </Layout>
  );
}

function ActivityCard({ activity, index, maxDay, onUpdate, onRemove, onPickIcon }) {
  const numChange = (field) => (e) => {
    const raw = e.target.value;
    if (raw === '') { onUpdate(field, ''); return; }
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 0) onUpdate(field, n);
  };

  const clamp = (field, min, max) => () => {
    const v = parseInt(activity[field]);
    onUpdate(field, isNaN(v) || v < min ? min : Math.min(v, max));
  };

  return (
    <div style={{ ...glass, borderRadius: 16, padding: '14px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>Активность {index + 1}</span>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', fontSize: 18, color: '#ccc', cursor: 'pointer', padding: 2 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <button onClick={onPickIcon} style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          border: '2px solid rgba(0,0,0,0.08)', background: '#fafafa',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={getIconPath(activity.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>
        <input value={activity.label} onChange={e => onUpdate('label', e.target.value)}
          placeholder="Название активности" style={{ ...inputStyle, flex: 1 }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>С дня</label>
          <input type="number" value={activity.firstDay}
            onChange={numChange('firstDay')}
            onBlur={clamp('firstDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>По день</label>
          <input type="number" value={activity.lastDay}
            onChange={numChange('lastDay')}
            onBlur={clamp('lastDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>Минут</label>
          <input type="number" value={activity.durationMin}
            onChange={numChange('durationMin')}
            onBlur={clamp('durationMin', 1, 1200)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
      </div>
    </div>
  );
}
