import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { LogoFull } from '../components/Icons';
import { MOTTOS } from '../data/constants';
import { getIconPath } from '../data/iconCatalog';
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

const SZ = 32, CX = SZ / 2, CY = SZ / 2, R = 12, CIRC = 2 * Math.PI * R, GREEN = '#27ae60', IR = R - 1.5;

function DayCircle({ day, timePct, allDone, practicePct, isPast, isCurrent, isFuture, uid }) {
  let arcPct = 0;
  if (isFuture) arcPct = 0;
  else if (allDone || isPast) arcPct = 100;
  else if (isCurrent) arcPct = Math.min(timePct, 100);
  const offset = CIRC - (arcPct / 100) * CIRC;
  const frac = Math.min(Math.max(practicePct, 0), 1);
  const diam = IR * 2, fillH = frac * diam, fillY = (CY + IR) - fillH;
  const clipId = `clip-${uid}-${day}`;

  return (
    <svg width={SZ} height={SZ} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <defs><clipPath id={clipId}><circle cx={CX} cy={CY} r={IR} /></clipPath></defs>
      {frac > 0 && <rect x={CX - IR} y={fillY} width={diam} height={fillH} fill={GREEN} opacity={0.25} clipPath={`url(#${clipId})`} style={{ transition: 'y 0.5s ease, height 0.5s ease' }} />}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={isFuture ? 'rgba(0,0,0,0.05)' : GREEN} strokeWidth={2} opacity={isFuture ? 1 : 0.35} />
      {arcPct > 0 && <circle cx={CX} cy={CY} r={R} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} style={{ transform: 'rotate(180deg)', transformOrigin: `${CX}px ${CY}px`, transition: 'stroke-dashoffset 1s ease' }} />}
      <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fill={isFuture ? '#ccc' : '#1a1a2e'} fontSize={11} fontWeight={isCurrent ? 700 : 500}>{day}</text>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════════════════════
export default function Dashboard({
  user, userRole, currentDay, progress, elapsedTime, dayStartHour,
  getElapsedForDay, onStartTimer, onNavigate,
  // New dynamic props
  activeItem, availableItems, onSwitchContext,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [viewingDay, setViewingDay] = useState(null);
  const [timePct, setTimePct] = useState(() => getDayTimePct(dayStartHour));
  const daysRowRef = useRef(null);
  const uidRef = useRef(Math.random().toString(36).slice(2, 8));

  const activeDay = viewingDay ?? currentDay;
  const isToday = activeDay === currentDay;

  // Dynamic activities from active course/tracker
  const allActivities = activeItem?.activities || [];
  const daysTotal = activeItem?.daysCount || 30;

  // Activities active on the viewed day
  const dayActivities = allActivities.filter(a => activeDay >= a.firstDay && activeDay <= a.lastDay);

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
    if (t) daysRowRef.current.scrollTo({ left: t.offsetLeft - daysRowRef.current.clientWidth / 2 + t.clientWidth / 2, behavior: 'smooth' });
  }, [activeDay]);

  useEffect(() => { setViewingDay(null); }, [currentDay, activeItem?.id]);

  const todayProgress = progress[activeDay] || {};
  const completedCount = dayActivities.filter(a => todayProgress[a.id]).length;

  const isDayComplete = (day) => {
    const dp = progress[day] || {};
    const acts = allActivities.filter(a => day >= a.firstDay && day <= a.lastDay);
    return acts.length > 0 && acts.every(a => dp[a.id]);
  };

  const completedDays = Array.from({ length: daysTotal }, (_, i) => i + 1).filter(d => isDayComplete(d)).length;

  const totalSecDay = dayActivities.reduce((s, a) => s + a.durationMin * 60, 0);
  const elapsedSecDay = dayActivities.reduce((s, a) => {
    if (todayProgress[a.id]) return s + a.durationMin * 60;
    return s + (dayElapsed[a.id] || 0);
  }, 0);
  const dayPct = totalSecDay > 0 ? (elapsedSecDay / totalSecDay) * 100 : 0;

  const totalPracticeSecAll = allActivities.reduce((s, a) => s + a.durationMin * 60, 0) || 1;

  const getPracticeFraction = (day) => {
    const dp = progress[day] || {};
    const el = day === currentDay ? elapsedTime : getElapsedForDay(day);
    const acts = allActivities.filter(a => day >= a.firstDay && day <= a.lastDay);
    const totalSec = acts.reduce((s, a) => s + a.durationMin * 60, 0);
    if (totalSec === 0) return 0;
    let sec = 0;
    acts.forEach(a => { sec += dp[a.id] ? a.durationMin * 60 : (el[a.id] || 0); });
    return sec / totalSec;
  };

  const dayDate = getDateForDay(activeDay, currentDay, dayStartHour);
  const motto = MOTTOS[(activeDay - 1) % MOTTOS.length] || MOTTOS[0];

  const activeAvatarSrc = activeItem?.avatarCustom || (activeItem?.avatarIcon ? getIconPath(activeItem.avatarIcon) : null);

  return (
    <Layout>
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 100, backdropFilter: 'blur(4px)' }} />
      )}

      {/* ══════ Slide menu ══════ */}
      <div style={{
        position: 'fixed', top: 0, right: menuOpen ? 0 : -280, width: 270, height: '100%',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
        zIndex: 101, transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
        padding: '60px 24px 40px', boxShadow: menuOpen ? '-8px 0 40px rgba(0,0,0,0.08)' : 'none',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          {user?.avatar && <img src={user.avatar} alt="" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover' }} />}
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{user?.name}</div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{user?.email}</div>
          </div>
        </div>

        {/* ── Course/Tracker Switcher ── */}
        {availableItems && availableItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setSwitcherOpen(!switcherOpen)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(39,174,96,0.06)', border: '1.5px solid rgba(39,174,96,0.15)',
              cursor: 'pointer', textAlign: 'left',
            }}>
              {activeAvatarSrc && <img src={activeAvatarSrc} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'contain' }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeItem?.title || 'Выберите курс'}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>
                  {activeItem?.type === 'tracker' ? 'Трекер' : 'Курс'} · {activeItem?.daysCount || 0} дн.
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#888', transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {switcherOpen && (
              <div style={{
                marginTop: 4, borderRadius: 12, overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.06)', background: '#fff',
              }}>
                {availableItems.map(item => {
                  const isActive = item.id === activeItem?.id;
                  const src = item.avatarCustom || (item.avatarIcon ? getIconPath(item.avatarIcon) : null);
                  return (
                    <button key={`${item.type}-${item.id}`}
                      onClick={() => { onSwitchContext(item); setSwitcherOpen(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 12px', border: 'none',
                        background: isActive ? 'rgba(39,174,96,0.08)' : 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                        borderBottom: '1px solid rgba(0,0,0,0.03)',
                      }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: isActive ? `2px solid ${GREEN}` : '1px solid rgba(0,0,0,0.06)',
                        padding: 2,
                      }}>
                        {src ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 14 }}>{item.type === 'tracker' ? '🎯' : '📚'}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: '#1a1a2e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div style={{ fontSize: 10, color: '#aaa' }}>
                          {item.type === 'tracker' ? 'Трекер' : 'Курс'} · {item.daysCount} дн. · {item.activities.length} практик
                        </div>
                      </div>
                      {isActive && <div style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Menu items ── */}
        {(() => {
          const items = [{ label: 'Профиль', icon: '👤', target: 'profile' }];
          if (userRole === 'admin') items.push({ label: 'Назначить роль', icon: '🔑', target: 'assign_role' });
          if (userRole === 'trainer' || userRole === 'admin') {
            items.push(
              { label: 'Создать курс', icon: '🛠️', target: 'create_course' },
              { label: 'Пригласить', icon: '📨', target: 'invite' },
              { label: 'Мои курсы', icon: '📚', target: 'my_courses' },
            );
          }
          if (userRole === 'curator') items.push({ label: 'Мои курсы', icon: '📚', target: 'my_courses' });
          if (userRole === 'student') items.push({ label: 'Мои курсы', icon: '📚', target: 'my_courses' });
          items.push(
            { label: 'Мои трекеры', icon: '🎯', target: 'my_trackers' },
            { label: 'Детали прогресса', icon: '📊', target: 'details' },
            { label: 'Рекомендации', icon: '💡', target: 'recommendations' },
            { label: 'Вопрос тренеру', icon: '💬', target: 'ask' },
          );
          return items;
        })().map(item => (
          <button key={item.target} onClick={() => { setMenuOpen(false); onNavigate(item.target); }}
            style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px', border: 'none', background: 'transparent', borderRadius: 12, fontSize: 15, fontWeight: 500, color: '#1a1a2e', cursor: 'pointer', textAlign: 'left', marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>{item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.04)', opacity: 0.5 }}>
          <LogoFull height={36} />
        </div>
      </div>

      {/* ════════════════ MAIN ════════════════ */}
      <div style={{ minHeight: '100vh', padding: '0 20px 32px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{user?.name}</div>
            {activeItem && (
              <div style={{ fontSize: 12, color: '#888', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                {activeAvatarSrc && <img src={activeAvatarSrc} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'contain' }} />}
                {activeItem.title}
              </div>
            )}
          </div>
          <button onClick={() => setMenuOpen(true)}
            style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 18, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
            <div style={{ width: 14, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
            <div style={{ width: 18, height: 2, background: '#1a1a2e', borderRadius: 2 }} />
          </button>
        </div>

        {/* No active item */}
        {!activeItem ? (
          <div style={{ ...glass, borderRadius: 18, padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Нет активного курса</div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>Выберите курс или трекер в меню</div>
          </div>
        ) : (
          <>
            {/* ── 1. Прогресс курса ── */}
            <div style={{ ...glass, borderRadius: 18, padding: '16px 0', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Прогресс</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#aaa', fontWeight: 500 }}>{completedDays}/{daysTotal}</span>
                  <button onClick={() => onNavigate('details')}
                    style={{ padding: '6px 14px', background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Детали</button>
                </div>
              </div>

              <div ref={daysRowRef}
                style={{ display: 'flex', alignItems: 'center', padding: '4px 16px', overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                <style>{`div::-webkit-scrollbar { display: none; }`}</style>
                {Array.from({ length: daysTotal }, (_, i) => {
                  const day = i + 1;
                  const allDone = isDayComplete(day);
                  const isCurrent = day === currentDay;
                  const isFuture = day > currentDay;
                  const isPast = !isCurrent && !isFuture;
                  const isClickable = !isFuture;
                  const practiceFrac = getPracticeFraction(day);
                  const showLine = day > 1;
                  const prevDay = day - 1;
                  const lineGreen = prevDay < currentDay || (prevDay === currentDay && isDayComplete(prevDay));

                  return (
                    <React.Fragment key={day}>
                      {showLine && <div style={{ width: 12, minWidth: 12, height: 2.5, background: lineGreen ? GREEN : 'rgba(0,0,0,0.06)', marginLeft: -3, marginRight: -3, zIndex: 0, flexShrink: 0 }} />}
                      <div data-day={day} onClick={() => { if (isClickable) setViewingDay(day === currentDay ? null : day); }}
                        style={{ cursor: isClickable ? 'pointer' : 'default', flexShrink: 0, zIndex: 1, position: 'relative' }}>
                        <DayCircle day={day} uid={uidRef.current} timePct={isCurrent ? timePct : (isPast ? 100 : 0)}
                          allDone={allDone} practicePct={practiceFrac} isPast={isPast} isCurrent={isCurrent} isFuture={isFuture} />
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* ── 2. День X ── */}
            <div style={{ ...glass, borderRadius: 18, padding: '18px 20px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>День {activeDay}</div>
                  <div style={{ fontSize: 13, color: '#999', fontWeight: 500, marginTop: 2 }}>{formatDayDate(dayDate)}</div>
                </div>
                <div style={{ fontSize: 13, color: '#888', fontWeight: 500, paddingTop: 4 }}>{completedCount} из {dayActivities.length}</div>
              </div>
              <div style={{ height: 8, background: 'rgba(0,0,0,0.04)', borderRadius: 4, overflow: 'hidden', marginTop: 14, marginBottom: 8 }}>
                <div style={{
                  height: '100%', width: `${dayPct}%`,
                  background: dayPct >= 100 ? 'linear-gradient(90deg, #27ae60, #2ecc71)' : 'linear-gradient(90deg, #1a1a2e, #3a3a5e)',
                  borderRadius: 4, transition: 'width 0.3s linear',
                }} />
              </div>
              <div style={{ fontSize: 12, color: '#aaa', fontWeight: 500 }}>
                {dayPct >= 100 ? 'Все практики выполнены ✨' : `${Math.floor(elapsedSecDay / 60)} из ${Math.floor(totalSecDay / 60)} минут`}
              </div>
            </div>

            {/* ── 3. Девиз дня ── */}
            <div style={{ ...glass, background: 'rgba(255,255,255,0.5)', borderRadius: 14, padding: '14px 20px', marginBottom: 20, textAlign: 'center' }}>
              <span style={{ fontSize: 13, color: '#888', fontWeight: 500, fontStyle: 'italic' }}>«{motto}»</span>
            </div>

            {/* ── 4. Activity cards (dynamic) ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dayActivities.length === 0 ? (
                <div style={{ ...glass, borderRadius: 18, padding: '24px 20px', textAlign: 'center', color: '#aaa', fontSize: 14 }}>
                  Нет практик на этот день
                </div>
              ) : dayActivities.map(act => {
                const done = todayProgress[act.id];
                const elapsedSec = done ? act.durationMin * 60 : (dayElapsed[act.id] || 0);
                const totalSec = act.durationMin * 60;
                const pct = totalSec > 0 ? (elapsedSec / totalSec) * 100 : 0;
                const elapsedMin = Math.floor(elapsedSec / 60);
                const elapsedRemSec = elapsedSec % 60;

                return (
                  <div key={act.id} style={{
                    ...glass, background: done ? 'rgba(26,26,46,0.04)' : 'rgba(255,255,255,0.65)',
                    borderRadius: 18, padding: '18px 20px',
                    border: done ? '1px solid rgba(26,26,46,0.08)' : '1px solid rgba(255,255,255,0.7)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 14,
                          background: done ? 'rgba(26,26,46,0.08)' : 'rgba(0,0,0,0.03)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6,
                        }}>
                          <img src={getIconPath(act.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>{act.label}</div>
                          <div style={{ fontSize: 12, color: '#999', fontWeight: 500, marginTop: 2 }}>{act.durationMin} минут</div>
                        </div>
                      </div>
                      {done ? (
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#27ae60', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><polyline points="3,8.5 6.5,12 13,4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="miter" fill="none" /></svg>
                        </div>
                      ) : isToday ? (
                        <button onClick={() => onStartTimer({
                          id: act.id,
                          activityId: act.activityId,
                          label: act.label,
                          duration: act.durationMin,
                          iconNum: act.iconNum,
                        })} style={{
                          padding: '10px 22px', background: '#1a1a2e', color: '#fff', border: 'none',
                          borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          boxShadow: '0 3px 10px rgba(26,26,46,0.15)',
                        }}>
                          {elapsedSec > 0 ? 'Продолжить' : 'Начать'}
                        </button>
                      ) : (
                        <div style={{ fontSize: 12, color: '#bbb', fontWeight: 500 }}>Не выполнено</div>
                      )}
                    </div>
                    <div style={{ height: 4, background: 'rgba(0,0,0,0.04)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: done ? 'linear-gradient(90deg, #27ae60, #2ecc71)' : 'linear-gradient(90deg, #1a1a2e, #4a4a6e)',
                        borderRadius: 2, transition: 'width 0.3s linear',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#bbb', marginTop: 6, fontWeight: 500 }}>
                      {done ? `${act.durationMin} из ${act.durationMin} мин • Выполнено`
                        : elapsedSec > 0 ? `${elapsedMin}:${String(elapsedRemSec).padStart(2, '0')} из ${act.durationMin} мин`
                        : `0 из ${act.durationMin} мин`}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Footer />
      </div>
    </Layout>
  );
}
