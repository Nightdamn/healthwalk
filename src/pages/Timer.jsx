import React, { useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { formatTime } from '../data/constants';
import { btnBack } from '../styles/shared';

const CX = 100, CY = 100, R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BALL_R = 8;

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone, onSeek }) {
  const totalSec = activity.duration * 60;
  const elapsed = totalSec - timerSeconds;
  const progressPct = totalSec > 0 ? (elapsed / totalSec) * 100 : 0;
  const strokeDashoffset = CIRCUMFERENCE - (progressPct / 100) * CIRCUMFERENCE;
  const hasStarted = elapsed > 0;
  const isDone = timerSeconds === 0;

  const circleRef = useRef(null);
  const draggingRef = useRef(false);

  // Ball position (in SVG coords, before CSS rotation)
  // The SVG is rotated -90deg, so we compute the angle in SVG space:
  // angle = progressPct / 100 * 2π (from 3 o'clock, counterclockwise in screen = clockwise in SVG due to rotation)
  const angleRad = (progressPct / 100) * 2 * Math.PI;
  const ballX = CX + R * Math.cos(angleRad);
  const ballY = CY + R * Math.sin(angleRad);

  // Convert screen pointer position to progress percentage
  const pointerToProgress = useCallback((clientX, clientY) => {
    if (!circleRef.current) return null;
    const rect = circleRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = clientX - cx;
    const dy = clientY - cy;

    // Angle from 12 o'clock, clockwise (screen coords)
    // atan2(dx, -dy): positive = clockwise from top
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    const pct = (angle / (2 * Math.PI)) * 100;
    return Math.max(0, Math.min(pct, 100));
  }, []);

  const handleDragProgress = useCallback((pct) => {
    if (pct === null || !onSeek) return;
    const newElapsed = Math.round((pct / 100) * totalSec);
    const newRemaining = Math.max(0, totalSec - newElapsed);
    onSeek(newRemaining);
  }, [totalSec, onSeek]);

  // Mouse handlers
  const onMouseDown = (e) => {
    if (isDone) return;
    e.preventDefault();
    draggingRef.current = true;
    handleDragProgress(pointerToProgress(e.clientX, e.clientY));
  };
  const onMouseMove = useCallback((e) => {
    if (!draggingRef.current) return;
    handleDragProgress(pointerToProgress(e.clientX, e.clientY));
  }, [pointerToProgress, handleDragProgress]);
  const onMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  // Touch handlers
  const onTouchStart = (e) => {
    if (isDone) return;
    draggingRef.current = true;
    const t = e.touches[0];
    handleDragProgress(pointerToProgress(t.clientX, t.clientY));
  };
  const onTouchMove = useCallback((e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    handleDragProgress(pointerToProgress(t.clientX, t.clientY));
  }, [pointerToProgress, handleDragProgress]);
  const onTouchEnd = useCallback(() => { draggingRef.current = false; }, []);

  // Attach global move/up listeners
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

        {/* Timer circle with draggable scrubber */}
        <div
          ref={circleRef}
          style={{ position: "relative", width: 200, height: 200, marginBottom: 36, touchAction: "none" }}
        >
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
            {/* Track circle */}
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
                style={{ cursor: "grab", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
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
                  {/* Play triangle */}
                  <svg width="16" height="18" viewBox="0 0 16 18" fill="none">
                    <path d="M2 1.5L14 9L2 16.5V1.5Z" fill="#fff"/>
                  </svg>
                  {hasStarted ? "Продолжить" : "Начать"}
                </>
              ) : (
                <>
                  {/* Pause bars */}
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
