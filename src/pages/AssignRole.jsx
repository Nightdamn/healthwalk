import TopBar from '../components/TopBar';
import React, { useState } from 'react';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { glass } from '../styles/shared';

const ROLES = [
  { value: 'student', label: 'Ученик' },
  { value: 'curator', label: 'Куратор' },
  { value: 'trainer', label: 'Тренер' },
  { value: 'admin', label: 'Админ' },
];

export default function AssignRolePage({ onBack, onAssign }) {
  const [email, setEmail] = useState('');
  // Роль по умолчанию не выбрана: раньше стоял «Ученик», и «Назначить» без
  // выбора молча понижало тренера.
  const [role, setRole] = useState('');
  const [status, setStatus] = useState(null); // { type: 'ok'|'err', msg }
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const missing = [!email.trim() && 'email', !role && 'роль'].filter(Boolean);
    if (missing.length) { setStatus({ type: 'err', msg: `Заполните: ${missing.join(', ')}` }); return; }
    setLoading(true); setStatus(null);
    const result = await onAssign(email.trim(), role);
    setLoading(false);
    if (result.success) {
      const label = ROLES.find(r => r.value === role).label;
      setStatus({ type: 'ok', msg: result.applied === 'now'
        ? `Роль «${label}» назначена для ${email}`
        : `Пользователь ${email} ещё не зарегистрирован — роль «${label}» применится при регистрации` });
      setEmail('');
      setRole('');
    } else {
      setStatus({ type: 'err', msg: result.error || 'Ошибка назначения роли' });
    }
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 20px", position: "relative", zIndex: 1 }}>
        <TopBar onBack={onBack} title="Назначить роль" />

        <div style={{ ...glass, borderRadius: 18, padding: "24px 20px" }}>
          {/* Email */}
          <label style={{ fontSize: 13, fontWeight: 600, color: "#888", marginBottom: 6, display: "block" }}>
            Email пользователя *
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
            Роль *
          </label>
          <div style={{ marginBottom: 24 }}>
            <Dropdown value={role} onChange={setRole} fullWidth fontSize={15}
              options={[{ value: '', label: 'Выберите роль' }, ...ROLES]} />
          </div>

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
