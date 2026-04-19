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

function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return m ? m[1] : null;
}

export default function VideoSection({ videos, courseId, activityId, maxDay, onUpload, onAddYoutube, onDelete, uploading }) {
  const [showYtInput, setShowYtInput] = useState(false);
  const [ytUrl, setYtUrl] = useState('');
  const [firstDay, setFirstDay] = useState(1);
  const [lastDay, setLastDay] = useState(1);
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
    if (file.size > 100 * 1024 * 1024) {
      alert('Максимальный размер файла: 100 МБ');
      return;
    }
    onUpload(file, firstDay, lastDay);
    e.target.value = '';
  };

  const handleAddYoutube = () => {
    if (!ytUrl.trim()) return;
    if (!extractYoutubeId(ytUrl)) {
      alert('Неверная ссылка YouTube');
      return;
    }
    onAddYoutube(ytUrl.trim(), firstDay, lastDay);
    setYtUrl('');
    setShowYtInput(false);
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
              padding: '6px 10px', marginBottom: 4, borderRadius: 8,
              background: 'rgba(0,0,0,0.02)', fontSize: 12,
            }}>
              <span style={{ fontSize: 14 }}>{v.video_type === 'youtube' ? '🔗' : '📹'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.video_type === 'youtube'
                    ? `YouTube: ${extractYoutubeId(v.video_url) || v.video_url}`
                    : v.video_url.split('/').pop()}
                </div>
                <div style={{ color: '#999', fontSize: 11 }}>
                  День {v.first_day}–{v.last_day}
                  {v.file_size ? ` • ${formatFileSize(v.file_size)}` : ''}
                  {v.duration_sec ? ` • ${Math.floor(v.duration_sec / 60)}:${String(v.duration_sec % 60).padStart(2, '0')}` : ''}
                </div>
              </div>
              <button onClick={() => onDelete(v.id, v.video_url, v.video_type)}
                style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: 14, padding: 2 }}>
                ✕
              </button>
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

      {/* YouTube input */}
      {showYtInput && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            style={{ ...smallInput, flex: 1, width: 'auto' }}
            onKeyDown={e => e.key === 'Enter' && handleAddYoutube()} />
          <button onClick={handleAddYoutube} style={{
            padding: '6px 12px', borderRadius: 8, border: 'none',
            background: GREEN, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>OK</button>
          <button onClick={() => { setShowYtInput(false); setYtUrl(''); }} style={{
            padding: '6px 8px', borderRadius: 8, border: 'none',
            background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 12, cursor: 'pointer',
          }}>✕</button>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: `1px dashed rgba(39,174,96,0.3)`, background: 'rgba(39,174,96,0.04)',
            color: GREEN, fontSize: 11, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.5 : 1,
          }}>
          {uploading ? 'Загрузка...' : '+ Видео файл'}
        </button>
        <button onClick={() => setShowYtInput(true)} disabled={uploading}
          style={{
            flex: 1, padding: '7px 10px', borderRadius: 8,
            border: '1px dashed rgba(231,76,60,0.3)', background: 'rgba(231,76,60,0.04)',
            color: '#e74c3c', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}>
          + YouTube
        </button>
      </div>
      <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime"
        style={{ display: 'none' }} onChange={handleFileSelect} />
    </div>
  );
}
