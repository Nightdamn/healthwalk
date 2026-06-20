import TopBar from '../components/TopBar';
import React from 'react';
import Layout from '../components/Layout';
import { glass } from '../styles/shared';

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
        <TopBar onBack={onBack} title="Рекомендации" />

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
