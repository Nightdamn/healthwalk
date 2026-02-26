import React, { useRef, useCallback } from 'react';
import Layout from '../components/Layout';
import { formatTime } from '../data/constants';
import { btnBack } from '../styles/shared';

const CX = 100, CY = 100, R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BALL_R = 10;
const GREEN = "#27ae60";

// Drag sensitivity: pixels per second of rewind
const PX_PER_SEC = 2;

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone, onSeek }) {
  const totalSec = activity.duration * 60;
  const elapsed = totalSec - timerSeconds;
  const progressPct = totalSec > 0 ? (elapsed / totalSec) * 100 : 0;
  const strokeDashoffset = CIRCUMFERENCE - (progressPct / 100) * CIRCUMFERENCE;
  const hasStarted = elapsed > 0;
  const isDone = timerSeconds === 0;

  const draggingRef = useRef(false);
  const grabRef = useRef({ x: 0, y: 0, elapsed: 0 });

  // Ball screen position (0% = 12 o'clock, clockwise)
  const angleRad = (progressPct / 100) * 2 * Math.PI;
  const ballScreenX = CX + R * Math.sin(angleRad);
  const ballScreenY = CY - R * Math.cos(angleRad);

  // ─── Drag handler: distance from grab point → rewind seconds ───
  const applyDrag = useCallback((clientX, clientY) => {
    if (!draggingRef.current || !onSeek) return;
    const o = grabRef.current;
    const dx = Math.abs(clientX - o.x);
    const dy = Math.max(0, o.y - clientY); // up = positive
    const dist = Math.max(dx, dy);
    const rewindSec = Math.round(dist / PX_PER_SEC);
    const newElapsed = Math.max(0, o.elapsed - rewindSec);
    onSeek(Math.max(0, Math.min(totalSec, totalSec - newElapsed)));
  }, [totalSec, onSeek]);

  const startDrag = useCallback((x, y) => {
    if (isDone || elapsed <= 0) return;
    draggingRef.current = true;
    grabRef.current = { x, y, elapsed };
  }, [isDone, elapsed]);

  const onPointerDown = (e) => {
    e.preventDefault();
    startDrag(e.clientX, e.clientY);
  };
  const onTouchStartBall = (e) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  };

  // Global move / up
  const onMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    applyDrag(x, y);
  }, [applyDrag]);
  const onEnd = useCallback(() => { draggingRef.current = false; }, []);

  React.useEffect(() => {
    const opts = { passive: false };
    const moveHandler = (e) => { if (draggingRef.current) { e.preventDefault(); onMove(e); } };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', moveHandler, opts);
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', moveHandler);
      window.removeEventListener('touchend', onEnd);
    };
  }, [onMove, onEnd]);

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
        <div style={{ position: "relative", width: 200, height: 200, marginBottom: 36, touchAction: "none" }}>
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)" }}>
            {/* Track */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
            {/* Green progress arc */}
            <circle cx={CX} cy={CY} r={R} fill="none"
              stroke={GREEN}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: draggingRef.current ? "none" : "stroke-dashoffset 1s linear" }}
            />
          </svg>

          {/* Scrubber ball — HTML div overlaid at screen position */}
          {!isDone && elapsed > 0 && (
            <div
              onMouseDown={onPointerDown}
              onTouchStart={onTouchStartBall}
              style={{
                position: "absolute",
                left: ballScreenX - BALL_R,
                top: ballScreenY - BALL_R,
                width: BALL_R * 2,
                height: BALL_R * 2,
                borderRadius: "50%",
                background: GREEN,
                border: "3px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                cursor: "grab",
                zIndex: 5,
                touchAction: "none",
              }}
            />
          )}

          {/* Center text */}
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            {isDone ? (
              <>
                <span style={{ fontSize: 42, fontWeight: 300, color: GREEN }}>✓</span>
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
                {!timerPaused && (
                  <span style={{ fontSize: 12, color: "#1a1a2e", fontWeight: 600 }}>
                    Ещё чуть-чуть!
                  </span>
                )}
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
