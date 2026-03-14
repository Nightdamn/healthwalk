import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass } from '../styles/shared';
import { getOwnCourses, getMyInvitations, acceptInvitation, declineInvitation } from '../lib/db';

const GREEN = '#27ae60';
const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор', trainer: 'Тренер' };

export default function MyCoursesPage({ user, userRole, onBack, onNavigate, onEditCourse, onRefresh, availableItems, activeItem, onStartCourse }) {
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
      <div style={{ minHeight: "100vh", padding: "0 20px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
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
                      const item = c.type ? c : null; // from availableItems
                      const isActive = activeItem?.id === (item?.id || c.id);
                      return (
                        <div key={item?.id || c.id} style={{ ...glass, borderRadius: 16, padding: "16px 16px" }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            {item && <CourseAvatar item={item} size={44} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>{item?.title || c.title}</div>
                              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                                {(item?.daysCount || c.days_count)} дней • {(item?.activities?.length || (c.course_activities || []).length)} активн.
                              </div>
                            </div>
                            <button onClick={() => onEditCourse(item?.id || c.id)}
                              style={{ background: 'none', border: 'none', fontSize: 18, color: '#bbb', cursor: 'pointer', padding: '4px 8px' }}>✏️</button>
                          </div>
                          {!isActive && item && (
                            <button onClick={() => onStartCourse(item)}
                              style={{ width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                                border: `1.5px solid ${GREEN}`, background: 'rgba(39,174,96,0.06)',
                                color: GREEN, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                              Начать курс
                            </button>
                          )}
                          {isActive && (
                            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: GREEN, textAlign: 'center' }}>
                              ✓ Активный курс
                            </div>
                          )}
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
                  const isActive = activeItem?.id === item.id;
                  return (
                    <div key={item.id} style={{ ...glass, borderRadius: 16, padding: '16px 16px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <CourseAvatar item={item} size={44} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                            {item.daysCount} дней • {item.activities?.length || 0} активн.
                          </div>
                        </div>
                        <span style={{
                          padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: item.enrollRole === 'curator' ? "rgba(52,152,219,0.1)" : "rgba(39,174,96,0.1)",
                          color: item.enrollRole === 'curator' ? "#3498db" : GREEN,
                        }}>
                          {ROLE_LABELS[item.enrollRole] || item.enrollRole}
                        </span>
                      </div>

                      {!isActive ? (
                        <button onClick={() => onStartCourse(item)}
                          style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10,
                            border: 'none', background: '#1a1a2e',
                            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
                          Начать курс
                        </button>
                      ) : (
                        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: GREEN, textAlign: 'center' }}>
                          ✓ Активный курс
                        </div>
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
