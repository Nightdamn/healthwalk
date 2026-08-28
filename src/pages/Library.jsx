import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import TopBar from '../components/TopBar';
import { glass } from '../styles/shared';
import { getIconPath } from '../data/iconCatalog';
import { getLibrary, deleteLibraryEntry, copyLibraryToCourse } from '../lib/api';

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

// Иконки медиа-типов — inline SVG, без внешних зависимостей.
function MediaTypeIcon({ type, size = 16 }) {
  const stroke = '#666';
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none' };
  if (type === 'video') return (
    <svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" stroke={stroke} strokeWidth="1.8"/><path d="M10 9L15 12L10 15V9Z" fill={stroke}/></svg>
  );
  if (type === 'audio') return (
    <svg {...common}><path d="M8 18V6L18 4V16" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round"/><circle cx="6" cy="18" r="2" stroke={stroke} strokeWidth="1.8"/><circle cx="16" cy="16" r="2" stroke={stroke} strokeWidth="1.8"/></svg>
  );
  if (type === 'image') return (
    <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" stroke={stroke} strokeWidth="1.8"/><circle cx="9" cy="10" r="1.6" fill={stroke}/><path d="M3 17L9 12L21 20" stroke={stroke} strokeWidth="1.8" strokeLinejoin="round" fill="none"/></svg>
  );
  if (type === 'text') return (
    <svg {...common}><path d="M5 5H19M5 10H19M5 15H14M5 20H10" stroke={stroke} strokeWidth="1.8" strokeLinecap="round"/></svg>
  );
  // none / unknown — точка
  return (
    <svg {...common}><circle cx="12" cy="12" r="3" fill={stroke}/></svg>
  );
}

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

