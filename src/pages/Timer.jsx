import React, { useRef, useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { formatTime } from '../data/constants';
import { btnBack } from '../styles/shared';
import { extractYoutubeId, extractDriveId } from '../components/VideoSection';

const CX = 100, CY = 100, R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BALL_R = 10;
const GREEN = "#27ae60";
const GREEN_PALE = "rgba(39,174,96,0.2)";

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone, onSeek, video, videoUrl }) {
  const totalSec = video?.duration_sec || activity.duration * 60;
  const elapsed = totalSec - timerSeconds;
  const hasStarted = elapsed > 0;
  const isDone = timerSeconds === 0;

  // Video refs
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const syncingRef = useRef(false); // prevent sync loops

  const isFileVideo = video?.video_type === 'file' && videoUrl;
  const isYoutube = video?.video_type === 'youtube';
  const isDrive = video?.video_type === 'drive';
  const isDirectLink = video?.video_type === 'link';
  const youtubeId = isYoutube ? extractYoutubeId(video.video_url) : null;
  const driveId = isDrive ? extractDriveId(video.video_url) : null;
  const hasVideo = isFileVideo || (isYoutube && youtubeId) || (isDrive && driveId) || isDirectLink;

  // ─── YouTube Player setup ───
  const [ytLoaded, setYtLoaded] = useState(false);
  const ytContainerRef = useRef(null);

  useEffect(() => {
    if (!isYoutube || !youtubeId) return;

    const initPlayer = () => {
      if (!ytContainerRef.current || ytPlayerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: youtubeId,
        playerVars: { controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => { ytReadyRef.current = true; setYtLoaded(true); },
          onStateChange: (e) => {
            if (syncingRef.current) return;
            // YT.PlayerState: PLAYING=1, PAUSED=2
            if (e.data === 1 && timerPaused) onPause();
            if (e.data === 2 && !timerPaused) onPause();
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      // Load YouTube IFrame API
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (ytPlayerRef.current?.destroy) {
        try { ytPlayerRef.current.destroy(); } catch (e) {}
      }
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
    };
  }, [youtubeId]);

  // ─── Sync video with timer play/pause ───
  useEffect(() => {
    if (!hasVideo) return;
    syncingRef.current = true;

    // HTML5 video: file uploads and direct links
    if ((isFileVideo || isDirectLink) && videoRef.current) {
      if (timerPaused || isDone) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    }

    if (isYoutube && ytReadyRef.current && ytPlayerRef.current) {
      try {
        if (timerPaused || isDone) {
          ytPlayerRef.current.pauseVideo();
        } else {
          ytPlayerRef.current.playVideo();
        }
      } catch (e) {}
    }
    // Drive iframe — no sync control available

    setTimeout(() => { syncingRef.current = false; }, 100);
  }, [timerPaused, isDone, hasVideo]);

  // ─── Sync timer seek → video seek ───
  const lastSyncedElapsed = useRef(elapsed);
  useEffect(() => {
    if (!hasVideo || syncingRef.current) return;
    const diff = Math.abs(elapsed - lastSyncedElapsed.current);
    // Only sync on large jumps (drag seek), not on normal 1-sec ticks
    if (diff > 2) {
      syncingRef.current = true;
      if ((isFileVideo || isDirectLink) && videoRef.current) {
        videoRef.current.currentTime = elapsed;
      }
      if (isYoutube && ytReadyRef.current && ytPlayerRef.current) {
        try { ytPlayerRef.current.seekTo(elapsed, true); } catch (e) {}
      }
      setTimeout(() => { syncingRef.current = false; }, 200);
    }
    lastSyncedElapsed.current = elapsed;
  }, [elapsed, hasVideo]);

  // ─── HTML5 video event: user seeks video → update timer ───
  const handleVideoSeeked = useCallback(() => {
    if (syncingRef.current || !videoRef.current || !onSeek) return;
    syncingRef.current = true;
    const videoTime = videoRef.current.currentTime;
    const newRemaining = Math.max(0, totalSec - Math.round(videoTime));
    onSeek(newRemaining);
    setTimeout(() => { syncingRef.current = false; }, 200);
  }, [totalSec, onSeek]);

  // ─── Wake Lock: keep screen on while timer is running ───
  const wakeLockRef = useRef(null);

  useEffect(() => {
    let active = true;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          if (active) wakeLockRef.current = null;
        });
      } catch (e) {}
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch (e) {}
        wakeLockRef.current = null;
      }
    };

    if (!timerPaused && !isDone) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !timerPaused && !isDone) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      releaseWakeLock();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [timerPaused, isDone]);

  // ─── Max progress: the furthest point the timer has counted to ───
  const maxElapsedRef = useRef(elapsed);
  useEffect(() => {
    if (elapsed > maxElapsedRef.current) {
      maxElapsedRef.current = elapsed;
    }
  }, [elapsed]);
  const maxElapsed = maxElapsedRef.current;

  // ─── Arc calculations ───
  const currentPct = totalSec > 0 ? (elapsed / totalSec) * 100 : 0;
  const maxPct = totalSec > 0 ? (maxElapsed / totalSec) * 100 : 0;

  const currentOffset = CIRCUMFERENCE - (currentPct / 100) * CIRCUMFERENCE;
  const maxOffset = CIRCUMFERENCE - (maxPct / 100) * CIRCUMFERENCE;

  // ─── Ball position ───
  const angleRad = (currentPct / 100) * 2 * Math.PI;
  const ballScreenX = CX + R * Math.sin(angleRad);
  const ballScreenY = CY - R * Math.cos(angleRad);

  // ─── Drag logic ───
  const draggingRef = useRef(false);

  const pointerToElapsed = useCallback((clientX, clientY, container) => {
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    const pct = angle / (2 * Math.PI);
    const sec = Math.round(pct * totalSec);

    return Math.max(0, Math.min(sec, maxElapsedRef.current));
  }, [totalSec]);

  const containerRef = useRef(null);

  const applyDrag = useCallback((clientX, clientY) => {
    if (!draggingRef.current || !onSeek || !containerRef.current) return;
    const newElapsed = pointerToElapsed(clientX, clientY, containerRef.current);
    const newRemaining = totalSec - newElapsed;
    onSeek(Math.max(0, newRemaining));
  }, [totalSec, onSeek, pointerToElapsed]);

  const startDrag = useCallback((e) => {
    if (isDone || elapsed <= 0) return;
    e.preventDefault();
    draggingRef.current = true;
  }, [isDone, elapsed]);

  const onTouchStartBall = useCallback((e) => {
    if (isDone || elapsed <= 0) return;
    draggingRef.current = true;
  }, [isDone, elapsed]);

  useEffect(() => {
    const moveHandler = (e) => {
      if (!draggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      applyDrag(x, y);
    };
    const endHandler = () => { draggingRef.current = false; };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', endHandler);
    window.addEventListener('touchmove', moveHandler, { passive: false });
    window.addEventListener('touchend', endHandler);
    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', endHandler);
      window.removeEventListener('touchmove', moveHandler);
      window.removeEventListener('touchend', endHandler);
    };
  }, [applyDrag]);

  return (
    <Layout>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 24px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <div style={{ width: "100%", display: "flex", alignItems: "center", paddingTop: 52, marginBottom: 20 }}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: 600, color: "#1a1a2e", margin: 0 }}>{activity.label}</h2>
          <div style={{ width: 42 }} />
        </div>

        {/* Video player or placeholder */}
        {hasVideo ? (
          <div style={{
            width: "100%", borderRadius: 20, overflow: "hidden", marginBottom: 24,
            background: "#000", boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}>
            {isFileVideo && (
              <video
                ref={videoRef}
                src={videoUrl}
                style={{ width: "100%", display: "block" }}
                playsInline
                preload="metadata"
                onSeeked={handleVideoSeeked}
              />
            )}
            {isDirectLink && (
              <video
                ref={videoRef}
                src={video.video_url}
                style={{ width: "100%", display: "block" }}
                playsInline
                preload="metadata"
                onSeeked={handleVideoSeeked}
                crossOrigin="anonymous"
              />
            )}
            {isYoutube && (
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <div ref={ytContainerRef} style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                }} />
              </div>
            )}
            {isDrive && driveId && (
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                <iframe
                  src={`https://drive.google.com/file/d/${driveId}/preview`}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            )}
          </div>
        ) : (
          <div style={{
            width: "100%", aspectRatio: "16/9", background: "rgba(255,255,255,0.6)", backdropFilter: "blur(20px)",
            borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.7)", boxShadow: "0 8px 32px rgba(0,0,0,0.04)",
            flexDirection: "column", gap: 8, overflow: "hidden",
          }}>
            <div style={{ color: "#bbb", fontSize: 40 }}>▶</div>
            <span style={{ color: "#aaa", fontSize: 13, fontWeight: 500 }}>Видеоурок дня {currentDay}</span>
          </div>
        )}

        {/* Timer circle */}
        <div ref={containerRef}
          style={{ position: "relative", width: 200, height: 200, marginBottom: 36, touchAction: "none" }}>
          <svg width="200" height="200" style={{ transform: "rotate(-90deg)" }}>
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />

            {maxPct > 0 && (
              <circle cx={CX} cy={CY} r={R} fill="none"
                stroke={GREEN_PALE}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={maxOffset}
              />
            )}

            {currentPct > 0 && (
              <circle cx={CX} cy={CY} r={R} fill="none"
                stroke={GREEN}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={currentOffset}
                style={{ transition: draggingRef.current ? "none" : "stroke-dashoffset 1s linear" }}
              />
            )}
          </svg>

          {!isDone && hasStarted && (
            <div
              onMouseDown={startDrag}
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
                boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                cursor: "grab",
                zIndex: 5,
                touchAction: "none",
              }}
            />
          )}

          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            {isDone ? (
              <>
                <svg width="42" height="42" viewBox="0 0 16 16" fill="none"><polyline points="3,8.5 6.5,12 13,4" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="miter" fill="none"/></svg>
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
