import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import TopBar from '../components/TopBar';
import { glass } from '../styles/shared';
import { getIconPath } from '../data/iconCatalog';
import {
  adminGetTrainers, adminGetTrainerCourses, adminGetCourse, adminGetAudit,
  adminApproveCourse, adminRejectCourse,
  adminBlockCourse, adminUnblockCourse,
  adminBlockTrainer, adminUnblockTrainer,
} from '../lib/supabase';

const GREEN = '#27ae60';
const RED = '#e74c3c';
const ORANGE = '#e67e22';
const NAVY = '#1a1a2e';

const STORE_STATUS_LABEL = {
  draft: 'Черновик',
  pending: 'На модерации',
  approved: 'В магазине',
  rejected: 'Отклонён',
  blocked: 'Заблокирован',
};

const STORE_STATUS_COLOR = {
  draft: '#999',
  pending: ORANGE,
  approved: GREEN,
  rejected: RED,
  blocked: RED,
};

const ACTION_LABEL = {
  approve_course: 'Одобрил курс',
  reject_course: 'Отклонил курс',
  block_course: 'Заблокировал курс',
  unblock_course: 'Разблокировал курс',
  block_trainer: 'Заблокировал тренера',
  unblock_trainer: 'Разблокировал тренера',
};

function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: '#fff',
      padding: '3px 10px', borderRadius: 8,
      background: STORE_STATUS_COLOR[status] || '#999',
      textTransform: 'uppercase', letterSpacing: 0.3,
    }}>{STORE_STATUS_LABEL[status] || status}</span>
  );
}

function BlockedBadge({ small = false }) {
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 700, color: '#fff',
      padding: '2px 8px', borderRadius: 6, background: RED,
      textTransform: 'uppercase', letterSpacing: 0.3,
    }}>Заблокирован</span>
  );
}

// Универсальная inline-форма подтверждения: спрашивает reason, две кнопки.
// Используется для reject/block, чтобы не тянуть prompt() (правило: без нативных попапов).
function ReasonPrompt({ title, confirmLabel, danger = true, onConfirm, onCancel, busy = false }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      marginTop: 12, padding: 12, borderRadius: 12,
      background: danger ? 'rgba(231,76,60,0.06)' : 'rgba(230,126,34,0.06)',
      border: `1px solid ${danger ? 'rgba(231,76,60,0.2)' : 'rgba(230,126,34,0.2)'}`,
    }}>
      <div style={{ fontSize: 13, color: NAVY, marginBottom: 8, fontWeight: 600 }}>{title}</div>
      <textarea value={reason} onChange={e => setReason(e.target.value)}
        placeholder="Причина (обязательно)…"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: 10, borderRadius: 10, fontSize: 13,
          border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
          resize: 'vertical', fontFamily: 'inherit', marginBottom: 10,
        }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => reason.trim() && onConfirm(reason.trim())}
          disabled={busy || !reason.trim()}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
            background: reason.trim() ? (danger ? RED : ORANGE) : 'rgba(0,0,0,0.1)',
            color: reason.trim() ? '#fff' : '#999',
            fontSize: 14, fontWeight: 600,
            cursor: busy ? 'wait' : (reason.trim() ? 'pointer' : 'not-allowed'),
          }}>{busy ? '…' : confirmLabel}</button>
        <button onClick={onCancel} disabled={busy}
          style={{
            flex: 1, padding: '10px 0', borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.1)', background: '#fff',
            color: '#666', fontSize: 14, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer',
          }}>Отмена</button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// СПИСОК ТРЕНЕРОВ
