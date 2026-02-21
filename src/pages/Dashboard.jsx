import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { LogoFull, activityIcons } from '../components/Icons';
import { DAYS_TOTAL, ACTIVITIES, MOTTOS, DAY_START_HOUR, isDayComplete } from '../data/constants';
import { glass } from '../styles/shared';

/** Get the calendar date for the current course day (respecting 5AM boundary) */
function getCurrentDayDate() {
  const now = new Date();
  // If before 5AM, the "logical day" is still yesterday
  if (now.getHours() < DAY_START_HOUR) {
    now.setDate(now.getDate() - 1);
  }
  return now;
}

/** Format date as "Понедельник, 21 февраля" */
function formatDayDate(date) {
  const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  const wd = weekdays[date.getDay()];
  const d = date.getDate();
  const m = months[date.getMonth()];
  return `${wd}, ${d} ${m}`;
}

export default function Dashboard({ user, currentDay, progress, elapsedTime, onStartTimer, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const daysRowRef = useRef(null);

  // Scroll day circles to current
  useEffect(() => {
    if (daysRowRef.current) {
      const el = daysRowRef.current;
      const dot = el.children[currentDay - 1];
      if (dot) {
        const scrollLeft = dot.offsetLeft - el.clientWidth / 2 + dot.clientWidth / 2;
        el.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [currentDay]);

  const todayProgress = progress[currentDay] || {};
  const completedCount = ACTIVITIES.filter((a) => todayProgress[a.id]).length;
  const completedDays = Object.keys(progress).filter((d) => isDayComplete(progress[d])).length;

  // Precise day progress: sum of elapsed seconds / total seconds
  const totalSecDay = ACTIVITIES.reduce((s, a) => s + a.duration * 60, 0);
  const elapsedSecDay = ACTIVITIES.reduce((s, a) => {
    if (todayProgress[a.id]) return s + a.duration * 60; // completed = full
    return s + (elapsedTime[a.id] || 0);
  }, 0);
  const dayPct = totalSecDay > 0 ? (elapsedSecDay / totalSecDay) * 100 : 0;

  const dayDate = getCurrentDayDate();
  const motto = MOTTOS[(currentDay - 1) % MOTTOS.length] || MOTTOS[0];

  return (
    <Layout>
      {/* Menu overlay */}
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.15)", zIndex: 100, backdropFilter: "blur(4px)" }} />
      )}

      {/* Slide menu */}
      <div style={{
        position: "fixed", top: 0, right: menuOpen ? 0 : -280, width: 270, height: "100%",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
        zIndex: 101, transition: "right 0.35s cubic-bezier(0.4,0,0.2,1)",
        padding: "60px 24px 40px", boxShadow: menuOpen ? "-8px 0 40px rgba(0,0,0,0.08)" : "none",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 36, paddingBottom: 24, borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {user?.avatar ? (
            <img src={user.avatar} alt="" referrerPolicy="no-referrer"
              style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>
              {user?.name?.charAt(0)}
            </div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: "#999" }}>День {currentDay} из {DAYS_TOTAL}</div>
          </div>
        </div>
        {[
          { label: "Профиль", icon: "👤", target: "profile" },
          { label: "Детали прогресса", icon: "📊", target: "details" },
          { label: "Рекомендации", icon: "💡", target: "recommendations" },
          { label: "Вопрос тренеру", icon: "💬", target: "ask" },
        ].map((item) => (
          <button key={item.target} onClick={() => { setMenuOpen(false); onNavigate(item.target); }}
            style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 16px", border: "none", background: "transparent", borderRadius: 12, fontSize: 15, fontWeight: 500, color: "#1a1a2e", cursor: "pointer", textAlign: "left", marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>{item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 20, borderTop: "1px solid rgba(0,0,0,0.04)", opacity: 0.5 }}>
          <LogoFull height={36} />
        </div>
      </div>

      {/* ════════════════ MAIN CONTENT ════════════════ */}
      <div style={{ minHeight: "100vh", padding: "0 20px 32px", position: "relative", zIndex: 1 }}>

        {/* ── Header: name + burger ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 52, marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>
            {user?.name}
          </div>
          <button onClick={() => setMenuOpen(true)}
            style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 14, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
          </button>
        </div>

        {/* ── 1. Прогресс курса — day circles + Детали button ── */}
        <div style={{ ...glass, borderRadius: 18, padding: "16px 0", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Прогресс курса
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#aaa", fontWeight: 500 }}>
                {completedDays}/{DAYS_TOTAL}
              </span>
              <button
                onClick={() => onNavigate("details")}
                style={{
                  padding: "6px 14px", background: "#1a1a2e", color: "#fff",
                  border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Детали
              </button>
            </div>
          </div>
          <div
            ref={daysRowRef}
            style={{
              display: "flex", gap: 8, padding: "0 20px",
              overflowX: "auto", scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
            {Array.from({ length: DAYS_TOTAL }, (_, i) => {
              const day = i + 1;
              const complete = isDayComplete(progress[day]);
              const isCurrent = day === currentDay;
              const isFuture = day > currentDay;
              return (
                <div key={day} style={{
                  width: 32, height: 32, minWidth: 32, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600, transition: "all 0.2s", cursor: "default",
                  ...(isCurrent ? {
                    background: "#1a1a2e", color: "#fff",
                    boxShadow: "0 2px 8px rgba(26,26,46,0.25)",
                  } : complete ? {
                    background: "rgba(0,0,0,0.08)", color: "#888",
                  } : {
                    background: isFuture ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.6)",
                    color: isFuture ? "#ccc" : "#aaa",
                    border: "1.5px solid rgba(0,0,0,0.06)",
                  }),
                }}>
                  {complete ? "✓" : day}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 2. День X + дата + прогресс бар ── */}
        <div style={{ ...glass, borderRadius: 18, padding: "18px 20px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e" }}>
                День {currentDay}
              </div>
              <div style={{ fontSize: 13, color: "#999", fontWeight: 500, marginTop: 2 }}>
                {formatDayDate(dayDate)}
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#888", fontWeight: 500, paddingTop: 4 }}>
              {completedCount} из {ACTIVITIES.length}
            </div>
          </div>
          {/* Precise day progress bar */}
          <div style={{ height: 8, background: "rgba(0,0,0,0.04)", borderRadius: 4, overflow: "hidden", marginTop: 14, marginBottom: 8 }}>
            <div style={{
              height: "100%",
              width: `${dayPct}%`,
              background: dayPct >= 100
                ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                : "linear-gradient(90deg, #1a1a2e, #3a3a5e)",
              borderRadius: 4,
              transition: "width 0.3s linear",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>
            {dayPct >= 100
              ? "Все практики выполнены ✨"
              : `${Math.floor(elapsedSecDay / 60)} из ${Math.floor(totalSecDay / 60)} минут`
            }
          </div>
        </div>

        {/* ── 3. Девиз дня ── */}
        <div style={{
          ...glass,
          background: "rgba(255,255,255,0.5)",
          borderRadius: 14, padding: "14px 20px", marginBottom: 20,
          textAlign: "center",
        }}>
          <span style={{ fontSize: 13, color: "#888", fontWeight: 500, fontStyle: "italic" }}>
            «{motto}»
          </span>
        </div>

        {/* ── 4. Activity cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ACTIVITIES.map((act) => {
            const done = todayProgress[act.id];
            const IconComp = activityIcons[act.id];
            const elapsedSec = done ? act.duration * 60 : (elapsedTime[act.id] || 0);
            const totalSec = act.duration * 60;
            // Precise percentage based on seconds
            const pct = totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;
            const elapsedMin = Math.floor(elapsedSec / 60);
            const elapsedRemSec = elapsedSec % 60;

            return (
              <div key={act.id} style={{
                ...glass,
                background: done ? "rgba(26,26,46,0.04)" : "rgba(255,255,255,0.65)",
                borderRadius: 18, padding: "18px 20px",
                border: done ? "1px solid rgba(26,26,46,0.08)" : "1px solid rgba(255,255,255,0.7)",
                transition: "all 0.3s",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 14,
                      background: done ? "rgba(26,26,46,0.08)" : "rgba(0,0,0,0.03)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#1a1a2e",
                    }}>
                      <IconComp size={32} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{act.label}</div>
                      <div style={{ fontSize: 12, color: "#999", fontWeight: 500, marginTop: 2 }}>{act.duration} минут</div>
                    </div>
                  </div>
                  {done ? (
                    <div style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: "#1a1a2e", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16,
                    }}>✓</div>
                  ) : (
                    <button onClick={() => onStartTimer(act)}
                      style={{
                        padding: "10px 22px", background: "#1a1a2e", color: "#fff",
                        border: "none", borderRadius: 12, fontSize: 13, fontWeight: 600,
                        cursor: "pointer", boxShadow: "0 3px 10px rgba(26,26,46,0.15)",
                      }}>
                      {elapsedSec > 0 ? "Продолжить" : "Начать"}
                    </button>
                  )}
                </div>
                {/* Precise activity progress bar */}
                <div style={{ height: 4, background: "rgba(0,0,0,0.04)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: done
                      ? "linear-gradient(90deg, #27ae60, #2ecc71)"
                      : "linear-gradient(90deg, #1a1a2e, #4a4a6e)",
                    borderRadius: 2, transition: "width 0.3s linear",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 6, fontWeight: 500 }}>
                  {done
                    ? `${act.duration} из ${act.duration} мин • Выполнено`
                    : elapsedSec > 0
                      ? `${elapsedMin}:${String(elapsedRemSec).padStart(2, '0')} из ${act.duration} мин`
                      : `0 из ${act.duration} мин`
                  }
                </div>
              </div>
            );
          })}
        </div>

        <Footer />
      </div>
    </Layout>
  );
}
