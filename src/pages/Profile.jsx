import React, { useState } from 'react';
import Layout from '../components/Layout';
import { DAYS_TOTAL, isDayComplete } from '../data/constants';
import { btnBack, glass } from '../styles/shared';

const TIMEZONES = [
  { label: "UTC−12 Бейкер", offset: -720 },
  { label: "UTC−11 Ниуэ", offset: -660 },
  { label: "UTC−10 Гавайи", offset: -600 },
  { label: "UTC−9 Аляска", offset: -540 },
  { label: "UTC−8 Лос-Анджелес", offset: -480 },
  { label: "UTC−7 Денвер", offset: -420 },
  { label: "UTC−6 Чикаго", offset: -360 },
  { label: "UTC−5 Нью-Йорк", offset: -300 },
  { label: "UTC−4 Галифакс", offset: -240 },
  { label: "UTC−3 Сан-Паулу", offset: -180 },
  { label: "UTC−2", offset: -120 },
  { label: "UTC−1 Азорские о-ва", offset: -60 },
  { label: "UTC+0 Лондон", offset: 0 },
  { label: "UTC+1 Берлин", offset: 60 },
  { label: "UTC+2 Киев, Калининград", offset: 120 },
  { label: "UTC+3 Москва, Минск", offset: 180 },
  { label: "UTC+4 Самара, Дубай", offset: 240 },
  { label: "UTC+5 Екатеринбург", offset: 300 },
  { label: "UTC+6 Омск, Алматы", offset: 360 },
  { label: "UTC+7 Красноярск, Бангкок", offset: 420 },
  { label: "UTC+8 Иркутск, Сингапур", offset: 480 },
  { label: "UTC+9 Якутск, Токио", offset: 540 },
  { label: "UTC+10 Владивосток", offset: 600 },
  { label: "UTC+11 Магадан", offset: 660 },
  { label: "UTC+12 Камчатка", offset: 720 },
];

export default function ProfilePage({ user, currentDay, progress, tzOffsetMin, onSetTimezone, onBack, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const completedDays = Object.keys(progress).filter((d) => isDayComplete(progress[d])).length;

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await onLogout(); } catch (e) { setLoggingOut(false); }
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 24px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 28 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Профиль</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* User card */}
        <div style={{ ...glass, borderRadius: 20, padding: 28 }}>
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} referrerPolicy="no-referrer"
              style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", display: "block", margin: "0 auto 16px", border: "3px solid rgba(255,255,255,0.8)", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)", margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700, color: "#1a1a2e" }}>
              {user?.name?.charAt(0)}
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{user?.name}</div>
            <div style={{ fontSize: 14, color: "#888" }}>{user?.email}</div>
            <div style={{ marginTop: 20, padding: 14, background: "rgba(0,0,0,0.02)", borderRadius: 12, fontSize: 14, color: "#555" }}>
              День {currentDay} из {DAYS_TOTAL} • Завершено дней: {completedDays}
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div style={{ ...glass, borderRadius: 16, padding: "18px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>
            Часовой пояс
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 12, lineHeight: 1.4 }}>
            День начинается в 5:00 и заканчивается в 5:00 следующего дня
          </div>
          <select
            value={tzOffsetMin}
            onChange={(e) => onSetTimezone(Number(e.target.value))}
            style={{
              width: "100%", padding: "12px 14px",
              border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: 12,
              fontSize: 14, background: "rgba(255,255,255,0.6)",
              color: "#1a1a2e", cursor: "pointer",
              appearance: "auto", boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.offset} value={tz.offset}>{tz.label}</option>
            ))}
          </select>
        </div>

        {/* Logout */}
        <button onClick={handleLogout} disabled={loggingOut}
          style={{
            width: "100%", marginTop: 20, padding: 16,
            background: "rgba(255,255,255,0.6)", backdropFilter: "blur(16px)",
            border: "1.5px solid rgba(200,60,60,0.15)", borderRadius: 16,
            fontSize: 15, fontWeight: 600, color: "#c0392b",
            cursor: loggingOut ? "wait" : "pointer",
            opacity: loggingOut ? 0.6 : 1,
          }}>
          {loggingOut ? "Выход..." : "Выйти из аккаунта"}
        </button>
      </div>
    </Layout>
  );
}
