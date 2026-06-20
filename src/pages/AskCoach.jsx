import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { getIconPath } from '../data/iconCatalog';
import { sendMessage, getConversation, markMessagesRead, getCourseStaff, getUnreadByConversation } from '../lib/db';

const GREEN = '#27ae60';
const BLUE = '#3498db';
const ORANGE = '#e67e22';
const OWNER_COLOR = '#8e44ad';
const ROLE_LABELS = { trainer: 'Тренер', curator: 'Куратор', student: 'Ученик' };

export default function AskCoachPage({ user, onBack, availableItems, activeItem, onUnreadChange }) {
  const courses = (availableItems || []).filter(i => i.type === 'course');
  const defaultCourseId = activeItem?.type === 'course' ? activeItem.id : (courses[0]?.id || null);

  const [courseId, setCourseId] = useState(defaultCourseId);
  const [staff, setStaff] = useState([]);
  const [chatUserId, setChatUserId] = useState(null);
  const [unreadMap, setUnreadMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

  const loadUnread = useCallback(async () => {
    const data = await getUnreadByConversation();
    const map = {};
    for (const u of data) map[`${u.course_id}_${u.sender_id}`] = Number(u.unread_count);
    setUnreadMap(map);
  }, []);

  useEffect(() => { loadUnread(); }, [loadUnread]);

  useEffect(() => {
    if (!courseId) { setStaff([]); return; }
    setLoading(true);
    getCourseStaff(courseId).then(s => { setStaff(s); setLoading(false); });
  }, [courseId]);

  const courseHasUnread = (cId) => Object.keys(unreadMap).some(k => k.startsWith(cId + '_') && unreadMap[k] > 0);
  const getRoleColor = (s) => s.is_owner ? OWNER_COLOR : s.role === 'trainer' ? ORANGE : s.role === 'curator' ? BLUE : GREEN;
  const getRoleLabel = (s) => s.is_owner ? 'Создатель' : (ROLE_LABELS[s.role] || s.role);
  const selectedCourse = courses.find(c => c.id === courseId);

  if (courses.length === 0) {
    return (
      <Layout>
        <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 24px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', position: 'fixed', top: 'var(--vv-top, 0px)', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 28 }}>
            <button onClick={onBack} style={btnBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
            <h2 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Сообщения</h2>
            <div style={{ width: 42 }} />
          </div>
          <div style={{ ...glass, borderRadius: 18, padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>У вас нет активного курса</div>
            <div style={{ fontSize: 14, color: '#888' }}>Запишитесь на курс, чтобы связаться с тренером</div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 20px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', position: 'fixed', top: 'var(--vv-top, 0px)', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 16 }}>
          <button onClick={onBack} style={btnBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <h2 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Сообщения</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Course dropdown */}
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <button onClick={() => setCourseDropdownOpen(!courseDropdownOpen)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 12,
              border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
              fontSize: 14, color: '#1a1a2e', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            {(() => {
              const src = selectedCourse?.avatarCustom || (selectedCourse?.avatarIcon ? getIconPath(selectedCourse.avatarIcon) : null);
              return (
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: '#fafafa', border: `1.5px solid ${GREEN}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {src
                    ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: 16 }}>📚</span>}
                </div>
              );
            })()}
            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedCourse?.title || 'Выберите курс'}
            </span>
            {courseHasUnread(courseId) && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 12, color: '#aaa', transition: 'transform 0.2s', transform: courseDropdownOpen ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>▼</span>
          </button>
          {courseDropdownOpen && (
            <>
              <div onClick={() => setCourseDropdownOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9 }} />
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
                background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.1)', overflow: 'hidden',
              }}>
                {courses.map(c => {
                  const src = c.avatarCustom || (c.avatarIcon ? getIconPath(c.avatarIcon) : null);
                  return (
                    <button key={c.id}
                      onClick={() => { setCourseId(c.id); setCourseDropdownOpen(false); }}
                      style={{
                        width: '100%', padding: '10px 14px', border: 'none',
                        background: c.id === courseId ? 'rgba(39,174,96,0.06)' : '#fff',
                        fontSize: 14, color: '#1a1a2e', fontWeight: c.id === courseId ? 600 : 400,
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 10,
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                      }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        background: '#fafafa', border: c.id === courseId ? `1.5px solid ${GREEN}` : '1px solid rgba(0,0,0,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      }}>
                        {src
                          ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 14 }}>📚</span>}
                      </div>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                      {courseHasUnread(c.id) && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Contacts list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 13 }}>Загрузка...</div>
        ) : staff.length === 0 ? (
          <div style={{ ...glass, borderRadius: 14, padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#999' }}>
            Нет доступных контактов в этом курсе
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {staff.map(s => {
              const color = getRoleColor(s);
              const unread = unreadMap[`${courseId}_${s.user_id}`] || 0;
              return (
                <div key={s.user_id}
                  onClick={() => setChatUserId(s.user_id)}
                  style={{
                    ...glass, borderRadius: 14, padding: '12px 14px', cursor: 'pointer',
                    display: 'flex', gap: 12, alignItems: 'center',
                    border: unread > 0 ? `1.5px solid ${ORANGE}40` : undefined,
                  }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `${color}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 17, fontWeight: 700, color,
                    }}>
                      {(s.display_name || '?')[0].toUpperCase()}
                    </div>
                    {unread > 0 && (
                      <div style={{
                        position: 'absolute', top: -3, right: -3,
                        width: 12, height: 12, borderRadius: '50%',
                        background: ORANGE, border: '2px solid #fff',
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.display_name}
                      </span>
                      <span style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: `${color}15`, color, flexShrink: 0,
                      }}>
                        {getRoleLabel(s)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.email}
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: '#ccc', flexShrink: 0 }}>›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {chatUserId && (
        <ChatModal
          courseId={courseId}
          userId={user.id}
          otherUserId={chatUserId}
          otherName={staff.find(s => s.user_id === chatUserId)?.display_name || ''}
          onClose={() => setChatUserId(null)}
          onRead={() => {
            setUnreadMap(prev => {
              const next = { ...prev };
              delete next[`${courseId}_${chatUserId}`];
              return next;
            });
            if (onUnreadChange) onUnreadChange();
          }}
        />
      )}
    </Layout>
  );
}

/* ── Chat modal ── */
function ChatModal({ courseId, userId, otherUserId, otherName, onClose, onRead }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatRef = useRef(null);
  const shouldScrollRef = useRef(true);

  const loadMessages = useCallback(async () => {
    const msgs = await getConversation(courseId, otherUserId);
    setMessages(msgs);
    setLoading(false);
    await markMessagesRead(courseId, otherUserId);
    if (onRead) onRead();
  }, [courseId, otherUserId, onRead]);

  useEffect(() => { shouldScrollRef.current = true; loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (shouldScrollRef.current && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
      shouldScrollRef.current = false;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const result = await sendMessage(courseId, otherUserId, text.trim());
    setSending(false);
    if (result.success) {
      setText('');
      shouldScrollRef.current = true;
      await loadMessages();
    } else alert(result.error || 'Ошибка отправки');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, maxHeight: '85vh',
        background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 12px',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>💬 {otherName}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.05)',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div ref={chatRef} style={{
          flex: 1, overflowY: 'auto', minHeight: 200, maxHeight: '55vh',
          display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, padding: '4px 0',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 13 }}>Загрузка...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#bbb', fontSize: 13 }}>Нет сообщений</div>
          ) : (
            messages.map(m => {
              const isMine = m.sender_id === userId;
              return (
                <div key={m.id} style={{
                  alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMine ? '#1a1a2e' : 'rgba(0,0,0,0.04)',
                  color: isMine ? '#fff' : '#1a1a2e',
                  fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word',
                }}>
                  <div>{m.body}</div>
                  <div style={{ fontSize: 10, marginTop: 4, textAlign: 'right', color: isMine ? 'rgba(255,255,255,0.5)' : '#bbb' }}>
                    {new Date(m.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea value={text}
              onChange={e => { if (e.target.value.length <= 500) setText(e.target.value); }}
              onKeyDown={handleKeyDown} placeholder="Сообщение..." rows={2}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12,
                border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.02)',
                fontSize: 14, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none',
              }} />
            <span style={{ position: 'absolute', right: 10, bottom: 6, fontSize: 10, color: text.length > 450 ? ORANGE : '#ccc' }}>
              {text.length}/500
            </span>
          </div>
          <button onClick={handleSend} disabled={sending || !text.trim()}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none',
              background: '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: sending || !text.trim() ? 'default' : 'pointer',
              opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0, height: 44,
            }}>
            {sending ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
