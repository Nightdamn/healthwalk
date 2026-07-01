import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { MOTTOS, isActivityScheduled } from '../data/constants';
import { getIconPath } from '../data/iconCatalog';
import { glass } from '../styles/shared';
import { useMenu } from '../components/MenuContext';
import { MenuButton } from '../components/TopBar';

// Русский плюрализатор: 1 день, 2 дня, 5 дней.
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

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

  // Solid fill when all practices are done
  const fillOpacity = allDone ? 0.85 : 0.25;

  return (
    <svg width={SZ} height={SZ} style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}>
      <defs><clipPath id={clipId}><circle cx={CX} cy={CY} r={IR} /></clipPath></defs>
      {frac > 0 && <rect x={CX - IR} y={fillY} width={diam} height={fillH} fill={GREEN} opacity={fillOpacity} clipPath={`url(#${clipId})`} style={{ transition: 'y 0.5s ease, height 0.5s ease' }} />}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={isFuture ? 'rgba(0,0,0,0.05)' : GREEN} strokeWidth={2} opacity={isFuture ? 1 : 0.35} />
      {arcPct > 0 && <circle cx={CX} cy={CY} r={R} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={offset} style={{ transform: 'rotate(180deg)', transformOrigin: `${CX}px ${CY}px`, transition: 'stroke-dashoffset 1s ease' }} />}
      <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fill={allDone ? '#fff' : isFuture ? '#ccc' : '#1a1a2e'} fontSize={11} fontWeight={isCurrent ? 700 : 500}>{day}</text>
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
  exclusions = {}, customActivities = [],
  unreadCount = 0, courseFinished = false,
  dayInfo = { isUpcoming: false, daysUntilStart: 0 },
  courseCalls = [],
}) {
  const { openMenu } = useMenu();
  const [viewingDay, setViewingDay] = useState(null);
  const [dashView, setDashView] = useState('day'); // 'day' | 'stats' | 'map'
  const [timePct, setTimePct] = useState(() => getDayTimePct(dayStartHour));
  const daysRowRef = useRef(null);
  const uidRef = useRef(Math.random().toString(36).slice(2, 8));

  // Курс с bound_to_calendar ещё не начался — currentDay=0. Для UI всё
  // считаем как «день 1» (чтобы карта дней показалась и активности
  // первого дня были видны), но кнопки действий скрываем — см. isUpcoming.
  const isUpcoming = !!dayInfo.isUpcoming;
  const effectiveCurrentDay = isUpcoming ? 1 : currentDay;
  const activeDay = viewingDay ?? effectiveCurrentDay;
  const isToday = !isUpcoming && activeDay === currentDay;

  // Dynamic activities from active course/tracker + custom student activities
  const allActivities = [...(activeItem?.activities || []), ...customActivities];
  const daysTotal = activeItem?.daysCount || 30;

  // Helper: check if an activity is scheduled on a given day. Combines:
  //   • trainer-level interval + excluded/extra overrides (per activity)
  //   • per-student exclusions (student_activity_exclusions, prop `exclusions`)
  //   • effective first_day clamp (activities added later don't appear on
  //     days the student has already passed)
  const studentJoinedAt = activeItem?.startDate;
  const isActivityOnDay = (a, day) => {
    if (!isActivityScheduled(a, day, studentJoinedAt)) return false;
    if (exclusions[`${a.id}_${day}`]) return false;
    return true;
  };

  // Activities active on the viewed day
  const dayActivities = allActivities.filter(a => isActivityOnDay(a, activeDay));

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

  useEffect(() => { setViewingDay(null); setDashView('day'); }, [currentDay, activeItem?.id]);

  const todayProgress = progress[activeDay] || {};
  const completedCount = dayActivities.filter(a => todayProgress[a.id]).length;

  const isDayComplete = (day) => {
    const dp = progress[day] || {};
    const acts = allActivities.filter(a => isActivityOnDay(a, day));
    return acts.length > 0 && acts.every(a => dp[a.id]);
  };

  const elapsedDays = courseFinished ? daysTotal : Math.max(0, currentDay - 1);

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
    const acts = allActivities.filter(a => isActivityOnDay(a, day));
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
      {/* MenuDrawer глобально живёт в App.jsx — открывается через useMenu().openMenu() */}

      {/* ════════════════ MAIN ════════════════ */}
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 32px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'fixed', top: 'var(--vv-top, 0px)', left: '50%', transform: 'translate3d(-50%, 0, 0)', willChange: 'transform', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 24 }}>
          <div style={{ minWidth: 0, paddingRight: 12, flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeItem && activeAvatarSrc && (
              <img src={activeAvatarSrc} alt="" style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'contain', flexShrink: 0, background: '#fafafa', border: '1px solid rgba(0,0,0,0.05)', padding: 3 }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              {activeItem && (
                <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeItem.title}
                </div>
              )}
              <div style={{ fontSize: 13, color: '#888', fontWeight: 500, marginTop: activeItem ? 2 : 0, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
            </div>
          </div>
          <MenuButton onClick={openMenu} unreadCount={unreadCount} />
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
                  <span style={{ fontSize: 13, color: '#aaa', fontWeight: 500 }}>{elapsedDays}/{daysTotal}</span>
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
                  const isCurrent = !courseFinished && !isUpcoming && day === currentDay;
                  const isFuture = !courseFinished && (isUpcoming || day > currentDay);
                  const isPast = !isCurrent && !isFuture;
                  // Все дни кликабельны — теорию/практику можно посмотреть в любом
                  // дне, но кнопки «Начать»/«Изучено» рисуются только в isToday.
                  const practiceFrac = getPracticeFraction(day);
                  const showLine = day > 1;
                  const prevDay = day - 1;
                  const lineGreen = courseFinished || (!isUpcoming && (prevDay < currentDay || (prevDay === currentDay && isDayComplete(prevDay))));

                  return (
                    <React.Fragment key={day}>
                      {showLine && <div style={{ width: 12, minWidth: 12, height: 2.5, background: lineGreen ? GREEN : 'rgba(0,0,0,0.06)', marginLeft: -3, marginRight: -3, zIndex: 0, flexShrink: 0 }} />}
                      <div data-day={day} onClick={() => {
                          if (day === currentDay && !isUpcoming) { setViewingDay(null); setDashView('day'); }
                          else setViewingDay(day);
                        }}
                        style={{ cursor: 'pointer', flexShrink: 0, zIndex: 1, position: 'relative' }}>
                        <DayCircle day={day} uid={uidRef.current} timePct={isCurrent ? timePct : (isPast ? 100 : 0)}
                          allDone={allDone} practicePct={practiceFrac} isPast={isPast} isCurrent={isCurrent} isFuture={isFuture} />
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* ── Map/Stats buttons ── */}
            {!courseFinished && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setDashView(dashView === 'map' ? 'day' : 'map')}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: '#1a1a2e', color: '#fff',
                    opacity: dashView === 'map' ? 0.85 : 1,
                  }}>
                  Карта курса
                </button>
                <button onClick={() => setDashView(dashView === 'stats' ? 'day' : 'stats')}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', border: 'none',
                    background: '#1a1a2e', color: '#fff',
                    opacity: dashView === 'stats' ? 0.85 : 1,
                  }}>
                  Статистика
                </button>
              </div>
            )}

            {courseFinished ? (
              <CourseCompleteView
                progress={progress}
                allActivities={allActivities}
                daysTotal={daysTotal}
                exclusions={exclusions}
                isActivityOnDay={isActivityOnDay}
                getElapsedForDay={getElapsedForDay}
                elapsedTime={elapsedTime}
                currentDay={currentDay}
                courseName={activeItem?.title}
              />
            ) : dashView === 'stats' ? (
              <CourseStatsView
                progress={progress}
                allActivities={allActivities}
                daysTotal={daysTotal}
                isActivityOnDay={isActivityOnDay}
                currentDay={currentDay}
                onBackToDay={() => setDashView('day')}
              />
            ) : dashView === 'map' ? (
              <CourseMapView
                progress={progress}
                allActivities={allActivities}
                daysTotal={daysTotal}
                isActivityOnDay={isActivityOnDay}
                currentDay={currentDay}
                dayStartHour={dayStartHour}
                getElapsedForDay={getElapsedForDay}
                elapsedTime={elapsedTime}
                onStartTimer={onStartTimer}
                enrollRole={activeItem?.enrollRole}
                userRole={userRole}
                onBackToDay={() => setDashView('day')}
                isUpcoming={isUpcoming}
              />
            ) : (
              <>
                {/* ── 2. День X (или счётчик до старта, если курс впереди) ── */}
                {isUpcoming ? (
                  <div style={{ ...glass, borderRadius: 18, padding: '24px 20px', marginBottom: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>До старта курса</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: '#1a1a2e', lineHeight: 1 }}>
                      {dayInfo.daysUntilStart} <span style={{ fontSize: 16, fontWeight: 500, color: '#888' }}>{plural(dayInfo.daysUntilStart, 'день', 'дня', 'дней')}</span>
                    </div>
                    {activeItem?.startDate && (
                      <div style={{ fontSize: 13, color: '#999', fontWeight: 500, marginTop: 6 }}>
                        Начало {formatDayDate(new Date(activeItem.startDate))}
                      </div>
                    )}
                  </div>
                ) : (
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
                )}

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
                    // Теория в любой день кликается — открывается в read-only
                    // если день не сегодняшний (alreadyDone=true ⇒ Timer
                    // покажет содержимое + кнопку «К практике» вместо «Изучено»).
                    const reopenTheory = done && act.practiceType === 'theory';
                    const viewTheoryReadOnly = act.practiceType === 'theory' && !isToday && !done;
                    const cardClickable = reopenTheory || viewTheoryReadOnly;

                    return (
                      <div key={act.id}
                        onClick={cardClickable ? () => onStartTimer({
                          id: act.id,
                          activityId: act.activityId,
                          label: act.label,
                          duration: act.durationMin,
                          iconNum: act.iconNum,
                          practiceType: act.practiceType,
                          descriptionHtml: act.descriptionHtml,
                          alreadyDone: true,
                        }) : undefined}
                        style={{
                        ...glass, background: done ? 'rgba(26,26,46,0.04)' : 'rgba(255,255,255,0.65)',
                        borderRadius: 18, padding: '18px 20px',
                        border: done ? '1px solid rgba(26,26,46,0.08)' : '1px solid rgba(255,255,255,0.7)',
                        cursor: cardClickable ? 'pointer' : 'default',
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
                              <div style={{ fontSize: 12, color: '#999', fontWeight: 500, marginTop: 2 }}>{act.practiceType === 'theory' ? 'Теория' : act.practiceType === 'call' ? 'Онлайн' : `${act.durationMin} минут`}</div>
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
                              practiceType: act.practiceType,
                              descriptionHtml: act.descriptionHtml,
                            })} style={{
                              padding: '10px 22px', background: '#1a1a2e', color: '#fff', border: 'none',
                              borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              boxShadow: '0 3px 10px rgba(26,26,46,0.15)',
                            }}>
                              {elapsedSec > 0 ? 'Продолжить' : 'Начать'}
                            </button>
                          ) : (
                            // Past day, never started — show a pale check inside a pale circle
                            // (visually parallel to the green "done" check, just muted).
                            <div title="Не выполнено" style={{
                              width: 28, height: 28, borderRadius: '50%',
                              border: '1.5px solid rgba(0,0,0,0.12)', background: 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <polyline points="3,8.5 6.5,12 13,4" stroke="rgba(0,0,0,0.18)"
                                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="miter" fill="none"/>
                              </svg>
                            </div>
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
                          {act.practiceType === 'theory' ? (done ? 'Выполнено' : 'Не выполнено')
                            : act.practiceType === 'call' ? (done ? 'Выполнено' : 'Запланировано')
                            : done ? `${act.durationMin} из ${act.durationMin} мин • Выполнено`
                            : elapsedSec > 0 ? `${elapsedMin}:${String(elapsedRemSec).padStart(2, '0')} из ${act.durationMin} мин`
                            : `0 из ${act.durationMin} мин`}
                        </div>

                        {/* Кнопка «Смотреть запись» — под прогресс-баром и статусом
                            (чёрная как «Начать»). Показывается ВСЕМ если у звонка есть
                            recording_url, даже если done — можно пересмотреть. */}
                        {act.practiceType === 'call' && (() => {
                          const c = (courseCalls || []).find(cc =>
                            cc.activity_id === (act.activityId || act.id) && cc.day === activeDay && cc.recording_url
                          );
                          if (!c) return null;
                          const mins = c.recording_duration_sec ? Math.round(c.recording_duration_sec / 60) : null;
                          return (
                            <button onClick={() => onStartTimer({
                              id: act.id,
                              activityId: act.activityId,
                              label: act.label,
                              duration: act.durationMin,
                              iconNum: act.iconNum,
                              practiceType: 'call_recording',
                              descriptionHtml: act.descriptionHtml,
                              recordingUrl: c.recording_url,
                              recordingDurationSec: c.recording_duration_sec,
                              day: activeDay,
                              alreadyDone: done,
                            })}
                              style={{
                                width: '100%', marginTop: 12, padding: '10px 14px',
                                background: '#1a1a2e', color: '#fff', border: 'none',
                                borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                boxShadow: '0 3px 10px rgba(26,26,46,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                              }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M3 2v12l11-6L3 2z"/>
                              </svg>
                              <span>Смотреть запись{mins ? ` (${mins} мин)` : ''}</span>
                            </button>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        <Footer />
      </div>

    </Layout>
  );
}

/* ── Course completion view ── */
function CourseCompleteView({ progress, allActivities, daysTotal, exclusions, isActivityOnDay, getElapsedForDay, elapsedTime, currentDay, courseName }) {
  // Compute stats
  let completedDays = 0;
  let totalActiveDays = 0;
  const activityStats = {}; // { actId: { label, iconNum, scheduled: 0, completed: 0, totalMinScheduled: 0 } }

  for (let d = 1; d <= daysTotal; d++) {
    const dayActs = allActivities.filter(a => isActivityOnDay(a, d));
    if (dayActs.length === 0) continue;
    totalActiveDays++;
    const dp = progress[d] || {};
    const allDone = dayActs.every(a => dp[a.id]?.completed || dp[a.id] === true);
    if (allDone) completedDays++;

    dayActs.forEach(a => {
      if (!activityStats[a.id]) {
        activityStats[a.id] = { label: a.label, iconNum: a.iconNum, scheduled: 0, completed: 0, totalMinScheduled: 0 };
      }
      activityStats[a.id].scheduled++;
      activityStats[a.id].totalMinScheduled += (a.durationMin || 10);
      if (dp[a.id]?.completed || dp[a.id] === true) activityStats[a.id].completed++;
    });
  }

  const overallPct = totalActiveDays > 0 ? Math.round((completedDays / totalActiveDays) * 100) : 0;
  const actList = Object.values(activityStats).sort((a, b) => b.scheduled - a.scheduled);

  // Total time (approximate: completed activities * duration)
  const totalMinutes = actList.reduce((s, a) => s + a.completed * (a.totalMinScheduled / a.scheduled), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = Math.round(totalMinutes % 60);

  // Ring chart params
  const ringSize = 120, ringStroke = 10, ringR = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc - (overallPct / 100) * ringCirc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Congratulations card */}
      <div style={{
        ...glass, borderRadius: 20, padding: '28px 20px', textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(39,174,96,0.08) 0%, rgba(46,204,113,0.04) 100%)',
        border: '1.5px solid rgba(39,174,96,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="27" fill="#27ae60" />
            <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            <polyline points="18,28 25,35 38,21" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>Поздравляем!</div>
        <div style={{ fontSize: 15, color: '#555', fontWeight: 500 }}>
          Курс {courseName ? `«${courseName}»` : ''} окончен
        </div>
      </div>

      {/* Ring chart + key stats */}
      <div style={{
        ...glass, borderRadius: 18, padding: '24px 20px',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        {/* Ring */}
        <div style={{ flexShrink: 0, position: 'relative' }}>
          <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR}
              fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={ringStroke} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR}
              fill="none" stroke={GREEN}
              strokeWidth={ringStroke} strokeLinecap="round"
              strokeDasharray={ringCirc} strokeDashoffset={ringOffset}
              style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#1a1a2e' }}>{overallPct}%</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Дней выполнено</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {completedDays} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>из {totalActiveDays}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Общее время</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {totalHours > 0 && <>{totalHours} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>ч</span>{' '}</>}
              {totalMins} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>мин</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Длительность</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {daysTotal} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>дней</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity breakdown */}
      {actList.length > 0 && (
        <div style={{ ...glass, borderRadius: 18, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
            Результаты по активностям
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actList.map(a => {
              const pct = a.scheduled > 0 ? Math.round((a.completed / a.scheduled) * 100) : 0;
              return (
                <div key={a.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <img src={getIconPath(a.iconNum)} alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{a.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 4,
                      background: 'linear-gradient(90deg, #27ae60, #2ecc71)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 3, fontWeight: 500 }}>
                    {a.completed} из {a.scheduled} занятий
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Course Map View ── */
function CourseMapView({ progress, allActivities, daysTotal, isActivityOnDay, currentDay, dayStartHour, getElapsedForDay, elapsedTime, onStartTimer, enrollRole, userRole, onBackToDay, isUpcoming = false }) {
  const [expandedDay, setExpandedDay] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {onBackToDay && (
        <button onClick={onBackToDay}
          style={{
            padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', border: 'none',
            background: '#1a1a2e', color: '#fff', marginBottom: 4,
          }}>
          К практике
        </button>
      )}
      {Array.from({ length: daysTotal }, (_, i) => {
        const day = i + 1;
        const isFuture = isUpcoming || day > currentDay;
        const isToday = !isUpcoming && day === currentDay;
        const dayActs = allActivities.filter(a => isActivityOnDay(a, day));
        const dp = progress[day] || {};
        const completedCount = dayActs.filter(a => dp[a.id]?.completed || dp[a.id] === true).length;
        const totalCount = dayActs.length;
        const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const allDone = totalCount > 0 && completedCount === totalCount;
        const isExpanded = expandedDay === day;
        // Все дни «открыты»: можно развернуть, посмотреть теорию, открыть
        // карточку практики. Кнопка «Начать» рисуется только в isToday.
        const locked = false;
        const dayDate = getDateForDay(day, currentDay, dayStartHour);
        const dayEl = isToday ? elapsedTime : getElapsedForDay(day);

        return (
          <div key={day} style={{
            ...glass, borderRadius: 16, padding: '14px 16px',
            opacity: locked ? 0.5 : 1,
            border: isToday ? '1.5px solid rgba(39,174,96,0.3)' : '1px solid rgba(255,255,255,0.7)',
            background: isToday ? 'rgba(39,174,96,0.04)' : allDone ? 'rgba(39,174,96,0.03)' : 'rgba(255,255,255,0.65)',
          }}>
            {/* Day header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>День {day}</span>
                  {isToday && <span style={{ fontSize: 10, fontWeight: 600, color: GREEN, background: 'rgba(39,174,96,0.1)', padding: '2px 8px', borderRadius: 6 }}>Сегодня</span>}
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{dayDate.getDate()} {MONTHS_G[dayDate.getMonth()]}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {locked ? (
                  <span style={{ fontSize: 16 }}>&#x1f512;</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12, color: allDone ? GREEN : '#888', fontWeight: 600 }}>
                      {completedCount}/{totalCount} {allDone ? '\u2713' : ''}
                    </span>
                    {totalCount > 0 && (
                      <button onClick={() => setExpandedDay(isExpanded ? null : day)}
                        style={{
                          width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)',
                          background: 'rgba(0,0,0,0.02)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, color: '#888', transition: 'transform 0.2s',
                          transform: isExpanded ? 'rotate(180deg)' : 'none',
                        }}>
                        &#x25bc;
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!locked && totalCount > 0 && (
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${pct}%`, borderRadius: 3,
                  background: 'linear-gradient(90deg, #27ae60, #2ecc71)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}

            {/* Expanded activities */}
            {isExpanded && !locked && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayActs.map(act => {
                  const done = dp[act.id]?.completed || dp[act.id] === true;
                  const elSec = done ? act.durationMin * 60 : (dayEl[act.id] || 0);
                  const actPct = act.durationMin > 0 ? Math.round((elSec / (act.durationMin * 60)) * 100) : 0;
                  // Кнопка «Начать» практику — только в сегодняшний день.
                  // Теорию можно открыть в любой день (read-only, без «Изучено»).
                  const canStart = isToday && !done;
                  const canViewTheory = act.practiceType === 'theory';
                  const canReopenTheory = done && act.practiceType === 'theory' && isToday;
                  const clickable = canStart || canReopenTheory || canViewTheory;

                  return (
                    <div key={act.id}
                      onClick={() => { if (clickable) onStartTimer({ id: act.id, activityId: act.activityId, label: act.label, duration: act.durationMin, iconNum: act.iconNum, practiceType: act.practiceType, descriptionHtml: act.descriptionHtml, alreadyDone: canReopenTheory || (canViewTheory && !isToday) }); }}
                      style={{
                        padding: '10px 12px', borderRadius: 12,
                        background: done ? 'rgba(39,174,96,0.06)' : 'rgba(0,0,0,0.02)',
                        border: '1px solid ' + (done ? 'rgba(39,174,96,0.12)' : 'rgba(0,0,0,0.04)'),
                        cursor: clickable ? 'pointer' : 'default',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <img src={getIconPath(act.iconNum)} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{act.label}</span>
                        <span style={{ fontSize: 12, color: '#aaa' }}>
                          {act.practiceType === 'theory' ? 'Теория'
                            : act.practiceType === 'call' ? 'Онлайн'
                            : `${act.durationMin} мин`}
                        </span>
                        {done && (
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 16 16"><polyline points="3,8.5 6.5,12 13,4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" /></svg>
                          </div>
                        )}
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${actPct}%`, borderRadius: 2,
                          background: done ? 'linear-gradient(90deg, #27ae60, #2ecc71)' : 'linear-gradient(90deg, #1a1a2e, #4a4a6e)',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Course Stats View (live progress, always green) ── */
function CourseStatsView({ progress, allActivities, daysTotal, isActivityOnDay, currentDay, onBackToDay }) {
  let completedDays = 0;
  let totalActiveDays = 0;
  const activityStats = {};

  for (let d = 1; d <= daysTotal; d++) {
    const dayActs = allActivities.filter(a => isActivityOnDay(a, d));
    if (dayActs.length === 0) continue;
    totalActiveDays++;
    const dp = progress[d] || {};
    const allDone = dayActs.every(a => dp[a.id]?.completed || dp[a.id] === true);
    if (allDone) completedDays++;

    dayActs.forEach(a => {
      if (!activityStats[a.id]) {
        activityStats[a.id] = { label: a.label, iconNum: a.iconNum, scheduled: 0, completed: 0, totalMinScheduled: 0 };
      }
      activityStats[a.id].scheduled++;
      activityStats[a.id].totalMinScheduled += (a.durationMin || 10);
      if (dp[a.id]?.completed || dp[a.id] === true) activityStats[a.id].completed++;
    });
  }

  const overallPct = totalActiveDays > 0 ? Math.round((completedDays / totalActiveDays) * 100) : 0;
  const actList = Object.values(activityStats).sort((a, b) => b.scheduled - a.scheduled);
  const totalMinutes = actList.reduce((s, a) => s + a.completed * (a.totalMinScheduled / a.scheduled), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = Math.round(totalMinutes % 60);

  const ringSize = 120, ringStroke = 10, ringR = (ringSize - ringStroke) / 2;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc - (overallPct / 100) * ringCirc;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {onBackToDay && (
        <button onClick={onBackToDay}
          style={{
            padding: '12px 0', borderRadius: 14, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', border: 'none',
            background: '#1a1a2e', color: '#fff',
          }}>
          К практике
        </button>
      )}
      {/* Current progress header */}
      <div style={{
        ...glass, borderRadius: 20, padding: '24px 20px', textAlign: 'center',
        background: 'linear-gradient(135deg, rgba(39,174,96,0.08) 0%, rgba(46,204,113,0.04) 100%)',
        border: '1.5px solid rgba(39,174,96,0.15)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>&#x1f4ca;</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>Текущий прогресс</div>
        <div style={{ fontSize: 15, color: '#555', fontWeight: 500 }}>
          День {currentDay} из {daysTotal}
        </div>
      </div>

      {/* Ring chart + stats */}
      <div style={{ ...glass, borderRadius: 18, padding: '24px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ flexShrink: 0, position: 'relative' }}>
          <svg width={ringSize} height={ringSize} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR}
              fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={ringStroke} />
            <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR}
              fill="none" stroke={GREEN} strokeWidth={ringStroke} strokeLinecap="round"
              strokeDasharray={ringCirc} strokeDashoffset={ringOffset}
              style={{ transition: 'stroke-dashoffset 1s ease' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: '#1a1a2e' }}>{overallPct}%</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Дней выполнено</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {completedDays} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>из {totalActiveDays}</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Общее время</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {totalHours > 0 && <>{totalHours} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>ч</span>{' '}</>}
              {totalMins} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>мин</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>Длительность</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {daysTotal} <span style={{ fontSize: 14, fontWeight: 500, color: '#aaa' }}>дней</span>
            </div>
          </div>
        </div>
      </div>

      {/* Activity breakdown */}
      {actList.length > 0 && (
        <div style={{ ...glass, borderRadius: 18, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 }}>
            Результаты по активностям
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actList.map(a => {
              const pct = a.scheduled > 0 ? Math.round((a.completed / a.scheduled) * 100) : 0;
              return (
                <div key={a.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <img src={getIconPath(a.iconNum)} alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{a.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: GREEN }}>{pct}%</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.04)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 4,
                      background: 'linear-gradient(90deg, #27ae60, #2ecc71)',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 3, fontWeight: 500 }}>
                    {a.completed} из {a.scheduled} занятий
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
