import React, { useState, useRef } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import { createCourseWithActivities, addVideoLink } from '../lib/db';
import { detectVideoType } from '../components/VideoSection';
import RichTextEditor from '../components/RichTextEditor';

const GREEN = '#27ae60';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block' };

let _actCounter = 0;
function emptyActivity(daysCount) {
  const id = `act_create_${Date.now()}_${_actCounter++}`;
  return { activityId: id, label: '', iconNum: 'health/1', practiceType: 'media', descriptionHtml: '', firstDay: 1, lastDay: daysCount, durationMin: 10, intervalDays: 1, _key: id, pendingLinks: [] };
}

export default function CreateCoursePage({ user, onBack, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  const [avatarIcon, setAvatarIcon] = useState('health/1');
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
        activityId: a.activityId,
        label: a.label.trim(),
        iconNum: a.iconNum,
        practiceType: a.practiceType || 'media',
        descriptionHtml: a.descriptionHtml || null,
        firstDay: parseInt(a.firstDay) || 1,
        lastDay: Math.min(parseInt(a.lastDay) || days, days),
        durationMin: a.practiceType === 'theory' ? 1 : Math.min(parseInt(a.durationMin) || 10, 1200),
        intervalDays: Math.max(parseInt(a.intervalDays) || 1, 1),
      })),
    });

    if (course?.error) { setLoading(false); setError(course.error); return; }
    if (!course?.id) { setLoading(false); setError('Не удалось создать курс'); return; }

    // Add pending video links after course is created
    const allLinks = valid.flatMap(a =>
      (a.pendingLinks || []).map(l => ({ ...l, activityId: a.activityId }))
    );
    for (const link of allLinks) {
      await addVideoLink(course.id, link.activityId, link.url, link.type, link.firstDay, link.lastDay);
    }

    setLoading(false);
    onCreated(course);
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
            onPickIcon={() => setPickerTarget(idx)}
            onAddPendingLink={(link) => {
              setActivities(prev => prev.map((act, i) => i === idx
                ? { ...act, pendingLinks: [...(act.pendingLinks || []), link] }
                : act
              ));
            }}
            onRemovePendingLink={(linkIdx) => {
              setActivities(prev => prev.map((act, i) => i === idx
                ? { ...act, pendingLinks: (act.pendingLinks || []).filter((_, li) => li !== linkIdx) }
                : act
              ));
            }} />
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

function ActivityCard({ activity, index, maxDay, onUpdate, onRemove, onPickIcon, onAddPendingLink, onRemovePendingLink }) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkFirstDay, setLinkFirstDay] = useState(1);
  const [linkLastDay, setLinkLastDay] = useState(1);

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

      {/* Practice type selector */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ ...labelStyle, fontSize: 11 }}>Тип практики</label>
        <select value={activity.practiceType || 'media'} onChange={e => onUpdate('practiceType', e.target.value)}
          style={{
            ...inputStyle, padding: '8px 32px 8px 12px', fontSize: 13,
            background: "rgba(255,255,255,0.85) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' width='12' height='8'><path d='M1 1l5 5 5-5' stroke='%231a1a2e' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\") no-repeat right 12px center",
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            cursor: 'pointer', fontWeight: 500,
          }}>
          <option value="media">Практика с медиа</option>
          <option value="theory">Текстовая теория</option>
          <option value="call">Онлайн с мастером</option>
        </select>
      </div>

      {/* Description / theory text */}
      {(activity.practiceType === 'theory' || activity.practiceType === 'call') && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>{activity.practiceType === 'theory' ? 'Текст теории' : 'Описание'}</label>
          <RichTextEditor
            content={activity.descriptionHtml || ''}
            onChange={val => onUpdate('descriptionHtml', val)}
            placeholder={activity.practiceType === 'theory' ? 'Содержание теоретического материала...' : 'Описание онлайн-практики...'} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
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
          <label style={{ ...labelStyle, fontSize: 11 }}>Интервал</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" value={activity.intervalDays ?? 1}
              onChange={numChange('intervalDays')}
              onBlur={clamp('intervalDays', 1, maxDay)}
              style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
            <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>дней</span>
          </div>
        </div>
      </div>
      {/* Duration (hidden for theory and call) */}
      {activity.practiceType !== 'theory' && activity.practiceType !== 'call' && (
        <div>
          <label style={{ ...labelStyle, fontSize: 11 }}>Длительность</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" value={activity.durationMin}
              onChange={numChange('durationMin')}
              onBlur={clamp('durationMin', 1, 1200)}
              style={{ ...inputStyle, padding: '8px 10px', fontSize: 14, width: 80 }} />
            <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>минут</span>
          </div>
        </div>
      )}

      {/* Video links section (only for media practice) */}
      {activity.practiceType === 'media' && (
      <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
          Видео
        </div>

        {/* Pending links list */}
        {(activity.pendingLinks || []).map((l, li) => (
          <div key={li} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
            marginBottom: 3, borderRadius: 8, background: 'rgba(0,0,0,0.02)', fontSize: 12,
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#555' }}>
              {l.url}
            </span>
            <span style={{ color: '#999', fontSize: 10, flexShrink: 0 }}>День {l.firstDay}–{l.lastDay}</span>
            <button onClick={() => onRemovePendingLink(li)} style={{
              background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 11, padding: '0 4px',
            }}>✕</button>
          </div>
        ))}

        {/* Link input */}
        {showLinkInput ? (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="YouTube, Google Drive или ссылка"
                style={{ ...inputStyle, flex: 1, padding: '6px 10px', fontSize: 12 }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const url = linkUrl.trim();
                    if (!url) return;
                    try { new URL(url); } catch { return; }
                    onAddPendingLink({ url, type: detectVideoType(url), firstDay: linkFirstDay, lastDay: linkLastDay });
                    setLinkUrl(''); setShowLinkInput(false);
                  }
                }} />
              <button onClick={() => {
                const url = linkUrl.trim();
                if (!url) return;
                try { new URL(url); } catch { return; }
                onAddPendingLink({ url, type: detectVideoType(url), firstDay: linkFirstDay, lastDay: linkLastDay });
                setLinkUrl(''); setShowLinkInput(false);
              }} style={{
                padding: '6px 10px', borderRadius: 8, border: 'none',
                background: '#27ae60', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>OK</button>
              <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} style={{
                padding: '6px 8px', borderRadius: 8, border: 'none',
                background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 11, cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#999' }}>С дня:</span>
              <input type="number" value={linkFirstDay} min={1} max={maxDay}
                onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n > 0) setLinkFirstDay(n); }}
                style={{ ...inputStyle, width: 50, padding: '4px 6px', fontSize: 11 }} />
              <span style={{ fontSize: 10, color: '#999' }}>По:</span>
              <input type="number" value={linkLastDay} min={1} max={maxDay}
                onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n > 0) setLinkLastDay(n); }}
                style={{ ...inputStyle, width: 50, padding: '4px 6px', fontSize: 11 }} />
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowLinkInput(true)} style={{
              flex: 1, padding: '7px 10px', borderRadius: 8,
              border: '1px dashed rgba(52,152,219,0.3)', background: 'rgba(52,152,219,0.04)',
              color: '#3498db', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}>+ Ссылка на видео</button>
          </div>
        )}

        <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
          Загрузка файлов доступна после сохранения курса
        </div>
      </div>
      )}
    </div>
  );
}
