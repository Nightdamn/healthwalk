import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { getOwnCourses, inviteToCourse } from '../lib/db';

export default function InvitePage({ user, onBack }) {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
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

  const handleInvite = async () => {
    if (!email.trim()) { setStatus({ type: 'err', msg: 'Введите email' }); return; }
    if (!selectedCourse) { setStatus({ type: 'err', msg: 'Выберите курс' }); return; }
    setLoading(true); setStatus(null);
    const result = await inviteToCourse(selectedCourse, email.trim(), role, user.id);
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

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 20px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Пригласить
          </h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ ...glass, borderRadius: 18, padding: "24px 20px" }}>
          {loadingCourses ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 20 }}>Загрузка курсов...</div>
          ) : courses.length === 0 ? (
            <div style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
              Сначала создайте курс
            </div>
          ) : (
            <>
              {/* Course selector */}
              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
                Курс
              </label>
              <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>

              {/* Email */}
              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
                Email участника
              </label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com" style={inputStyle} />

              {/* Role in course */}
              <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
                Роль в курсе
              </label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}>
                <option value="student">Ученик</option>
                <option value="curator">Куратор</option>
              </select>

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