// ═════════════════════════════════════════════════════════════════════
function TrainersList({ onSelectTrainer }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const rows = await adminGetTrainers();
        setItems(Array.isArray(rows) ? rows : []);
      } catch (e) { setError(e.message || 'Ошибка'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: RED }}>{error}</div>;
  if (items.length === 0) return <div style={{ ...glass, borderRadius: 16, padding: 24, textAlign: 'center', color: '#888' }}>Пока нет ни одного создателя курсов.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(t => (
        <button key={t.id} onClick={() => onSelectTrainer(t.id)}
          style={{
            ...glass, borderRadius: 16, padding: '14px 14px',
            border: t.blocked_at ? `2px solid ${RED}` : glass.border,
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', textAlign: 'left', width: '100%',
          }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {t.avatar_url
              ? <img src={t.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 18, color: '#aaa', fontWeight: 600 }}>{(t.display_name || t.email || '?')[0]?.toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.display_name || t.email}
              </div>
              {t.blocked_at && <BlockedBadge small />}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.email}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{t.courses_count} курс{t.courses_count === 1 ? '' : (t.courses_count >= 2 && t.courses_count <= 4 ? 'а' : 'ов')}</span>
              <span style={{ color: '#ccc' }}>·</span>
              <span>{t.students_count} учен{t.students_count === 1 ? 'ик' : (t.students_count >= 2 && t.students_count <= 4 ? 'ика' : 'иков')}</span>
              {t.pending_count > 0 && <>
                <span style={{ color: '#ccc' }}>·</span>
                <span style={{ color: ORANGE, fontWeight: 600 }}>{t.pending_count} на модерации</span>
              </>}
              {t.approved_count > 0 && <>
                <span style={{ color: '#ccc' }}>·</span>
                <span style={{ color: GREEN, fontWeight: 600 }}>{t.approved_count} в магазине</span>
              </>}
            </div>
          </div>
          <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
            <path d="M2 2L8 7L2 12" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// КУРСЫ ТРЕНЕРА
// ═════════════════════════════════════════════════════════════════════
function TrainerCourses({ trainerId, onSelectCourse, onBackToList }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(null); // 'block' | null
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await adminGetTrainerCourses(trainerId);
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [trainerId]);

  const handleBlock = async (reason) => {
    setBusy(true);
    try {
      const r = await adminBlockTrainer(trainerId, reason);
      if (r?.error) throw new Error(r.error);
      setPrompt(null);
      await reload();
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setBusy(false); }
  };
  const handleUnblock = async () => {
    setBusy(true);
    try {
      const r = await adminUnblockTrainer(trainerId);
      if (r?.error) throw new Error(r.error);
      await reload();
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: RED }}>{error}</div>;
  const { trainer, courses } = data || {};
  return (
    <div>
      <div style={{
        ...glass, borderRadius: 16, padding: 14, marginBottom: 14,
        border: trainer?.blocked_at ? `2px solid ${RED}` : glass.border,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {trainer?.avatar_url
              ? <img src={trainer.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 22, color: '#aaa', fontWeight: 600 }}>{(trainer?.display_name || trainer?.email || '?')[0]?.toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{trainer?.display_name || trainer?.email}</div>
              {trainer?.blocked_at && <BlockedBadge />}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{trainer?.email}</div>
            {trainer?.blocked_reason && (
              <div style={{ fontSize: 12, color: RED, marginTop: 4, fontStyle: 'italic' }}>
                Причина: {trainer.blocked_reason}
              </div>
            )}
          </div>
        </div>
        {!prompt && (
          trainer?.blocked_at
            ? <button onClick={handleUnblock} disabled={busy}
                style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 10,
                  border: `1px solid ${GREEN}`, background: '#fff', color: GREEN,
                  fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                Разблокировать тренера
              </button>
            : <button onClick={() => setPrompt('block')} disabled={busy}
                style={{ marginTop: 12, width: '100%', padding: 12, borderRadius: 10,
                  border: `1px solid ${RED}`, background: '#fff', color: RED,
                  fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                Заблокировать тренера
              </button>
        )}
        {prompt === 'block' && (
          <ReasonPrompt
            title="Заблокировать тренера. Причина будет сохранена в аудит."
            confirmLabel="Заблокировать"
            busy={busy}
            onConfirm={handleBlock}
            onCancel={() => setPrompt(null)} />
        )}
      </div>

      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 8 }}>
        Курсы ({courses?.length || 0})
      </div>
      {!courses?.length && (
        <div style={{ ...glass, borderRadius: 16, padding: 20, textAlign: 'center', color: '#888' }}>Пока нет курсов.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {courses?.map(c => {
          const iconSrc = c.avatar_custom || (c.avatar_icon ? getIconPath(c.avatar_icon) : null);
          return (
            <button key={c.id} onClick={() => onSelectCourse(c.id)}
              style={{
                ...glass, borderRadius: 16, padding: '14px 14px',
                border: c.blocked_at ? `2px solid ${RED}` : glass.border,
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textAlign: 'left', width: '100%',
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4,
              }}>
                {iconSrc && <img src={iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <StatusBadge status={c.blocked_at ? 'blocked' : c.store_status} />
                  <span>{c.days_count} дн.</span>
                  <span style={{ color: '#ccc' }}>·</span>
                  <span>{c.students_count} учен{c.students_count === 1 ? 'ик' : 'иков'}</span>
                  {c.price_amount > 0 && <>
                    <span style={{ color: '#ccc' }}>·</span>
                    <span style={{ color: GREEN, fontWeight: 600 }}>{c.price_amount} {c.price_currency}</span>
                  </>}
                </div>
              </div>
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2 2L8 7L2 12" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// КАРТОЧКА КУРСА + УЧЕНИКИ + модерация
// ═════════════════════════════════════════════════════════════════════
function CourseCard({ courseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(null); // 'reject' | 'block' | null
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await adminGetCourse(courseId);
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [courseId]);

  const run = async (fn) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r?.error) throw new Error(r.error);
      setPrompt(null);
      await reload();
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: RED }}>{error}</div>;
  const { course, students } = data || {};
  if (!course) return null;
  const iconSrc = course.avatar_custom || (course.avatar_icon ? getIconPath(course.avatar_icon) : null);
  const status = course.blocked_at ? 'blocked' : course.store_status;

  return (
    <div>
      <div style={{
        ...glass, borderRadius: 16, padding: 14, marginBottom: 14,
        border: course.blocked_at ? `2px solid ${RED}` : glass.border,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4,
          }}>
            {iconSrc && <img src={iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>{course.title}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusBadge status={status} />
              <span>{course.days_count} дн.</span>
              {course.price_amount > 0 && <>
                <span style={{ color: '#ccc' }}>·</span>
                <span style={{ color: GREEN, fontWeight: 600 }}>{course.price_amount} {course.price_currency}</span>
              </>}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>
              Автор: <b>{course.owner_name || course.owner_email}</b> · {course.owner_email}
            </div>
          </div>
        </div>

        {course.description && (
          <div style={{ fontSize: 13, color: '#666', marginTop: 12, lineHeight: 1.4 }}>
            {course.description}
          </div>
        )}

        {course.store_reject_reason && course.store_status === 'rejected' && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(231,76,60,0.06)', color: RED, fontSize: 12 }}>
            <b>Отклонён:</b> {course.store_reject_reason}
          </div>
        )}
        {course.blocked_reason && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: 'rgba(231,76,60,0.06)', color: RED, fontSize: 12 }}>
            <b>Заблокирован:</b> {course.blocked_reason}
          </div>
        )}

        {!prompt && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {course.store_status === 'pending' && (
              <>
                <button onClick={() => run(() => adminApproveCourse(courseId))} disabled={busy}
                  style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none',
                    background: GREEN, color: '#fff', fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                  Одобрить и опубликовать
                </button>
                <button onClick={() => setPrompt('reject')} disabled={busy}
                  style={{ width: '100%', padding: 12, borderRadius: 10,
                    border: `1px solid ${ORANGE}`, background: '#fff', color: ORANGE,
                    fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                  Отклонить
                </button>
              </>
            )}
            {!course.blocked_at ? (
              <button onClick={() => setPrompt('block')} disabled={busy}
                style={{ width: '100%', padding: 12, borderRadius: 10,
                  border: `1px solid ${RED}`, background: '#fff', color: RED,
                  fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                Заблокировать курс
              </button>
            ) : (
              <button onClick={() => run(() => adminUnblockCourse(courseId))} disabled={busy}
                style={{ width: '100%', padding: 12, borderRadius: 10,
                  border: `1px solid ${GREEN}`, background: '#fff', color: GREEN,
                  fontSize: 14, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                Разблокировать курс
              </button>
            )}
          </div>
        )}

        {prompt === 'reject' && (
          <ReasonPrompt
            title="Отклонить курс из витрины. Тренер увидит причину."
            confirmLabel="Отклонить"
            danger={false}
            busy={busy}
            onConfirm={(reason) => run(() => adminRejectCourse(courseId, reason))}
            onCancel={() => setPrompt(null)} />
        )}
        {prompt === 'block' && (
          <ReasonPrompt
            title="Заблокировать курс. Он не появится в витрине и станет скрытым."
            confirmLabel="Заблокировать"
            busy={busy}
            onConfirm={(reason) => run(() => adminBlockCourse(courseId, reason))}
            onCancel={() => setPrompt(null)} />
        )}
      </div>

      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 8 }}>
        Ученики ({students?.length || 0})
      </div>
      {!students?.length && (
        <div style={{ ...glass, borderRadius: 16, padding: 20, textAlign: 'center', color: '#888' }}>Пока никто не записан.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {students?.map(s => (
          <div key={s.id} style={{
            ...glass, borderRadius: 12, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, flexShrink: 0,
              background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              {s.avatar_url
                ? <img src={s.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>{(s.display_name || s.email || '?')[0]?.toUpperCase()}</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.display_name || s.email}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>{s.email} · {s.role || 'student'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// АУДИТ-ЛОГ
// ═════════════════════════════════════════════════════════════════════
function AuditLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    (async () => {
      try {
        const rows = await adminGetAudit(200);
        setItems(Array.isArray(rows) ? rows : []);
      } catch (e) { setError(e.message || 'Ошибка'); }
      finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: RED }}>{error}</div>;
  if (items.length === 0) return <div style={{ ...glass, borderRadius: 16, padding: 20, textAlign: 'center', color: '#888' }}>Пока пусто.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(a => {
        const d = new Date(a.created_at);
        const when = `${d.toLocaleDateString('ru-RU')} ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        const reason = a.metadata?.reason;
        return (
          <div key={a.id} style={{ ...glass, borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>
              {ACTION_LABEL[a.action] || a.action}
              {a.target_label && <span style={{ color: '#666', fontWeight: 400 }}> · {a.target_label}</span>}
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
              {a.actor_name || a.actor_email || 'неизвестно'} · {when}
            </div>
            {reason && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4, fontStyle: 'italic' }}>
                «{reason}»
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// КОРНЕВОЙ КОМПОНЕНТ
// ═════════════════════════════════════════════════════════════════════
export default function AdminPanel({ onBack }) {
  // Локальный nav-стек: 'trainers' | 'trainer:<id>' | 'course:<id>' | 'audit'.
  const [stack, setStack] = useState(['trainers']);
  const top = stack[stack.length - 1];

  const push = (screen) => setStack(prev => [...prev, screen]);
  const back = () => {
    if (stack.length > 1) setStack(prev => prev.slice(0, -1));
    else onBack?.();
  };
  const jumpTo = (screen) => setStack([screen]);

  let title = 'Админ-панель';
  let body = null;
  if (top === 'trainers') {
    title = 'Тренеры';
    body = <TrainersList onSelectTrainer={(id) => push(`trainer:${id}`)} />;
  } else if (top === 'audit') {
    title = 'Аудит-лог';
    body = <AuditLog />;
  } else if (top.startsWith('trainer:')) {
    title = 'Тренер';
    body = <TrainerCourses trainerId={top.slice('trainer:'.length)}
      onSelectCourse={(id) => push(`course:${id}`)} />;
  } else if (top.startsWith('course:')) {
    title = 'Курс';
    body = <CourseCard courseId={top.slice('course:'.length)} />;
  }

  return (
    <Layout>
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 40px', position: 'relative', zIndex: 1 }}>
        <TopBar onBack={back} title={title} />
        {/* Переключатель разделов виден только на корне стека, чтобы не мешать
            drill-in навигации. */}
        {(top === 'trainers' || top === 'audit') && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button onClick={() => jumpTo('trainers')}
              style={tabStyle(top === 'trainers')}>Тренеры</button>
            <button onClick={() => jumpTo('audit')}
              style={tabStyle(top === 'audit')}>Аудит</button>
          </div>
        )}
        {body}
      </div>
    </Layout>
  );
}

function tabStyle(active) {
  return {
    flex: 1, padding: '10px 0', borderRadius: 12,
    border: active ? `1.5px solid ${NAVY}` : '1px solid rgba(0,0,0,0.08)',
    background: active ? NAVY : '#fff',
    color: active ? '#fff' : NAVY,
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };
}
