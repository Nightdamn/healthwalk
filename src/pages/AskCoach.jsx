import React, { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { sendMessage, getConversation, markMessagesRead, getCourseStaff } from '../lib/db';

const GREEN = '#27ae60';
const BLUE = '#3498db';
const ORANGE = '#e67e22';
const OWNER_COLOR = '#8e44ad';

export default function AskCoachPage({ user, onBack, availableItems, activeItem, onUnreadChange }) {
  const courses = (availableItems || []).filter(i => i.type === 'course');
  const defaultCourseId = activeItem?.type === 'course' ? activeItem.id : (courses[0]?.id || null);

  const [courseId, setCourseId] = useState(defaultCourseId);
  const [staff, setStaff] = useState([]);
  const [recipientId, setRecipientId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  // Load staff when course changes
  useEffect(() => {
    if (!courseId) { setStaff([]); setRecipientId(null); return; }
    let cancelled = false;
    getCourseStaff(courseId).then(s => {
      if (cancelled) return;
      setStaff(s);
      setRecipientId(prev => {
        if (prev && s.some(st => st.user_id === prev)) return prev;
        return s[0]?.user_id || null;
      });
    });
    return () => { cancelled = true; };
  }, [courseId]);

  // Load conversation when recipient changes
  const loadConversation = useCallback(async () => {
    if (!courseId || !recipientId) { setMessages([]); return; }
    setLoading(true);
    const msgs = await getConversation(courseId, recipientId);
    setMessages(msgs);
    await markMessagesRead(courseId, recipientId);
    if (onUnreadChange) onUnreadChange();
    setLoading(false);
  }, [courseId, recipientId, onUnreadChange]);

  useEffect(() => { loadConversation(); }, [loadConversation]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !recipientId || !courseId) return;
    setSending(true);
    const result = await sendMessage(courseId, recipientId, text.trim());
    setSending(false);
    if (result.success) {
      setText('');
      await loadConversation();
    } else {
      alert(result.error || 'Ошибка отправки');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const courseName = courses.find(c => c.id === courseId)?.title || '';

  if (courses.length === 0) {
    return (
      <Layout>
        <div style={{ minHeight: '100vh', padding: '0 24px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingTop: 52, marginBottom: 28 }}>
            <button onClick={onBack} style={btnBack}>←</button>
            <h2 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Вопрос тренеру</h2>
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
      <div style={{ minHeight: '100vh', padding: '0 20px 20px', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingTop: 52, marginBottom: 16 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Вопрос тренеру</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Course selector */}
        <div style={{ marginBottom: 10 }}>
          <select value={courseId || ''} onChange={e => setCourseId(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
              fontSize: 14, color: '#1a1a2e', fontWeight: 500, cursor: 'pointer', outline: 'none',
            }}>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        {/* Recipient selector */}
        {staff.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <select value={recipientId || ''} onChange={e => setRecipientId(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
                fontSize: 14, color: '#1a1a2e', fontWeight: 500, cursor: 'pointer', outline: 'none',
              }}>
              {staff.map(s => (
                <option key={s.user_id} value={s.user_id}>
                  {s.display_name} — {s.is_owner ? 'Создатель' : s.role === 'trainer' ? 'Тренер' : 'Куратор'}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ ...glass, borderRadius: 12, padding: '16px', marginBottom: 12, textAlign: 'center', fontSize: 13, color: '#999' }}>
            В этом курсе нет доступных тренеров
          </div>
        )}

        {/* Chat history */}
        <div ref={chatRef} style={{
          ...glass, borderRadius: 16, padding: '12px', flex: 1, minHeight: 200, maxHeight: 'calc(100vh - 340px)',
          overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12,
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize: 13 }}>Загрузка...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#bbb', fontSize: 13 }}>
              Нет сообщений. Напишите первым!
            </div>
          ) : (
            messages.map(m => {
              const isMine = m.sender_id === user.id;
              return (
                <div key={m.id} style={{
                  alignSelf: isMine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMine ? '#1a1a2e' : 'rgba(0,0,0,0.04)',
                  color: isMine ? '#fff' : '#1a1a2e',
                  fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word',
                }}>
                  <div>{m.body}</div>
                  <div style={{
                    fontSize: 10, marginTop: 4, textAlign: 'right',
                    color: isMine ? 'rgba(255,255,255,0.5)' : '#bbb',
                  }}>
                    {new Date(m.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {!isMine && !m.is_read && <span style={{ color: ORANGE, marginLeft: 4, fontWeight: 700 }}>●</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input area */}
        {recipientId && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <textarea
                value={text}
                onChange={e => { if (e.target.value.length <= 500) setText(e.target.value); }}
                onKeyDown={handleKeyDown}
                placeholder="Ваш вопрос..."
                rows={2}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
                  fontSize: 14, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
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
        )}
      </div>
    </Layout>
  );
}
