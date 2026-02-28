import React, { useState } from 'react';
import Layout from '../components/Layout';
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

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const fmtH = (h) => `${String(h).padStart(2, "0")}:00`;

const selectStyle = {
  width: "100%", padding: "12px 14px",
  border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: 12,
  fontSize: 14, background: "rgba(255,255,255,0.6)",
  color: "#1a1a2e", cursor: "pointer",
  appearance: "auto", boxSizing: "border-box",
  fontFamily: "inherit",
};

export default function ProfilePage({ user, currentDay, progress, tzOffsetMin, dayStartHour, onSetTimezone, onSetDayStartHour, onBack, onLogout, activeItem }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const daysTotal = activeItem?.daysCount || 30;
  const activities = activeItem?.activities || [];
  const isDayDone = (day) => {
    const dp = progress[day] || {};
    const acts = activities.filter(a => day >= a.firstDay && day <= a.lastDay);
    return acts.length > 0 && acts.every(a => dp[a.id]);
  };
  const completedDays = Array.from({ length: daysTotal }, (_, i) => i + 1).filter(d => isDayDone(d)).length;

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await onLogout(); } catch (e) { setLoggingOut(false); }
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 24px 40px", position: "relative", zIndex: 1 }}>
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
              День {currentDay} из {daysTotal} • Завершено: {completedDays}
            </div>
          </div>
        </div>

        {/* ─── Биоритм ─── */}
        <div style={{ ...glass, borderRadius: 16, padding: "20px 20px", marginTop: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
            Биоритм
          </div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 16, lineHeight: 1.5 }}>
            Настройте границы вашего дня. Прогресс практик считается от начала до конца дня.
          </div>

          {/* Day start hour */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>
              День начинается в
            </div>
            <select
              value={dayStartHour}
              onChange={(e) => onSetDayStartHour(Number(e.target.value))}
              style={selectStyle}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{fmtH(h)}</option>
              ))}
            </select>
          </div>

          {/* Summary */}
          <div style={{
            padding: "12px 16px", borderRadius: 12,
            background: "rgba(26,26,46,0.03)",
            fontSize: 13, color: "#666", lineHeight: 1.5,
          }}>
            День начинается в <strong>{fmtH(dayStartHour)}</strong> и заканчивается в <strong>{fmtH(dayStartHour)}</strong> следующего дня
          </div>
        </div>

        {/* ─── Часовой пояс ─── */}
        <div style={{ ...glass, borderRadius: 16, padding: "18px 20px", marginTop: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", marginBottom: 10 }}>
            Часовой пояс
          </div>
          <select
            value={tzOffsetMin}
            onChange={(e) => onSetTimezone(Number(e.target.value))}
            style={selectStyle}
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
