import React from 'react';
import Layout from '../components/Layout';
import { DAYS_TOTAL } from '../data/constants';
import { btnBack, glass } from '../styles/shared';

export default function ProfilePage({ user, currentDay, progress, onBack }) {
  const completedDays = Object.keys(progress).filter((d) => {
    const day = progress[d];
    return day.warmup && day.standing && day.sitting && day.walking;
  }).length;

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 28 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Профиль</h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ ...glass, borderRadius: 20, padding: 28 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)",
              margin: "0 auto 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
              color: "#1a1a2e",
            }}
          >
            {user?.name?.charAt(0)}
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>{user?.name}</div>
            <div style={{ fontSize: 14, color: "#888" }}>{user?.email}</div>
            <div style={{ marginTop: 20, padding: 14, background: "rgba(0,0,0,0.02)", borderRadius: 12, fontSize: 14, color: "#555" }}>
              День {currentDay} из {DAYS_TOTAL} • Завершено дней: {completedDays}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
