import React, { useState } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { LogoFull, activityIcons } from '../components/Icons';
import { DAYS_TOTAL, MOTTOS, ACTIVITIES } from '../data/constants';
import { glass, glassLight } from '../styles/shared';

export default function Dashboard({ user, currentDay, setCurrentDay, progress, elapsedTime, onStartTimer, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const completedToday = progress[currentDay]
    ? Object.values(progress[currentDay]).filter(Boolean).length
    : 0;

  const completedDays = Object.keys(progress).filter((d) => {
    const day = progress[d];
    return day.warmup && day.standing && day.sitting && day.walking;
  }).length;

  return (
    <Layout>
      {/* Menu overlay */}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.15)",
            zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
        />
      )}

      {/* Slide menu */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: menuOpen ? 0 : -280,
          width: 270,
          height: "100%",
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          zIndex: 101,
          transition: "right 0.35s cubic-bezier(0.4,0,0.2,1)",
          padding: "60px 24px 40px",
          boxShadow: menuOpen ? "-8px 0 40px rgba(0,0,0,0.08)" : "none",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36, paddingBottom: 24, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt=""
              referrerPolicy="no-referrer"
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                fontWeight: 700,
                color: "#1a1a2e",
              }}
            >
              {user?.name?.charAt(0)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: "#999" }}>День {currentDay}</div>
          </div>
        </div>

        {[
          { label: "Профиль", icon: "👤", target: "profile" },
          { label: "Рекомендации", icon: "💡", target: "recommendations" },
          { label: "Вопрос тренеру", icon: "💬", target: "ask" },
        ].map((item) => (
          <button
            key={item.target}
            onClick={() => { setMenuOpen(false); onNavigate(item.target); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: "100%",
              padding: "14px 16px",
              border: "none",
              background: "transparent",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 500,
              color: "#1a1a2e",
              cursor: "pointer",
              textAlign: "left",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.04)", opacity: 0.5 }}>
          <LogoFull height={36} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ minHeight: "100vh", padding: "0 20px 32px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 52, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 14, color: "#aaa", fontWeight: 500, marginBottom: 2 }}>Добро пожаловать</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a2e" }}>Привет, {user?.name}</div>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.6)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 14, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
          </button>
        </div>

        {/* Progress card */}
        <div style={{ ...glass, borderRadius: 22, padding: "22px 22px 20px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                Текущий прогресс
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#1a1a2e" }}>День {currentDay}</div>
            </div>
            <button
              onClick={() => onNavigate("details")}
              style={{
                padding: "10px 20px",
                background: "#1a1a2e",
                color: "#fff",
                border: "none",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(26,26,46,0.15)",
              }}
            >
              Детали
            </button>
          </div>
          <div style={{ height: 8, background: "rgba(0,0,0,0.04)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
            <div
              style={{
                height: "100%",
                width: `${(currentDay / DAYS_TOTAL) * 100}%`,
                background: "linear-gradient(90deg, #1a1a2e, #3a3a5e)",
                borderRadius: 4,
                transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#aaa", fontWeight: 500 }}>
            <span>{completedDays} дней завершено</span>
            <span>{DAYS_TOTAL} дней</span>
          </div>
        </div>

        {/* Motto */}
        <div style={{ ...glassLight, borderRadius: 14, padding: "14px 20px", marginBottom: 24, textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#888", fontWeight: 500, fontStyle: "italic" }}>
            «{MOTTOS[currentDay - 1] || MOTTOS[0]}»
          </span>
        </div>

        {/* Day dots */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", marginBottom: 28, padding: "0 4px" }}>
          {Array.from({ length: DAYS_TOTAL }, (_, i) => {
            const day = i + 1;
            const p = progress[day];
            const isComplete = p && p.warmup && p.standing && p.sitting && p.walking;
            const isCurrent = day === currentDay;
            return (
              <div
                key={day}
                onClick={() => setCurrentDay(day)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: isCurrent ? "2px solid #1a1a2e" : isComplete ? "2px solid #1a1a2e" : "1.5px solid rgba(0,0,0,0.08)",
                  background: isComplete ? "#1a1a2e" : isCurrent ? "rgba(26,26,46,0.08)" : "rgba(255,255,255,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontWeight: 600,
                  color: isComplete ? "#fff" : "#999",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                {isComplete ? "✓" : day}
              </div>
            );
          })}
        </div>

        {/* Activity cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ACTIVITIES.map((act) => {
            const done = progress[currentDay]?.[act.id];
            const IconComp = activityIcons[act.id];
            const elapsedSec = elapsedTime[act.id] || 0;
            const elapsedMin = Math.floor(elapsedSec / 60);
            const totalMin = act.duration;
            const pct = done ? 100 : Math.round((elapsedSec / (totalMin * 60)) * 100);

            return (
              <div
                key={act.id}
                style={{
                  ...glass,
                  background: done ? "rgba(26,26,46,0.04)" : "rgba(255,255,255,0.65)",
                  borderRadius: 18,
                  padding: "18px 20px",
                  border: done ? "1px solid rgba(26,26,46,0.08)" : "1px solid rgba(255,255,255,0.7)",
                  transition: "all 0.3s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: done ? "rgba(26,26,46,0.08)" : "rgba(0,0,0,0.03)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#1a1a2e",
                      }}
                    >
                      <IconComp />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{act.label}</div>
                      <div style={{ fontSize: 12, color: "#999", fontWeight: 500, marginTop: 1 }}>{act.duration} минут</div>
                    </div>
                  </div>
                  {done ? (
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1a1a2e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                      ✓
                    </div>
                  ) : (
                    <button
                      onClick={() => onStartTimer(act)}
                      style={{
                        padding: "10px 22px",
                        background: "#1a1a2e",
                        color: "#fff",
                        border: "none",
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 3px 10px rgba(26,26,46,0.15)",
                      }}
                    >
                      Начать
                    </button>
                  )}
                </div>
                <div style={{ height: 4, background: "rgba(0,0,0,0.04)", borderRadius: 2, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      background: "linear-gradient(90deg, #1a1a2e, #4a4a6e)",
                      borderRadius: 2,
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 6, fontWeight: 500 }}>
                  {done ? `${totalMin} из ${totalMin} минут • Выполнено ✓` : `${elapsedMin} из ${totalMin} минут`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Today summary */}
        <div style={{ ...glassLight, marginTop: 20, borderRadius: 16, padding: "16px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>
            Сегодня выполнено {completedToday} из 4 практик
          </div>
          {completedToday === 4 && (
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "#1a1a2e" }}>
              Все практики завершены! Отличная работа ✨
            </div>
          )}
        </div>

        <Footer />
      </div>
    </Layout>
  );
}
