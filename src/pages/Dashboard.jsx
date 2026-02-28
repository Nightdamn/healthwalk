import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { LogoFull, activityIcons } from '../components/Icons';
import { DAYS_TOTAL, ACTIVITIES, MOTTOS, isDayComplete } from '../data/constants';
import { glass } from '../styles/shared';

const WEEKDAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function formatDayDate(d) { return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_G[d.getMonth()]}`; }
function getCurrentDayDate(h) { const n = new Date(); if (n.getHours() < h) n.setDate(n.getDate() - 1); return n; }
function getDateForDay(day, cur, h) { const t = getCurrentDayDate(h); t.setDate(t.getDate() + (day - cur)); return t; }
function getDayTimePct(h) {
  const n = new Date(); let hr = n.getHours() - h + n.getMinutes() / 60 + n.getSeconds() / 3600;
  if (hr < 0) hr += 24; return Math.min((hr / 24) * 100, 100);
}

const TOTAL_PRACTICE_SEC = ACTIVITIES.reduce((s, a) => s + a.duration * 60, 0);

// ─── SVG Day Circle ───
const SZ = 32;
const CX = SZ / 2;
const CY = SZ / 2;
const R = 12;
const CIRC = 2 * Math.PI * R;
const GREEN = "#27ae60";
const IR = R - 1.5; // inner fill radius

/**
 * Water-level fill: green from bottom to top, height = practicePct * diameter.
 * Uses clipPath to mask a rect to the circle.
 * Arc starts at 9 o'clock (left side), time-based; allDone forces 100%.
 * Day number always black.
 */
function DayCircle({ day, timePct, allDone, practicePct, isPast, isCurrent, isFuture, uid }) {
  let arcPct = 0;
  if (isFuture) arcPct = 0;
  else if (allDone || isPast) arcPct = 100;
  else if (isCurrent) arcPct = Math.min(timePct, 100);

  const offset = CIRC - (arcPct / 100) * CIRC;
  const frac = Math.min(Math.max(practicePct, 0), 1);

  // Water level: rect from bottom of circle, height proportional to frac
  const diam = IR * 2;
  const fillH = frac * diam;
  const fillY = (CY + IR) - fillH; // top edge of the water

  const clipId = `clip-${uid}-${day}`;

  return (
    <svg width={SZ} height={SZ} style={{ display: "block", overflow: "visible", flexShrink: 0 }}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={CX} cy={CY} r={IR} />
        </clipPath>
      </defs>

      {/* Water-level green fill (clipped to circle) */}
      {frac > 0 && (
        <rect
          x={CX - IR} y={fillY} width={diam} height={fillH}
          fill={GREEN} opacity={0.25}
          clipPath={`url(#${clipId})`}
          style={{ transition: "y 0.5s ease, height 0.5s ease" }}
        />
      )}

      {/* Base ring — green for past & current, gray for future */}
      <circle cx={CX} cy={CY} r={R}
        fill="none"
        stroke={isFuture ? "rgba(0,0,0,0.05)" : GREEN}
        strokeWidth={2}
        opacity={isFuture ? 1 : 0.35}
      />

      {/* Green arc — starts at 9 o'clock (rotate 180deg) */}
      {arcPct > 0 && (
        <circle cx={CX} cy={CY} r={R}
          fill="none" stroke={GREEN} strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          style={{
            transform: "rotate(180deg)",
            transformOrigin: `${CX}px ${CY}px`,
            transition: "stroke-dashoffset 1s ease",
          }}
        />
      )}

      {/* Day number — ALWAYS black */}
      <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle"
        fill={isFuture ? "#ccc" : "#1a1a2e"}
        fontSize={11} fontWeight={isCurrent ? 700 : 500}
      >{day}</text>
    </svg>
  );
}

