import React, { useState } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';

const ROLES = [
  { value: 'student', label: 'Ученик' },
  { value: 'curator', label: 'Куратор' },
  { value: 'trainer', label: 'Тренер' },
  { value: 'admin', label: 'Админ' },
];

export default function AssignRolePage({ onBack, onAssign }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', msg }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) { setStatus({ type: 'err', msg: 'Введите email' }); return; }
    setLoading(true); setStatus(null);
    const result = await onAssign(email.trim(), role);
    setLoading(false);
    if (result.success) {
      setStatus({ type: 'ok', msg: `Роль «${ROLES.find(r => r.value === role).label}» назначена для ${email}` });
      setEmail('');
    } else {
      setStatus({ type: 'err', msg: result.error || 'Ошибка назначения роли' });
    }
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 20px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Назначить роль
          </h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ ...glass, borderRadius: 18, padding: "24px 20px" }}>
          {/* Email */}
          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Email пользователя
          </label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "1.5px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.7)",
              fontSize: 15, color: "#1a1a2e", outline: "none", marginBottom: 20,
              boxSizing: "border-box",
            }}
          />

          {/* Role selector */}
          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Роль
          </label>
          <select
            value={role} onChange={(e) => setRole(e.target.value)}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              border: "1.5px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.7)",
              fontSize: 15, color: "#1a1a2e", outline: "none", marginBottom: 24,
              boxSizing: "border-box", appearance: "auto",
            }}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>

          {/* Submit */}
          <button
            onClick={handleSubmit} disabled={loading}
            style={{
              width: "100%", padding: "16px", background: "#1a1a2e", color: "#fff",
              border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600,
              cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Назначение..." : "Назначить"}
          </button>

          {/* Status */}
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
        </div>
      </div>
    </Layout>
  );
}
