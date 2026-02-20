import React from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';

export default function AskCoachPage({ onBack }) {
  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 28 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Вопрос тренеру</h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ ...glass, borderRadius: 20, padding: 24 }}>
          <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, margin: "0 0 20px" }}>
            Задайте вопрос тренеру и получите ответ в течение 24 часов
          </p>
          <textarea
            placeholder="Ваш вопрос..."
            style={{
              width: "100%",
              minHeight: 120,
              padding: 16,
              border: "1.5px solid rgba(0,0,0,0.06)",
              borderRadius: 14,
              fontSize: 15,
              resize: "vertical",
              background: "rgba(255,255,255,0.5)",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
          <button
            style={{
              width: "100%",
              marginTop: 16,
              padding: 15,
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Отправить
          </button>
        </div>
      </div>
    </Layout>
  );
}
