import React from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';

const tips = [
  { t: "Начинайте утро с разминки", d: "Лучшее время — через 30 минут после пробуждения" },
  { t: "Следите за дыханием", d: "Дышите ровно и глубоко во время практик" },
  { t: "Не торопитесь", d: "Качество важнее скорости" },
  { t: "Практикуйте каждый день", d: "Регулярность — ключ к результату" },
  { t: "Выбирайте удобную обувь", d: "Или практикуйте босиком на ровной поверхности" },
];

export default function RecommendationsPage({ onBack }) {
  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 24px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", position: 'fixed', top: 'var(--vv-top, 0px)', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 28 }}>
          <button onClick={onBack} style={btnBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>Рекомендации</h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tips.map((r, i) => (
            <div key={i} style={{ ...glass, borderRadius: 16, padding: "18px 20px" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", marginBottom: 4 }}>{r.t}</div>
              <div style={{ fontSize: 13, color: "#888", lineHeight: 1.4 }}>{r.d}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
