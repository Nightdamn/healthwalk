import React, { useRef } from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass } from '../styles/shared';
import { isActivityScheduled } from '../data/constants';

const GREEN = '#27ae60';

function DayDot({ day, done, frac, isToday, isFuture, uid, actId }) {
  const SZ = 30, CX = SZ / 2, CY = SZ / 2, R = SZ / 2 - 2, IR = R - 0.5;
  const diam = IR * 2, fillH = Math.min(frac, 1) * diam, fillY = (CY + IR) - fillH;
  const clipId = `dc-${uid}-${actId}-${day}`;
  const stroke = isFuture ? 'rgba(0,0,0,0.1)' : GREEN;
  const strokeW = isFuture ? 1 : 1.5;

  // Solid fill when practice is done for this day
  const fillOpacity = done ? 0.85 : 0.25;

  return (
    <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      <defs><clipPath id={clipId}><circle cx={CX} cy={CY} r={IR} /></clipPath></defs>
      <circle cx={CX} cy={CY} r={IR} fill={isFuture ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.5)'} />
      {frac > 0 && <rect x={CX - IR} y={fillY} width={diam} height={fillH} fill={GREEN} opacity={fillOpacity} clipPath={`url(#${clipId})`} />}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke={stroke} strokeWidth={strokeW} opacity={isFuture ? 1 : 0.7} />
      <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fill={done ? '#fff' : isFuture ? '#ccc' : '#1a1a2e'} fontSize={9} fontWeight={600}>{day}</text>
    </svg>
  );
}

export default function DetailsPage({ progress, currentDay, elapsedTime, getElapsedForDay, onBack, activeItem, exclusions = {}, customActivities = [] }) {
  const uidRef = useRef(Math.random().toString(36).slice(2, 8));

  const activities = [...(activeItem?.activities || []), ...customActivities];
  const daysTotal = activeItem?.daysCount || 30;
  const studentJoinedAt = activeItem?.startDate;

  return (
    <Layout>
      <div style={{ minHeight: '100vh', padding: 'calc(env(safe-area-inset-top, 0px) + 82px) 20px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, zIndex: 100, paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12, paddingLeft: 20, paddingRight: 20, marginLeft: -20, marginRight: -20, background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)', marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="#1a1a2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
          <h2 style={{ flex: 1, textAlign: 'center', fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Детали прогресса</h2>
          <div style={{ width: 42 }} />
        </div>

        {activeItem && (
          <div style={{ textAlign: 'center', marginBottom: 28, fontSize: 15, color: '#666', fontWeight: 500 }}>
            {activeItem.title}
          </div>
        )}

        {activities.length === 0 ? (
          <div style={{ ...glass, borderRadius: 18, padding: '24px', textAlign: 'center', color: '#aaa' }}>Нет активностей</div>
        ) : activities.map(act => {
          const totalSec = act.durationMin * 60;

          return (
            <div key={act.id} style={{ ...glass, borderRadius: 18, padding: '18px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, color: '#1a1a2e' }}>
                <img src={getIconPath(act.iconNum)} alt="" style={{ width: 28, height: 28 }} />
                <span style={{ fontSize: 16, fontWeight: 600 }}>{act.label} {act.durationMin} минут</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {Array.from({ length: daysTotal }, (_, i) => {
                  const day = i + 1;
                  const inRange = isActivityScheduled(act, day, studentJoinedAt)
                    && !exclusions[`${act.id}_${day}`];
                  const done = progress[day]?.[act.id];
                  const isToday = day === currentDay;
                  const isFuture = day > currentDay;

                  if (!inRange) {
                    return <div key={day} style={{ width: '100%', aspectRatio: '1', opacity: 0.15 }}>
                      <DayDot day={day} done={false} frac={0} isToday={false} isFuture={true} uid={uidRef.current} actId={act.id} />
                    </div>;
                  }

                  let elapsedSec = 0;
                  if (done) elapsedSec = totalSec;
                  else if (day === currentDay && elapsedTime) elapsedSec = elapsedTime[act.id] || 0;
                  else if (day < currentDay && getElapsedForDay) elapsedSec = (getElapsedForDay(day)[act.id]) || 0;

                  return (
                    <div key={day} style={{ width: '100%', aspectRatio: '1', opacity: isFuture ? 0.5 : 1 }}>
                      <DayDot day={day} done={done} frac={totalSec > 0 ? elapsedSec / totalSec : 0}
                        isToday={isToday} isFuture={isFuture} uid={uidRef.current} actId={act.id} />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Footer />
      </div>
    </Layout>
  );
}
