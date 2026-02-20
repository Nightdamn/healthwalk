import React from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { activityIcons } from '../components/Icons';
import { DAYS_TOTAL, ACTIVITIES } from '../data/constants';
import { btnBack, glass } from '../styles/shared';

export default function DetailsPage({ progress, currentDay, onBack }) {
  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 20px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Детали прогресса
          </h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 28, fontSize: 15, color: "#666", fontWeight: 500 }}>
          Сейчас самое время сделать первый шаг
        </div>

        {/* 4 grids */}
        {ACTIVITIES.map((act) => {
          const IconComp = activityIcons[act.id];
          return (
            <div key={act.id} style={{ ...glass, borderRadius: 18, padding: "18px 20px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, color: "#1a1a2e" }}>
                <IconComp />
                <span style={{ fontSize: 16, fontWeight: 600 }}>{act.label} {act.duration} минут</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {Array.from({ length: DAYS_TOTAL }, (_, i) => {
                  const day = i + 1;
                  const done = progress[day]?.[act.id];
                  const isToday = day === currentDay;
                  return (
                    <div
                      key={day}
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        borderRadius: "50%",
                        border: isToday ? "2px solid #1a1a2e" : done ? "2px solid #1a1a2e" : "1.5px solid rgba(0,0,0,0.1)",
                        background: done ? "#1a1a2e" : isToday ? "rgba(26,26,46,0.06)" : "rgba(255,255,255,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        color: done ? "#fff" : "#999",
                        fontWeight: 600,
                        transition: "all 0.2s",
                      }}
                    >
                      {done ? "✓" : day}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Footer />
      </div>
    </Layout>
  );
}
