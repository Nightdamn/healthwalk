import React from 'react';

const GREEN = '#27ae60';

// Course / tracker avatar widget. Three ways to change the picture:
//   1. Click the avatar itself  → onPick()    (open built-in IconPicker)
//   2. Click magnifier on left  → onPick()    (same — hint for users who
//                                              don't realize the avatar
//                                              is clickable)
//   3. Click ↑ on the right     → onUpload()  (opens a hidden file input)
export default function AvatarPicker({ src, onPick, onUpload, fileInputRef, onFileChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button onClick={onPick}
        title="Выбрать из наших значков"
        aria-label="Выбрать из наших значков"
        style={miniBtn}>
        {/* magnifier */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      <button onClick={onPick}
        title="Изменить значок"
        aria-label="Изменить значок"
        style={{
          width: 64, height: 64, borderRadius: 16, border: `2px solid ${GREEN}`,
          background: '#fafafa', cursor: 'pointer', padding: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
        {src
          ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 28 }}>📚</span>}
      </button>

      <button onClick={onUpload}
        title="Загрузить из галереи (SVG / PNG / JPG, до 1 МБ)"
        aria-label="Загрузить картинку с устройства"
        style={miniBtn}>
        {/* up arrow */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/svg+xml,image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />
    </div>
  );
}

const miniBtn = {
  width: 28, height: 28, borderRadius: 8, padding: 0,
  border: '1px solid rgba(0,0,0,0.12)', background: '#fff',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

// Validate + (raster) resize an uploaded avatar file. Calls onResult with
// a data URL ready to drop into <img src> / DB; calls onError with a Russian
// string on rejection.
//   - Accepts SVG, PNG, JPG (file MIME or extension fallback).
//   - Rejects > 1 MB.
//   - SVG: passed through as data URL untouched (vector, no size cap needed).
//   - PNG/JPG: drawn to a Canvas at max 300×300 (preserving aspect) before
//     encoding. Final blob ends up well under the 1 MB cap.
const MAX_BYTES = 1024 * 1024;
const MAX_DIM = 300;
const ALLOWED = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/jpg'];

export function processAvatarFile(file, onResult, onError) {
  if (!file) return;
  const mime = (file.type || '').toLowerCase();
  const ext = (file.name || '').toLowerCase().split('.').pop();
  const isSvg = mime.includes('svg') || ext === 'svg';
  const isPng = mime === 'image/png' || ext === 'png';
  const isJpg = mime === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg';
  if (!isSvg && !isPng && !isJpg && !ALLOWED.includes(mime)) {
    onError('Поддерживаются SVG, PNG, JPG');
    return;
  }
  if (file.size > MAX_BYTES) {
    onError(`Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} МБ (лимит 1 МБ)`);
    return;
  }

  if (isSvg) {
    const reader = new FileReader();
    reader.onload = (ev) => onResult(ev.target.result);
    reader.onerror = () => onError('Не удалось прочитать файл');
    reader.readAsDataURL(file);
    return;
  }

  // Raster — load into <img>, downscale via Canvas to MAX_DIM × MAX_DIM box.
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // PNG preserves transparency; JPG is fine as JPEG.
      const outMime = isPng ? 'image/png' : 'image/jpeg';
      const quality = isJpg ? 0.9 : undefined;
      onResult(canvas.toDataURL(outMime, quality));
    };
    img.onerror = () => onError('Не удалось обработать картинку');
    img.src = ev.target.result;
  };
  reader.onerror = () => onError('Не удалось прочитать файл');
  reader.readAsDataURL(file);
}
