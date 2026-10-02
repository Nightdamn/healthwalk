import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Video, FileText, X, Check, Clock, CornerUpLeft } from 'lucide-react';
import Layout from '../components/Layout';
import TopBar from '../components/TopBar';
import { TheoryContent } from '../components/RichTextEditor';
import { saveTaskDraft, submitTask, uploadTaskFile, deleteTaskFile, taskFileUrl } from '../lib/db';

// v31: экран задания у ученика. Текст задания, ответ текстом и файлами,
// «Выполнено» («Самостоятельно») или «Отправить на проверку» («С проверкой»),
// статус ответа и комментарий тренера, если вернул на доработку.
// Черновик создаётся на сервере при первой правке (текст или файл).

const GREEN = '#27ae60';
const ORANGE = '#e67e22';
const BLUE = '#2f6fb3';
const MAX_BYTES = 200 * 1024 * 1024;
const ACCEPT = 'image/*,video/*,.pdf,.doc,.docx,.txt,.rtf,.odt';

const card = {
  background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  borderRadius: 20, padding: '18px 18px', marginBottom: 14,
  border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
};
const sectionLabel = { fontSize: 12, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 };

const fmtSize = (b) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(b / 1024))} КБ`;

// Статус ответа так, как его видит ученик.
export function taskStatusInfo(sub, review) {
  if (!sub || sub.status === 'draft') return { label: sub ? 'Черновик' : 'Не выполнено', color: '#999', done: false };
  if (sub.status === 'returned') return { label: 'На доработке', color: ORANGE, done: false };
  if (sub.status === 'approved') return { label: 'Зачтено', color: GREEN, done: true };
  return review ? { label: 'На проверке', color: BLUE, done: true } : { label: 'Выполнено', color: GREEN, done: true };
}

export default function TaskPage({ activity, day, courseId, groupId, submission, onBack, onChange, onSubmitted }) {
  const [sub, setSub] = useState(submission || null);
  const [text, setText] = useState(submission?.answerText || '');
  const [uploads, setUploads] = useState([]); // [{ key, name, pct }]
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const saveTimer = useRef(null);
  const savedText = useRef(submission?.answerText || '');

  const review = !!activity.taskReview;
  const editable = !sub || sub.status === 'draft' || sub.status === 'returned';
  const status = taskStatusInfo(sub, review);

  const applySub = (s) => { setSub(s); onChange?.(s); };

  // Черновик на сервере: создаёт при первом обращении, обновляет текст.
  const ensureDraft = async (answerText) => {
    const r = await saveTaskDraft({ courseId, groupId, activityId: activity.id, day, answerText });
    if (r?.error) { setError(r.error); return null; }
    if (answerText !== undefined) savedText.current = answerText;
    applySub(r.data);
    return r.data;
  };

  const flushText = async () => {
    clearTimeout(saveTimer.current);
    if (text !== savedText.current || !sub) return ensureDraft(text);
    return sub;
  };

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const onTextChange = (v) => {
    setText(v);
    setError('');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { ensureDraft(v); }, 900);
  };

  const onPickFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    const tooBig = files.filter(f => f.size > MAX_BYTES);
    if (tooBig.length) setError(`Больше 200 МБ, не загружено: ${tooBig.map(f => f.name).join(', ')}`);
    const ok = files.filter(f => f.size <= MAX_BYTES);
    if (!ok.length) return;
    const draft = await flushText();
    if (!draft) return;
    for (const f of ok) {
      const key = `${f.name}-${f.size}-${Date.now()}`;
      setUploads(u => [...u, { key, name: f.name, pct: 0 }]);
      const r = await uploadTaskFile(draft.id, f, (pct) => setUploads(u => u.map(x => x.key === key ? { ...x, pct } : x)));
      setUploads(u => u.filter(x => x.key !== key));
      if (r?.error) { setError(`${f.name}: ${r.error}`); continue; }
      setSub(prev => {
        const next = { ...(prev || draft), files: [...((prev || draft).files || []), r.data] };
        onChange?.(next);
        return next;
      });
    }
  };

  const onRemoveFile = async (fileId) => {
    const r = await deleteTaskFile(fileId);
    if (r?.error) { setError(r.error); return; }
    setSub(prev => {
      const next = { ...prev, files: (prev?.files || []).filter(f => f.id !== fileId) };
      onChange?.(next);
      return next;
    });
  };

  const onSubmit = async () => {
    setError('');
    if (review && !text.trim() && !(sub?.files || []).length) {
      setError('Напишите ответ или приложите файл — тренеру нечего проверить.');
      return;
    }
    setBusy(true);
    try {
      const draft = await flushText();
      if (!draft) return;
      const r = await submitTask(draft.id);
      if (r?.error) { setError(r.error); return; }
      applySub(r.data);
      onSubmitted?.(r.data);
    } finally {
      setBusy(false);
    }
  };

  const files = sub?.files || [];
  const uploading = uploads.length > 0;

  return (
    <Layout>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 40px', position: 'relative', zIndex: 1 }}>
        <TopBar onBack={onBack} title={activity.label || 'Задание'} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#555', background: 'rgba(0,0,0,0.05)', padding: '4px 10px', borderRadius: 8 }}>
            День {day}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: status.color, background: `${status.color}14`, padding: '4px 10px', borderRadius: 8 }}>
            {status.label}
          </span>
          {activity.taskRequired && activity.taskBound !== false && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#555', background: 'rgba(0,0,0,0.05)', padding: '4px 10px', borderRadius: 8 }}>
              Обязательное
            </span>
          )}
        </div>

        <div style={card}>
          <div style={sectionLabel}>Задание</div>
          {activity.descriptionHtml
            ? <TheoryContent html={activity.descriptionHtml} />
            : <div style={{ color: '#aaa', fontSize: 14 }}>Текст задания не добавлен</div>}
        </div>

        {sub?.status === 'returned' && (
          <div style={{ ...card, background: 'rgba(230,126,34,0.07)', border: `1px solid ${ORANGE}33` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: ORANGE, fontWeight: 600, fontSize: 14, marginBottom: sub.reviewComment ? 8 : 0 }}>
              <CornerUpLeft size={16} /> Тренер вернул на доработку
            </div>
            {sub.reviewComment && <div style={{ fontSize: 14, color: '#1a1a2e', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{sub.reviewComment}</div>}
          </div>
        )}

        <div style={card}>
          <div style={sectionLabel}>Ваш ответ</div>
          {editable ? (
            <textarea value={text} onChange={e => onTextChange(e.target.value)}
              onBlur={() => { if (text !== savedText.current) { clearTimeout(saveTimer.current); ensureDraft(text); } }}
              placeholder={review ? 'Напишите ответ для тренера…' : 'Можно написать ответ — по желанию'}
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 110,
                padding: '12px 14px', borderRadius: 12, border: '1.5px solid rgba(0,0,0,0.08)',
                background: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 1.5,
                fontFamily: 'inherit', color: '#1a1a2e', outline: 'none',
              }} />
          ) : (
            <div style={{ fontSize: 15, color: text ? '#1a1a2e' : '#aaa', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {text || 'Без текста'}
            </div>
          )}

          {(files.length > 0 || uploading) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, background: 'rgba(0,0,0,0.03)' }}>
                  {f.kind === 'image' ? (
                    <a href={taskFileUrl(f.id)} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
                      <img src={taskFileUrl(f.id)} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ) : (
                    <span style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(39,174,96,0.08)', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {f.kind === 'video' ? <Video size={20} /> : <FileText size={20} />}
                    </span>
                  )}
                  <a href={taskFileUrl(f.id, { download: f.kind === 'document' })} target="_blank" rel="noreferrer"
                    style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: '#1a1a2e' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.originalName}</div>
                    <div style={{ fontSize: 12, color: '#999' }}>{fmtSize(f.sizeBytes)}</div>
                  </a>
                  {editable && (
                    <button type="button" onClick={() => onRemoveFile(f.id)} aria-label="Убрать файл"
                      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: '#bbb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
              {uploads.map(u => (
                <div key={u.key} style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: 13, color: '#555', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${u.pct}%`, background: GREEN, transition: 'width 0.2s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {editable && (<>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} style={{ display: 'none' }}
              onChange={e => { onPickFiles(e.target.files); e.target.value = ''; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{
                marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 12,
                border: '1.5px solid rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.06)', color: GREEN,
                fontSize: 14, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <Paperclip size={16} /> Приложить фото, видео или документ
            </button>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 6, textAlign: 'center' }}>
              До 200 МБ каждый файл
            </div>
          </>)}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: '#c0392b', background: 'rgba(192,57,43,0.06)', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
            {error}
          </div>
        )}

        {editable ? (
          <button type="button" onClick={onSubmit} disabled={busy || uploading}
            style={{
              width: '100%', padding: '16px 0', background: '#1a1a2e', color: '#fff', border: 'none',
              borderRadius: 16, fontSize: 16, fontWeight: 600, cursor: busy || uploading ? 'wait' : 'pointer',
              opacity: busy || uploading ? 0.6 : 1, boxShadow: '0 4px 20px rgba(26,26,46,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
            {review ? <Clock size={18} /> : <Check size={18} />}
            {review
              ? (sub?.status === 'returned' ? 'Отправить снова' : 'Отправить на проверку')
              : 'Выполнено'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 14, color: status.color, fontWeight: 600, padding: '8px 0' }}>
            {sub?.status === 'approved' ? 'Тренер зачёл задание'
              : review ? 'Ответ отправлен — тренер проверит его'
              : 'Задание выполнено'}
          </div>
        )}
      </div>
    </Layout>
  );
}
