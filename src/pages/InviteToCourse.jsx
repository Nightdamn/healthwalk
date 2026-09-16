import TopBar from '../components/TopBar';
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { glass } from '../styles/shared';
import Dropdown from '../components/Dropdown';
import { getOwnCourses, inviteToCourse } from '../lib/db';
import { getGroups } from '../lib/api';

export default function InvitePage({ user, onBack }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadingCourses, setLoadingCourses] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    getOwnCourses(user.id).then((c) => {
      setCourses(c);
      if (c.length > 0) setSelectedCourse(c[0].id);
      setLoadingCourses(false);
    });
  }, [user?.id]);

  // v29: при смене курса — подгрузить его группы (если groups_enabled).
  useEffect(() => {
    if (!selectedCourse) { setGroups([]); setGroupId(''); return; }
    const c = courses.find(x => x.id === selectedCourse);
    if (!c?.groups_enabled) { setGroups([]); setGroupId(''); return; }
    getGroups(selectedCourse).then(rows => {
      setGroups(Array.isArray(rows) ? rows : []);
      setGroupId('');
    }).catch(() => setGroups([]));
  }, [selectedCourse, courses]);

  const handleInvite = async () => {
    if (!email.trim()) { setStatus({ type: 'err', msg: 'Введите email' }); return; }
    if (!selectedCourse) { setStatus({ type: 'err', msg: 'Выберите курс' }); return; }
    setLoading(true); setStatus(null);
    const result = await inviteToCourse(selectedCourse, email.trim(), role, user.id, groupId || null);
    setLoading(false);
    if (result.success) {
      setStatus({ type: 'ok', msg: `Приглашение отправлено на ${email}` });
      setEmail('');
    } else {
      setStatus({ type: 'err', msg: result.error || 'Ошибка приглашения' });
    }
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", borderRadius: 12,
    border: "1.5px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.7)",
    fontSize: 15, color: "#1a1a2e", outline: "none", marginBottom: 20,
    boxSizing: "border-box",
  };

  const courseOptions = courses.map(c => ({ value: c.id, label: c.title }));
  const roleOptions = [
    { value: 'student', label: 'Ученик' },
    { value: 'curator', label: 'Куратор' },
    { value: 'trainer', label: 'Тренер' },
  ];
  const groupOptions = [{ value: '', label: '— без группы (по курс-настройкам) —' },
    ...groups.map(g => ({ value: g.id, label: g.name + (g.members_count ? ` · ${g.members_count} чел.` : '') }))];

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 20px", position: "relative", zIndex: 1 }}>
        <TopBar onBack={onBack} title="Пригласить" />

        <div style={{ ...glass, borderRadius: 18, padding: "24px 20px" }}>
          {loadingCourses ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 20 }}>Загрузка курсов...</div>
          ) : courses.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
              Сначала создайте курс
            </div>
          ) : (
            <>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>Курс</label>
              <div style={{ marginBottom: 16 }}>
                <Dropdown value={selectedCourse} onChange={setSelectedCourse} options={courseOptions} fullWidth />
              </div>

              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>Email участника</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com" style={inputStyle} />

              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>Роль в курсе</label>
              <div style={{ marginBottom: 16 }}>
                <Dropdown value={role} onChange={setRole} options={roleOptions} fullWidth />
              </div>

              {/* v29: селектор группы — только если у курса groups_enabled */}
              {groups.length > 0 && role === 'student' && (
                <>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>Группа</label>
                  <div style={{ marginBottom: 20 }}>
                    <Dropdown value={groupId} onChange={setGroupId} options={groupOptions} fullWidth />
                  </div>
                </>
              )}

              <button onClick={handleInvite} disabled={loading}
                style={{
                  width: "100%", padding: "16px", background: "#1a1a2e", color: "#fff",
                  border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600,
                  cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
                }}>
                {loading ? "Отправка..." : "Пригласить"}
              </button>

              {status && (
                <div style={{
                  marginTop: 16, padding: "12px 16px", borderRadius: 12,
                  background: status.type === 'ok' ? "rgba(39,174,96,0.1)" : "rgba(231,76,60,0.1)",
                  color: status.type === 'ok' ? "#27ae60" : "#e74c3c",
                  fontSize: 14, fontWeight: 500,
                }}>
                  {status.msg}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
