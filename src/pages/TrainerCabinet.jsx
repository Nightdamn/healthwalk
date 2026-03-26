import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import {
  getCourseStudentsInfo, getCourseAllStudentsProgress,
  inviteToCourse, toggleStudentPause, removeStudentFromCourse,
  loadCourseForEdit,
} from '../lib/db';

const GREEN = '#27ae60';
const BLUE = '#3498db';
const RED = '#e74c3c';
const ORANGE = '#e67e22';
const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор', trainer: 'Тренер' };
const ROLE_COLORS = { student: GREEN, curator: BLUE, trainer: ORANGE };

export default function TrainerCabinetPage({ courseId, user, onBack }) {
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [allProgress, setAllProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [actionId, setActionId] = useState(null);

  // Invite state
  const [showInvite, setShowInvite] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invRole, setInvRole] = useState('student');
  const [invLoading, setInvLoading] = useState(false);
  const [invStatus, setInvStatus] = useState(null);

  const loadData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    const [c, s, p] = await Promise.all([
      loadCourseForEdit(courseId),
      getCourseStudentsInfo(courseId),
      getCourseAllStudentsProgress(courseId),
    ]);
    setCourse(c);
    setStudents(s);
    setAllProgress(p);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInvite = async () => {
    if (!invEmail.trim()) { setInvStatus({ ok: false, msg: 'Введите email' }); return; }
    setInvLoading(true); setInvStatus(null);
    const result = await inviteToCourse(courseId, invEmail.trim(), invRole, user.id);
    setInvLoading(false);
    if (result.success) {
      setInvStatus({ ok: true, msg: `Приглашение отправлено: ${invEmail}` });
      setInvEmail('');
    } else {
      setInvStatus({ ok: false, msg: result.error || 'Ошибка' });
    }
  };

  const handleTogglePause = async (enrollmentId) => {
    setActionId(enrollmentId);
    const result = await toggleStudentPause(enrollmentId);
    if (result.success) {
      setStudents(prev => prev.map(s =>
        s.enrollment_id === enrollmentId ? { ...s, paused: result.paused } : s
      ));
    } else {
      alert(result.error || 'Ошибка');
    }
    setActionId(null);
  };

  const handleRemove = async (enrollmentId, name) => {
    if (!confirm(`Удалить ${name} из курса? Весь прогресс ученика будет потерян.`)) return;
    setActionId(enrollmentId);
    const result = await removeStudentFromCourse(enrollmentId);
    if (result.success) {
      setStudents(prev => prev.filter(s => s.enrollment_id !== enrollmentId));
    } else {
      alert(result.error || 'Ошибка');
    }
    setActionId(null);
  };

  const activities = (course?.course_activities || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const daysCount = course?.days_count || 30;

  // Calculate completion stats for a student
  const getStudentStats = (userId) => {
    const prog = allProgress[userId] || {};
    let completedDays = 0;
    for (let d = 1; d <= daysCount; d++) {
      const dayActivities = activities.filter(a => d >= (a.first_day || 1) && d <= (a.last_day || daysCount));
      if (dayActivities.length === 0) continue;
      const allDone = dayActivities.every(a => prog[d]?.[a.id]?.completed);
      if (allDone) completedDays++;
    }
    const totalActiveDays = Array.from({ length: daysCount }, (_, i) => i + 1)
      .filter(d => activities.some(a => d >= (a.first_day || 1) && d <= (a.last_day || daysCount))).length;
    return { completedDays, totalActiveDays };
  };

  const avatarSrc = course?.avatar_custom || (course?.avatar_icon ? getIconPath(course.avatar_icon) : null);

  if (loading) {
    return (
      <Layout>
        <div style={{ ...pageWrapper, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span style={{ fontSize: 14, color: '#aaa' }}>Загрузка...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={pageWrapper}>
        <div style={topBar}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={topBarTitle}>Кабинет тренера</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Course header */}
        <div style={{ ...glass, borderRadius: 18, padding: '16px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: '#fafafa', border: `1.5px solid ${GREEN}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {avatarSrc
              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span style={{ fontSize: 22 }}>📚</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {course?.title}
            </div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
              {daysCount} дней · {activities.length} активн. · {students.length} {studentWord(students.length)}
            </div>
          </div>
        </div>

        {/* Invite section */}
        <button onClick={() => setShowInvite(!showInvite)} style={{
          width: '100%', padding: '14px 16px', marginBottom: showInvite ? 0 : 16,
          borderRadius: showInvite ? '14px 14px 0 0' : 14,
          border: `1.5px solid ${GREEN}40`, background: `${GREEN}08`,
          color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>✉️</span>
          Пригласить в курс
          <span style={{ fontSize: 12, transition: 'transform 0.2s', transform: showInvite ? 'rotate(180deg)' : 'none' }}>▼</span>
        </button>

        {showInvite && (
          <div style={{ ...glass, borderRadius: '0 0 14px 14px', padding: '16px', marginBottom: 16, borderTop: 'none' }}>
            <input
              type="email" value={invEmail}
              onChange={e => setInvEmail(e.target.value)}
              placeholder="Email участника"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
                fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {['student', 'curator', 'trainer'].map(r => (
                <button key={r} onClick={() => setInvRole(r)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: invRole === r ? `2px solid ${ROLE_COLORS[r]}` : '1.5px solid rgba(0,0,0,0.08)',
                  background: invRole === r ? `${ROLE_COLORS[r]}10` : '#fff',
                  color: invRole === r ? ROLE_COLORS[r] : '#888', cursor: 'pointer',
                }}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
            <button onClick={handleInvite} disabled={invLoading} style={{
              width: '100%', padding: '12px', borderRadius: 10,
              border: 'none', background: '#1a1a2e', color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: invLoading ? 'wait' : 'pointer',
              opacity: invLoading ? 0.6 : 1,
            }}>
              {invLoading ? 'Отправка...' : 'Пригласить'}
            </button>
            {invStatus && (
              <div style={{
                marginTop: 10, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                background: invStatus.ok ? `${GREEN}15` : `${RED}10`,
                color: invStatus.ok ? GREEN : RED,
              }}>
                {invStatus.msg}
              </div>
            )}
          </div>
        )}

        {/* Students list */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Ученики ({students.length})
        </div>

        {students.length === 0 ? (
          <div style={{ ...glass, borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 14, color: '#aaa' }}>Пока нет учеников. Пригласите кого-нибудь!</div>
          </div>
        ) : (
          students.map(st => {
            const stats = getStudentStats(st.user_id);
            const pct = stats.totalActiveDays > 0 ? Math.round((stats.completedDays / stats.totalActiveDays) * 100) : 0;
            const isExpanded = expandedId === st.enrollment_id;
            const isBusy = actionId === st.enrollment_id;

            return (
              <div key={st.enrollment_id} style={{
                ...glass, borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                border: st.paused ? '2px solid rgba(230,126,34,0.3)' : undefined,
                opacity: st.paused ? 0.7 : 1,
              }}>
                {/* Main row — clickable */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : st.enrollment_id)}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}
                >
                  {/* Initials avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                    background: `${ROLE_COLORS[st.role] || GREEN}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: ROLE_COLORS[st.role] || GREEN,
                  }}>
                    {(st.display_name || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.display_name}
                      </span>
                      <span style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                        background: `${ROLE_COLORS[st.role]}15`, color: ROLE_COLORS[st.role],
                      }}>
                        {ROLE_LABELS[st.role] || st.role}
                      </span>
                      {st.paused && (
                        <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: `${ORANGE}15`, color: ORANGE }}>
                          Пауза
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {st.email}
                    </div>

                    {/* Progress bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: 3,
                          background: pct === 100 ? GREEN : pct > 50 ? BLUE : '#ddd',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: pct > 50 ? GREEN : '#aaa', flexShrink: 0 }}>
                        {stats.completedDays}/{stats.totalActiveDays}
                      </span>
                    </div>
                  </div>

                  <span style={{ fontSize: 12, color: '#bbb', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <StudentDetails
                      userId={st.user_id}
                      progress={allProgress[st.user_id] || {}}
                      activities={activities}
                      daysCount={daysCount}
                    />

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button onClick={() => handleTogglePause(st.enrollment_id)} disabled={isBusy}
                        style={{
                          flex: 1, padding: '10px 0', borderRadius: 10,
                          border: `1.5px solid ${st.paused ? GREEN : ORANGE}40`,
                          background: st.paused ? `${GREEN}08` : `${ORANGE}08`,
                          color: st.paused ? GREEN : ORANGE,
                          fontSize: 13, fontWeight: 600, cursor: isBusy ? 'wait' : 'pointer',
                        }}>
                        {st.paused ? '▶ Возобновить' : '⏸ Поставить на паузу'}
                      </button>
                      <button onClick={() => handleRemove(st.enrollment_id, st.display_name)} disabled={isBusy}
                        style={{
                          padding: '10px 16px', borderRadius: 10,
                          border: `1.5px solid ${RED}30`, background: `${RED}06`,
                          color: RED, fontSize: 13, fontWeight: 600,
                          cursor: isBusy ? 'wait' : 'pointer',
                        }}>
                        🗑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}

/* ── Student detail progress view ── */
function StudentDetails({ userId, progress, activities, daysCount }) {
  // Show last 10 days of progress as a grid
  const days = [];
  for (let d = 1; d <= daysCount; d++) {
    const dayActivities = activities.filter(a => d >= (a.first_day || 1) && d <= (a.last_day || daysCount));
    if (dayActivities.length === 0) continue;
    const completed = dayActivities.filter(a => progress[d]?.[a.id]?.completed).length;
    days.push({ day: d, total: dayActivities.length, completed });
  }

  // Show compact grid
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
        Прогресс по дням
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {days.map(d => {
          const pct = d.total > 0 ? d.completed / d.total : 0;
          let bg = 'rgba(0,0,0,0.04)';
          if (pct === 1) bg = GREEN;
          else if (pct > 0) bg = `${GREEN}50`;
          return (
            <div key={d.day} title={`День ${d.day}: ${d.completed}/${d.total}`} style={{
              width: 24, height: 24, borderRadius: 6,
              background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 600, color: pct === 1 ? '#fff' : pct > 0 ? '#fff' : '#ccc',
            }}>
              {d.day}
            </div>
          );
        })}
      </div>

      {/* Activity breakdown for last active day */}
      {days.length > 0 && (() => {
        const lastDay = days[days.length - 1];
        const dayActs = activities.filter(a =>
          lastDay.day >= (a.first_day || 1) && lastDay.day <= (a.last_day || daysCount)
        );
        return (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>
              День {lastDay.day} — детали:
            </div>
            {dayActs.map(a => {
              const p = progress[lastDay.day]?.[a.id];
              const mins = p?.elapsed ? Math.floor(p.elapsed / 60) : 0;
              return (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <img src={getIconPath(a.icon_num || 'health/1')} alt="" style={{ width: 18, height: 18 }} />
                  <span style={{ fontSize: 12, color: '#555', flex: 1 }}>{a.label}</span>
                  <span style={{ fontSize: 11, color: p?.completed ? GREEN : '#ccc', fontWeight: 600 }}>
                    {p?.completed ? `✓ ${mins}м` : mins > 0 ? `${mins}м` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

function studentWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'ученик';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'ученика';
  return 'учеников';
}
