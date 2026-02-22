import React, { useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { formatTime } from '../data/constants';
import { btnBack } from '../styles/shared';

const CX = 100, CY = 100, R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BALL_R = 9;

// Sensitivity: pixels of drag per second of rewind
const PX_PER_SEC = 1.5;

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone, onSeek }) {
  const totalSec = activity.duration * 60;
  const elapsed = totalSec - timerSeconds;
  const progressPct = totalSec > 0 ? (elapsed / totalSec) * 100 : 0;
  const strokeDashoffset = CIRCUMFERENCE - (progressPct / 100) * CIRCUMFERENCE;
  const hasStarted = elapsed > 0;
  const isDone = timerSeconds === 0;

  const circleRef = useRef(null);
  const draggingRef = useRef(false);
  const grabOriginRef = useRef({ x: 0, y: 0, elapsed: 0 });

  // Ball position on SVG (rotated -90deg: 0% = top, clockwise)
  const angleRad = (progressPct / 100) * 2 * Math.PI;
  const ballX = CX + R * Math.cos(angleRad);
  const ballY = CY + R * Math.sin(angleRad);

  // ─── Drag: movement UP or SIDEWAYS from grab point → rewind ───
  const handleDragDelta = useCallback((clientX, clientY) => {
    if (!draggingRef.current || !onSeek) return;
    const origin = grabOriginRef.current;
    // Distance from grab point (any direction away = rewind)
    const dx = clientX - origin.x;
    const dy = origin.y - clientY; // inverted: up = positive
    // Use the larger of |dx| or |dy| so any direction works
    const dist = Math.max(Math.abs(dx), Math.abs(dy), 0);
    const rewindSec = Math.round(dist / PX_PER_SEC);
    const newElapsed = Math.max(0, origin.elapsed - rewindSec);
    const newRemaining = totalSec - newElapsed;
    onSeek(Math.min(totalSec, Math.max(0, newRemaining)));
  }, [totalSec, onSeek]);

  // Mouse
  const onMouseDown = (e) => {
    if (isDone) return;
    e.preventDefault();
    draggingRef.current = true;
    grabOriginRef.current = { x: e.clientX, y: e.clientY, elapsed };
  };
  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    handleDragDelta(e.clientX, e.clientY);
  }, [handleDragDelta]);
  const onMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  // Touch
  const onTouchStart = (e) => {
    if (isDone) return;
    draggingRef.current = true;
    const t = e.touches[0];
    grabOriginRef.current = { x: t.clientX, y: t.clientY, elapsed };
  };
  const onTouchMove = useCallback((e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    handleDragDelta(t.clientX, t.clientY);
  }, [handleDragDelta]);
  const onTouchEnd = useCallback(() => { draggingRef.current = false; }, []);

  React.useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  return (
    <Layout>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 20 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 600, color: "#1a1a2e", margin: 0 }}>{activity.label}</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Video placeholder */}
        <div style={{
          width: "100%", aspectRatio: "16/9", background: "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)",
          borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 36,
          border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
          flexDirection: "column", gap: 8, overflow: "hidden",
        }}>
          <div style={{ color: "#bbb", fontSize: 40 }}>▶</div>
          <span style={{ color: "#aaa", fontSize: 13, fontWeight: 500 }}>Видеоурок дня {currentDay}</span>
        </div>

        {/* Timer circle */}
        <div ref={circleRef}
          style={{ position: "relative", width: 200, height: 200, marginBottom: 36, touchAction: "none" }}>
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
            {/* Track */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
            {/* Progress arc */}
            <circle cx={CX} cy={CY} r={R} fill="none"
              stroke={isDone ? "#27ae60" : "#1a1a2e"}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: draggingRef.current ? "none" : "stroke-dashoffset 1s linear" }}
            />
            {/* Scrubber ball */}
            {!isDone && elapsed > 0 && (
              <circle
                cx={ballX} cy={ballY} r={BALL_R}
                fill="#1a1a2e" stroke="#fff" strokeWidth="3"
                style={{ cursor: "grab", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
              />
            )}
          </svg>

          {/* Center text */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            {isDone ? (
              <>
                <span style={{ fontSize: 42, fontWeight: 300, color: "#27ae60" }}>✓</span>
                <span style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 600, marginTop: 4 }}>Завершено</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 11, color: "#aaa", fontWeight: 500 }}>
                  {timerPaused ? (hasStarted ? "На паузе" : "Готовы?") : "До завершения:"}
                </span>
                <span style={{
                  fontSize: 42, fontWeight: 300, color: "#1a1a2e",
                  letterSpacing: "2px", fontVariantNumeric: "tabular-nums", margin: "6px 0",
                }}>
                  {formatTime(timerSeconds)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 16 }}>
          {!isDone ? (
            <button onClick={onPause}
              style={{
                padding: "16px 44px",
                background: timerPaused ? "#1a1a2e" : "rgba(255,255,255,0.8)",
                color: timerPaused ? "#fff" : "#1a1a2e",
                border: timerPaused ? "none" : "1.5px solid rgba(0,0,0,0.08)",
                borderRadius: 16, fontSize: 16, fontWeight: 600, cursor: "pointer",
                boxShadow: timerPaused ? "0 4px 20px rgba(26,26,46,0.2)" : "0 4px 16px rgba(0,0,0,0.04)",
                backdropFilter: timerPaused ? "none" : "blur(12px)",
                transition: "all 0.25s ease", minWidth: 180,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}>
              {timerPaused ? (
                <>
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
                    <path d="M2 1.5L14 9L2 16.5V1.5Z" fill="#fff"/>
                  </svg>
                  {hasStarted ? "Продолжить" : "Начать"}
                </>
              ) : (
                <>
                  <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
                    <rect x="1" y="1" width="4" height="14" rx="1" fill="#1a1a2e"/>
                    <rect x="9" y="1" width="4" height="14" rx="1" fill="#1a1a2e"/>
                  </svg>
                  Пауза
                </>
              )}
            </button>
          ) : (
            <button onClick={onDone}
              style={{
                padding: "16px 44px", background: "#1a1a2e", color: "#fff",
                border: "none", borderRadius: 16, fontSize: 16, fontWeight: 600,
                cursor: "pointer", boxShadow: "0 4px 20px rgba(26,26,46,0.2)", minWidth: 180,
              }}>
              Готово
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
