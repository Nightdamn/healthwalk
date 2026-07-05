import React, { useState, useRef, useEffect } from 'react';
import ScheduleCalendar, { toggleDayInVideo } from './ScheduleCalendar';
import RichTextEditor from './RichTextEditor';

const numInput = {
  padding: '8px 10px', borderRadius: 8,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 14, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
  width: '100%',
};
const inlineLabel = {
  display: 'block', fontSize: 11, color: '#888', marginBottom: 3, fontWeight: 500,
};
const nativeSelect = {
  padding: '8px 34px 8px 12px', borderRadius: 8,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 13, color: '#1a1a2e', outline: 'none',
  width: '100%', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22><path d=%22M6 9L12 15L18 9%22 stroke=%22%23888%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/></svg>")',
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
};

const GREEN = '#27ae60';

const smallInput = {
  padding: '6px 10px', borderRadius: 8,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 13, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
  width: 60,
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMMSS(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function parseMMSS(str) {
  const m = String(str || '').trim().match(/^(\d+)(?::(\d{1,2}))?$/);
  if (!m) return 0;
  const mins = parseInt(m[1] || '0', 10);
  const secs = Math.min(59, parseInt(m[2] || '0', 10));
  return Math.max(0, mins * 60 + secs);
}

export function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return m ? m[1] : null;
}
export function extractDriveId(url) {
  if (!url) return null;
  let m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/docs\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/drive\.usercontent\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/google\.com\/.*\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return null;
}
export function detectSourceType(url) {
  if (extractYoutubeId(url)) return 'youtube';
  if (extractDriveId(url)) return 'drive';
  if (/google\.com|googleapis\.com/.test(url)) return 'drive';
  return 'link';
}
function sourceLabel(m) {
  if (m.source_type === 'youtube') return `YouTube: ${extractYoutubeId(m.media_url) || m.media_url}`;
  if (m.source_type === 'drive') return `Drive: ${extractDriveId(m.media_url) || m.media_url}`;
  if (m.source_type === 'link') { try { return new URL(m.media_url).hostname + '/...'; } catch { return m.media_url; } }
  if (m.source_type === 'text') return '';
  if (m.source_type === 'none') return '';
  return (m.media_url || '').split('/').pop();
}
function typeIcon(m) {
  if (m.media_type === 'audio') return '♪';
  if (m.media_type === 'image') return '🖼';
  if (m.media_type === 'text') return 'T';
  if (m.media_type === 'none') return '·';
  if (m.source_type === 'youtube') return '▶';
  if (m.source_type === 'drive') return '☁';
  if (m.source_type === 'link') return '🔗';
  return '📹';
}

// Валидные MIME для upload по типу медиа.
const ACCEPT_BY_TYPE = {
  video: 'video/mp4,video/webm,video/quicktime',
  audio: 'audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a',
  image: 'image/jpeg,image/png,image/webp,image/gif',
};

const MEDIA_TYPE_LABEL = {
  video: 'Видео', audio: 'Аудио', image: 'Изображение', text: 'Текст', none: 'Без медиа',
};

// Days covered by a list of media. Takes interval + per-media extra/excluded overrides.
function buildCoverage(list) {
  const days = new Set();
  for (const m of list) {
    const iv = Math.max(1, m.interval_days || 1);
    const excluded = new Set(m.excluded_days || []);
    const extra = m.extra_days || [];
    for (let d = m.first_day; d <= m.last_day; d += iv) {
      if (!excluded.has(d)) days.add(d);
    }
    for (const d of extra) if (!excluded.has(d)) days.add(d);
  }
  return days;
}
function findFreeRange(coverage, from, to) {
  let start = null;
  for (let d = from; d <= to; d++) {
    if (!coverage.has(d)) { start = d; break; }
  }
  if (start === null) return null;
  let end = start;
  for (let d = start; d <= to; d++) {
    if (coverage.has(d)) break;
    end = d;
  }
  return { start, end };
}

export default function MediaSection({
  media, courseId, activityId, maxDay,
  defaultFirstDay = 1, defaultLastDay = null, defaultIntervalDays = 1,
  activityScheduledDays,
  onUpload, onAddLink, onAddEmpty, onDelete, onPatchMedia,
  uploading, uploadProgress, uploadPhase, globalUploading,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [formMediaType, setFormMediaType] = useState('video');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [firstDay, setFirstDay] = useState(defaultFirstDay || 1);
  const [lastDay, setLastDay] = useState(defaultLastDay || maxDay || 1);
  const [intervalDays, setIntervalDays] = useState(defaultIntervalDays || 1);
  const [deletingId, setDeletingId] = useState(null);
  const [openDescId, setOpenDescId] = useState(null);
  const fileRef = useRef();

  const actMedia = (media || [])
    .filter(m => m.activity_id === activityId)
    .sort((a, b) => a.first_day - b.first_day || a.last_day - b.last_day);

  const actFirst = defaultFirstDay || 1;
  const actLast = defaultLastDay || maxDay || 1;
  const coverage = buildCoverage(actMedia);
  const freeRange = findFreeRange(coverage, actFirst, actLast);
  const allCovered = freeRange === null;

  useEffect(() => {
    if (formOpen) return;
    if (actMedia.length === 0) {
      setFirstDay(actFirst); setLastDay(actLast); setIntervalDays(defaultIntervalDays || 1);
    } else if (freeRange) {
      setFirstDay(freeRange.start); setLastDay(freeRange.end); setIntervalDays(1);
    }
  }, [formOpen, actMedia.length, actFirst, actLast, freeRange?.start, freeRange?.end, defaultIntervalDays]);

  const isFormVisible = actMedia.length === 0 || formOpen;
  const showFileBtn = formMediaType === 'video' || formMediaType === 'audio' || formMediaType === 'image';
  const showLinkBtn = formMediaType === 'video' || formMediaType === 'audio';
  const showEmptyBtn = formMediaType === 'text' || formMediaType === 'none';

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUpload(file, firstDay, lastDay, intervalDays, formMediaType);
    e.target.value = '';
    setFormOpen(false);
  };
  const handleAddLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    try { new URL(url); } catch { alert('Введите корректную ссылку'); return; }
    const sourceType = detectSourceType(url);
    onAddLink(url, sourceType, firstDay, lastDay, intervalDays, formMediaType);
    setLinkUrl(''); setShowLinkInput(false); setFormOpen(false);
  };
  const handleAddEmpty = () => {
    onAddEmpty(formMediaType, firstDay, lastDay, intervalDays);
    setFormOpen(false);
  };

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
        Медиа
      </div>

      {/* Список */}
      {actMedia.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {actMedia.map(m => (
            <MediaItem key={m.id} m={m} maxDay={maxDay}
              activityScheduledDays={activityScheduledDays}
              onPatchMedia={onPatchMedia}
              onDelete={onDelete}
              deletingId={deletingId}
              setDeletingId={setDeletingId}
              openDescId={openDescId}
              setOpenDescId={setOpenDescId} />
          ))}
        </div>
      )}

      {/* CTA — все дни покрыты или открыть форму */}
      {actMedia.length > 0 && !formOpen && (
        allCovered ? (
          <div style={{
            padding: '7px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: 'rgba(39,174,96,0.08)', border: '1px solid rgba(39,174,96,0.25)',
            color: GREEN, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <polyline points="3,8.5 6.5,12 13,4" stroke={GREEN} strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            Медиа есть на все дни практики. Освободите дни чтобы добавить ещё.
          </div>
        ) : (
          <button onClick={() => setFormOpen(true)} disabled={globalUploading}
            style={{
              width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
              color: GREEN, fontSize: 11, fontWeight: 600,
              cursor: globalUploading ? 'not-allowed' : 'pointer', opacity: globalUploading ? 0.4 : 1,
            }}>
            + Ещё медиа
            <span style={{ color: '#888', fontWeight: 400, marginLeft: 6 }}>
              (свободно: дни {freeRange.start}–{freeRange.end})
            </span>
          </button>
        )
      )}

      {/* Форма */}
      {isFormVisible && (
        <div style={{ marginTop: 6 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={inlineLabel}>Тип медиа</label>
            <select value={formMediaType}
              onChange={e => setFormMediaType(e.target.value)}
              style={nativeSelect}>
              <option value="video">Видео</option>
              <option value="audio">Аудио</option>
              <option value="image">Изображение</option>
              <option value="text">Текст</option>
              <option value="none">Без медиа</option>
            </select>
          </div>
          {/* Три колонки С дня / По день / Каждые — как для активности сверху. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={inlineLabel}>С дня</label>
              <input type="number" value={firstDay === '' ? '' : firstDay} min={1} max={maxDay}
                onChange={e => { const v = e.target.value; if (v === '') { setFirstDay(''); return; } const n = parseInt(v); if (!isNaN(n)) setFirstDay(n); }}
                onBlur={() => { const n = parseInt(firstDay); setFirstDay(isNaN(n) || n < 1 ? 1 : Math.min(n, maxDay)); }}
                style={numInput} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={inlineLabel}>По день</label>
              <input type="number" value={lastDay === '' ? '' : lastDay} min={1} max={maxDay}
                onChange={e => { const v = e.target.value; if (v === '') { setLastDay(''); return; } const n = parseInt(v); if (!isNaN(n)) setLastDay(n); }}
                onBlur={() => { const n = parseInt(lastDay); const fd = parseInt(firstDay) || 1; setLastDay(isNaN(n) || n < fd ? fd : Math.min(n, maxDay)); }}
                style={numInput} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={inlineLabel}>Каждые (дн.)</label>
              <input type="number" value={intervalDays === '' ? '' : intervalDays} min={1} max={maxDay}
                onChange={e => { const v = e.target.value; if (v === '') { setIntervalDays(''); return; } const n = parseInt(v); if (!isNaN(n)) setIntervalDays(n); }}
                onBlur={() => { const n = parseInt(intervalDays); setIntervalDays(isNaN(n) || n < 1 ? 1 : Math.min(n, maxDay)); }}
                style={numInput} />
            </div>
          </div>
          {actMedia.length > 0 && (
            <div style={{ marginBottom: 6, textAlign: 'right' }}>
              <button onClick={() => { setFormOpen(false); setShowLinkInput(false); setLinkUrl(''); }}
                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 11, cursor: 'pointer' }}>
                Отмена
              </button>
            </div>
          )}

          {showLinkInput && showLinkBtn && (
            <div style={{ marginBottom: 6, display: 'flex', gap: 6 }}>
              <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                placeholder="YouTube, Google Drive или прямая ссылка"
                style={{ ...smallInput, flex: 1, width: 'auto' }}
                onKeyDown={e => e.key === 'Enter' && handleAddLink()} />
              <button onClick={handleAddLink} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: GREEN, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>OK</button>
              <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} style={{ padding: '6px 8px', borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 12, cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {uploading && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>
                  {uploadPhase === 'transcoding' ? 'Перекодирование...' : 'Загрузка...'}
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>{uploadProgress || 0}%</span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)' }}>
                <div style={{ width: `${uploadProgress || 0}%`, height: '100%', borderRadius: 2, background: GREEN, transition: 'width 0.3s ease' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {showFileBtn && (
              <button onClick={() => fileRef.current?.click()} disabled={globalUploading}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)', color: GREEN, fontSize: 11, fontWeight: 600, cursor: globalUploading ? 'not-allowed' : 'pointer', opacity: globalUploading ? 0.4 : 1 }}>
                + Файл
              </button>
            )}
            {showLinkBtn && (
              <button onClick={() => setShowLinkInput(true)} disabled={globalUploading}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px dashed rgba(52,152,219,0.3)', background: 'rgba(52,152,219,0.04)', color: '#3498db', fontSize: 11, fontWeight: 600, cursor: globalUploading ? 'not-allowed' : 'pointer', opacity: globalUploading ? 0.4 : 1 }}>
                + Ссылка
              </button>
            )}
            {showEmptyBtn && (
              <button onClick={handleAddEmpty} disabled={globalUploading}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)', color: GREEN, fontSize: 11, fontWeight: 600, cursor: globalUploading ? 'not-allowed' : 'pointer', opacity: globalUploading ? 0.4 : 1 }}>
                + {formMediaType === 'text' ? 'Текст' : 'Пустое'}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept={ACCEPT_BY_TYPE[formMediaType] || ''}
            style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
      )}
    </div>
  );
}

function MediaItem({ m, maxDay, activityScheduledDays, onPatchMedia, onDelete, deletingId, setDeletingId, openDescId, setOpenDescId }) {
  const [durationRaw, setDurationRaw] = useState(() => formatMMSS(m.duration_sec));
  const [textDraft, setTextDraft] = useState(m.text_content || '');
  useEffect(() => { setDurationRaw(formatMMSS(m.duration_sec)); }, [m.duration_sec]);
  useEffect(() => { setTextDraft(m.text_content || ''); }, [m.id]);
  const isDeleting = deletingId === m.id;
  const isText = m.media_type === 'text';
  const isNone = m.media_type === 'none';
  const isImage = m.media_type === 'image';
  const durationEditable = isImage || isText || isNone;
  const durationDisplayable = m.duration_sec && (m.media_type === 'video' || m.media_type === 'audio');
  const isDescOpen = openDescId === m.id;

  return (
    <div style={{
      padding: '10px 10px', marginBottom: 6, borderRadius: 10,
      background: isDeleting ? 'rgba(231,76,60,0.06)' : 'rgba(0,0,0,0.02)',
      border: isDeleting ? '1px solid rgba(231,76,60,0.15)' : '1px solid transparent',
      fontSize: 12, transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, width: 28, textAlign: 'center', flexShrink: 0 }}>{typeIcon(m)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {MEDIA_TYPE_LABEL[m.media_type] || m.media_type}
            {sourceLabel(m) ? ` · ${sourceLabel(m)}` : ''}
          </div>
          <div style={{ color: '#999', fontSize: 11 }}>
            День {m.first_day}–{m.last_day}
            {m.interval_days > 1 ? ` • каждые ${m.interval_days} дн.` : ''}
            {m.file_size ? ` • ${formatFileSize(m.file_size)}` : ''}
          </div>
        </div>
        {isDeleting ? (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={async () => { await onDelete(m.id); setDeletingId(null); }}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#e74c3c', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Да</button>
            <button onClick={() => setDeletingId(null)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', color: '#888', fontSize: 11, cursor: 'pointer' }}>Нет</button>
          </div>
        ) : (
          <button onClick={() => setDeletingId(m.id)} title="Удалить"
            style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 13, padding: '2px 4px', opacity: 0.5, flexShrink: 0 }}>
            Удалить
          </button>
        )}
      </div>

      {/* Text — встроенный редактор вместо загрузки. Сохраняем в text_content. */}
      {isText && (
        <div style={{ marginTop: 8 }}>
          <RichTextEditor content={textDraft}
            onChange={val => { setTextDraft(val); onPatchMedia(m.id, { textContent: val }); }}
            placeholder="Текст практики..." />
        </div>
      )}

      {/* Календарь per-media */}
      {onPatchMedia && (
        <div style={{ marginTop: 8 }}>
          <ScheduleCalendar
            daysCount={maxDay}
            firstDay={m.first_day}
            lastDay={m.last_day}
            intervalDays={m.interval_days}
            excludedDays={m.excluded_days || []}
            extraDays={m.extra_days || []}
            enabledDays={activityScheduledDays || null}
            hint="Зелёный — это медиа идёт в этот день, серый — другое медиа или ничего, бледный — практика в этот день не назначена."
            onToggle={(day) => {
              const next = toggleDayInVideo(m, day);
              onPatchMedia(m.id, next);
            }}
          />
        </div>
      )}

      {/* Длительность */}
      {durationDisplayable && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#666' }}>
          <span style={{ color: '#999' }}>Длительность:</span>
          <span style={{ fontWeight: 600, color: '#27ae60', background: 'rgba(39,174,96,0.06)', padding: '3px 8px', borderRadius: 6, fontVariantNumeric: 'tabular-nums' }}>
            {formatMMSS(m.duration_sec)}
          </span>
        </div>
      )}
      {durationEditable && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#666' }}>
          <span style={{ color: '#999' }}>Длительность:</span>
          <input type="text" inputMode="numeric" pattern="\d+:\d{2}" placeholder="1:00"
            value={durationRaw}
            onChange={e => setDurationRaw(e.target.value.replace(/[^\d:]/g, ''))}
            onBlur={() => {
              const sec = Math.max(1, Math.min(72000, parseMMSS(durationRaw)));
              onPatchMedia(m.id, { durationSec: sec });
              setDurationRaw(formatMMSS(sec));
            }}
            style={{ ...smallInput, width: 80, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
          <span style={{ fontSize: 11, color: '#888' }}>мм:сс</span>
        </div>
      )}

      {/* Описание («Введение к уроку») — раскрывающийся блок для всех типов
          КРОМЕ text (там сам текст является содержимым, редактор уже показан). */}
      {!isText && (
        <div style={{ marginTop: 8, borderTop: '1px dashed rgba(0,0,0,0.06)', paddingTop: 8 }}>
          <button type="button" onClick={() => setOpenDescId(isDescOpen ? null : m.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#666', fontWeight: 500 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              style={{ transform: isDescOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
              <path d="M9 6L15 12L9 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Введение к уроку {m.description_html && m.description_html.trim() ? '(есть)' : '(пусто)'}
          </button>
          {isDescOpen && (
            <div style={{ marginTop: 6 }}>
              <RichTextEditor content={m.description_html || ''}
                onChange={val => onPatchMedia(m.id, { descriptionHtml: val })}
                placeholder="Краткое введение к этому медиа..." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
