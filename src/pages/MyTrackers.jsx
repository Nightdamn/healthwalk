import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import { getMyTrackers, deleteTracker } from '../lib/db';

const GREEN = '#27ae60';

export default function MyTrackersPage({ user, onBack, onNavigate }) {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoading(true);
      const data = await getMyTrackers(user.id);
      setTrackers(data);
      setLoading(false);
    })();
  }, [user?.id]);

  const handleDelete = async (id) => {
    if (!confirm('Удалить трекер? Все данные будут потеряны.')) return;
    const ok = await deleteTracker(id);
    if (ok) setTrackers((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <Layout>
      <div style={pageWrapper}>
        {/* Top bar */}
        <div style={topBar}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={topBarTitle}>Мои трекеры</h2>
          <div style={{ width: 42 }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', fontSize: 14 }}>Загрузка...</div>
        ) : trackers.length === 0 ? (
          <div style={{
            ...glass, borderRadius: 18, padding: '40px 20px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>
              Нет трекеров
            </div>
            <div style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>
              Создайте персональный трекер для отслеживания своих практик
            </div>
            <button
              onClick={() => onNavigate('create_tracker')}
              style={{
                padding: '14px 32px', background: GREEN, color: '#fff',
                border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Создать трекер
            </button>
          </div>
        ) : (
          <>
            {trackers.map((tracker) => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                onDelete={() => handleDelete(tracker.id)}
              />
            ))}

            {/* Create new button */}
            <button
              onClick={() => onNavigate('create_tracker')}
              style={{
                width: '100%', padding: 16, marginTop: 8,
                border: '2px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
                color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer', borderRadius: 14,
              }}
            >
              + Создать трекер
            </button>
          </>
        )}
      </div>
    </Layout>
  );
}

function TrackerCard({ tracker, onDelete }) {
  const practices = tracker.tracker_practices || [];
  const avatarSrc = tracker.avatar_custom || (tracker.avatar_icon ? getIconPath(tracker.avatar_icon) : null);

  return (
    <div style={{
      ...glass, borderRadius: 18, padding: '16px 16px', marginBottom: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Header: avatar + info */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14, flexShrink: 0,
          border: `2px solid ${GREEN}`, background: '#fafafa',
          padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {avatarSrc ? (
            <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 28 }}>🎯</span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#1a1a2e',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {tracker.title}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            {tracker.days_count} дней · {practices.length} {practiceWord(practices.length)}
            {tracker.start_date && (
              <span> · с {new Date(tracker.start_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            )}
          </div>
        </div>
        {/* Delete button */}
        <button
          onClick={onDelete}
          style={{
            background: 'rgba(231,76,60,0.08)', border: 'none', borderRadius: 10,
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 16, color: '#e74c3c', flexShrink: 0,
          }}
        >🗑</button>
      </div>

      {/* Practices mini-list */}
      {practices.length > 0 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {practices.sort((a, b) => a.sort_order - b.sort_order).map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(39,174,96,0.06)', borderRadius: 10,
                padding: '4px 10px 4px 4px', fontSize: 12, color: '#555',
              }}
            >
              <img src={getIconPath(p.icon_num)} alt="" style={{ width: 22, height: 22 }} />
              <span style={{ fontWeight: 500 }}>{p.title}</span>
              <span style={{ color: '#aaa', fontSize: 11 }}>
                д.{p.first_day}–{p.last_day}, {p.duration_min}м
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function practiceWord(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'практика';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'практики';
  return 'практик';
}
