import React from 'react';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { activityIcons } from '../components/Icons';
import { DAYS_TOTAL, ACTIVITIES } from '../data/constants';
import { btnBack, glass } from '../styles/shared';

/** SVG checkmark with straight strokes (no curves on right leg) */
function CheckIcon({ size = 14, color = "#fff", strokeWidth = 2.5 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ display: "block" }}>
      <polyline
        points="3,8.5 6.5,12 13,4"
        stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="miter"
        fill="none"
      />
    </svg>
  );
}

const GREEN = "#27ae60";

export default function DetailsPage({ progress, currentDay, elapsedTime, getElapsedForDay, onBack }) {
  return (
    <Layout>
      <div style={{ minHeight: "100vh", padding: "0 20px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 24 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
            Детали прогресса
          </h2>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ textAlign: "center", marginBottom: 28, fontSize: 15, color: "#666", fontWeight: 500 }}>
          Сейчас самое время сделать первый шаг
        </div>

        {/* 4 activity grids */}
        {ACTIVITIES.map((act) => {
          const IconComp = activityIcons[act.id];
          const totalSec = act.duration * 60;

          return (
            <div key={act.id} style={{ ...glass, borderRadius: 18, padding: "18px 20px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, color: "#1a1a2e" }}>
                <IconComp />
                <span style={{ fontSize: 16, fontWeight: 600 }}>{act.label} {act.duration} минут</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {Array.from({ length: DAYS_TOTAL }, (_, i) => {
                  const day = i + 1;
                  const done = progress[day]?.[act.id];
                  const isToday = day === currentDay;
                  const isFuture = day > currentDay;

                  // Elapsed seconds for this activity on this day
                  let elapsedSec = 0;
                  if (done) {
                    elapsedSec = totalSec;
                  } else if (day === currentDay && elapsedTime) {
                    elapsedSec = elapsedTime[act.id] || 0;
                  } else if (day < currentDay && getElapsedForDay) {
                    const dayEl = getElapsedForDay(day);
                    elapsedSec = dayEl[act.id] || 0;
                  }

                  const frac = totalSec > 0 ? Math.min(elapsedSec / totalSec, 1) : 0;

                  // Background:
                  // done → solid green
                  // partial → semi-transparent green proportional to progress
                  // future → very light
                  let bg;
                  if (done) {
                    bg = GREEN;
                  } else if (frac > 0) {
                    bg = `rgba(39,174,96,${(frac * 0.35).toFixed(3)})`;
                  } else if (isToday) {
                    bg = "rgba(26,26,46,0.06)";
                  } else {
                    bg = "rgba(255,255,255,0.5)";
                  }

                  // Border
                  let border;
                  if (done) {
                    border = `2px solid ${GREEN}`;
                  } else if (isToday) {
                    border = "2px solid #1a1a2e";
                  } else if (frac > 0) {
                    border = `1.5px solid rgba(39,174,96,0.3)`;
                  } else {
                    border = "1.5px solid rgba(0,0,0,0.1)";
                  }

                  return (
                    <div
                      key={day}
                      style={{
                        width: "100%", aspectRatio: "1", borderRadius: "50%",
                        border, background: bg,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 600,
                        color: done ? "#fff" : isFuture ? "#ccc" : "#1a1a2e",
                        transition: "all 0.2s",
                        opacity: isFuture ? 0.5 : 1,
                      }}
                    >
                      {day}
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

export { CheckIcon };
