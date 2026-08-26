import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import TopBar from '../components/TopBar';
import { glass } from '../styles/shared';
import { getIconPath } from '../data/iconCatalog';
import { getLibrary, deleteLibraryEntry, copyLibraryToCourse } from '../lib/supabase';

const GREEN = '#27ae60';

const TYPE_LABEL = {
  media: 'Медиа',
  theory: 'Теория',
  call: 'Звонок',
};

const MEDIA_TYPE_LABEL = {
  video: 'Видео',
  audio: 'Аудио',
  image: 'Изображение',
  text: 'Текст',
  none: '—',
};

function MediaTypeChip({ type, count }) {
  const label = MEDIA_TYPE_LABEL[type] || type;
  return (
    <span style={{
      fontSize: 11, color: '#666', fontWeight: 500,
      padding: '2px 8px', borderRadius: 8,
      background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.05)',
    }}>{label}{count > 1 ? ` ×${count}` : ''}</span>
  );
}

export default function LibraryPage({ onBack, pickerCourseId, onPickerDone }) {
  const pickerMode = !!pickerCourseId;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getLibrary();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id) => {
    setBusy(true);
    try {
      await deleteLibraryEntry(id);
      setItems(prev => prev.filter(p => p.id !== id));
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      setConfirmDeleteId(null);
    } catch (e) {
      setError(e.message || 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  const handleAddToCourse = async () => {
    if (!pickerCourseId || selected.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selected);
      const res = await copyLibraryToCourse(pickerCourseId, ids);
      if (res?.error) throw new Error(res.error);
      onPickerDone?.(res?.data || []);
    } catch (e) {
      setError(e.message || 'Ошибка добавления');
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 120px', position: 'relative', zIndex: 1 }}>
        <TopBar onBack={onBack} title={pickerMode ? 'Добавить из листа' : 'Лист практик'} />

        {pickerMode && (
          <div style={{
            ...glass, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
            fontSize: 13, color: '#666',
          }}>
            Выберите одну или несколько практик, затем нажмите «Добавить в курс».
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка...</div>
        ) : items.length === 0 ? (
          <div style={{ ...glass, borderRadius: 16, padding: '24px 20px', textAlign: 'center', color: '#888', fontSize: 14 }}>
            Лист пуст. Отметьте галочку «Сохранить в лист практик» при создании активности в курсе.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(p => {
              const iconSrc = p.icon_num ? getIconPath(p.icon_num) : null;
              const isSel = selected.has(p.id);
              // Сгруппируем медиа по типу для наглядности.
              const mediaByType = {};
              for (const m of (p.media || [])) {
                mediaByType[m.media_type] = (mediaByType[m.media_type] || 0) + 1;
              }
              return (
                <div key={p.id} style={{
                  ...glass, borderRadius: 16, padding: '14px 14px',
                  border: isSel ? `2px solid ${GREEN}` : glass.border,
                  cursor: pickerMode ? 'pointer' : 'default',
                }}
                onClick={pickerMode ? () => toggle(p.id) : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {pickerMode && (
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${isSel ? GREEN : 'rgba(0,0,0,0.15)'}`,
                        background: isSel ? GREEN : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSel && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    <div style={{
                      width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                      background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
                    }}>
                      {iconSrc && <img src={iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.label || '(без названия)'}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span>{TYPE_LABEL[p.practice_type] || p.practice_type}</span>
                        <span>·</span>
                        <span>{p.duration_min} мин</span>
                        {Object.entries(mediaByType).map(([t, c]) => <MediaTypeChip key={t} type={t} count={c} />)}
                      </div>
                    </div>
                    {!pickerMode && confirmDeleteId !== p.id && (
                      <button onClick={() => setConfirmDeleteId(p.id)} disabled={busy}
                        title="Удалить из листа"
                        style={{
                          padding: '8px 10px', borderRadius: 10,
                          border: '1px solid rgba(231,76,60,0.2)',
                          background: 'rgba(231,76,60,0.06)', color: '#e74c3c',
                          fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                        }}>Удалить</button>
                    )}
                  </div>
                  {!pickerMode && confirmDeleteId === p.id && (
                    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.15)' }}>
                      <div style={{ fontSize: 13, color: '#1a1a2e', marginBottom: 10 }}>
                        Удалить практику из листа? Уже добавленные в курсы копии не пострадают.
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleDelete(p.id)} disabled={busy}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
                            background: '#e74c3c', color: '#fff', fontSize: 14, fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                          }}>Удалить</button>
                        <button onClick={() => setConfirmDeleteId(null)} disabled={busy}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10,
                            border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
                            color: '#666', fontSize: 14, fontWeight: 600,
                            cursor: busy ? 'wait' : 'pointer',
                          }}>Отмена</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div style={{ marginTop: 14, padding: '12px 16px', borderRadius: 12, background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>

      {pickerMode && (
        <div style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10,
          padding: '12px 20px calc(env(safe-area-inset-bottom, 0px) + 12px)',
          background: 'rgba(255,255,255,0.92)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        }}>
          <button onClick={handleAddToCourse} disabled={busy || selected.size === 0}
            style={{
              width: '100%', padding: 14, borderRadius: 14,
              border: 'none', background: selected.size ? GREEN : 'rgba(0,0,0,0.08)',
              color: selected.size ? '#fff' : '#999',
              fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : (selected.size ? 'pointer' : 'not-allowed'),
              opacity: busy ? 0.6 : 1,
            }}>
            {busy ? 'Добавляем...' : `Добавить в курс${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      )}
    </Layout>
  );
}
