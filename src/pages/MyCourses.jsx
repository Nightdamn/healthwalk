import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass } from '../styles/shared';
import { getOwnCourses, getMyInvitations, acceptInvitation, declineInvitation } from '../lib/db';

const GREEN = '#27ae60';
const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор', trainer: 'Тренер' };

export default function MyCoursesPage({ user, userRole, onBack, onNavigate, onEditCourse, onRefresh, onTrainerCabinet, availableItems }) {
  const [ownCourses, setOwnCourses] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);

  const loadAll = async () => {
    if (!user?.id) return;
    setLoading(true);
    const promises = [
      getMyInvitations(user.email).then(setInvitations),
    ];
    if (userRole === 'trainer' || userRole === 'admin') {
      promises.push(getOwnCourses(user.id).then(setOwnCourses));
    }
    await Promise.all(promises);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [user?.id, userRole]);

  const handleAccept = async (inv) => {
    setActionId(inv.id);
    const result = await acceptInvitation(inv.id);
    if (result.success) {
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      await onRefresh?.();
    } else {
      alert(result.error || 'Ошибка принятия приглашения');
    }
    setActionId(null);
  };

  const handleDecline = async (inv) => {
    setActionId(inv.id);
    const result = await declineInvitation(inv.id);
    if (result.success) {
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
    } else {
      alert(result.error || 'Ошибка отклонения');
    }
    setActionId(null);
  };

  const isTrainerOrAdmin = userRole === 'trainer' || userRole === 'admin';

  // Enrolled courses from availableItems (already loaded with full data)
  const enrolledCourses = (availableItems || []).filter(i => i.type === 'course' && i.ownerId !== user.id);
  // Own courses that user created (for the "Созданные курсы" section)
  const myCourses = (availableItems || []).filter(i => i.type === 'course' && i.ownerId === user.id);

  const CourseAvatar = ({ item, size = 48 }) => {
    const src = item.avatarCustom || (item.avatarIcon ? getIconPath(item.avatarIcon) : null);
    return (
      <div style={{
        width: size, height: size, borderRadius: 12, flexShrink: 0,
        background: '#fafafa', border: '1.5px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {src
          ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: size * 0.45 }}>📚</span>}
      </div>
    );
  };

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 20px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, marginLeft: -20, marginRight: -20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Мои курсы
          </h2>
          <div style={{ width: 42 }} />
        </div>

        {loading && !availableItems?.length ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>Загрузка...</div>
        ) : (
          <>
            {/* ── Pending Invitations ── */}
            {invitations.length > 0 && (
              <>
                <SectionTitle color="#e67e22">Приглашения ({invitations.length})</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {invitations.map(inv => {
                    const course = inv.courses;
                    const avatarSrc = course?.avatar_custom || (course?.avatar_icon ? getIconPath(course.avatar_icon) : null);
                    const busy = actionId === inv.id;
                    return (
                      <div key={inv.id} style={{
                        ...glass, borderRadius: 16, padding: '16px 16px',
                        border: '2px solid rgba(230,126,34,0.25)',
                        background: 'rgba(230,126,34,0.04)',
                      }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                            background: '#fafafa', border: '1.5px solid rgba(0,0,0,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                          }}>
                            {avatarSrc
                              ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              : <span style={{ fontSize: 22 }}>📚</span>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>
                              {course?.title || 'Курс'}
                            </div>
                            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                              {course?.days_count || '?'} дней • роль: {ROLE_LABELS[inv.role] || inv.role}
                            </div>
                            {course?.description && (
                              <div style={{ fontSize: 13, color: '#888', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {course.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => handleAccept(inv)} disabled={busy}
                            style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                              background: GREEN, color: '#fff', fontSize: 15, fontWeight: 600,
                              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                            {busy ? '...' : 'Принять'}
                          </button>
                          <button onClick={() => handleDecline(inv)} disabled={busy}
                            style={{ flex: 1, padding: '12px 0', borderRadius: 12,
                              border: '1.5px solid rgba(0,0,0,0.1)', background: '#fff',
                              color: '#999', fontSize: 15, fontWeight: 600,
                              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                            Отклонить
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Trainer/Admin: own courses ── */}
            {isTrainerOrAdmin && (
              <>
                <SectionTitle>Созданные курсы</SectionTitle>
                {myCourses.length === 0 && ownCourses.length === 0 ? (
                  <div style={{ ...glass, borderRadius: 16, padding: "24px 20px", marginBottom: 20, textAlign: "center" }}>
                    <div style={{ fontSize: 14, color: "#aaa", marginBottom: 16 }}>У вас пока нет курсов</div>
                    <button onClick={() => onNavigate('create_course')}
                      style={{ padding: "12px 28px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      Создать курс
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {(myCourses.length > 0 ? myCourses : ownCourses).map((c) => {
                      const item = c.type ? c : null;
                      const id = item?.id || c.id;
                      const title = item?.title || c.title;
                      const desc = item?.description || c.description || '';
                      const days = item?.daysCount || c.days_count;
                      const acts = item?.activities || [];
                      const enrollCount = item?.enrollCount || (c.course_enrollments || []).length || 0;
                      const studentCount = Math.max(0, enrollCount - 1); // не считаем создателя
                      return (
                        <div key={id} style={{ ...glass, borderRadius: 16, padding: "16px 16px", position: 'relative' }}>
                          <button
                            onClick={() => onEditCourse?.(id)}
                            title="Редактировать курс"
                            style={{
                              position: 'absolute', top: 10, right: 10,
                              width: 32, height: 32, borderRadius: 8, padding: 0,
                              border: '1.5px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.85)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 14, color: '#666',
                            }}
                          >
                            ✏️
                          </button>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', paddingRight: 36 }}>
                            {item && <CourseAvatar item={item} size={48} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>{title}</div>
                              {desc && (
                                <div style={{ fontSize: 13, color: '#888', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {desc}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ marginTop: 12, fontSize: 13, color: '#888' }}>
                            <div style={{ marginBottom: 6 }}>Длительность: <span style={{ fontWeight: 600, color: '#555' }}>{days} дней</span></div>
                            <div style={{ marginBottom: 6 }}>Ученики: <span style={{ fontWeight: 600, color: '#555' }}>{studentCount} чел.</span></div>

                            {acts.length > 0 && (
                              <>
                                <div style={{ marginBottom: 4, fontWeight: 600, color: '#888' }}>Активности:</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {acts.map(a => (
                                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <img src={getIconPath(a.iconNum || 'health/1')} alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />
                                      <span style={{ flex: 1, fontSize: 13, color: '#555' }}>{a.label}</span>
                                      <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{a.durationMin} мин</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>

                          <button onClick={() => onTrainerCabinet(id)}
                            style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10,
                              border: 'none', background: '#1a1a2e',
                              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}>
                            <span>Кабинет тренера</span>
                          </button>
                        </div>
                      );
                    })}
                    <button onClick={() => onNavigate('create_course')}
                      style={{ width: "100%", padding: 14, borderRadius: 14,
                        border: "2px dashed rgba(39,174,96,0.3)", background: "rgba(39,174,96,0.04)",
                        color: GREEN, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                      + Создать курс
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Enrolled courses (where I'm a participant, not owner) ── */}
            <SectionTitle>{isTrainerOrAdmin ? "Курсы, где я участник" : "Мои курсы"}</SectionTitle>
            {enrolledCourses.length === 0 ? (
              <div style={{ ...glass, borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#aaa" }}>Вы пока не записаны ни на один курс</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {enrolledCourses.map((item) => {
                  const roleColor = item.enrollRole === 'curator' ? '#3498db' : item.enrollRole === 'trainer' ? '#e67e22' : GREEN;
                  const acts = item.activities || [];
                  const studentCount = Math.max(0, (item.enrollCount || 0) - 1);
                  return (
                    <div key={item.id} style={{ ...glass, borderRadius: 16, padding: '16px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <CourseAvatar item={item} size={48} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            <span style={{
                              padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, flexShrink: 0,
                              background: `${roleColor}15`, color: roleColor,
                            }}>
                              {ROLE_LABELS[item.enrollRole] || item.enrollRole}
                            </span>
                          </div>
                          {item.description && (
                            <div style={{ fontSize: 13, color: '#888', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.description}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: 12, fontSize: 13, color: '#888' }}>
                        <div style={{ marginBottom: 6 }}>Длительность: <span style={{ fontWeight: 600, color: '#555' }}>{item.daysCount} дней</span></div>
                        <div style={{ marginBottom: 6 }}>Ученики: <span style={{ fontWeight: 600, color: '#555' }}>{studentCount} чел.</span></div>

                        {acts.length > 0 && (
                          <>
                            <div style={{ marginBottom: 4, fontWeight: 600, color: '#888' }}>Активности:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {acts.map(a => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <img src={getIconPath(a.iconNum || 'health/1')} alt="" style={{ width: 20, height: 20, flexShrink: 0 }} />
                                  <span style={{ flex: 1, fontSize: 13, color: '#555' }}>{a.label}</span>
                                  <span style={{ fontSize: 12, color: '#aaa', flexShrink: 0 }}>{a.durationMin} мин</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      {(item.enrollRole === 'trainer' || item.enrollRole === 'curator') && (
                        <button onClick={() => onTrainerCabinet(item.id)}
                          style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10,
                            border: 'none', background: item.enrollRole === 'curator' ? '#3498db' : '#1a1a2e',
                            color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          }}>
                          {item.enrollRole === 'curator' ? 'Кабинет куратора' : 'Кабинет тренера'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function SectionTitle({ children, color = '#888' }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </div>
  );
}
