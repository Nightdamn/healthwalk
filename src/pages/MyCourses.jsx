import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { btnBack, glass } from '../styles/shared';
import { getOwnCourses, getEnrolledCourses } from '../lib/db';

const ROLE_LABELS = { student: 'Ученик', curator: 'Куратор' };

export default function MyCoursesPage({ user, userRole, onBack, onNavigate, onEditCourse }) {
  const [ownCourses, setOwnCourses] = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const promises = [];
      if (userRole === 'trainer' || userRole === 'admin') {
        promises.push(getOwnCourses(user.id).then(setOwnCourses));
      }
      promises.push(getEnrolledCourses(user.id).then(setEnrolledCourses));
      await Promise.all(promises);
      setLoading(false);
    })();
  }, [user?.id, userRole]);

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
            {/* Trainer/Admin: own courses */}
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
                        color: "#27ae60", fontSize: 15, fontWeight: 600, cursor: "pointer",
                      }}>
                      + Создать курс
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Enrolled courses */}
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
                  <div key={e.id}
                    onClick={() => onNavigate('course_view', e.course_id)}
                    style={{ ...glass, borderRadius: 16, padding: "16px 20px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>
                        {e.courses?.title || "Курс"}
                      </div>
                      <span style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: e.role === 'curator' ? "rgba(52,152,219,0.1)" : "rgba(39,174,96,0.1)",
                        color: e.role === 'curator' ? "#3498db" : "#27ae60",
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