// Chevron ↓/↑ для раскрывалки. Поворот по transform, чтобы плавно анимировать.
function Chevron({ open, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
      <path d="M6 9L12 15L18 9" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Форматирует расписание для одной строки: «С дня N по день M · каждый K-й день».
function formatSchedule(first, last, interval) {
  const fd = first || 1;
  const ld = last || fd;
  if (fd === ld) return `День ${fd}`;
  const iv = interval || 1;
  const base = `С дня ${fd} по день ${ld}`;
  return iv > 1 ? `${base} · каждый ${iv}-й день` : base;
}

// Короткое имя источника для отображения (без длинных URL).
function mediaSummary(m) {
  const src = m.source_type;
  if (src === 'youtube') return 'YouTube';
  if (src === 'drive') return 'Google Drive';
  if (src === 'link' || src === 'audio_link' || src === 'image_link') {
    try {
      const u = new URL(m.media_url);
      return u.hostname.replace(/^www\./, '');
    } catch { return 'Ссылка'; }
  }
  if (src === 'file' || src === 'audio_file' || src === 'image_file') {
    const name = (m.media_url || '').split('/').pop();
    return name || 'Файл';
  }
  if (src === 'text') return 'Текстовый блок';
  if (src === 'none') return 'Заглушка (без источника)';
  return src;
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m} мин`;
}

// Строка одного медиа внутри раскрытой практики.
function MediaRow({ m, idx }) {
  const dur = fmtDuration(m.duration_sec);
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '10px 0',
      borderTop: idx === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)',
    }}>
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <MediaTypeIcon type={m.media_type} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{MEDIA_TYPE_LABEL[m.media_type] || m.media_type}</span>
          <span style={{ color: '#bbb', fontWeight: 400 }}>·</span>
          <span style={{ color: '#666', fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
            {mediaSummary(m)}
          </span>
          {dur && <>
            <span style={{ color: '#bbb', fontWeight: 400 }}>·</span>
            <span style={{ color: '#666', fontWeight: 400 }}>{dur}</span>
          </>}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 3 }}>
          {formatSchedule(m.first_day, m.last_day, m.interval_days)}
        </div>
        {(m.excluded_days?.length || m.extra_days?.length) ? (
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
            {m.excluded_days?.length ? `Исключены: ${m.excluded_days.join(', ')}` : ''}
            {m.excluded_days?.length && m.extra_days?.length ? ' · ' : ''}
            {m.extra_days?.length ? `Добавлены: ${m.extra_days.join(', ')}` : ''}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function LibraryPage({ onBack, pickerCourseId, onPickerDone }) {
  const pickerMode = !!pickerCourseId;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [expanded, setExpanded] = useState(new Set());
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

  const toggleExpand = (id) => {
    setExpanded(prev => {
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
            Выберите одну или несколько практик, затем нажмите «Добавить в курс». Нажмите стрелку, чтобы посмотреть состав практики.
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
              const isOpen = expanded.has(p.id);
              const media = Array.isArray(p.media) ? p.media : [];
              const mediaByType = {};
              for (const m of media) {
                mediaByType[m.media_type] = (mediaByType[m.media_type] || 0) + 1;
              }
              const hasDescription = !!(p.description_html && p.description_html.trim());
              // Клик по карточке в picker mode = переключить выбор. Клик по
              // области раскрывалки — отдельный жест, stopPropagation.
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
                        {media.length > 0 && <span style={{ color: '#bbb' }}>·</span>}
                        {media.length > 0 && <span>{media.length} медиа</span>}
                        {Object.entries(mediaByType).map(([t, c]) => <MediaTypeChip key={t} type={t} count={c} />)}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); toggleExpand(p.id); }}
                      aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
                      style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: 'rgba(255,255,255,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: 0,
                      }}>
                      <Chevron open={isOpen} />
                    </button>
                    {!pickerMode && confirmDeleteId !== p.id && (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }} disabled={busy}
                        title="Удалить из листа"
                        style={{
                          padding: '8px 10px', borderRadius: 10,
                          border: '1px solid rgba(231,76,60,0.2)',
                          background: 'rgba(231,76,60,0.06)', color: '#e74c3c',
                          fontSize: 13, fontWeight: 600, cursor: busy ? 'wait' : 'pointer',
                        }}>Удалить</button>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}
                      onClick={(e) => e.stopPropagation()}>
                      {/* Расписание самой практики */}
                      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 6 }}>
                        Расписание практики
                      </div>
                      <div style={{ fontSize: 13, color: '#1a1a2e', marginBottom: 12 }}>
                        {formatSchedule(p.first_day, p.last_day, p.interval_days)}
                        {(p.excluded_days?.length || p.extra_days?.length) ? (
                          <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                            {p.excluded_days?.length ? `Исключены: ${p.excluded_days.join(', ')}` : ''}
                            {p.excluded_days?.length && p.extra_days?.length ? ' · ' : ''}
                            {p.extra_days?.length ? `Добавлены: ${p.extra_days.join(', ')}` : ''}
                          </div>
                        ) : null}
                      </div>

                      {hasDescription && (
                        <>
                          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 6 }}>
                            {p.practice_type === 'theory' ? 'Текст теории' : 'Описание'}
                          </div>
                          <div className="theory-content"
                            style={{ fontSize: 13, color: '#333', marginBottom: 12, lineHeight: 1.5 }}
                            dangerouslySetInnerHTML={{ __html: p.description_html }} />
                        </>
                      )}

                      {media.length > 0 && (
                        <>
                          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 2 }}>
                            Медиа ({media.length})
                          </div>
                          <div>
                            {media.map((m, i) => <MediaRow key={m.id} m={m} idx={i} />)}
                          </div>
                        </>
                      )}

                      {!hasDescription && media.length === 0 && (
                        <div style={{ fontSize: 13, color: '#aaa', fontStyle: 'italic' }}>
                          Ни описания, ни медиа. Практика — просто заголовок с расписанием.
                        </div>
                      )}
                    </div>
                  )}

                  {!pickerMode && confirmDeleteId === p.id && (
                    <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(231,76,60,0.06)', border: '1px solid rgba(231,76,60,0.15)' }}
                      onClick={(e) => e.stopPropagation()}>
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
