import React, { useState, useRef } from 'react';

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

export function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return m ? m[1] : null;
}

export function extractDriveId(url) {
  if (!url) return null;
  // https://drive.google.com/file/d/FILE_ID/view
  // https://drive.google.com/file/d/FILE_ID/preview
  // https://drive.google.com/open?id=FILE_ID
  // https://drive.google.com/uc?id=FILE_ID&export=download
  // https://drive.usercontent.google.com/download?id=FILE_ID
  // https://docs.google.com/uc?id=FILE_ID
  let m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?.*id=)([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/docs\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/drive\.usercontent\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  // Any google.com URL with /d/FILE_ID pattern
  m = url.match(/google\.com\/.*\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return null;
}

export function detectVideoType(url) {
  if (extractYoutubeId(url)) return 'youtube';
  if (extractDriveId(url)) return 'drive';
  // Check if it looks like a Google domain (catch-all)
  if (/google\.com|googleapis\.com/.test(url)) return 'drive';
  return 'link';
}

function videoTypeLabel(type) {
  if (type === 'youtube') return 'YouTube';
  if (type === 'drive') return 'Google Drive';
  if (type === 'link') return 'Ссылка';
  return 'Файл';
}

function videoTypeIcon(type) {
  if (type === 'youtube') return '▶';
  if (type === 'drive') return '☁';
  if (type === 'link') return '🔗';
  return '📹';
}

function videoDisplayName(v) {
  if (v.video_type === 'youtube') {
    return `YouTube: ${extractYoutubeId(v.video_url) || v.video_url}`;
  }
  if (v.video_type === 'drive') {
    return `Drive: ${extractDriveId(v.video_url) || v.video_url}`;
  }
  if (v.video_type === 'link') {
    try { return new URL(v.video_url).hostname + '/...'; } catch { return v.video_url; }
  }
  return v.video_url.split('/').pop();
}

export default function VideoSection({ videos, courseId, activityId, maxDay, onUpload, onAddLink, onDelete, uploading, uploadProgress, globalUploading }) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [firstDay, setFirstDay] = useState(1);
  const [lastDay, setLastDay] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef();

  const actVideos = videos.filter(v => v.activity_id === activityId);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validTypes.includes(file.type)) {
      alert('Поддерживаемые форматы: MP4, WebM, MOV');
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      alert('Максимальный размер файла: 500 МБ');
      return;
    }
    onUpload(file, firstDay, lastDay);
    e.target.value = '';
  };

  const handleAddLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    try { new URL(url); } catch {
      alert('Введите корректную ссылку');
      return;
    }
    const type = detectVideoType(url);
    onAddLink(url, type, firstDay, lastDay);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
        Видео
      </div>

      {/* Video list */}
      {actVideos.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {actVideos.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', marginBottom: 4, borderRadius: 10,
              background: deletingId === v.id ? 'rgba(231,76,60,0.06)' : 'rgba(0,0,0,0.02)',
              border: deletingId === v.id ? '1px solid rgba(231,76,60,0.15)' : '1px solid transparent',
              fontSize: 12, transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 14 }}>{videoTypeIcon(v.video_type)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {videoDisplayName(v)}
                </div>
                <div style={{ color: '#999', fontSize: 11 }}>
                  День {v.first_day}–{v.last_day}
                  {v.file_size ? ` • ${formatFileSize(v.file_size)}` : ''}
                  {v.duration_sec ? ` • ${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}` : ''}
                </div>
              </div>
              {deletingId === v.id ? (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={async () => {
                    await onDelete(v.id, v.video_url, v.video_type);
                    setDeletingId(null);
                  }} style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: '#e74c3c', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>Да</button>
                  <button onClick={() => setDeletingId(null)} style={{
                    padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)',
                    background: '#fff', color: '#888', fontSize: 11, cursor: 'pointer',
                  }}>Нет</button>
                </div>
              ) : (
                <button onClick={() => setDeletingId(v.id)}
                  title="Удалить видео"
                  style={{
                    background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer',
                    fontSize: 13, padding: '2px 4px', opacity: 0.5, flexShrink: 0,
                  }}>
                  Удалить
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Day interval inputs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#999' }}>С дня:</span>
        <input type="number" value={firstDay} min={1} max={maxDay}
          onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n > 0) setFirstDay(n); }}
          onBlur={() => setFirstDay(Math.max(1, Math.min(firstDay, maxDay)))}
          style={smallInput} />
        <span style={{ fontSize: 11, color: '#999' }}>По день:</span>
        <input type="number" value={lastDay} min={1} max={maxDay}
          onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n) && n > 0) setLastDay(n); }}
          onBlur={() => setLastDay(Math.max(firstDay, Math.min(lastDay, maxDay)))}
          style={smallInput} />
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
              placeholder="YouTube, Google Drive или прямая ссылка"
              style={{ ...smallInput, flex: 1, width: 'auto' }}
              onKeyDown={e => e.key === 'Enter' && handleAddLink()} />
            <button onClick={handleAddLink} style={{
              padding: '6px 12px', borderRadius: 8, border: 'none',
              background: GREEN, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>OK</button>
            <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} style={{
              padding: '6px 8px', borderRadius: 8, border: 'none',
              background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 12, cursor: 'pointer',
            }}>✕</button>
          </div>
          {linkUrl.trim() && (
            <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
              Тип: {videoTypeLabel(detectVideoType(linkUrl.trim()))}
            </div>
          )}
        </div>
      )}

      {/* Upload progress bar */}
      {uploading && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>Загрузка видео...</span>
            <span style={{ fontSize: 11, color: '#888' }}>{uploadProgress || 0}%</span>
          </div>
          <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)' }}>
            <div style={{
              width: `${uploadProgress || 0}%`, height: '100%', borderRadius: 2,
              background: GREEN, transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => fileRef.current?.click()} disabled={globalUploading}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: `1px dashed rgba(39,174,96,0.3)`, background: 'rgba(39,174,96,0.04)',
            color: GREEN, fontSize: 11, fontWeight: 600,
            cursor: globalUploading ? 'not-allowed' : 'pointer',
            opacity: globalUploading ? 0.4 : 1,
          }}>
          {uploading ? `Загрузка ${uploadProgress || 0}%` : '+ Файл'}
        </button>
        <button onClick={() => setShowLinkInput(true)} disabled={globalUploading}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: '1px dashed rgba(52,152,219,0.3)', background: 'rgba(52,152,219,0.04)',
            color: '#3498db', fontSize: 11, fontWeight: 600,
            cursor: globalUploading ? 'not-allowed' : 'pointer',
            opacity: globalUploading ? 0.4 : 1,
          }}>
          + Ссылка
        </button>
      </div>
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime"
        style={{ display: 'none' }} onChange={handleFileSelect} />
    </div>
  );
}
