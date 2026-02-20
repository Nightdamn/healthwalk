import React from 'react';
import Layout from '../components/Layout';
import { formatTime } from '../data/constants';
import { btnBack } from '../styles/shared';

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone }) {
  const totalSec = activity.duration * 60;
  const progressPct = totalSec > 0 ? ((totalSec - timerSeconds) / totalSec) * 100 : 0;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  return (
    <Layout>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "0 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Top bar */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 20 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 600, color: "#1a1a2e", margin: 0 }}>
            {activity.label}
          </h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Video placeholder */}
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(20px)",
            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 36,
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
            flexDirection: "column",
            gap: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ color: "#bbb", fontSize: 40 }}>▶</div>
          <span style={{ color: "#aaa", fontSize: 13, fontWeight: 500 }}>
            Видеоурок дня {currentDay}
          </span>
        </div>

        {/* Timer circle */}
        <div style={{ position: "relative", width: 200, height: 200, marginBottom: 36 }}>
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
            <circle
              cx="100" cy="100" r="90" fill="none" stroke="#1a1a2e" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {timerSeconds === 0 ? (
              <>
                <span style={{ fontSize: 42, fontWeight: 300, color: "#1a1a2e" }}>✓</span>
                <span style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 600, marginTop: 4 }}>Завершено</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 500, textAlign: "center" }}>
                  {timerPaused ? "На паузе" : "До завершения упражнения:"}
                </span>
                <span
                  style={{
                    fontSize: 40,
                    fontWeight: 300,
                    color: "#1a1a2e",
                    letterSpacing: "2px",
                    fontVariantNumeric: "tabular-nums",
                    margin: "4px 0",
                  }}
                >
                  {formatTime(timerSeconds)}
                </span>
                <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>
                  {timerPaused ? "Нажмите ▶ для продолжения" : "Ещё чуть-чуть!"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 16 }}>
          {timerSeconds > 0 && (
            <button
              onClick={onPause}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "1.5px solid rgba(0,0,0,0.08)",
                background: "rgba(255,255,255,0.8)",
                backdropFilter: "blur(12px)",
                cursor: "pointer",
                fontSize: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#1a1a2e",
                boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
              }}
            >
              {timerPaused ? "▶" : "⏸"}
            </button>
          )}
          {timerSeconds === 0 && (
            <button
              onClick={onDone}
              style={{
                padding: "16px 40px",
                background: "#1a1a2e",
                color: "#fff",
                border: "none",
                borderRadius: 16,
                fontSize: 15,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(26,26,46,0.2)",
              }}
            >
              Готово
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
