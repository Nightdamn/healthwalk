import React, { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import Dropdown from '../components/Dropdown';
import RichTextEditor from '../components/RichTextEditor';

const PRACTICE_TYPE_OPTIONS = [
  { value: 'media', label: 'Практика' },
  { value: 'theory', label: 'Текстовая теория' },
  { value: 'call', label: 'Онлайн с мастером' },
];
import { getIconPath } from '../data/iconCatalog';
import { getCourseDay, isActivityScheduled } from '../data/constants';
import { glass, pageWrapper } from '../styles/shared';
import TopBar from '../components/TopBar';
import {
  getCourseStudentsInfo, getCourseAllStudentsProgress,
  inviteToCourse, toggleStudentPause, removeStudentFromCourse,
  changeStudentRole, loadCourseForEdit, setEnrollmentMode,
  trainerToggleExclusion, trainerAddStudentActivity, trainerDeleteStudentActivity,
  trainerToggleCompletion,
  getCourseExclusions, getCourseCustomActivities,
  getConversation, sendMessage, markMessagesRead, getUnreadByConversation,
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
  const [chatUserId, setChatUserId] = useState(null); // open chat with this student
  const [unreadMap, setUnreadMap] = useState({}); // { `courseId_senderId`: count }
  const [roleDropdownId, setRoleDropdownId] = useState(null); // enrollment_id with open role dropdown

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
    // Load unread messages
    const unreadData = await getUnreadByConversation();
    const map = {};
    for (const u of unreadData) map[`${u.course_id}_${u.sender_id}`] = Number(u.unread_count);
    setUnreadMap(map);
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

  const courseMode = (m) => ({ daily: 'По дням', free: 'По прохождению', self_paced: 'Свободно' }[m] || 'По дням');

  // v25: смена per-student режима зачёта дня (или reset к общему = null).
  const handleChangeMode = async (enrollmentId, newMode) => {
    setActionId(enrollmentId);
    const result = await setEnrollmentMode(enrollmentId, newMode);
    if (result?.error) {
      alert(result.error);
    } else {
      setStudents(prev => prev.map(s =>
        s.enrollment_id === enrollmentId ? { ...s, progression_mode_override: newMode } : s
      ));
    }
    setActionId(null);
  };

  const activities = (course?.course_activities || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const daysCount = course?.days_count || 30;

  const effectiveStartDate = (student) => {
    if (course?.bound_to_calendar && course.start_date) {
      return String(course.start_date).slice(0, 10);
    }
    return (student.joined_at || '').slice(0, 10);
  };

  const isActOnDayForStudent = (a, d, student) =>
    isActivityScheduled(a, d, effectiveStartDate(student));

  const getStudentStats = (student) => {
    const startDate = effectiveStartDate(student);
    const studentCurrentDay = startDate ? getCourseDay(startDate, null, 0, daysCount) : 1;
    const elapsedDays = Math.max(0, studentCurrentDay - 1);
    const prog = allProgress[student.user_id] || {};
    const excl = allExclusions[student.user_id] || {};
    const customActs = allCustomActivities.filter(ca => ca.user_id === student.user_id);
    let completedDays = 0;
    for (let d = 1; d < studentCurrentDay; d++) {
      const dayActs = [...activities, ...customActs]
        .filter(a => isActOnDayForStudent(a, d, student) && !excl[`${a.id}_${d}`]);
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
        <TopBar onBack={onBack} title="Кабинет тренера" />

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
                position: 'relative', zIndex: roleDropdownId === st.enrollment_id ? 10 : 1,
              }}>
                {/* Main row — clickable */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : st.enrollment_id)}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}
                >
                  {/* Initials avatar */}
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `${avatarColor}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: avatarColor,
                  }}>
                    {(st.display_name || '?')[0].toUpperCase()}
                  </div>
                  {!isSelf && (unreadMap[`${courseId}_${st.user_id}`] || 0) > 0 && (
                    <div style={{
                      position: 'absolute', top: -3, right: -3,
                      width: 12, height: 12, borderRadius: '50%',
                      background: ORANGE, border: '2px solid #fff',
                    }} />
                  )}
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
                        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              if (!isBusy && !isSelf) setRoleDropdownId(roleDropdownId === st.enrollment_id ? null : st.enrollment_id);
                            }}
                            style={{
                              padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: `1.5px solid ${ROLE_COLORS[st.role]}40`,
                              background: `${ROLE_COLORS[st.role]}15`, color: ROLE_COLORS[st.role],
                              cursor: isBusy || isSelf ? 'default' : 'pointer', outline: 'none',
                              opacity: isBusy ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            {ROLE_LABELS[st.role]}
                            {!isSelf && <span style={{ fontSize: 8, marginLeft: 2 }}>▼</span>}
                          </button>
                          {roleDropdownId === st.enrollment_id && (
                            <>
                              <div onClick={() => setRoleDropdownId(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 19 }} />
                              <div style={{
                                position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 4,
                                background: '#fff', borderRadius: 10, border: '1px solid rgba(0,0,0,0.08)',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 120,
                              }}>
                                {['student', 'curator', 'trainer'].map(r => (
                                  <button key={r}
                                    onClick={() => {
                                      setRoleDropdownId(null);
                                      if (r !== st.role) handleChangeRole(st.enrollment_id, r);
                                    }}
                                    style={{
                                      width: '100%', padding: '10px 14px', border: 'none',
                                      background: r === st.role ? `${ROLE_COLORS[r]}10` : '#fff',
                                      fontSize: 13, fontWeight: r === st.role ? 600 : 400,
                                      color: ROLE_COLORS[r], cursor: 'pointer', textAlign: 'left',
                                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                    }}>
                                    {r === st.role && <span style={{ fontSize: 11 }}>✓</span>}
                                    {ROLE_LABELS[r]}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
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
                      studentStartDate={effectiveStartDate(st)}
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
                      onAddActivity={async (label, iconNum, durationMin, firstDay, lastDay, intervalDays, practiceType, descriptionHtml) => {
                        const result = await trainerAddStudentActivity(
                          courseId, st.user_id, label, iconNum, durationMin, firstDay, lastDay, intervalDays,
                          practiceType, descriptionHtml
                        );
                        if (result.success) {
                          setAllCustomActivities(prev => [...prev, {
                            id: result.id, user_id: st.user_id, label, icon_num: iconNum,
                            duration_min: durationMin, first_day: firstDay, last_day: lastDay,
                            interval_days: intervalDays,
                            practice_type: practiceType || 'media',
                            description_html: descriptionHtml || null,
                            created_at: result.createdAt || new Date().toISOString(),
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
                      onToggleCompletion={async (actId, day, completed) => {
                        const result = await trainerToggleCompletion(courseId, st.user_id, actId, day, completed);
                        if (result.success) {
                          setAllProgress(prev => {
                            const next = { ...prev };
                            if (!next[st.user_id]) next[st.user_id] = {};
                            if (!next[st.user_id][day]) next[st.user_id][day] = {};
                            next[st.user_id][day] = {
                              ...next[st.user_id][day],
                              [actId]: { elapsed: result.elapsed || 0, completed: result.completed },
                            };
                            return next;
                          });
                        }
                        return result;
                      }}
                    />

                    {/* v25: селектор per-student Режима зачёта дня. NULL = «Как у курса». */}
                    {!isOwner && st.role === 'student' && (
                      <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.02)' }}>
                        <div style={{ fontSize: 11, color: '#888', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' }}>
                          Режим зачёта дня
                        </div>
                        <select
                          value={st.progression_mode_override || ''}
                          disabled={isBusy}
                          onChange={e => handleChangeMode(st.enrollment_id, e.target.value || null)}
                          style={{
                            width: '100%', padding: '8px 10px', borderRadius: 8,
                            border: '1.5px solid rgba(0,0,0,0.08)', background: '#fff',
                            fontSize: 13, color: '#1a1a2e',
                          }}>
                          <option value="">Как у курса ({courseMode(st.course_progression_mode)})</option>
                          <option value="daily">По дням</option>
                          <option value="free">По прохождению</option>
                          <option value="self_paced">Свободно</option>
                        </select>
                        {typeof st.closed_days === 'string' || typeof st.closed_days === 'number' ? (
                          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                            Закрытых дней: {st.closed_days}
                          </div>
                        ) : null}
                      </div>
                    )}

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

                    {/* Chat button */}
                    {!isSelf && (
                      <button onClick={() => setChatUserId(st.user_id)}
                        style={{
                          width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 10,
                          border: `1.5px solid ${BLUE}40`, background: `${BLUE}08`,
                          color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          position: 'relative',
                        }}>
                        💬 Связь с учеником
                        {(unreadMap[`${courseId}_${st.user_id}`] || 0) > 0 && (
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%', background: ORANGE,
                          }} />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Chat modal */}
        {chatUserId && (
          <TrainerChat
            courseId={courseId}
            trainerId={user.id}
            studentId={chatUserId}
            studentName={students.find(s => s.user_id === chatUserId)?.display_name || ''}
            onClose={() => setChatUserId(null)}
            onRead={() => {
              setUnreadMap(prev => {
                const next = { ...prev };
                delete next[`${courseId}_${chatUserId}`];
                return next;
              });
            }}
          />
        )}
      </div>
    </Layout>
  );
}

/* ── Student detail progress view ── */
function StudentDetails({
  userId, courseId, progress, activities, daysCount, studentCurrentDay, studentStartDate,
  exclusions, customActivities, onToggleExclusion, onAddActivity, onDeleteCustomActivity,
  onToggleCompletion,
}) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [completionSaving, setCompletionSaving] = useState(null);
  const [saving, setSaving] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    label: '', iconNum: 'health/1', durationMin: 10, firstDay: '', lastDay: '', intervalDays: 1,
    practiceType: 'media', descriptionHtml: '',
  });
  const [addSaving, setAddSaving] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const isActOnDay = (a, d) => isActivityScheduled(a, d, studentStartDate);

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

  const viewDay = selectedDay || studentCurrentDay;
  const isCurrentDay = viewDay === studentCurrentDay;
  const isFutureDay = viewDay > studentCurrentDay;
  const isPastDay = viewDay < studentCurrentDay;
  const canEdit = viewDay >= studentCurrentDay; // adding/excluding: current + future
  const canMarkCompletion = viewDay <= studentCurrentDay; // marking done: past + current

  const handleToggleExcl = async (actId) => {
    setSaving(actId);
    const result = await onToggleExclusion(actId, viewDay);
    if (!result.success) alert(result.error || 'Ошибка');
    setSaving(null);
  };

  const handleAdd = async () => {
    if (!addForm.label.trim()) return;
    setAddSaving(true);
    const pt = addForm.practiceType || 'media';
    // Theory has duration 1 min (instant); call duration is set per scheduled session.
    const dur = pt === 'theory' ? 1 : (addForm.durationMin || 10);
    const result = await onAddActivity(
      addForm.label.trim(), addForm.iconNum,
      dur,
      addForm.firstDay || viewDay, addForm.lastDay || daysCount,
      addForm.intervalDays || 1,
      pt,
      addForm.descriptionHtml || null,
    );
    if (result.success) {
      setShowAddForm(false);
      setAddForm({
        label: '', iconNum: 'health/1', durationMin: 10, firstDay: '', lastDay: '', intervalDays: 1,
        practiceType: 'media', descriptionHtml: '',
      });
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

        if (allDayActs.length === 0 && isPastDay) return null;

        const dayComplete = activeDayActs.length > 0 && activeDayActs.every(a => progress[viewDay]?.[a.id]?.completed);
        const dayStarted = activeDayActs.some(a => (progress[viewDay]?.[a.id]?.elapsed || 0) > 0);

        return (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>
                  День {viewDay}
                </span>
                {isCurrentDay && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: `${GREEN}15`, color: GREEN }}>
                    текущий
                  </span>
                )}
                {isFutureDay && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: `${BLUE}15`, color: BLUE }}>
                    будущий
                  </span>
                )}
                {isPastDay && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: 'rgba(0,0,0,0.05)', color: '#999' }}>
                    прошедший
                  </span>
                )}
              </div>
              {isPastDay && (
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
              const isInstant = a.practice_type === 'theory' || a.practice_type === 'call';
              const timePct = isInstant
                ? (p?.completed ? 100 : 0)
                : Math.min(100, Math.round((mins / target) * 100));
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
                    {isInstant
                      ? (p?.completed ? '✓' : '—')
                      : p?.completed ? `✓ ${mins}м` : mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : '—'}
                  </span>
                  {!isInstant && (
                    <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0 }}>/{target}м</span>
                  )}
                  {/* Mark/unmark completion — past + current day */}
                  {canMarkCompletion && onToggleCompletion && (
                    <button
                      onClick={async () => {
                        setCompletionSaving(a.id);
                        await onToggleCompletion(a.id, viewDay, !p?.completed);
                        setCompletionSaving(null);
                      }}
                      disabled={completionSaving === a.id}
                      title={p?.completed ? 'Отменить зачёт' : 'Зачесть практику'}
                      style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0, padding: 0,
                        border: `1.5px solid ${p?.completed ? GREEN : 'rgba(0,0,0,0.15)'}`,
                        background: p?.completed ? GREEN : 'rgba(255,255,255,0.7)',
                        color: p?.completed ? '#fff' : '#bbb',
                        fontSize: 13, fontWeight: 700,
                        cursor: completionSaving === a.id ? 'wait' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: completionSaving === a.id ? 0.5 : 1,
                      }}>✓</button>
                  )}
                  {/* Disable button — current + future days */}
                  {canEdit && (
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
                      {canEdit && (
                        <button onClick={() => handleToggleExcl(a.id)} disabled={isSaving}
                          title="Включить обратно"
                          style={{
                            width: 26, height: 26, borderRadius: 6, flexShrink: 0, padding: 0,
                            border: `1.5px solid ${GREEN}40`, background: `${GREEN}08`, color: GREEN,
                            fontSize: 12, fontWeight: 700, cursor: isSaving ? 'wait' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>✓</button>
                      )}
                      {canEdit && a._isCustom && (
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
            {canEdit && (
              <div style={{ marginTop: 8 }}>
                {!showAddForm ? (
                  <button onClick={() => {
                    setAddForm(f => ({ ...f, firstDay: viewDay, lastDay: viewDay, intervalDays: 1 }));
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
                    {/* Practice type */}
                    <div style={{ marginBottom: 6 }}>
                      <label style={labelStyle}>Тип практики</label>
                      <Dropdown
                        value={addForm.practiceType || 'media'}
                        onChange={(v) => setAddForm(f => ({ ...f, practiceType: v }))}
                        options={PRACTICE_TYPE_OPTIONS}
                        fullWidth
                      />
                    </div>
                    {/* Description / theory text — for theory and call */}
                    {(addForm.practiceType === 'theory' || addForm.practiceType === 'call') && (
                      <div style={{ marginBottom: 6 }}>
                        <label style={labelStyle}>{addForm.practiceType === 'theory' ? 'Текст теории' : 'Описание'}</label>
                        <RichTextEditor
                          content={addForm.descriptionHtml || ''}
                          onChange={(val) => setAddForm(f => ({ ...f, descriptionHtml: val }))}
                          placeholder={addForm.practiceType === 'theory' ? 'Содержание теоретического материала...' : 'Описание онлайн-практики...'}
                        />
                      </div>
                    )}
                    {/* Day range + interval. Inputs accept empty during edit; on blur
                        we clamp to a valid range so it's impossible to save a broken value. */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>С дня</label>
                        <input type="number" value={addForm.firstDay === '' ? '' : addForm.firstDay}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '') { setAddForm(f => ({ ...f, firstDay: '' })); return; }
                            const n = parseInt(v);
                            if (!isNaN(n)) setAddForm(f => ({ ...f, firstDay: n }));
                          }}
                          onBlur={() => setAddForm(f => {
                            const n = parseInt(f.firstDay);
                            const min = studentCurrentDay; // can only add to current/future
                            return { ...f, firstDay: isNaN(n) || n < min ? min : Math.min(n, daysCount) };
                          })}
                          style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>По день</label>
                        <input type="number" value={addForm.lastDay === '' ? '' : addForm.lastDay}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '') { setAddForm(f => ({ ...f, lastDay: '' })); return; }
                            const n = parseInt(v);
                            if (!isNaN(n)) setAddForm(f => ({ ...f, lastDay: n }));
                          }}
                          onBlur={() => setAddForm(f => {
                            const n = parseInt(f.lastDay);
                            const fd = parseInt(f.firstDay) || studentCurrentDay;
                            return { ...f, lastDay: isNaN(n) || n < fd ? fd : Math.min(n, daysCount) };
                          })}
                          style={inputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Интервал</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" value={addForm.intervalDays === '' ? '' : addForm.intervalDays}
                            onChange={e => {
                              const v = e.target.value;
                              if (v === '') { setAddForm(f => ({ ...f, intervalDays: '' })); return; }
                              const n = parseInt(v);
                              if (!isNaN(n)) setAddForm(f => ({ ...f, intervalDays: n }));
                            }}
                            onBlur={() => setAddForm(f => {
                              const n = parseInt(f.intervalDays);
                              return { ...f, intervalDays: isNaN(n) || n < 1 ? 1 : Math.min(n, daysCount) };
                            })}
                            style={inputStyle} />
                          <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>дней</span>
                        </div>
                      </div>
                    </div>
                    {/* Duration — hidden for theory/call */}
                    {addForm.practiceType !== 'theory' && addForm.practiceType !== 'call' && (
                      <div style={{ marginBottom: 8 }}>
                        <label style={labelStyle}>Длительность</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="number" value={addForm.durationMin === '' ? '' : addForm.durationMin}
                            onChange={e => {
                              const v = e.target.value;
                              if (v === '') { setAddForm(f => ({ ...f, durationMin: '' })); return; }
                              const n = parseInt(v);
                              if (!isNaN(n)) setAddForm(f => ({ ...f, durationMin: n }));
                            }}
                            onBlur={() => setAddForm(f => {
                              const n = parseInt(f.durationMin);
                              return { ...f, durationMin: isNaN(n) || n < 1 ? 10 : Math.min(n, 1200) };
                            })}
                            style={{ ...inputStyle, width: 80 }} />
                          <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>минут</span>
                        </div>
                      </div>
                    )}
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

/* ── Trainer ↔ Student chat modal ── */
function TrainerChat({ courseId, trainerId, studentId, studentName, onClose, onRead }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatRef = useRef(null);
  const shouldScrollRef = useRef(true);

  const loadMessages = useCallback(async () => {
    const msgs = await getConversation(courseId, studentId);
    setMessages(msgs);
    setLoading(false);
    await markMessagesRead(courseId, studentId);
    if (onRead) onRead();
  }, [courseId, studentId, onRead]);

  useEffect(() => { shouldScrollRef.current = true; loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (shouldScrollRef.current && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
      shouldScrollRef.current = false;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    const result = await sendMessage(courseId, studentId, text.trim());
    setSending(false);
    if (result.success) {
      setText('');
      shouldScrollRef.current = true;
      await loadMessages();
    } else {
      alert(result.error || 'Ошибка отправки');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 500, maxHeight: '85vh',
        background: '#fff', borderRadius: '20px 20px 0 0', padding: '16px 16px 12px',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>
            💬 {studentName}
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none', background: 'rgba(0,0,0,0.05)',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* Messages */}
        <div ref={chatRef} style={{
          flex: 1, overflowY: 'auto', minHeight: 200, maxHeight: '55vh',
          display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12,
          padding: '4px 0',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#aaa', fontSize: 13 }}>Загрузка...</div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#bbb', fontSize: 13 }}>
              Нет сообщений
            </div>
          ) : (
            messages.map(m => {
              const isMine = m.sender_id === trainerId;
              return (
                <div key={m.id} style={{
                  alignSelf: isMine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMine ? '#1a1a2e' : 'rgba(0,0,0,0.04)',
                  color: isMine ? '#fff' : '#1a1a2e',
                  fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word',
                }}>
                  <div>{m.body}</div>
                  <div style={{
                    fontSize: 10, marginTop: 4, textAlign: 'right',
                    color: isMine ? 'rgba(255,255,255,0.5)' : '#bbb',
                  }}>
                    {new Date(m.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              value={text}
              onChange={e => { if (e.target.value.length <= 500) setText(e.target.value); }}
              onKeyDown={handleKeyDown}
              placeholder="Ваш ответ..."
              rows={2}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 12,
                border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.02)',
                fontSize: 14, resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <span style={{ position: 'absolute', right: 10, bottom: 6, fontSize: 10, color: text.length > 450 ? '#e67e22' : '#ccc' }}>
              {text.length}/500
            </span>
          </div>
          <button onClick={handleSend} disabled={sending || !text.trim()}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none',
              background: '#1a1a2e', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: sending || !text.trim() ? 'default' : 'pointer',
              opacity: sending || !text.trim() ? 0.5 : 1, flexShrink: 0, height: 44,
            }}>
            {sending ? '...' : '→'}
          </button>
        </div>
      </div>
    </div>
  );
}
