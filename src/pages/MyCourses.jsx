import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass } from '../styles/shared';
import { getOwnCourses, getEnrolledCourses, getMyInvitations, acceptInvitation, declineInvitation } from '../lib/db';

const GREEN = '#27ae60';
const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор', trainer: 'Тренер' };

export default function MyCoursesPage({ user, userRole, onBack, onNavigate, onEditCourse, onRefresh }) {
  const [ownCourses, setOwnCourses] = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null); // invitation being processed

  const loadAll = async () => {
    if (!user?.id) return;
    setLoading(true);
    const promises = [
      getEnrolledCourses(user.id).then(setEnrolledCourses),
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
      await loadAll();
      onRefresh?.(); // refresh Dashboard items
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

  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 20px", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Мои курсы
          </h2>
          <div style={{ width: 42 }} />
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#aaa" }}>Загрузка...</div>
        ) : (
          <>
            {/* ── Pending Invitations ── */}
            {invitations.length > 0 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#e67e22', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Приглашения ({invitations.length})
                </div>
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
                        {/* Course info */}
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                          <div style={{
                            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                            background: '#fafafa', border: '1.5px solid rgba(0,0,0,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden',
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

                        {/* Accept / Decline buttons */}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => handleAccept(inv)}
                            disabled={busy}
                            style={{
                              flex: 1, padding: '12px 0', borderRadius: 12, border: 'none',
                              background: GREEN, color: '#fff', fontSize: 15, fontWeight: 600,
                              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {busy ? '...' : 'Принять'}
                          </button>
                          <button
                            onClick={() => handleDecline(inv)}
                            disabled={busy}
                            style={{
                              flex: 1, padding: '12px 0', borderRadius: 12,
                              border: '1.5px solid rgba(0,0,0,0.1)', background: '#fff',
                              color: '#999', fontSize: 15, fontWeight: 600,
                              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
                            }}
                          >
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
                <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Созданные курсы
                </div>
                {ownCourses.length === 0 ? (
                  <div style={{ ...glass, borderRadius: 16, padding: "24px 20px", marginBottom: 20, textAlign: "center" }}>
                    <div style={{ fontSize: 14, color: "#aaa", marginBottom: 16 }}>У вас пока нет курсов</div>
                    <button onClick={() => onNavigate('create_course')}
                      style={{ padding: "12px 28px", background: "#1a1a2e", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      Создать курс
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {ownCourses.map((c) => (
                      <div key={c.id}
                        onClick={() => onEditCourse(c.id)}
                        style={{ ...glass, borderRadius: 16, padding: "16px 20px", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{c.title}</div>
                          <span style={{ fontSize: 14, color: "#bbb" }}>✏️</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
                          {c.days_count} дней • {(c.course_activities || []).length} активн. • {c.is_active ? "Активен" : "Неактивен"}
                        </div>
                        {c.description && (
                          <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{c.description}</div>
                        )}
                      </div>
                    ))}
                    <button onClick={() => onNavigate('create_course')}
                      style={{
                        width: "100%", padding: 14, borderRadius: 14,
                        border: "2px dashed rgba(39,174,96,0.3)", background: "rgba(39,174,96,0.04)",
                        color: GREEN, fontSize: 15, fontWeight: 600, cursor: "pointer",
                      }}>
                      + Создать курс
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── Enrolled courses ── */}
            <div style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {isTrainerOrAdmin ? "Курсы, где я участник" : "Мои курсы"}
            </div>
            {enrolledCourses.length === 0 ? (
              <div style={{ ...glass, borderRadius: 16, padding: "24px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: "#aaa" }}>Вы пока не записаны ни на один курс</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {enrolledCourses.map((e) => (
                  <div key={e.id} style={{ ...glass, borderRadius: 16, padding: "16px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
                        {e.courses?.title || "Курс"}
                      </div>
                      <span style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: e.role === 'curator' ? "rgba(52,152,219,0.1)" : "rgba(39,174,96,0.1)",
                        color: e.role === 'curator' ? "#3498db" : GREEN,
                      }}>
                        {ROLE_LABELS[e.role] || e.role}
                      </span>
                    </div>
                    {e.courses?.description && (
                      <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{e.courses.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
