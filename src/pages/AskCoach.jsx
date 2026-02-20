import React, { useState } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { submitQuestion } from '../lib/db';

export default function AskCoachPage({ user, onBack }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || !user?.id) return;
    setSending(true);
    const ok = await submitQuestion(user.id, text.trim());
    setSending(false);
    if (ok) {
      setSent(true);
      setText("");
    }
  };

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
          {sent && (
            <div style={{ padding: "12px 16px", marginBottom: 16, borderRadius: 12, background: "rgba(39,174,96,0.08)", color: "#27ae60", fontSize: 14, fontWeight: 500 }}>
              Вопрос отправлен! Ответ придёт в течение 24 часов.
            </div>
          )}
          <textarea
            placeholder="Ваш вопрос..."
            value={text}
            onChange={(e) => { setText(e.target.value); setSent(false); }}
            style={{
              width: "100%", minHeight: 120, padding: 16,
              border: "1.5px solid rgba(0,0,0,0.06)", borderRadius: 14,
              fontSize: 15, resize: "vertical", background: "rgba(255,255,255,0.5)",
              boxSizing: "border-box", fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            style={{
              width: "100%", marginTop: 16, padding: 15,
              background: "#1a1a2e", color: "#fff", border: "none",
              borderRadius: 14, fontSize: 15, fontWeight: 600,
              cursor: sending || !text.trim() ? "default" : "pointer",
              opacity: sending || !text.trim() ? 0.5 : 1,
            }}
          >
            {sending ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </div>
    </Layout>
  );
}
