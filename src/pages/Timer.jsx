import TopBar from '../components/TopBar';
import React, { useRef, useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { formatTime, formatInTz } from '../data/constants';
import { extractYoutubeId, extractDriveId } from '../components/VideoSection';
import { TheoryContent } from '../components/RichTextEditor';
import { getCallAttendance, saveCallAttendance } from '../lib/db';

const CX = 100, CY = 100, R = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;
const BALL_R = 10;
const GREEN = "#27ae60";
const GREEN_PALE = "rgba(39,174,96,0.2)";

export default function TimerPage({ activity, timerSeconds, timerPaused, currentDay, onPause, onBack, onDone, onSeek, video, videoUrl, onDurationDetected, activeCall, getCallToken, tzOffsetMin }) {
  const tzMin = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 180;
  const totalSec = video?.duration_sec || activity.duration * 60;
  const elapsed = totalSec - timerSeconds;
  const hasStarted = elapsed > 0;
  const isDone = timerSeconds === 0;

  // Video refs
  const videoRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const syncingRef = useRef(false); // prevent sync loops
  const durationReportedRef = useRef(false); // only report duration once

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  // Re-detect video type: if saved as 'link' but URL is actually youtube/drive, treat accordingly
  const savedType = video?.video_type;
  const detectedYoutubeId = video ? extractYoutubeId(video.video_url) : null;
  const detectedDriveId = video ? extractDriveId(video.video_url) : null;
  const isGoogleUrl = video ? /google\.com|googleapis\.com/.test(video.video_url) : false;

  const isFileVideo = savedType === 'file' && videoUrl;
  const isYoutube = savedType === 'youtube' || (savedType === 'link' && !!detectedYoutubeId);
  const isDrive = savedType === 'drive' || (savedType === 'link' && (!!detectedDriveId || isGoogleUrl));
  const isDirectLink = savedType === 'link' && !isYoutube && !isDrive;
  const youtubeId = isYoutube ? detectedYoutubeId : null;
  const driveId = isDrive ? detectedDriveId : null;
  const hasVideo = isFileVideo || (isYoutube && youtubeId) || isDrive || isDirectLink;

  // Video load error state
  const [videoError, setVideoError] = useState(false);

  // Linear progress bar drag (over video)
  const linearBarRef = useRef(null);
  const linearDraggingRef = useRef(false);

  const applyLinearDrag = useCallback((clientX) => {
    if (!linearBarRef.current || !onSeek) return;
    const rect = linearBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newElapsed = Math.round(pct * totalSec);
    const clamped = Math.min(newElapsed, maxElapsedRef.current);
    onSeek(Math.max(0, totalSec - clamped));
  }, [totalSec, onSeek]);

  useEffect(() => {
    const move = (e) => {
      if (!linearDraggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      applyLinearDrag(x);
    };
    const end = () => {
      if (linearDraggingRef.current) {
        linearDraggingRef.current = false;
        endScrub();
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
  }, [applyLinearDrag]);

  // ─── YouTube Player setup ───
  const [ytLoaded, setYtLoaded] = useState(false);
  const ytContainerRef = useRef(null);

  useEffect(() => {
    if (!isYoutube || !youtubeId) return;

    const initPlayer = () => {
      if (!ytContainerRef.current || ytPlayerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: youtubeId,
        // Default host (www.youtube.com) — youtube-nocookie isn't in our CSP
        // frame-src and embed-playback breaks otherwise.
        playerVars: {
          controls: 0,         // hide YT control bar
          modestbranding: 1,   // smaller YT logo
          rel: 0,              // no related videos at end
          playsinline: 1,      // mobile inline play
          disablekb: 1,        // ignore keyboard
          fs: 0,               // hide YT fullscreen button (we have our own)
          iv_load_policy: 3,   // no annotations
          cc_load_policy: 0,   // no captions by default
        },
        events: {
          onReady: () => {
            ytReadyRef.current = true; setYtLoaded(true);
            // Auto-detect duration from YouTube
            if (!durationReportedRef.current && onDurationDetected && !video?.duration_sec) {
              try {
                const dur = ytPlayerRef.current.getDuration();
                if (dur > 0) {
                  durationReportedRef.current = true;
                  onDurationDetected(video.id, Math.round(dur));
                }
              } catch (e) {}
            }
          },
          // IMPORTANT: read timerPaused / onPause via refs because this
          // callback is captured at player creation and would otherwise
          // see the initial paused=true forever, causing it to re-pause
          // the video the moment YT reports PLAYING.
          onStateChange: (e) => {
            if (syncingRef.current) return;
            const paused = timerPausedRef.current;
            const cb = onPauseRef.current;
            if (e.data === 1 && paused) cb?.();    // YT started playing but timer says pause
            if (e.data === 2 && !paused) cb?.();   // YT paused but timer says play
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
  // During drag we sync every change; outside drag, sync only on jumps >1s
  // (so the normal 1-sec timer tick doesn't seek the video each tick).
  const lastSyncedElapsed = useRef(elapsed);
  useEffect(() => {
    if (!hasVideo) return;
    const diff = Math.abs(elapsed - lastSyncedElapsed.current);
    const isDragJump = draggingRef.current || linearDraggingRef.current;
    if (isDragJump || diff > 1) {
      syncingRef.current = true;
      if ((isFileVideo || isDirectLink) && videoRef.current) {
        try { videoRef.current.currentTime = elapsed; } catch {}
      }
      if (isYoutube && ytReadyRef.current && ytPlayerRef.current) {
        try { ytPlayerRef.current.seekTo(elapsed, true); } catch (e) {}
      }
      // Short lockout — long enough that the resulting `seeked` event from
      // the player doesn't loop back and re-update the timer.
      setTimeout(() => { syncingRef.current = false; }, 80);
    }
    lastSyncedElapsed.current = elapsed;
  }, [elapsed, hasVideo, isFileVideo, isDirectLink, isYoutube]);

  // ─── HTML5 video event: user seeks video → update timer ───
  const handleVideoSeeked = useCallback(() => {
    if (syncingRef.current || !videoRef.current || !onSeek) return;
    syncingRef.current = true;
    const videoTime = videoRef.current.currentTime;
    const newRemaining = Math.max(0, totalSec - Math.round(videoTime));
    onSeek(newRemaining);
    setTimeout(() => { syncingRef.current = false; }, 200);
  }, [totalSec, onSeek]);

  // ─── Auto-detect duration from video metadata ───
  const handleLoadedMetadata = useCallback(() => {
    if (durationReportedRef.current || !videoRef.current || !onDurationDetected) return;
    const dur = videoRef.current.duration;
    if (dur > 0 && isFinite(dur) && !video?.duration_sec) {
      durationReportedRef.current = true;
      onDurationDetected(video.id, Math.round(dur));
    }
  }, [video, onDurationDetected]);

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
  // Drag a ball auto-pauses the timer (so video freezes on the scrubbed
  // frame), and on release resumes if it was playing before the drag.
  const draggingRef = useRef(false);
  const wasPlayingBeforeDragRef = useRef(false);

  // Always-current refs so handlers stuck in old closures still see the latest.
  const timerPausedRef = useRef(timerPaused);
  const onPauseRef = useRef(onPause);
  const isDoneRef = useRef(isDone);
  useEffect(() => { timerPausedRef.current = timerPaused; }, [timerPaused]);
  useEffect(() => { onPauseRef.current = onPause; }, [onPause]);
  useEffect(() => { isDoneRef.current = isDone; }, [isDone]);

  const beginScrub = () => {
    if (!timerPausedRef.current) {
      wasPlayingBeforeDragRef.current = true;
      onPauseRef.current?.();
    } else {
      wasPlayingBeforeDragRef.current = false;
    }
  };

  const endScrub = () => {
    if (wasPlayingBeforeDragRef.current && !isDoneRef.current) {
      // resume after one tick so any pending seek finishes first
      setTimeout(() => { onPauseRef.current?.(); }, 0);
    }
    wasPlayingBeforeDragRef.current = false;
  };

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
    beginScrub();
  }, [isDone, elapsed, timerPaused]);

  const onTouchStartBall = useCallback((e) => {
    if (isDone || elapsed <= 0) return;
    draggingRef.current = true;
    beginScrub();
  }, [isDone, elapsed, timerPaused]);

  useEffect(() => {
    const moveHandler = (e) => {
      if (!draggingRef.current) return;
      if (e.cancelable) e.preventDefault();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      applyDrag(x, y);
    };
    const endHandler = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        endScrub();
      }
    };

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

  // ─── Call practice type: Jitsi Meet video call ───
  const [callState, setCallState] = useState('waiting'); // waiting | joining | active | ended
  const [callJoin, setCallJoin] = useState(null); // { roomUrl, userName, isStaff, jwt, host }
  const [callCountdown, setCallCountdown] = useState('');
  const callFrameRef = useRef(null);
  const callContainerRef = useRef(null);

  // Attendance (trainer-only after call ends)
  const [attendance, setAttendance] = useState(null); // { currentUserId, participants: [...] }
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  useEffect(() => {
    if (callState !== 'ended' || !callJoin?.isStaff || !activeCall?.id) return;
    let cancelled = false;
    setAttendanceLoading(true);
    (async () => {
      const data = await getCallAttendance(activeCall.id);
      if (cancelled) return;
      if (data?.participants) {
        setAttendance(data);
        const initial = new Set();
        for (const p of data.participants) {
          if (p.userId === data.currentUserId || p.attended || p.joined) initial.add(p.userId);
        }
        setCheckedIds(initial);
      }
      setAttendanceLoading(false);
    })();
    return () => { cancelled = true; };
  }, [callState, callJoin, activeCall]);

  const toggleAttendance = useCallback((userId) => {
    if (userId === attendance?.currentUserId) return; // self always checked
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, [attendance]);

  const handleSubmitAttendance = useCallback(async () => {
    if (!activeCall?.id || attendanceSaving) return;
    setAttendanceSaving(true);
    const ids = Array.from(checkedIds);
    const result = await saveCallAttendance(activeCall.id, ids);
    setAttendanceSaving(false);
    if (result?.success !== false) onDone?.();
  }, [activeCall, checkedIds, attendanceSaving, onDone]);

  // Countdown timer for scheduled call
  useEffect(() => {
    if (activity.practiceType !== 'call' || !activeCall) return;
    const update = () => {
      const now = Date.now();
      const scheduled = new Date(activeCall.scheduled_at).getTime();
      const diff = scheduled - now;
      if (diff <= 0) {
        setCallCountdown('Сейчас');
      } else {
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setCallCountdown(h > 0 ? `${h}ч ${m}м` : m > 0 ? `${m}м ${s}с` : `${s}с`);
      }
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [activity.practiceType, activeCall]);

  const handleJoinCall = useCallback(async () => {
    if (!activeCall || !getCallToken) return;
    setCallState('joining');
    try {
      const data = await getCallToken(activeCall.id);
      if (data?.roomUrl) {
        setCallJoin({
          roomUrl: data.roomUrl,
          userName: data.userName || '',
          isStaff: !!data.isStaff,
          jwt: data.jwt || null,
          host: data.host || null,
        });
        setCallState('active');
      } else {
        setCallState('waiting');
      }
    } catch {
      setCallState('waiting');
    }
  }, [activeCall, getCallToken]);

  const handleLeaveCall = useCallback(() => {
    setCallState('ended');
    // keep callJoin so we know isStaff on the post-call screen
  }, []);

  // Jitsi External API: load script once, mount iframe into container div
  useEffect(() => {
    if (callState !== 'active' || !callJoin?.roomUrl) return;
    const container = callContainerRef.current;
    if (!container) return;

    let api = null;
    let cancelled = false;
    const jitsiHost = callJoin.host || new URL(callJoin.roomUrl).host;
    const loadScript = () => new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) return resolve();
      const existing = document.querySelector('script[data-jitsi]');
      if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
      const s = document.createElement('script');
      s.src = `https://${jitsiHost}/external_api.js`;
      s.async = true;
      s.dataset.jitsi = '1';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    (async () => {
      try {
        await loadScript();
        if (cancelled) return;
        const roomName = callJoin.roomUrl.split('/').pop();
        api = new window.JitsiMeetExternalAPI(jitsiHost, {
          roomName,
          parentNode: container,
          width: '100%',
          height: '100%',
          lang: 'ru',
          jwt: callJoin.jwt || undefined,
          userInfo: { displayName: callJoin.userName || 'Участник' },
          configOverwrite: {
            startWithAudioMuted: false,
            // Prejoin страница с self-preview и явным запросом permissions —
            // без неё браузер запрашивает доступ к камере/микрофону в фоне
            // уже после входа в комнату, и юзер видит «отключённые»
            // устройства до того как успеет нажать Allow.
            prejoinPageEnabled: true,
            prejoinConfig: { enabled: true, hideDisplayName: false },
            defaultLanguage: 'ru',
            disableDeepLinking: true,
            hideConferenceSubject: true,
            hideParticipantsStats: true,
            disableProfile: true,
            startWithVideoMuted: false,
            disableTileEnlargement: false,
            tileView: { numberOfVisibleTiles: 25 },
            p2p: { enabled: true },
            disableAP: false,
            enableNoisyMicDetection: true,
            audioQuality: { stereo: false, opusMaxAverageBitrate: 32000 },
            constraints: {
              audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
              video: { height: { ideal: 540, max: 720, min: 240 } },
            },
            toolbarButtons: [
              'microphone', 'camera', 'desktop', 'chat', 'tileview',
              'fullscreen', 'settings', 'raisehand', 'recording', 'hangup',
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
            HIDE_INVITE_MORE_HEADER: true,
            DEFAULT_BACKGROUND: '#000',
            DISABLE_VIDEO_BACKGROUND: true,
          },
        });
        // КРИТИЧНО: iframe (meet.instep.life внутри instep.life) — другой
        // origin. Браузер по умолчанию блокирует getUserMedia из cross-origin
        // iframe. Нужен явный allow с нашими permissions. Jitsi External API
        // не всегда ставит allow корректно — выставляем сами.
        try {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            iframe.setAttribute('allow',
              'camera; microphone; display-capture; autoplay; clipboard-write; web-share');
          }
        } catch (e) { console.warn('iframe allow failed', e); }
        api.addListener('readyToClose', handleLeaveCall);
        api.addListener('videoConferenceJoined', () => {
          try { api.executeCommand('setTileView', true); } catch {}

          // Принудительно включить камеру/микрофон если Jitsi их замутил.
          // Бывает что prejoin/JWT/настройки сервера оставляют muted,
          // несмотря на startWithAudioMuted=false. Проверяем фактическое
          // состояние и анмутим если нужно. Задержка чтобы media-tracks
          // успели инициализироваться.
          setTimeout(() => {
            try {
              api.isAudioMuted().then(m => { if (m) api.executeCommand('toggleAudio'); });
              api.isVideoMuted().then(m => { if (m) api.executeCommand('toggleVideo'); });
            } catch (e) { console.warn('unmute failed', e); }
          }, 1500);

          // Авто-запись: запускает тренер (isStaff), как только зашёл.
          // Если уже идёт — Jitsi проигнорирует второй startRecording.
          // Ученики НЕ триггерят запись — у них нет moderator JWT,
          // jicofo бы всё равно отверг команду.
          if (callJoin?.isStaff) {
            setTimeout(() => {
              try { api.executeCommand('startRecording', { mode: 'file' }); }
              catch (e) { console.warn('startRecording failed', e); }
            }, 2500); // больше задержка — после unmute
          }
        });
        api.addListener('recordingStatusChanged', (ev) => {
          // Для дебага: видно в консоли тренера
          console.log('[recording]', ev);
        });
        api.addListener('audioMuteStatusChanged', (ev) => console.log('[audio]', ev));
        api.addListener('videoMuteStatusChanged', (ev) => console.log('[video]', ev));
      } catch (err) {
        console.error('Jitsi load failed', err);
        if (!cancelled) setCallState('waiting');
      }
    })();

    return () => {
      cancelled = true;
      try { api?.dispose(); } catch {}
    };
  }, [callState, callJoin, handleLeaveCall]);

  // ─── Theory practice type: show text content + "Изучено" button ───
  if (activity.practiceType === 'theory') {
    return (
      <Layout>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 24px", position: "relative", zIndex: 1 }}>
          {/* Top bar */}
          <TopBar onBack={onBack} title={activity.label} />

          {/* Theory content */}
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)',
            borderRadius: 20, padding: '20px 18px', marginBottom: 24,
            border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
            overflowY: 'auto',
          }}>
            {activity.descriptionHtml ? (
              <TheoryContent html={activity.descriptionHtml} />
            ) : (
              <div style={{ textAlign: 'center', color: '#aaa', fontSize: 14, padding: '40px 0' }}>
                Содержание не добавлено
              </div>
            )}
          </div>

          {/* "Изучено" / "К практике" button */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 40 }}>
            <button onClick={activity.alreadyDone ? onBack : onDone}
              style={{
                padding: "16px 44px", background: "#1a1a2e", color: "#fff",
                border: "none", borderRadius: 16, fontSize: 16, fontWeight: 600,
                cursor: "pointer", boxShadow: "0 4px 20px rgba(26,26,46,0.2)", minWidth: 180,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
              {!activity.alreadyDone && (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <polyline points="3,8.5 6.5,12 13,4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="miter" fill="none"/>
                </svg>
              )}
              {activity.alreadyDone ? 'К практике' : 'Изучено'}
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  // ─── Call practice type: Jitsi Meet video call UI ───
  if (activity.practiceType === 'call') {
    const scheduled = activeCall ? new Date(activeCall.scheduled_at) : null;
    const now = Date.now();
    const canJoin = scheduled && (now >= scheduled.getTime() - 5 * 60 * 1000); // 5 min before

    return (
      <Layout>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 24px", position: "relative", zIndex: 1 }}>
          {/* Top bar */}
          <TopBar onBack={onBack} title={activity.label} />

          {callState === 'active' && callJoin?.roomUrl ? (
            /* Jitsi Meet iframe (injected by External API) */
            <div style={{
              height: 'calc(100vh - 140px)', borderRadius: 20, overflow: 'hidden', marginBottom: 24,
              background: '#000', position: 'relative', flexShrink: 0,
            }}>
              <div ref={callContainerRef} style={{ position: 'absolute', inset: 0 }} />
            </div>
          ) : callState === 'ended' ? (
            callJoin?.isStaff ? (
              /* Trainer: mark attendance */
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 24,
              }}>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>
                    Звонок завершён
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    Отметьте, кто участвовал — у них практика засчитается
                  </div>
                </div>

                {attendanceLoading ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    Загрузка...
                  </div>
                ) : attendance?.participants?.length ? (
                  <div style={{
                    flex: 1, overflowY: 'auto',
                    background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)',
                    borderRadius: 16, padding: 8, marginBottom: 16,
                    border: '1px solid rgba(255,255,255,0.7)',
                  }}>
                    {attendance.participants.map(p => {
                      const checked = checkedIds.has(p.userId);
                      const isSelf = p.userId === attendance.currentUserId;
                      return (
                        <div
                          key={p.userId}
                          onClick={() => toggleAttendance(p.userId)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 12px', borderRadius: 12,
                            cursor: isSelf ? 'default' : 'pointer',
                            opacity: isSelf ? 0.7 : 1,
                            background: checked ? 'rgba(39,174,96,0.08)' : 'transparent',
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: 6,
                            border: checked ? '2px solid #27ae60' : '2px solid rgba(0,0,0,0.2)',
                            background: checked ? '#27ae60' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            {checked && (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <polyline points="3,8.5 6.5,12 13,4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                              </svg>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 500, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.displayName || p.email || 'Участник'}
                            </div>
                            <div style={{ fontSize: 11, color: '#999' }}>
                              {isSelf ? 'Вы' : p.isOwner ? 'Мастер' : p.role === 'trainer' ? 'Тренер' : 'Ученик'}
                              {p.joined && !isSelf ? ' · был(а) в звонке' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    Нет участников
                  </div>
                )}

                <button
                  onClick={handleSubmitAttendance}
                  disabled={attendanceSaving || attendanceLoading}
                  style={{
                    padding: '16px 44px', background: '#1a1a2e', color: '#fff',
                    border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 600,
                    cursor: attendanceSaving ? 'wait' : 'pointer',
                    boxShadow: '0 4px 20px rgba(26,26,46,0.2)',
                    opacity: attendanceSaving || attendanceLoading ? 0.7 : 1,
                  }}
                >
                  {attendanceSaving ? 'Сохранение...' : 'Сохранить посещаемость'}
                </button>
              </div>
            ) : (
              /* Student: simple done screen */
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20,
              }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', background: 'rgba(39,174,96,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="36" height="36" viewBox="0 0 16 16" fill="none">
                    <polyline points="3,8.5 6.5,12 13,4" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" fill="none"/>
                  </svg>
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e' }}>Звонок завершён</div>
                <div style={{ fontSize: 13, color: '#666', textAlign: 'center', maxWidth: 280 }}>
                  Тренер отметит посещаемость — практика засчитается автоматически
                </div>
                <button onClick={onBack} style={{
                  padding: '16px 44px', background: '#1a1a2e', color: '#fff',
                  border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 600,
                  cursor: 'pointer', boxShadow: '0 4px 20px rgba(26,26,46,0.2)', minWidth: 180,
                }}>
                  Готово
                </button>
              </div>
            )
          ) : (
            /* Waiting / pre-call */
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24,
            }}>
              {activeCall ? (
                <>
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: 'rgba(26,26,46,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#1a1a2e" strokeWidth="1.5">
                      <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>
                      Запланированный звонок
                    </div>
                    <div style={{ fontSize: 14, color: '#666' }}>
                      {formatInTz(activeCall.scheduled_at, tzMin)}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                      по вашему часовому поясу из Профиля
                    </div>
                    {activeCall.duration_min && (
                      <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>
                        Длительность: {activeCall.duration_min} мин
                      </div>
                    )}
                  </div>

                  {/* Trainer's description of the upcoming call */}
                  {activity.descriptionHtml && (
                    <div style={{
                      width: '100%', maxWidth: 560, padding: '14px 18px',
                      borderRadius: 14, background: 'rgba(255,255,255,0.7)',
                      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(0,0,0,0.06)',
                    }}>
                      <TheoryContent html={activity.descriptionHtml} />
                    </div>
                  )}

                  {!canJoin && (
                    <div style={{
                      background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)',
                      borderRadius: 16, padding: '16px 28px', textAlign: 'center',
                      border: '1px solid rgba(255,255,255,0.7)',
                    }}>
                      <div style={{ fontSize: 13, color: '#999', marginBottom: 4 }}>До начала</div>
                      <div style={{ fontSize: 28, fontWeight: 300, color: '#1a1a2e', fontVariantNumeric: 'tabular-nums' }}>
                        {callCountdown}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleJoinCall}
                    disabled={!canJoin || callState === 'joining'}
                    style={{
                      padding: '16px 44px',
                      background: canJoin ? '#1a1a2e' : 'rgba(26,26,46,0.15)',
                      color: canJoin ? '#fff' : '#999',
                      border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 600,
                      cursor: canJoin ? 'pointer' : 'not-allowed',
                      boxShadow: canJoin ? '0 4px 20px rgba(26,26,46,0.2)' : 'none',
                      minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      opacity: callState === 'joining' ? 0.7 : 1,
                    }}
                  >
                    {callState === 'joining' ? 'Подключение...' : canJoin ? 'Войти в звонок' : 'Ожидание'}
                  </button>
                </>
              ) : (
                <>
                  <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    background: 'rgba(26,26,46,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5">
                      <rect x="2" y="3" width="20" height="14" rx="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e' }}>Звонок не запланирован</div>
                  <div style={{ fontSize: 14, color: '#999', textAlign: 'center', maxWidth: 280 }}>
                    Тренер ещё не назначил звонок на этот день
                  </div>
                  <button onClick={onBack} style={{
                    padding: '14px 36px', background: 'rgba(255,255,255,0.8)', color: '#1a1a2e',
                    border: '1.5px solid rgba(0,0,0,0.08)', borderRadius: 14, fontSize: 15, fontWeight: 600,
                    cursor: 'pointer', backdropFilter: 'blur(12px)',
                  }}>
                    Назад
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "calc(env(safe-area-inset-top, 0px) + 82px) 24px", position: "relative", zIndex: 1 }}>
        {/* Top bar */}
        <TopBar onBack={onBack} title={activity.label} />

        {/* Video player — rendered only when a video is actually attached.
            For media practices without a video the page falls through to
            intro (if any) + timer; no empty placeholder. */}
        {hasVideo && (
          <div ref={videoContainerRef} style={{
            width: "100%",
            // In fullscreen the container IS the screen — fill it and center
            // the video with object-fit:contain so it doesn't stick to the top.
            height: isFullscreen ? '100%' : 'auto',
            borderRadius: isFullscreen ? 0 : 20,
            overflow: "hidden",
            marginBottom: isFullscreen ? 0 : 24,
            background: "#000",
            boxShadow: isFullscreen ? 'none' : "0 8px 32px rgba(0,0,0,0.12)",
            position: 'relative',
            display: isFullscreen ? 'flex' : 'block',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isFileVideo && !videoError && (
              <video
                ref={videoRef}
                src={videoUrl}
                style={{
                  width: "100%",
                  height: isFullscreen ? '100%' : 'auto',
                  aspectRatio: isFullscreen ? 'auto' : "16/9",
                  display: "block",
                  objectFit: "contain",
                  background: "#000",
                  pointerEvents: 'none',
                }}
                playsInline
                preload="auto"
                controlsList="nodownload nofullscreen noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                onSeeked={handleVideoSeeked}
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setVideoError(true)}
              />
            )}
            {isDirectLink && !videoError && (
              <video
                ref={videoRef}
                src={video.video_url}
                style={{
                  width: "100%",
                  height: isFullscreen ? '100%' : 'auto',
                  aspectRatio: isFullscreen ? 'auto' : "16/9",
                  display: "block",
                  objectFit: "contain",
                  background: "#000",
                  pointerEvents: 'none',
                }}
                playsInline
                preload="auto"
                controlsList="nodownload nofullscreen noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
                onSeeked={handleVideoSeeked}
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setVideoError(true)}
              />
            )}
            {videoError && (
              <div style={{
                width: '100%', aspectRatio: '16/9', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', background: '#111', color: '#aaa', gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>Не удалось загрузить видео</span>
                <a href={video.video_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#3498db', fontSize: 13, textDecoration: 'underline' }}>
                  Открыть ссылку
                </a>
              </div>
            )}
            {isYoutube && (
              <div style={isFullscreen
                ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }
                : { position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }
              }>
                {/* pointer-events:none → all clicks go to our tap overlay above
                    (zIndex 5) so YouTube's residual title/share/etc icons can't
                    be interacted with even if YT decides to render them. */}
                <div ref={ytContainerRef} style={{
                  position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                  pointerEvents: 'none',
                }} />
              </div>
            )}
            {isDrive && (
              <div style={isFullscreen
                ? { position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }
                : { position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }
              }>
                <iframe
                  src={driveId
                    ? `https://drive.google.com/file/d/${driveId}/preview`
                    : video.video_url.replace(/\/view(\?.*)?$/, '/preview').replace(/\/edit(\?.*)?$/, '/preview')
                  }
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
                {/* Cover the "pop-out" button in top-right corner */}
                <div style={{
                  position: 'absolute', top: 0, right: 0, width: 48, height: 48,
                  background: '#000', zIndex: 2,
                }} />
              </div>
            )}

            {/* Tap overlay for play/pause + fullscreen button */}
            {!isDrive && (
              <div
                onClick={onPause}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: isFullscreen ? 36 : 0,
                  zIndex: 5, cursor: 'pointer',
                }}
              />
            )}
            {!isDrive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                  } else {
                    videoContainerRef.current?.requestFullscreen?.().catch(() => {});
                  }
                }}
                style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 12,
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(0,0,0,0.5)', border: 'none',
                  color: '#fff', fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isFullscreen ? '⊠' : '⛶'}
              </button>
            )}

            {/* Linear timer progress bar — only in fullscreen */}
            {isFullscreen && !isDone && (
              <div
                ref={linearBarRef}
                onMouseDown={(e) => {
                  if (elapsed <= 0) return;
                  linearDraggingRef.current = true;
                  beginScrub();
                  applyLinearDrag(e.clientX);
                }}
                onTouchStart={(e) => {
                  if (elapsed <= 0) return;
                  linearDraggingRef.current = true;
                  beginScrub();
                  applyLinearDrag(e.touches[0].clientX);
                }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: 36, cursor: 'pointer', zIndex: 10,
                  display: 'flex', alignItems: 'flex-end', touchAction: 'none',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
                }}
              >
                {/* Track bg */}
                <div style={{
                  position: 'absolute', bottom: 10, left: 16, right: 16,
                  height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.25)',
                }}>
                  {/* Max progress (pale) */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                    background: GREEN_PALE, width: `${maxPct}%`,
                  }} />
                  {/* Current progress */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                    background: GREEN, width: `${currentPct}%`,
                    transition: linearDraggingRef.current ? 'none' : 'width 1s linear',
                  }} />
                </div>
                {/* Ball */}
                {hasStarted && (
                  <div style={{
                    position: 'absolute', bottom: 5,
                    left: `calc(16px + (100% - 32px) * ${currentPct / 100} - 7px)`,
                    width: 14, height: 14, borderRadius: '50%',
                    background: GREEN, border: '2px solid #fff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    transition: linearDraggingRef.current ? 'none' : 'left 1s linear',
                  }} />
                )}
                {/* Time label */}
                <div style={{
                  position: 'absolute', bottom: 18, right: 16,
                  fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatTime(timerSeconds)}
                </div>
                {/* Pause indicator */}
                {timerPaused && hasStarted && (
                  <div style={{
                    position: 'absolute', bottom: 18, left: 16,
                    fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 500,
                  }}>
                    На паузе
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isDrive && (
          <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: -16, marginBottom: 8 }}>
            Google Drive: управляйте видео в плеере отдельно от таймера
          </div>
        )}

        {/* Lesson intro — collapsible. Trainer fills it in EditCourse for
            media practices. Auto-collapses the moment the timer starts. */}
        {activity.descriptionHtml && (
          <LessonIntro html={activity.descriptionHtml} timerPaused={timerPaused} />
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

// Collapsible intro shown above the timer on media practices. Header acts
// as a chevron toggle; expanded body is full TheoryContent (HTML rich text,
// inline images/videos). Auto-collapses on timer start so the timer stays
// visible without the user having to fold it back manually.
function LessonIntro({ html, timerPaused }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!timerPaused) setOpen(false);
  }, [timerPaused]);
  return (
    <div style={{
      width: '100%', marginBottom: 16,
      borderRadius: 14, background: 'rgba(255,255,255,0.65)',
      backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 14px', border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a1a2e',
        }}
      >
        <span>Введение к уроку</span>
        <span style={{
          fontSize: 11, color: '#888',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }}>▼</span>
      </button>
      {open && (
        <div style={{ padding: '4px 14px 14px' }}>
          <TheoryContent html={html} />
        </div>
      )}
    </div>
  );
}