// ─── Main Dashboard ───
export default function Dashboard({ user, userRole, currentDay, progress, elapsedTime, dayStartHour, getElapsedForDay, onStartTimer, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewingDay, setViewingDay] = useState(null);
  const [timePct, setTimePct] = useState(() => getDayTimePct(dayStartHour));
  const daysRowRef = useRef(null);
  const uidRef = useRef(Math.random().toString(36).slice(2, 8));

  const activeDay = viewingDay ?? currentDay;
  const isToday = activeDay === currentDay;
  const dayElapsed = isToday ? elapsedTime : getElapsedForDay(activeDay);

  useEffect(() => {
    setTimePct(getDayTimePct(dayStartHour));
    const iv = setInterval(() => setTimePct(getDayTimePct(dayStartHour)), 30000);
    return () => clearInterval(iv);
  }, [dayStartHour]);

  useEffect(() => {
    if (!daysRowRef.current) return;
    const items = daysRowRef.current.querySelectorAll('[data-day]');
    const t = items[activeDay - 1];
    if (t) daysRowRef.current.scrollTo({ left: t.offsetLeft - daysRowRef.current.clientWidth / 2 + t.clientWidth / 2, behavior: "smooth" });
  }, [activeDay]);

  useEffect(() => { setViewingDay(null); }, [currentDay]);

  const todayProgress = progress[activeDay] || {};
  const completedCount = ACTIVITIES.filter((a) => todayProgress[a.id]).length;
  const completedDays = Object.keys(progress).filter((d) => isDayComplete(progress[d])).length;

  const totalSecDay = ACTIVITIES.reduce((s, a) => s + a.duration * 60, 0);
  const elapsedSecDay = ACTIVITIES.reduce((s, a) => {
    if (todayProgress[a.id]) return s + a.duration * 60;
    return s + (dayElapsed[a.id] || 0);
  }, 0);
  const dayPct = totalSecDay > 0 ? (elapsedSecDay / totalSecDay) * 100 : 0;

  const dayDate = getDateForDay(activeDay, currentDay, dayStartHour);
  const motto = MOTTOS[(activeDay - 1) % MOTTOS.length] || MOTTOS[0];

  const getPracticeFraction = (day) => {
    const dp = progress[day] || {};
    const el = day === currentDay ? elapsedTime : getElapsedForDay(day);
    let sec = 0;
    ACTIVITIES.forEach((a) => { sec += dp[a.id] ? a.duration * 60 : (el[a.id] || 0); });
    return TOTAL_PRACTICE_SEC > 0 ? sec / TOTAL_PRACTICE_SEC : 0;
  };

  return (
    <Layout>
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
            <img src={user.avatar} alt="" referrerPolicy="no-referrer" style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #e8ecf1, #d0d8e3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#1a1a2e" }}>{user?.name?.charAt(0)}</div>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e" }}>{user?.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#999" }}>День {currentDay} из {DAYS_TOTAL}</span>
              {userRole && userRole !== 'student' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                  background: userRole === 'admin' ? "rgba(231,76,60,0.12)" : userRole === 'trainer' ? "rgba(52,152,219,0.12)" : "rgba(39,174,96,0.12)",
                  color: userRole === 'admin' ? "#e74c3c" : userRole === 'trainer' ? "#3498db" : "#27ae60",
                  textTransform: "uppercase",
                }}>
                  {userRole === 'admin' ? 'Админ' : userRole === 'trainer' ? 'Тренер' : 'Куратор'}
                </span>
              )}
            </div>
          </div>
        </div>
        {(() => {
          const items = [
            { label: "Профиль", icon: "👤", target: "profile" },
          ];
          // Admin: assign role + all trainer items
          if (userRole === 'admin') {
            items.push({ label: "Назначить роль", icon: "🔑", target: "assign_role" });
          }
          // Trainer & Admin
          if (userRole === 'trainer' || userRole === 'admin') {
            items.push(
              { label: "Создать курс", icon: "🛠️", target: "create_course" },
              { label: "Пригласить", icon: "📨", target: "invite" },
              { label: "Мои курсы", icon: "📚", target: "my_courses" },
            );
          }
          // Curator
          if (userRole === 'curator') {
            items.push({ label: "Мои курсы", icon: "📚", target: "my_courses" });
          }
          // Student (and all roles)
          if (userRole === 'student') {
            items.push(
              { label: "Мои курсы", icon: "📚", target: "my_courses" },
            );
          }
          // Common for all
          items.push(
            { label: "Персональный трекер", icon: "🎯", target: "my_trackers" },
            { label: "Детали прогресса", icon: "📊", target: "details" },
            { label: "Рекомендации", icon: "💡", target: "recommendations" },
            { label: "Вопрос тренеру", icon: "💬", target: "ask" },
          );
          return items;
        })().map((item) => (
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

      {/* ════════════════ MAIN ════════════════ */}
      <div style={{ minHeight: "100vh", padding: "0 20px 32px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 52, marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e" }}>{user?.name}</div>
          <button onClick={() => setMenuOpen(true)}
            style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 14, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
            <div style={{ width: 18, height: 2, background: "#1a1a2e", borderRadius: 2 }} />
          </button>
        </div>

        {/* ── 1. Прогресс курса ── */}
        <div style={{ ...glass, borderRadius: 18, padding: "16px 0", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>Прогресс курса</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#aaa", fontWeight: 500 }}>{completedDays}/{DAYS_TOTAL}</span>
              <button onClick={() => onNavigate("details")}
                style={{ padding: "6px 14px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Детали</button>
            </div>
          </div>

          <div ref={daysRowRef}
            style={{ display: "flex", alignItems: "center", padding: "4px 16px", overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
            {Array.from({ length: DAYS_TOTAL }, (_, i) => {
              const day = i + 1;
              const allDone = isDayComplete(progress[day]);
              const isCurrent = day === currentDay;
              const isFuture = day > currentDay;
              const isPast = !isCurrent && !isFuture;
              const isClickable = !isFuture;
              const practiceFrac = getPracticeFraction(day);

              const showLine = day > 1;
              const prevDay = day - 1;
              const lineGreen = prevDay < currentDay || (prevDay === currentDay && isDayComplete(progress[prevDay]));

              return (
                <React.Fragment key={day}>
                  {showLine && (
                    <div style={{
                      width: 12, minWidth: 12, height: 2.5,
                      background: lineGreen ? GREEN : "rgba(0,0,0,0.06)",
                      marginLeft: -3, marginRight: -3,
                      zIndex: 0, flexShrink: 0,
                    }} />
                  )}
                  <div
                    data-day={day}
                    onClick={() => { if (isClickable) setViewingDay(day === currentDay ? null : day); }}
                    style={{ cursor: isClickable ? "pointer" : "default", flexShrink: 0, zIndex: 1, position: "relative" }}
                  >
                    <DayCircle
                      day={day} uid={uidRef.current}
                      timePct={isCurrent ? timePct : (isPast ? 100 : 0)}
                      allDone={allDone} practicePct={practiceFrac}
                      isPast={isPast} isCurrent={isCurrent} isFuture={isFuture}
                    />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── 2. День X ── */}
        <div style={{ ...glass, borderRadius: 18, padding: "18px 20px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e" }}>День {activeDay}</div>
              <div style={{ fontSize: 13, color: "#999", fontWeight: 500, marginTop: 2 }}>{formatDayDate(dayDate)}</div>
            </div>
            <div style={{ fontSize: 13, color: "#888", fontWeight: 500, paddingTop: 4 }}>{completedCount} из {ACTIVITIES.length}</div>
          </div>
          <div style={{ height: 8, background: "rgba(0,0,0,0.04)", borderRadius: 4, overflow: "hidden", marginTop: 14, marginBottom: 8 }}>
            <div style={{
              height: "100%", width: `${dayPct}%`,
              background: dayPct >= 100 ? "linear-gradient(90deg, #27ae60, #2ecc71)" : "linear-gradient(90deg, #1a1a2e, #3a3a5e)",
              borderRadius: 4, transition: "width 0.3s linear",
            }} />
          </div>
          <div style={{ fontSize: 12, color: "#aaa", fontWeight: 500 }}>
            {dayPct >= 100 ? "Все практики выполнены ✨" : `${Math.floor(elapsedSecDay / 60)} из ${Math.floor(totalSecDay / 60)} минут`}
          </div>
        </div>

        {/* ── 3. Девиз дня ── */}
        <div style={{ ...glass, background: "rgba(255,255,255,0.5)", borderRadius: 14, padding: "14px 20px", marginBottom: 20, textAlign: "center" }}>
          <span style={{ fontSize: 13, color: "#888", fontWeight: 500, fontStyle: "italic" }}>«{motto}»</span>
        </div>

        {/* ── 4. Activity cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ACTIVITIES.map((act) => {
            const done = todayProgress[act.id];
            const IconComp = activityIcons[act.id];
            const elapsedSec = done ? act.duration * 60 : (dayElapsed[act.id] || 0);
            const totalSec = act.duration * 60;
            const pct = totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;
            const elapsedMin = Math.floor(elapsedSec / 60);
            const elapsedRemSec = elapsedSec % 60;

            return (
              <div key={act.id} style={{
                ...glass, background: done ? "rgba(26,26,46,0.04)" : "rgba(255,255,255,0.65)",
                borderRadius: 18, padding: "18px 20px",
                border: done ? "1px solid rgba(26,26,46,0.08)" : "1px solid rgba(255,255,255,0.7)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: done ? "rgba(26,26,46,0.08)" : "rgba(0,0,0,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <IconComp size={32} />
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{act.label}</div>
                      <div style={{ fontSize: 12, color: "#999", fontWeight: 500, marginTop: 2 }}>{act.duration} минут</div>
                    </div>
                  </div>
                  {done ? (
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#27ae60", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><polyline points="3,8.5 6.5,12 13,4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="miter" fill="none"/></svg>
                    </div>
                  ) : isToday ? (
                    <button onClick={() => onStartTimer(act)}
                      style={{ padding: "10px 22px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 3px 10px rgba(26,26,46,0.15)" }}>
                      {elapsedSec > 0 ? "Продолжить" : "Начать"}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: "#bbb", fontWeight: 500 }}>Не выполнено</div>
                  )}
                </div>
                <div style={{ height: 4, background: "rgba(0,0,0,0.04)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`,
                    background: done ? "linear-gradient(90deg, #27ae60, #2ecc71)" : "linear-gradient(90deg, #1a1a2e, #4a4a6e)",
                    borderRadius: 2, transition: "width 0.3s linear",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 6, fontWeight: 500 }}>
                  {done ? `${act.duration} из ${act.duration} мин • Выполнено`
                    : elapsedSec > 0 ? `${elapsedMin}:${String(elapsedRemSec).padStart(2, '0')} из ${act.duration} мин`
                    : `0 из ${act.duration} мин`}
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
