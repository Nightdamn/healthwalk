import React, { useState } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { createCourse } from '../lib/db';

export default function CreateCoursePage({ user, onBack, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) { setError('Введите название курса'); return; }
    setLoading(true); setError('');
    const course = await createCourse(user.id, title.trim(), description.trim(), daysCount);
    setLoading(false);
    if (course) {
      onCreated(course);
    } else {
      setError('Не удалось создать курс');
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
            Создать курс
          </h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ ...glass, borderRadius: 18, padding: "24px 20px" }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Название курса
          </label>
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Осознанная походка 2.0"
            style={inputStyle}
          />

          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Описание
          </label>
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Краткое описание курса..."
            rows={3}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />

          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Количество дней
          </label>
          <input
            type="number" value={daysCount} min={1} max={365}
            onChange={(e) => setDaysCount(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
            style={inputStyle}
          />

          <div style={{ fontSize: 12, color: "#aaa", marginBottom: 20 }}>
            После создания вы сможете добавить активности и пригласить участников
          </div>

          <button
            onClick={handleCreate} disabled={loading}
            style={{
              width: "100%", padding: "16px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600,
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Создание..." : "Создать курс"}
          </button>

          {error && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(231,76,60,0.1)", color: "#e74c3c", fontSize: 14 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
