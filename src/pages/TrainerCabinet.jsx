import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import { getIconPath } from '../data/iconCatalog';
import { getCourseDay } from '../data/constants';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import {
  getCourseStudentsInfo, getCourseAllStudentsProgress,
  inviteToCourse, toggleStudentPause, removeStudentFromCourse,
  changeStudentRole, loadCourseForEdit,
  trainerToggleExclusion, trainerAddStudentActivity, trainerDeleteStudentActivity,
  getCourseExclusions, getCourseCustomActivities,
} from '../lib/db';

const GREEN = '#27ae60';
const BLUE = '#3498db';
const RED = '#e74c3c';
const ORANGE = '#e67e22';
const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор', trainer: 'Тренер' };
const ROLE_COLORS = { student: GREEN, curator: BLUE, trainer: ORANGE };
const OWNER_COLOR = '#8e44ad';

export default function TrainerCabinetPage({ courseId, user, onBack, onRefreshRole, onEditCourse }) {
  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [allProgress, setAllProgress] = useState({});
  const [allExclusions, setAllExclusions] = useState({}); // { userId: { `actId_day`: true } }
  const [allCustomActivities, setAllCustomActivities] = useState([]); // array of custom activities
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
    const [c, s, p, excl, custom] = await Promise.all([
      loadCourseForEdit(courseId),
      getCourseStudentsInfo(courseId),
      getCourseAllStudentsProgress(courseId),
      getCourseExclusions(courseId),
      getCourseCustomActivities(courseId),
    ]);
    setCourse(c);
    setStudents(s);
    setAllProgress(p);
    setAllExclusions(excl);
    setAllCustomActivities(custom);
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

  const handleChangeRole = async (enrollmentId, newRole) => {
    setActionId(enrollmentId);
    const result = await changeStudentRole(enrollmentId, newRole);
    if (result.success) {
      setStudents(prev => prev.map(s =>
        s.enrollment_id === enrollmentId ? { ...s, role: result.role } : s
      ));
      if (onRefreshRole) onRefreshRole();
    } else {
      alert(result.error || 'Ошибка смены роли');
    }
    setActionId(null);
  };

  const activities = (course?.course_activities || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const daysCount = course?.days_count || 30;

  const isActOnDay = (a, d) => {
    if (d < (a.first_day || 1) || d > (a.last_day || daysCount)) return false;
    const interval = a.interval_days || 1;
    return (d - (a.first_day || 1)) % interval === 0;
  };

  // Calculate stats for a student: elapsed days (based on joined_at) and completion
  const getStudentStats = (student) => {
    const startDate = (student.joined_at || '').slice(0, 10);
    const studentCurrentDay = startDate ? getCourseDay(startDate, null, 0, daysCount) : 1;
    const elapsedDays = Math.max(0, studentCurrentDay - 1);
    const prog = allProgress[student.user_id] || {};
    const excl = allExclusions[student.user_id] || {};
    const customActs = allCustomActivities.filter(ca => ca.user_id === student.user_id);
    let completedDays = 0;
    for (let d = 1; d < studentCurrentDay; d++) {
      const dayActs = [...activities, ...customActs]
        .filter(a => isActOnDay(a, d) && !excl[`${a.id}_${d}`]);
      if (dayActs.length === 0) continue;
      if (dayActs.every(a => prog[d]?.[a.id]?.completed)) completedDays++;
    }
    return { elapsedDays, studentCurrentDay, completedDays, totalDays: daysCount };
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
              {daysCount} дней · {activities.length} активн. · {students.length} уч.
            </div>
          </div>
          {onEditCourse && (
            <button onClick={() => onEditCourse(courseId)}
              style={{ background: 'none', border: 'none', fontSize: 20, color: '#bbb', cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}>
              ✏️
            </button>
          )}
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
          Участники ({students.length})
        </div>

        {students.length === 0 ? (
          <div style={{ ...glass, borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 14, color: '#aaa' }}>Пока нет учеников. Пригласите кого-нибудь!</div>
          </div>
        ) : (
          students.map(st => {
            const stats = getStudentStats(st);
            const pct = stats.totalDays > 0 ? Math.round((stats.elapsedDays / stats.totalDays) * 100) : 0;
            const isExpanded = expandedId === st.enrollment_id;
            const isBusy = actionId === st.enrollment_id;
            const isSelf = st.user_id === user.id;
            const isOwner = st.is_owner;
            const avatarColor = isOwner ? OWNER_COLOR : (ROLE_COLORS[st.role] || GREEN);

            return (
              <div key={st.enrollment_id} style={{
                ...glass, borderRadius: 16, padding: '14px 16px', marginBottom: 10,
                border: st.paused ? '2px solid rgba(230,126,34,0.3)' : isOwner ? `2px solid ${OWNER_COLOR}30` : undefined,
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
                    background: `${avatarColor}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: avatarColor,
                  }}>
                    {(st.display_name || '?')[0].toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.display_name}
                        {isSelf && <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}> (вы)</span>}
                      </span>
                      {isOwner ? (
                        <span style={{
                          padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: `${OWNER_COLOR}15`, color: OWNER_COLOR,
                        }}>
                          Создатель
                        </span>
                      ) : (
                        <select
                          value={st.role}
                          disabled={isBusy || isSelf}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); handleChangeRole(st.enrollment_id, e.target.value); }}
                          style={{
                            padding: '2px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            border: `1.5px solid ${ROLE_COLORS[st.role]}40`,
                            background: `${ROLE_COLORS[st.role]}15`, color: ROLE_COLORS[st.role],
                            cursor: isBusy || isSelf ? 'default' : 'pointer', outline: 'none',
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          {['student', 'curator', 'trainer'].map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                      {st.paused && (
                        <span style={{ padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, background: `${ORANGE}15`, color: ORANGE }}>
                          Пауза
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                      {st.email} · день {stats.studentCurrentDay}
                    </div>

                    {/* Progress bar — elapsed days */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: 3,
                          background: pct >= 100 ? GREEN : pct > 50 ? BLUE : pct > 0 ? '#bbb' : '#eee',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: pct > 50 ? GREEN : '#aaa', flexShrink: 0 }}>
                        {stats.elapsedDays}/{stats.totalDays}
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
                      courseId={courseId}
                      progress={allProgress[st.user_id] || {}}
                      activities={activities}
                      daysCount={daysCount}
                      studentCurrentDay={stats.studentCurrentDay}
                      exclusions={allExclusions[st.user_id] || {}}
                      customActivities={allCustomActivities.filter(ca => ca.user_id === st.user_id)}
                      onToggleExclusion={async (actId, day) => {
                        const result = await trainerToggleExclusion(courseId, st.user_id, actId, day);
                        if (result.success) {
                          setAllExclusions(prev => {
                            const next = { ...prev };
                            if (!next[st.user_id]) next[st.user_id] = {};
                            const key = `${actId}_${day}`;
                            if (result.excluded) next[st.user_id][key] = true;
                            else delete next[st.user_id][key];
                            return next;
                          });
                        }
                        return result;
                      }}
                      onAddActivity={async (label, iconNum, durationMin, firstDay, lastDay, intervalDays) => {
                        const result = await trainerAddStudentActivity(
                          courseId, st.user_id, label, iconNum, durationMin, firstDay, lastDay, intervalDays
                        );
                        if (result.success) {
                          setAllCustomActivities(prev => [...prev, {
                            id: result.id, user_id: st.user_id, label, icon_num: iconNum,
                            duration_min: durationMin, first_day: firstDay, last_day: lastDay,
                            interval_days: intervalDays,
                          }]);
                        }
                        return result;
                      }}
                      onDeleteCustomActivity={async (actId) => {
                        const result = await trainerDeleteStudentActivity(actId);
                        if (result.success) {
                          setAllCustomActivities(prev => prev.filter(a => a.id !== actId));
                        }
                        return result;
                      }}
                    />

                    {/* Actions */}
                    {(
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => handleTogglePause(st.enrollment_id)} disabled={isBusy}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 10,
                            border: `1.5px solid ${st.paused ? GREEN : ORANGE}40`,
                            background: st.paused ? `${GREEN}08` : `${ORANGE}08`,
                            color: st.paused ? GREEN : ORANGE,
                            fontSize: 13, fontWeight: 600, cursor: isBusy ? 'wait' : 'pointer',
                          }}>
                          {st.paused ? '▶ Возобновить' : '⏸ На паузу'}
                        </button>
                        {!isOwner && !isSelf && (
                          <button onClick={() => handleRemove(st.enrollment_id, st.display_name)} disabled={isBusy}
                            style={{
                              padding: '10px 16px', borderRadius: 10,
                              border: `1.5px solid ${RED}30`, background: `${RED}06`,
                              color: RED, fontSize: 13, fontWeight: 600,
                              cursor: isBusy ? 'wait' : 'pointer',
                            }}>
                            🗑
                          </button>
                        )}
                      </div>
                    )}
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
function StudentDetails({
  userId, courseId, progress, activities, daysCount, studentCurrentDay,
  exclusions, customActivities, onToggleExclusion, onAddActivity, onDeleteCustomActivity,
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [saving, setSaving] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ label: '', iconNum: 'health/1', durationMin: 10, firstDay: '', lastDay: '', intervalDays: 1 });
  const [addSaving, setAddSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const isActOnDay = (a, d) => {
    const first = a.first_day || 1;
    const last = a.last_day || daysCount;
    if (d < first || d > last) return false;
    const interval = a.interval_days || 0;
    if (interval === 0) return d === first;
    return (d - first) % interval === 0;
  };

  // Merge course activities + custom activities for this student
  const allActs = [
    ...activities,
    ...customActivities.map(ca => ({
      ...ca, label: ca.label, icon_num: ca.icon_num, duration_min: ca.duration_min,
      first_day: ca.first_day, last_day: ca.last_day, interval_days: ca.interval_days,
      _isCustom: true,
    })),
  ];

  // Build day data accounting for exclusions
  const days = [];
  for (let d = 1; d <= daysCount; d++) {
    const dayActivities = allActs.filter(a => isActOnDay(a, d) && !exclusions[`${a.id}_${d}`]);
    if (dayActivities.length === 0) continue;
    const completed = dayActivities.filter(a => progress[d]?.[a.id]?.completed).length;
    const allDone = completed === dayActivities.length;
    const totalSec = dayActivities.reduce((s, a) => s + (a.duration_min || 10) * 60, 0);
    let elapsedSec = 0;
    dayActivities.forEach(a => {
      if (progress[d]?.[a.id]?.completed) elapsedSec += (a.duration_min || 10) * 60;
      else elapsedSec += (progress[d]?.[a.id]?.elapsed || 0);
    });
    const frac = totalSec > 0 ? elapsedSec / totalSec : 0;
    days.push({ day: d, total: dayActivities.length, completed, allDone, frac });
  }

  const viewDay = selectedDay || (studentCurrentDay > 1 ? studentCurrentDay - 1 : 1);
  const isFutureDay = viewDay >= studentCurrentDay;
  const isPastDay = viewDay < studentCurrentDay;

  const handleToggleExcl = async (actId) => {
    setSaving(actId);
    const result = await onToggleExclusion(actId, viewDay);
    if (!result.success) alert(result.error || 'Ошибка');
    setSaving(null);
  };

  const handleAdd = async () => {
    if (!addForm.label.trim()) return;
    setAddSaving(true);
    const result = await onAddActivity(
      addForm.label.trim(), addForm.iconNum,
      addForm.durationMin || 10,
      addForm.firstDay || viewDay, addForm.lastDay || daysCount,
      addForm.intervalDays || 1,
    );
    if (result.success) {
      setShowAddForm(false);
      setAddForm({ label: '', iconNum: 'health/1', durationMin: 10, firstDay: '', lastDay: '', intervalDays: 1 });
    } else {
      alert(result.error || 'Ошибка');
    }
    setAddSaving(false);
  };

  const inputStyle = {
    padding: '8px 10px', borderRadius: 10, fontSize: 13,
    border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
    outline: 'none', boxSizing: 'border-box', width: '100%', color: '#1a1a2e',
  };
  const labelStyle = { fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 4, display: 'block' };

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 8 }}>
        Прогресс по дням <span style={{ fontWeight: 400, color: '#bbb' }}>(нажмите на день)</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {days.map(d => {
          const isFuture = d.day >= studentCurrentDay;
          const isSelected = d.day === viewDay;
          return (
            <DaySquare
              key={d.day}
              day={d.day}
              frac={d.frac}
              allDone={d.allDone}
              isFuture={isFuture}
              isSelected={isSelected}
              title={`День ${d.day}: ${d.completed}/${d.total}`}
              onClick={() => setSelectedDay(d.day)}
            />
          );
        })}
      </div>

      {/* Activity breakdown for selected day */}
      {(() => {
        // Show all activities for this day (active + excluded for trainer view)
        const allDayActs = allActs.filter(a => isActOnDay(a, viewDay));
        const activeDayActs = allDayActs.filter(a => !exclusions[`${a.id}_${viewDay}`]);
        const excludedDayActs = allDayActs.filter(a => exclusions[`${a.id}_${viewDay}`]);

        if (allDayActs.length === 0 && !isFutureDay) return null;

        const dayComplete = activeDayActs.length > 0 && activeDayActs.every(a => progress[viewDay]?.[a.id]?.completed);
        const dayStarted = activeDayActs.some(a => (progress[viewDay]?.[a.id]?.elapsed || 0) > 0);

        return (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>
                  День {viewDay}
                </span>
                {isFutureDay && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: `${BLUE}15`, color: BLUE }}>
                    будущий
                  </span>
                )}
              </div>
              {!isFutureDay && (
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: dayComplete ? `${GREEN}15` : dayStarted ? `${ORANGE}15` : 'rgba(0,0,0,0.04)',
                  color: dayComplete ? GREEN : dayStarted ? ORANGE : '#bbb',
                }}>
                  {dayComplete ? 'Выполнен' : dayStarted ? 'Частично' : 'Не начат'}
                </span>
              )}
            </div>

            {/* Active activities */}
            {activeDayActs.map(a => {
              const p = progress[viewDay]?.[a.id];
              const mins = p?.elapsed ? Math.floor(p.elapsed / 60) : 0;
              const secs = p?.elapsed ? p.elapsed % 60 : 0;
              const target = a.duration_min || 10;
              const timePct = Math.min(100, Math.round((mins / target) * 100));
              const isSaving = saving === a.id;
              return (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '4px 0',
                }}>
                  <img src={getIconPath(a.icon_num || 'health/1')} alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#555', fontWeight: 500, marginBottom: 2 }}>
                      {a.label}
                      {a._isCustom && <span style={{ fontSize: 9, color: BLUE, marginLeft: 4 }}>индив.</span>}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${timePct}%`, height: '100%', borderRadius: 2,
                        background: p?.completed ? GREEN : timePct > 0 ? ORANGE : 'transparent',
                      }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: p?.completed ? GREEN : mins > 0 ? ORANGE : '#ccc', fontWeight: 600, flexShrink: 0 }}>
                    {p?.completed ? `✓ ${mins}м` : mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>/{target}м</span>
                  {/* Disable button for any activity on future days */}
                  {isFutureDay && (
                    <button onClick={() => handleToggleExcl(a.id)} disabled={isSaving}
                      title="Отключить для ученика"
                      style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0, padding: 0,
                        border: `1.5px solid ${RED}40`, background: `${RED}08`, color: RED,
                        fontSize: 12, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: isSaving ? 0.5 : 1,
                      }}>✕</button>
                  )}
                </div>
              );
            })}

            {/* Excluded (disabled) activities shown as greyed out */}
            {excludedDayActs.length > 0 && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10, color: '#bbb', marginBottom: 4 }}>Отключено:</div>
                {excludedDayActs.map(a => {
                  const isSaving = saving === a.id;
                  return (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, padding: '3px 0', opacity: 0.5,
                    }}>
                      <img src={getIconPath(a.icon_num || 'health/1')} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 12, color: '#999', textDecoration: 'line-through' }}>{a.label}</span>
                      {isFutureDay && (
                        <button onClick={() => handleToggleExcl(a.id)} disabled={isSaving}
                          title="Включить обратно"
                          style={{
                            width: 26, height: 26, borderRadius: 6, flexShrink: 0, padding: 0,
                            border: `1.5px solid ${GREEN}40`, background: `${GREEN}08`, color: GREEN,
                            fontSize: 12, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>✓</button>
                      )}
                      {isFutureDay && a._isCustom && (
                        <button onClick={async () => {
                          if (!confirm(`Удалить индивидуальную практику "${a.label}"?`)) return;
                          setSaving(a.id);
                          await onDeleteCustomActivity(a.id);
                          setSaving(null);
                        }} disabled={isSaving}
                          title="Удалить индивидуальную практику"
                          style={{
                            width: 26, height: 26, borderRadius: 6, flexShrink: 0, padding: 0,
                            border: `1.5px solid ${RED}40`, background: `${RED}15`, color: RED,
                            fontSize: 11, cursor: isSaving ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>🗑</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add practice button — only for future days */}
            {isFutureDay && (
              <div style={{ marginTop: 8 }}>
                {!showAddForm ? (
                  <button onClick={() => {
                    setAddForm(f => ({ ...f, firstDay: viewDay, lastDay: viewDay, intervalDays: 0 }));
                    setShowAddForm(true);
                  }} style={{
                    width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: `1.5px dashed ${GREEN}40`, background: `${GREEN}06`, color: GREEN,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    + Добавить практику
                  </button>
                ) : (
                  <div style={{ padding: '10px', borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 8 }}>
                      Новая практика для ученика
                    </div>
                    {/* Icon + Name row */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                      <button onClick={() => setShowIconPicker(true)} style={{
                        width: 42, height: 42, borderRadius: 10, flexShrink: 0, padding: 4, cursor: 'pointer',
                        border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <img src={getIconPath(addForm.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </button>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Название</label>
                        <input value={addForm.label} onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))}
                          placeholder="Например: Растяжка" style={inputStyle} />
                      </div>
                    </div>
                    {/* Day range + interval */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>С дня</label>
                        <input type="number" value={addForm.firstDay}
                          onChange={e => setAddForm(f => ({ ...f, firstDay: parseInt(e.target.value) || '' }))}
                          style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>По день</label>
                        <input type="number" value={addForm.lastDay}
                          onChange={e => setAddForm(f => ({ ...f, lastDay: parseInt(e.target.value) || '' }))}
                          style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Интервал</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" value={addForm.intervalDays}
                            onChange={e => setAddForm(f => ({ ...f, intervalDays: parseInt(e.target.value) || 1 }))}
                            style={inputStyle} />
                          <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>дней</span>
                        </div>
                      </div>
                    </div>
                    {/* Duration */}
                    <div style={{ marginBottom: 8 }}>
                      <label style={labelStyle}>Длительность</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" value={addForm.durationMin}
                          onChange={e => setAddForm(f => ({ ...f, durationMin: parseInt(e.target.value) || 1 }))}
                          style={{ ...inputStyle, width: 80 }} />
                        <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>минут</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={handleAdd} disabled={addSaving || !addForm.label.trim()} style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: 'none', background: '#1a1a2e', color: '#fff',
                        cursor: addSaving ? 'wait' : 'pointer', opacity: addSaving ? 0.6 : 1,
                      }}>
                        {addSaving ? 'Сохранение...' : 'Добавить'}
                      </button>
                      <button onClick={() => setShowAddForm(false)} style={{
                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: '1.5px solid rgba(0,0,0,0.1)', background: '#fff', color: '#888', cursor: 'pointer',
                      }}>
                        Отмена
                      </button>
                    </div>
                    {showIconPicker && (
                      <IconPicker
                        value={addForm.iconNum}
                        onChange={num => { setAddForm(f => ({ ...f, iconNum: num })); setShowIconPicker(false); }}
                        onClose={() => setShowIconPicker(false)}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/* ── Day square with proportional fill (like DayCircle in Dashboard) ── */
function DaySquare({ day, frac, allDone, isFuture, isSelected, title, onClick }) {
  const SZ = 26, R = 5, PAD = 1;
  const innerH = SZ - PAD * 2;
  const fillH = Math.min(frac, 1) * innerH;
  const fillY = SZ - PAD - fillH;
  const fillOpacity = allDone ? 0.85 : 0.25;
  const clipId = `sq-${day}`;

  return (
    <svg
      width={SZ} height={SZ}
      viewBox={`0 0 ${SZ} ${SZ}`}
      onClick={onClick}
      style={{
        display: 'block', cursor: 'pointer', flexShrink: 0,
        outline: isSelected ? `2px solid ${GREEN}` : 'none',
        outlineOffset: 1, borderRadius: R + 1,
      }}
    >
      <title>{title}</title>
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD} y={PAD} width={SZ - PAD * 2} height={innerH} rx={R - 1} />
        </clipPath>
      </defs>
      {/* Background */}
      <rect x={0} y={0} width={SZ} height={SZ} rx={R}
        fill={isFuture ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.04)'} />
      {/* Proportional fill from bottom */}
      {frac > 0 && (
        <rect x={PAD} y={fillY} width={SZ - PAD * 2} height={fillH}
          fill={GREEN} opacity={fillOpacity} clipPath={`url(#${clipId})`} />
      )}
      {/* Border */}
      <rect x={0.5} y={0.5} width={SZ - 1} height={SZ - 1} rx={R}
        fill="none" stroke={isFuture ? 'rgba(0,0,0,0.06)' : GREEN} strokeWidth={0.8}
        opacity={isFuture ? 0.5 : allDone ? 0.6 : 0.3} />
      {/* Day number */}
      <text x={SZ / 2} y={SZ / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={allDone ? '#fff' : frac > 0.5 ? '#fff' : isFuture ? '#ddd' : '#999'}
        fontSize={9} fontWeight={600}>
        {day}
      </text>
    </svg>
  );
}

function studentWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'ученик';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'ученика';
  return 'учеников';
}
