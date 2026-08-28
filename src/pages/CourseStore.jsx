import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import TopBar from '../components/TopBar';
import { glass } from '../styles/shared';
import { getIconPath } from '../data/iconCatalog';
import { getStore, getStoreCourse, enrollFromStore } from '../lib/api';

const GREEN = '#27ae60';
const NAVY = '#1a1a2e';

function priceLabel(amount, currency) {
  const n = parseFloat(amount) || 0;
  if (n === 0) return 'Бесплатно';
  return `${n} ${currency || 'RUB'}`;
}

function StoreListItem({ course, onOpen }) {
  const iconSrc = course.avatar_custom || (course.avatar_icon ? getIconPath(course.avatar_icon) : null);
  const enrolled = course.already_enrolled;
  return (
    <button onClick={() => onOpen(course.id)}
      style={{
        ...glass, borderRadius: 16, padding: '14px 14px',
        display: 'flex', gap: 12, alignItems: 'center',
        cursor: 'pointer', textAlign: 'left', width: '100%',
        border: enrolled ? `2px solid ${GREEN}` : glass.border,
      }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, flexShrink: 0,
        background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4,
      }}>
        {iconSrc && <img src={iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {course.title}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {course.owner_name || 'Автор'} · {course.days_count} дн. · {course.enroll_count} записан{course.enroll_count === 1 ? '' : (course.enroll_count >= 2 && course.enroll_count <= 4 ? 'о' : 'о')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>
            {priceLabel(course.price_amount, course.price_currency)}
          </span>
          {enrolled && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#fff',
              padding: '2px 8px', borderRadius: 6, background: GREEN,
              textTransform: 'uppercase', letterSpacing: 0.3,
            }}>Вы записаны</span>
          )}
        </div>
      </div>
      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ flexShrink: 0 }}>
        <path d="M2 2L8 7L2 12" stroke="#aaa" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  );
}

function CourseDetail({ courseId, onBack, onEnrolled }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await getStoreCourse(courseId);
      if (res?.error) throw new Error(res.error);
      setData(res);
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [courseId]);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      const r = await enrollFromStore(courseId);
      if (r?.error) throw new Error(r.error);
      await reload();
      onEnrolled?.();
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setEnrolling(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>;
  if (error) return <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: '#e74c3c' }}>{error}</div>;
  const { course, activities } = data || {};
  if (!course) return null;
  const iconSrc = course.avatar_custom || (course.avatar_icon ? getIconPath(course.avatar_icon) : null);

  return (
    <div>
      <div style={{ ...glass, borderRadius: 18, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 16, flexShrink: 0,
            background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 6,
          }}>
            {iconSrc && <img src={iconSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{course.title}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 6, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{course.owner_name || 'Автор'}</span>
              <span style={{ color: '#ccc' }}>·</span>
              <span>{course.days_count} дн.</span>
              <span style={{ color: '#ccc' }}>·</span>
              <span>{course.enroll_count} записан{course.enroll_count === 1 ? '' : 'о'}</span>
            </div>
          </div>
        </div>

        {course.description && (
          <div style={{ marginTop: 14, fontSize: 14, color: '#333', lineHeight: 1.5 }}>
            {course.description}
          </div>
        )}

        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 12, background: 'rgba(39,174,96,0.06)', border: '1px solid rgba(39,174,96,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: '#666' }}>Стоимость</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>
            {priceLabel(course.price_amount, course.price_currency)}
          </div>
        </div>

        {course.already_enrolled ? (
          <div style={{
            marginTop: 12, padding: 14, borderRadius: 12,
            background: 'rgba(39,174,96,0.08)', color: GREEN, fontSize: 14,
            fontWeight: 600, textAlign: 'center',
          }}>
            Вы уже записаны на этот курс — он доступен в разделе «Мои курсы».
          </div>
        ) : (
          <>
            <button onClick={handleEnroll} disabled={enrolling}
              style={{
                marginTop: 12, width: '100%', padding: 14, borderRadius: 12,
                border: 'none', background: GREEN, color: '#fff',
                fontSize: 15, fontWeight: 700,
                cursor: enrolling ? 'wait' : 'pointer', opacity: enrolling ? 0.6 : 1,
              }}>
              {enrolling ? 'Записываем…' : (parseFloat(course.price_amount) > 0 ? 'Записаться (без оплаты, пилот)' : 'Записаться')}
            </button>
            {parseFloat(course.price_amount) > 0 && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#888', textAlign: 'center' }}>
                Эквайринг подключим отдельной фазой — сейчас запись бесплатная.
              </div>
            )}
          </>
        )}
      </div>

      {activities?.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600, marginBottom: 8 }}>
            Практики курса ({activities.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {activities.map(a => {
              const src = a.icon_num ? getIconPath(a.icon_num) : null;
              return (
                <div key={a.id} style={{
                  ...glass, borderRadius: 12, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, overflow: 'hidden',
                  }}>
                    {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{a.duration_min} мин</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function CourseStorePage({ onBack, onCourseEnrolled }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await getStore();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) { setError(e.message || 'Ошибка'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Layout>
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px 40px', position: 'relative', zIndex: 1 }}>
        <TopBar onBack={selectedId ? () => setSelectedId(null) : onBack} title={selectedId ? 'Курс' : 'Магазин курсов'} />
        {selectedId ? (
          <CourseDetail courseId={selectedId} onBack={() => setSelectedId(null)}
            onEnrolled={() => { onCourseEnrolled?.(); load(); }} />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>Загрузка…</div>
        ) : error ? (
          <div style={{ padding: 14, borderRadius: 12, background: 'rgba(231,76,60,0.08)', color: '#e74c3c' }}>{error}</div>
        ) : items.length === 0 ? (
          <div style={{ ...glass, borderRadius: 16, padding: 24, textAlign: 'center', color: '#888' }}>
            Пока в магазине пусто. Одобренные администратором курсы появятся здесь.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(c => <StoreListItem key={c.id} course={c} onOpen={setSelectedId} />)}
          </div>
        )}
      </div>
    </Layout>
  );
}
