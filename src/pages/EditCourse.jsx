import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import AvatarPicker, { processAvatarFile } from '../components/AvatarPicker';
import ScheduleCalendar, { toggleDayInActivity } from '../components/ScheduleCalendar';
import { getIconPath } from '../data/iconCatalog';
import { formatInTz, isActivityScheduled, normalizeSchedule } from '../data/constants';
import { glass, pageWrapper } from '../styles/shared';
import TopBar from '../components/TopBar';
import {
  loadCourseForEdit, canDeleteCourse, deleteCourse,
  getActivityMedia, uploadActivityMedia, addMediaLink, addEmptyMedia, importDriveMedia, deleteActivityMedia,
  getActivityCalls, createActivityCall, deleteActivityCall, patchActivityCall,
  updateActivityDuration, updateMediaDuration, patchMedia,
  patchCourseMeta, createActivity, patchActivity, deleteActivity,
} from '../lib/db';
import { createAutoSaver } from '../lib/autoSave';
import MediaSection, { extractYoutubeId } from '../components/MediaSection';
import RichTextEditor from '../components/RichTextEditor';
import Dropdown from '../components/Dropdown';

// Detect a video's duration without showing it. Used at trainer-edit time so
// the practice length auto-syncs with the actual runtime.
function detectDirectDuration(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    let done = false;
    const finish = (val) => {
      if (done) return; done = true;
      try { v.src = ''; v.remove(); } catch {}
      resolve(val);
    };
    v.onloadedmetadata = () => {
      const d = Math.round(v.duration);
      finish(d > 0 && isFinite(d) ? d : null);
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
    v.src = url;
  });
}

function detectYoutubeDuration(youtubeId) {
  return new Promise((resolve) => {
    const ensureApi = () => new Promise((res) => {
      if (window.YT?.Player) return res();
      if (!document.querySelector('script[data-yt-api]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.dataset.ytApi = '1';
        document.head.appendChild(tag);
      }
      const tick = setInterval(() => {
        if (window.YT?.Player) { clearInterval(tick); res(); }
      }, 200);
      setTimeout(() => { clearInterval(tick); res(); }, 8000);
    });
    (async () => {
      await ensureApi();
      if (!window.YT?.Player) return resolve(null);
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
      document.body.appendChild(host);
      let resolved = false;
      const finish = (val) => {
        if (resolved) return; resolved = true;
        try { player?.destroy?.(); } catch {}
        try { host.remove(); } catch {}
        resolve(val);
      };
      const player = new window.YT.Player(host, {
        videoId: youtubeId,
        playerVars: { controls: 0, autoplay: 0 },
        events: {
          onReady: () => {
            try {
              const d = player.getDuration();
              finish(d > 0 ? Math.round(d) : null);
            } catch { finish(null); }
          },
          onError: () => finish(null),
        },
      });
      setTimeout(() => finish(null), 10000);
    })();
  });
}

const PRACTICE_TYPE_OPTIONS = [
  { value: 'media', label: 'Практика' },
  { value: 'call', label: 'Онлайн с мастером' },
];

// Тип медиа выбирается per-media внутри practice=media.
const MEDIA_TYPE_OPTIONS = [
  { value: 'video', label: 'Видео' },
  { value: 'audio', label: 'Аудио' },
  { value: 'image', label: 'Изображение' },
  { value: 'text', label: 'Текст' },
  { value: 'none', label: 'Без медиа' },
];

const GREEN = '#27ae60';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block' };

function SaveStatusBadge({ status }) {
  if (status === 'saving') {
    return (
      <span title="Сохранение..." style={{
        fontSize: 12, color: '#27ae60', fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>Сохр.</span>
    );
  }
  if (status === 'error') {
    return (
      <span title="Ошибка сохранения" style={{
        fontSize: 14, color: '#e74c3c',
      }}>⚠</span>
    );
  }
  return (
    <span title="Все изменения сохранены" style={{
      fontSize: 14, color: '#27ae60',
    }}>✓</span>
  );
}

function emptyActivity(daysCount) {
  return { dbId: null, label: '', iconNum: 'health/1', practiceType: 'media', descriptionHtml: '', firstDay: 1, lastDay: daysCount, durationMin: 10, intervalDays: 1, excludedDays: [], extraDays: [], _key: Date.now() + Math.random() };
}

export default function EditCoursePage({ courseId, onBack, onSaved, onDeleted, tzOffsetMin }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  // v22 calendar binding: if true — все ученики стартуют относительно
  // startDate, иначе с момента joined_at каждого. accessDaysAfter — окно
  // доступа к материалам ПОСЛЕ окончания (NULL = бессрочно, 0 = ровно
  // в день окончания, N>0 = N дней после).
  const [boundToCalendar, setBoundToCalendar] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [accessDaysAfter, setAccessDaysAfter] = useState('');
  const [avatarIcon, setAvatarIcon] = useState('health/1');
  const [avatarCustom, setAvatarCustom] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [pickerTarget, setPickerTarget] = useState(null);
  const [videos, setVideos] = useState([]);
  const [calls, setCalls] = useState([]);
  const [videoUploadingId, setVideoUploadingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState('downloading'); // 'downloading' | 'processing' | 'done'
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'
  const fileRef = useRef();
  // Свёрнутые активности (по _key, стабильный per-сессия). Drag/drop
  // работает только когда карточка свёрнута — маленькая цель, не будет
  // конфликта с обычными взаимодействиями внутри развёрнутой карточки.
  const [collapsedKeys, setCollapsedKeys] = useState(() => new Set());
  const [dragKey, setDragKey] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  // FLIP-анимация reorder карточек. Перед setActivities снимаем rects
  // всех видимых карточек; после ре-рендера в useLayoutEffect для каждой
  // считаем delta = oldRect - newRect, мгновенно смещаем translate назад,
  // потом за один rAF снимаем transform под transition → плавный слайд.
  const prevRectsRef = useRef(new Map());
  const captureCardRects = () => {
    const m = new Map();
    document.querySelectorAll('[data-activity-key]').forEach(el => {
      m.set(el.getAttribute('data-activity-key'), el.getBoundingClientRect());
    });
    prevRectsRef.current = m;
  };
  useLayoutEffect(() => {
    const prev = prevRectsRef.current;
    if (!prev || prev.size === 0) return;
    document.querySelectorAll('[data-activity-key]').forEach(el => {
      const key = el.getAttribute('data-activity-key');
      const oldRect = prev.get(key);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const dy = oldRect.top - newRect.top;
      if (Math.abs(dy) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 320);
      });
    });
    prevRectsRef.current = new Map();
  }, [activities]);

  // One auto-saver per editor instance — debounces field PATCHes per-key
  // (each key = one course field group or one activity dbId).
  const saverRef = useRef(null);
  if (!saverRef.current) saverRef.current = createAutoSaver(700);
  useEffect(() => {
    const off = saverRef.current.onStateChange(setSaveStatus);
    return () => off();
  }, []);
  // Best-effort: flush any pending saves when the user navigates away.
  useEffect(() => {
    return () => { saverRef.current?.flushAll(); };
  }, []);

  // Load (or re-load) course data from the server.
  const loadCourse = useCallback(async ({ withSpinner = true } = {}) => {
    if (!courseId) return;
    if (withSpinner) setLoading(true);
    const [course, vids, callsData] = await Promise.all([
      loadCourseForEdit(courseId),
      getActivityMedia(courseId),
      getActivityCalls(courseId),
    ]);
    if (!course) { setError('Не удалось загрузить курс'); setLoading(false); return; }

    setTitle(course.title || '');
    setDescription(course.description || '');
    const dc = course.days_count || 30;
    setDaysCount(dc);
    setBoundToCalendar(!!course.bound_to_calendar);
    // Date input wants YYYY-MM-DD; trim ISO timestamp if backend ever returns full.
    setStartDate((course.start_date || '').slice(0, 10));
    setAccessDaysAfter(course.access_days_after == null ? '' : String(course.access_days_after));
    setAvatarIcon(course.avatar_icon || 'health/1');
    setAvatarCustom(course.avatar_custom || null);
    setCalls(callsData || []);

    // Defensive clamp on load: legacy rows may have first_day/last_day past
    // the current days_count (e.g. course was shortened by an older client
    // that didn't cascade). Clamp in local state AND quietly PATCH so the
    // numeric inputs/calendar agree from the first render. Same for videos.
    const clampedVideos = (vids || []).map(v => {
      const newFirst = Math.min(v.first_day || 1, dc);
      const newLast = Math.min(v.last_day || dc, dc);
      const newExc = (v.excluded_days || []).filter(d => d <= dc);
      const newExt = (v.extra_days || []).filter(d => d <= dc);
      if (newFirst === v.first_day && newLast === v.last_day
          && newExc.length === (v.excluded_days || []).length
          && newExt.length === (v.extra_days || []).length) {
        return v;
      }
      patchMedia(v.id, { firstDay: newFirst, lastDay: newLast, excludedDays: newExc, extraDays: newExt });
      return { ...v, first_day: newFirst, last_day: newLast, excluded_days: newExc, extra_days: newExt };
    });
    setVideos(clampedVideos);

    const acts = (course.course_activities || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(a => {
        const newFirst = Math.min(a.first_day || 1, dc);
        const newLast = Math.min(a.last_day || dc, dc);
        const newExc = (Array.isArray(a.excluded_days) ? a.excluded_days : []).filter(d => d <= dc);
        const newExt = (Array.isArray(a.extra_days) ? a.extra_days : []).filter(d => d <= dc);
        const drift = newFirst !== (a.first_day || 1) || newLast !== (a.last_day || dc)
          || newExc.length !== (a.excluded_days || []).length
          || newExt.length !== (a.extra_days || []).length;
        if (drift) {
          patchActivity(a.id, { firstDay: newFirst, lastDay: newLast, excludedDays: newExc, extraDays: newExt });
        }
        return {
          dbId: a.id,
          activityId: a.activity_id,
          label: a.label,
          iconNum: a.icon_num || 'health/1',
          practiceType: a.practice_type || 'media',
          descriptionHtml: a.description_html || '',
          firstDay: newFirst,
          lastDay: newLast,
          durationMin: a.duration_min || 10,
          intervalDays: a.interval_days || 1,
          excludedDays: newExc,
          extraDays: newExt,
          _key: a.id,
        };
      });
    setActivities(acts);
    if (withSpinner) setLoading(false);
  }, [courseId]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  // After a video is added, sync the activity's practice duration to match
  // the video runtime (rounded to whole minutes, min 1).
  const syncActivityDuration = async (activityId, durationSec) => {
    if (!durationSec || durationSec <= 0) return;
    const durationMin = Math.max(1, Math.round(durationSec / 60));
    setActivities(prev => prev.map(a => (a.dbId === activityId ? { ...a, durationMin } : a)));
    await updateActivityDuration(activityId, durationMin);
  };

  const handleVideoUpload = async (activityId, file, firstDay, lastDay, intervalDays, mediaType = 'video') => {
    setVideoUploadingId(activityId);
    setUploadProgress(0);
    const result = await uploadActivityMedia(courseId, activityId, file, firstDay, lastDay, intervalDays, (pct) => {
      setUploadProgress(pct);
    }, mediaType);
    setVideoUploadingId(null);
    setUploadProgress(0);
    if (result.error) { setError(`Ошибка загрузки видео: ${result.error}`); return; }
    setVideos(prev => [...prev, result.data]);
    // Server already extracts duration_sec from upload metadata when client sent it.
    if (result.data?.duration_sec) {
      await syncActivityDuration(activityId, result.data.duration_sec);
    }
  };

  const handleAddEmpty = async (activityId, mediaType, firstDay, lastDay, intervalDays) => {
    const result = await addEmptyMedia(courseId, activityId, mediaType, firstDay, lastDay, intervalDays);
    if (result.error) { setError(`Ошибка: ${result.error}`); return; }
    setVideos(prev => [...prev, result.data]);
  };

  const handleAddLink = async (activityId, url, sourceType, firstDay, lastDay, intervalDays, mediaType = 'video') => {
    // Drive URLs route through import-drive: backend pulls the file to our
    // storage, frontend shows a progress bar like a normal upload, and the
    // result becomes a regular type='file' video (timer fully syncs).
    if (sourceType === 'drive') {
      setVideoUploadingId(activityId);
      setUploadProgress(0);
      setUploadPhase('downloading');
      const result = await importDriveMedia(
        courseId, activityId, url, firstDay, lastDay, intervalDays,
        (pct, phase) => { setUploadProgress(pct); if (phase) setUploadPhase(phase); },
      );
      setVideoUploadingId(null);
      setUploadProgress(0);
      setUploadPhase('downloading');
      if (result.error) {
        const msg = `Не удалось импортировать видео с Google Drive:\n${result.error}\n\nЕсли файл больше 1 ГБ — сожмите его до меньшего размера или загрузите на YouTube как «Доступ по ссылке».`;
        setError(`Ошибка импорта Drive: ${result.error}`);
        alert(msg);
        return;
      }
      if (!result.data || !result.data.id) {
        setError('Импорт завершился, но данные видео не вернулись. Перезагрузите страницу.');
        alert('Импорт завершился, но данные видео не вернулись. Перезагрузите страницу.');
        return;
      }
      setVideos(prev => [...prev, result.data]);
      if (result.data?.duration_sec) {
        await syncActivityDuration(activityId, result.data.duration_sec);
      }
      return;
    }

    const result = await addMediaLink(courseId, activityId, url, sourceType, firstDay, lastDay, intervalDays, mediaType);
    if (result.error) { setError(`Ошибка добавления ссылки: ${result.error}`); return; }
    const created = result.data;
    setVideos(prev => [...prev, created]);
    // Background duration detection — YouTube + direct mp4/webm.
    let detected = null;
    try {
      if (sourceType === 'youtube') {
        const ytId = extractYoutubeId(url);
        if (ytId) detected = await detectYoutubeDuration(ytId);
      } else if (sourceType === 'link') {
        detected = await detectDirectDuration(url);
      }
    } catch {}
    if (detected && created?.id) {
      try { await updateMediaDuration(created.id, detected); } catch {}
      setVideos(prev => prev.map(v => (v.id === created.id ? { ...v, duration_sec: detected } : v)));
      await syncActivityDuration(activityId, detected);
    }
  };

  const handleDeleteVideo = async (videoId, videoUrl, sourceType) => {
    const result = await deleteActivityMedia(videoId, videoUrl, sourceType);
    if (result.error) { setError(`Ошибка удаления видео: ${result.error}`); return; }
    setVideos(prev => prev.filter(v => v.id !== videoId));
  };

  // Per-video day-override toggle from the mini-calendar under each video.
  // Same normalization as toggleActivityDay — collapse the window around the
  // resulting ON-days so first_day/last_day match what's visible.
  const handlePatchVideo = async (videoId, fields) => {
    const current = videos.find(v => v.id === videoId);
    if (!current) return;
    const merged = {
      firstDay: current.first_day, lastDay: current.last_day, intervalDays: current.interval_days,
      excludedDays: current.excluded_days || [], extraDays: current.extra_days || [],
      ...fields,
    };
    const normalized = normalizeSchedule(merged, daysCount) || merged;
    setVideos(prev => prev.map(v => v.id === videoId ? {
      ...v,
      first_day: normalized.firstDay,
      last_day: normalized.lastDay,
      excluded_days: normalized.excludedDays,
      extra_days: normalized.extraDays,
    } : v));
    const result = await patchMedia(videoId, normalized);
    if (result?.error) setError(`Ошибка: ${result.error}`);
  };

  const handleCreateCall = async (activityId, day, scheduledAt, durationMin) => {
    const result = await createActivityCall(courseId, activityId, day, scheduledAt, durationMin);
    if (result.error) { setError(`Ошибка: ${result.error}`); return; }
    if (result.data) setCalls(prev => [...prev, result.data]);
  };

  const handleDeleteCall = async (callId) => {
    const result = await deleteActivityCall(callId);
    if (result.error) { setError(`Ошибка: ${result.error}`); return; }
    setCalls(prev => prev.filter(c => c.id !== callId));
  };

  const handlePatchCall = async (callId, fields) => {
    // optimistic update
    setCalls(prev => prev.map(c => c.id === callId ? {
      ...c,
      scheduled_at: fields.scheduledAt !== undefined ? fields.scheduledAt : c.scheduled_at,
    } : c));
    const result = await patchActivityCall(callId, fields);
    if (result?.error) setError(`Ошибка: ${result.error}`);
    else if (result?.data) {
      setCalls(prev => prev.map(c => c.id === callId ? result.data : c));
    }
  };

  // ── Activity field auto-save ──
  // Backend payload uses camelCase same as our state — pass through directly.
  const scheduleActivityPatch = (dbId, fields) => {
    saverRef.current.schedule(`act-${dbId}`, () => patchActivity(dbId, fields));
  };

  const updateActivity = (idx, field, val) => {
    // Read dbId from current state BEFORE setActivities — React queues the
    // updater function and runs it later, so reading inside `prev => ...`
    // would give us the value too late and we'd skip every PATCH.
    const dbId = activities[idx]?.dbId;
    setActivities(prev => prev.map((a, i) => (i === idx ? { ...a, [field]: val } : a)));
    if (dbId) scheduleActivityPatch(dbId, { [field]: val });
  };

  // Calendar tap: compute new excluded/extra arrays AND collapse first/last
  // around the resulting ON-days so the numeric inputs stay in sync with what
  // the calendar shows (excluding leading/trailing days collapses the window
  // rather than just hiding them).
  const toggleActivityDay = (idx, day) => {
    const act = activities[idx];
    if (!act) return;
    const next = toggleDayInActivity(act, day);
    const normalized = normalizeSchedule({ ...act, ...next }, daysCount) || next;
    setActivities(prev => prev.map((a, i) => (i === idx ? { ...a, ...normalized } : a)));
    if (act.dbId) scheduleActivityPatch(act.dbId, normalized);
  };

  const toggleCollapsed = (key) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Drag/drop reorder свёрнутых активностей. onDragOver над карточкой
  // помечает её как drop-target (для рамки-индикатора). onDrop переставляет
  // массив и пушит новый sort_order на бэк для каждой изменившейся строки.
  const handleDrop = async (targetKey) => {
    const src = dragKey;
    setDragKey(null);
    setDragOverKey(null);
    if (!src || src === targetKey) return;
    const srcIdx = activities.findIndex(a => a._key === src);
    const dstIdx = activities.findIndex(a => a._key === targetKey);
    if (srcIdx < 0 || dstIdx < 0) return;
    const reordered = [...activities];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(dstIdx, 0, moved);
    captureCardRects();
    setActivities(reordered);
    // Persist sort_order (id * 10 шагом, чтобы будущие вставки не били).
    // Только для карточек с dbId — новые ещё не в БД.
    reordered.forEach((a, i) => {
      if (a.dbId) {
        const newOrder = i * 10;
        if (a.sort_order !== newOrder) scheduleActivityPatch(a.dbId, { sortOrder: newOrder });
      }
    });
  };

  const removeActivity = async (idx) => {
    const act = activities[idx];
    const label = (act?.label || '').trim();
    const msg = label
      ? `Вы уверены что хотите удалить активность «${label}»?`
      : 'Вы уверены что хотите удалить активность?';
    if (!confirm(msg)) return;
    setActivities(prev => prev.filter((_, i) => i !== idx));
    if (act?.dbId) {
      saverRef.current.cancel(`act-${act.dbId}`);
      // delete is fire-and-forget; if it errors, user can hit refresh
      const result = await deleteActivity(act.dbId);
      if (result?.error) setError(`Ошибка удаления активности: ${result.error}`);
      // Refresh videos cached in state — server cascaded them on disk + DB.
      setVideos(prev => prev.filter(v => v.activity_id !== act.dbId));
    }
  };

  // Add a new activity. Auto-creates the DB row immediately so videos /
  // call scheduling are usable without a "save first" step. Anything the user
  // types during the create roundtrip is merged into the new dbId after the
  // response lands and pushed via a follow-up patch.
  const addActivity = async () => {
    const tempKey = `tmp-${Date.now()}`;
    const placeholder = { ...emptyActivity(daysCount), _key: tempKey, _creating: true };
    setActivities(prev => [...prev, placeholder]);
    const days = parseInt(daysCount) || 30;
    const created = await createActivity(courseId, {
      label: '', iconNum: 'health/1', practiceType: 'media',
      firstDay: 1, lastDay: days, durationMin: 10, intervalDays: 1,
      sortOrder: activities.length,
    });
    if (created?.error || !created?.id) {
      setError(`Ошибка создания активности: ${created?.error || 'unknown'}`);
      setActivities(prev => prev.filter(a => a._key !== tempKey));
      return;
    }
    let userEdits = null;
    setActivities(prev => prev.map(a => {
      if (a._key !== tempKey) return a;
      // Merge: user-edited fields take precedence over server defaults.
      const merged = {
        dbId: created.id,
        activityId: created.activity_id,
        label: a.label || created.label || '',
        iconNum: a.iconNum || created.icon_num || 'health/1',
        practiceType: a.practiceType || created.practice_type || 'media',
        descriptionHtml: a.descriptionHtml || created.description_html || '',
        firstDay: a.firstDay ?? created.first_day,
        lastDay: a.lastDay ?? created.last_day,
        durationMin: a.durationMin ?? created.duration_min,
        intervalDays: a.intervalDays ?? created.interval_days ?? 1,
        _key: created.id,
      };
      // Detect what the user actually changed during the roundtrip.
      const diff = {};
      if (a.label && a.label !== '') diff.label = a.label;
      if (a.iconNum && a.iconNum !== 'health/1') diff.iconNum = a.iconNum;
      if (a.practiceType && a.practiceType !== 'media') diff.practiceType = a.practiceType;
      if (a.descriptionHtml) diff.descriptionHtml = a.descriptionHtml;
      if (Object.keys(diff).length > 0) userEdits = diff;
      return merged;
    }));
    if (userEdits) {
      saverRef.current.schedule(`act-${created.id}`, () => patchActivity(created.id, userEdits));
    }
  };

  // ── Course meta auto-save wrappers ──
  // setLocal + schedule a debounced PATCH. Server clamps values, so empty
  // intermediate states (e.g., daysCount === '') are skipped.
  const scheduleMetaSave = useCallback((fields) => {
    saverRef.current.schedule('meta', () => patchCourseMeta(courseId, fields));
  }, [courseId]);

  const onTitleChange = (v) => { setTitle(v); scheduleMetaSave({ title: v }); };
  const onDescriptionChange = (v) => { setDescription(v); scheduleMetaSave({ description: v }); };
  const onBoundToCalendarChange = (v) => {
    setBoundToCalendar(v);
    // Если выключают привязку — start_date остаётся в БД на случай
    // повторного включения (не очищаем).
    scheduleMetaSave({ boundToCalendar: v });
  };
  const onStartDateChange = (v) => {
    setStartDate(v);
    scheduleMetaSave({ startDate: v || null });
  };
  const onAccessDaysAfterChange = (v) => {
    setAccessDaysAfter(v);
    const n = v === '' ? null : Math.max(0, parseInt(v));
    if (v !== '' && !Number.isFinite(n)) return;
    scheduleMetaSave({ accessDaysAfter: n });
  };
  // Light path: while the trainer is typing, only update local state + the
  // debounced meta save. Clamping is destructive (collapses lastDay down to
  // every intermediate digit, e.g. "12" passes through "1" first), so it
  // runs ONLY on commit — see commitDaysCount below.
  const onDaysCountChange = (v) => {
    setDaysCount(v);
    const n = parseInt(v);
    if (!isNaN(n) && n >= 1) scheduleMetaSave({ daysCount: Math.min(n, 365) });
  };

  // Heavy path: called on input blur after the trainer is done typing.
  // Walks activities + videos and trims anything that overflows the new
  // course tail. Schedules that already fit are untouched.
  const commitDaysCount = (rawValue) => {
    const n = parseInt(rawValue);
    if (isNaN(n) || n < 1) return;
    const clamped = Math.min(n, 365);
    setActivities(prev => prev.map(a => {
      const oldFirst = a.firstDay ?? 1;
      const oldLast = a.lastDay ?? clamped;
      const oldExc = a.excludedDays || [];
      const oldExt = a.extraDays || [];
      const newFirst = Math.min(oldFirst, clamped);
      const newLast = Math.min(oldLast, clamped);
      const newExc = oldExc.filter(d => d <= clamped);
      const newExt = oldExt.filter(d => d <= clamped);
      const changed = newFirst !== oldFirst || newLast !== oldLast
        || newExc.length !== oldExc.length || newExt.length !== oldExt.length;
      if (!changed) return a;
      if (a.dbId) {
        scheduleActivityPatch(a.dbId, {
          firstDay: newFirst, lastDay: newLast,
          excludedDays: newExc, extraDays: newExt,
        });
      }
      return { ...a, firstDay: newFirst, lastDay: newLast, excludedDays: newExc, extraDays: newExt };
    }));
    setVideos(prev => prev.map(v => {
      const oldFirst = v.first_day || 1;
      const oldLast = v.last_day || clamped;
      const oldExc = v.excluded_days || [];
      const oldExt = v.extra_days || [];
      const newFirst = Math.min(oldFirst, clamped);
      const newLast = Math.min(oldLast, clamped);
      const newExc = oldExc.filter(d => d <= clamped);
      const newExt = oldExt.filter(d => d <= clamped);
      const changed = newFirst !== oldFirst || newLast !== oldLast
        || newExc.length !== oldExc.length || newExt.length !== oldExt.length;
      if (!changed) return v;
      saverRef.current.schedule(`video-${v.id}`, () => patchMedia(v.id, {
        firstDay: newFirst, lastDay: newLast,
        excludedDays: newExc, extraDays: newExt,
      }));
      return { ...v, first_day: newFirst, last_day: newLast, excluded_days: newExc, extra_days: newExt };
    }));
  };
  const onAvatarIconChange = (icon) => {
    setAvatarIcon(icon); setAvatarCustom(null);
    scheduleMetaSave({ avatarIcon: icon, avatarCustom: null });
  };
  const onAvatarCustomChange = (dataUrl) => {
    setAvatarCustom(dataUrl); setAvatarIcon(null);
    scheduleMetaSave({ avatarCustom: dataUrl });
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    processAvatarFile(file, onAvatarCustomChange, setError);
  };

  const handleDelete = async () => {
    setError('');
    setDeleting(true);

    const check = await canDeleteCourse(courseId);
    if (!check.canDelete) {
      setError(check.reason);
      setDeleting(false);
      return;
    }

    if (!confirm('Удалить курс? Все данные курса будут безвозвратно потеряны.')) {
      setDeleting(false);
      return;
    }

    const result = await deleteCourse(courseId);
    setDeleting(false);

    if (result?.deleted) {
      onDeleted();
    } else {
      setError(result?.reason || 'Не удалось удалить курс');
    }
  };

  const avatarSrc = avatarCustom || (avatarIcon ? getIconPath(avatarIcon) : null);

  if (loading) {
    return (
      <Layout>
        <div style={{ ...pageWrapper, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <span style={{ fontSize: 14, color: '#aaa' }}>Загрузка курса...</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={pageWrapper}>
        <TopBar onBack={onBack} title="Редактировать курс" right={<SaveStatusBadge status={saveStatus} />} />

        {/* Avatar + Title + Description */}
        <div style={{ ...glass, borderRadius: 18, padding: '20px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <AvatarPicker
              src={avatarSrc}
              onPick={() => setPickerTarget('avatar')}
              onUpload={() => fileRef.current?.click()}
              fileInputRef={fileRef}
              onFileChange={handleAvatarUpload}
            />
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Название курса</label>
              <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Мой курс" style={inputStyle} />
            </div>
          </div>

          <label style={labelStyle}>Описание</label>
          <textarea value={description} onChange={e => onDescriptionChange(e.target.value)}
            placeholder="Краткое описание курса..." rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />

          <label style={labelStyle}>Длительность (дней)</label>
          <input type="number" value={daysCount} min={1} max={365}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') { onDaysCountChange(''); return; }
              const n = parseInt(raw);
              if (!isNaN(n) && n >= 0) onDaysCountChange(n);
            }}
            onBlur={() => {
              const v = parseInt(daysCount);
              const clamped = isNaN(v) || v < 1 ? 1 : Math.min(v, 365);
              if (clamped !== daysCount) onDaysCountChange(clamped);
              // Apply destructive clamping (activity/video lastDay trim) only
              // after the trainer commits — typing "12" passes through "1"
              // and an immediate clamp would collapse everything to day 1.
              commitDaysCount(clamped);
            }}
            style={{ ...inputStyle, width: 100 }} />

          {/* v22 calendar binding */}
          <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.02)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
              <input type="checkbox" checked={boundToCalendar}
                onChange={e => onBoundToCalendarChange(e.target.checked)} />
              Привязать начало к дате
            </label>
            <div style={{ fontSize: 12, color: '#888', marginTop: 4, marginLeft: 24 }}>
              Курс будет виден ученикам в плане, но дни пойдут только с указанной даты.
            </div>
            {boundToCalendar && (
              <div style={{ marginTop: 10, marginLeft: 24 }}>
                <label style={{ ...labelStyle, fontSize: 12 }}>Дата начала</label>
                <input type="date" value={startDate}
                  onChange={e => onStartDateChange(e.target.value)}
                  style={{ ...inputStyle, width: 180 }} />
              </div>
            )}
          </div>

          {/* v22 access window after course end */}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.02)' }}>
            <label style={{ ...labelStyle, fontSize: 13 }}>
              Материалы доступны после окончания (дней)
            </label>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
              Сколько дней после окончания курса ученик ещё видит материалы и практики.
              Пусто = бессрочно, 0 = только в день окончания.
            </div>
            <input type="number" min={0} max={3650} placeholder="бессрочно"
              value={accessDaysAfter}
              onChange={e => onAccessDaysAfterChange(e.target.value)}
              style={{ ...inputStyle, width: 140 }} />
          </div>
        </div>

        {/* Activities */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Активности
        </div>

        {activities.map((a, idx) => (
          <ActivityCard key={a._key} activity={a} index={idx} maxDay={daysCount}
            onUpdate={(f, v) => updateActivity(idx, f, v)}
            onToggleDay={(day) => toggleActivityDay(idx, day)}
            onRemove={() => removeActivity(idx)}
            onPickIcon={() => setPickerTarget(idx)}
            videos={videos} courseId={courseId}
            videoUploadingId={videoUploadingId}
            uploadProgress={uploadProgress}
            uploadPhase={uploadPhase}
            activityId={a.dbId || a._key}
            onVideoUpload={(file, fd, ld, iv, mt) => handleVideoUpload(a.dbId || a._key, file, fd, ld, iv, mt)}
            onAddLink={(url, type, fd, ld, iv, mt) => handleAddLink(a.dbId || a._key, url, type, fd, ld, iv, mt)}
            onAddEmpty={(mt, fd, ld, iv) => handleAddEmpty(a.dbId || a._key, mt, fd, ld, iv)}
            onDeleteVideo={handleDeleteVideo}
            onPatchVideo={handlePatchVideo}
            calls={calls}
            onCreateCall={handleCreateCall}
            onDeleteCall={handleDeleteCall}
            onPatchCall={handlePatchCall}
            tzOffsetMin={tzOffsetMin}
            boundToCalendar={boundToCalendar}
            courseStartDate={startDate}
            collapsed={collapsedKeys.has(a._key)}
            onToggleCollapsed={() => toggleCollapsed(a._key)}
            isDragging={dragKey === a._key}
            isDragOver={dragOverKey === a._key && dragKey && dragKey !== a._key}
            onDragBegin={() => setDragKey(a._key)}
            onDragOverKey={(key) => { if (dragKey && dragKey !== key) setDragOverKey(key); }}
            onDragEnd={() => { setDragKey(null); setDragOverKey(null); }}
            onDropOn={(key) => handleDrop(key)} />
        ))}

        <button onClick={addActivity} style={{
          width: '100%', padding: 14, borderRadius: 14,
          border: '2px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
          color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 20,
        }}>+ Добавить активность</button>

        {/* Delete course */}
        {onDeleted && (
          <div style={{
            marginTop: 24, padding: '16px', borderRadius: 14,
            border: '1.5px solid rgba(231,76,60,0.2)', background: 'rgba(231,76,60,0.03)',
          }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              Курс можно удалить только если в нём нет учеников (кроме создателя).
            </div>
            <button onClick={handleDelete} disabled={deleting} style={{
              width: '100%', padding: 14, background: deleting ? '#ccc' : 'rgba(231,76,60,0.1)',
              color: '#e74c3c', border: '1.5px solid rgba(231,76,60,0.3)', borderRadius: 12,
              fontSize: 15, fontWeight: 600, cursor: deleting ? 'wait' : 'pointer',
            }}>
              {deleting ? 'Проверка...' : '🗑 Удалить курс'}
            </button>
          </div>
        )}

        {error && (
          <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 12, background: 'rgba(231,76,60,0.1)', color: '#e74c3c', fontSize: 14 }}>
            {error}
          </div>
        )}
      </div>

      {pickerTarget !== null && (
        <IconPicker
          value={pickerTarget === 'avatar' ? avatarIcon : activities[pickerTarget]?.iconNum}
          onChange={num => {
            if (pickerTarget === 'avatar') onAvatarIconChange(num);
            else updateActivity(pickerTarget, 'iconNum', num);
          }}
          onClose={() => setPickerTarget(null)} />
      )}
    </Layout>
  );
}

// Helpers: «День N курса» → YYYY-MM-DD (UTC-стабильно), и обратно.
function dayToISODate(startDateISO, day) {
  const [y, mo, d] = startDateISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (day - 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}

function formatDayDateLong(isoDate) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const W = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const M = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  return `${W[dt.getUTCDay()]}, ${dt.getUTCDate()} ${M[dt.getUTCMonth()]}`;
}

// Превращает (YYYY-MM-DD, HH:MM, tzMinutes) → ISO UTC момент,
// интерпретируя время как wall-clock в указанном часовом поясе.
function combineDateTimeInTz(isoDate, hhmm, tzMin) {
  const [y, mo, d] = isoDate.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  return new Date(naiveUtc - tzMin * 60000).toISOString();
}

// Достаёт HH:MM (в указанном tz) из ISO timestamp.
function isoToHHMM(isoTimestamp, tzMin) {
  const d = new Date(isoTimestamp);
  const shifted = new Date(d.getTime() + tzMin * 60000);
  return `${String(shifted.getUTCHours()).padStart(2,'0')}:${String(shifted.getUTCMinutes()).padStart(2,'0')}`;
}

// Список плановых дней активности — учитывает firstDay/lastDay/intervalDays
// + excluded/extra дни. Не учитывает joinedAt (мы в редакторе курса, всех учеников).
function getActivityScheduledDays(activity, maxDay) {
  const days = [];
  for (let d = 1; d <= maxDay; d++) {
    if (isActivityScheduled(activity, d)) days.push(d);
  }
  return days;
}

function CallSchedule({ activity, maxDay, calls, courseId, tzMin, trainerTzLabel,
                        boundToCalendar, courseStartDate,
                        onCreateCall, onDeleteCall, onPatchCall }) {
  const actId = activity.activityId || activity.dbId;
  const actCalls = (calls || []).filter(c => c.activity_id === actId);
  const scheduledDays = getActivityScheduledDays(activity, maxDay);

  // Sync БД с расписанием активности: для каждого scheduled-дня без звонка
  // создать звонок (10:00 default), для каждого звонка с днём вне расписания —
  // удалить. Запускается на изменения scheduledDays и при каждом монтировании.
  // Защита от race: используем ref-флаг чтобы не дёргать API параллельно.
  const syncingRef = useRef(false);
  useEffect(() => {
    if (!boundToCalendar || !courseStartDate || !courseId) return;
    if (syncingRef.current) return;
    const dayToCall = new Map(actCalls.map(c => [c.day, c]));
    const toCreate = scheduledDays.filter(d => !dayToCall.has(d));
    const toDelete = actCalls.filter(c => !scheduledDays.includes(c.day));
    if (!toCreate.length && !toDelete.length) return;
    syncingRef.current = true;
    (async () => {
      try {
        for (const d of toCreate) {
          const scheduledAt = combineDateTimeInTz(dayToISODate(courseStartDate, d), '10:00', tzMin);
          await onCreateCall(actId, d, scheduledAt, null);
        }
        for (const c of toDelete) {
          await onDeleteCall(c.id);
        }
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [boundToCalendar, courseStartDate, JSON.stringify(scheduledDays), actCalls.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Без bound_to_calendar: списка нет, показываем подсказку.
  if (!boundToCalendar || !courseStartDate) {
    return (
      <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
          Расписание звонков
        </div>
        <div style={{ fontSize: 11, color: '#999', padding: '8px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', lineHeight: 1.5 }}>
          Чтобы запланировать звонки, отметьте курс как привязанный к календарю и укажите дату начала — звонки появятся автоматически на отмеченные дни активности.
        </div>
      </div>
    );
  }

  const sortedCalls = [...actCalls].sort((a, b) => a.day - b.day);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
        Расписание звонков
      </div>
      {sortedCalls.length === 0 ? (
        <div style={{ fontSize: 11, color: '#aaa', padding: '6px 8px' }}>
          Отметьте дни активности выше — для каждого появится звонок.
        </div>
      ) : sortedCalls.map(c => (
        <CallRow key={c.id} call={c} courseStartDate={courseStartDate} tzMin={tzMin}
                 onPatch={(scheduledAt) => onPatchCall(c.id, { scheduledAt })} />
      ))}
      <div style={{ fontSize: 10, color: '#aaa', marginTop: 6 }}>
        Время указывается в вашем часовом поясе из Профиля ({trainerTzLabel}). У учеников отобразится в их собственном. Длительность учитывается по факту окончания.
      </div>
    </div>
  );
}

function CallRow({ call, courseStartDate, tzMin, onPatch }) {
  const isoDate = dayToISODate(courseStartDate, call.day);
  const initialTime = call.scheduled_at ? isoToHHMM(call.scheduled_at, tzMin) : '10:00';
  const [time, setTime] = useState(initialTime);
  const savedRef = useRef(initialTime);

  // Если бэкенд вернул обновлённое значение — обновим локально.
  useEffect(() => {
    if (call.scheduled_at) {
      const t = isoToHHMM(call.scheduled_at, tzMin);
      if (t !== savedRef.current) { setTime(t); savedRef.current = t; }
    }
  }, [call.scheduled_at, tzMin]);

  // Debounced patch на изменение времени.
  useEffect(() => {
    if (time === savedRef.current) return;
    const t = setTimeout(() => {
      const scheduledAt = combineDateTimeInTz(isoDate, time, tzMin);
      savedRef.current = time;
      onPatch(scheduledAt);
    }, 500);
    return () => clearTimeout(t);
  }, [time]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      marginBottom: 4, borderRadius: 8, background: 'rgba(155,89,182,0.06)', fontSize: 12,
    }}>
      <span style={{ fontSize: 14 }}>📞</span>
      <span style={{ flex: 1, color: '#555' }}>
        День {call.day} — {formatDayDateLong(isoDate)}
      </span>
      <input type="time" value={time} onChange={e => setTime(e.target.value)}
        style={{ width: 84, padding: '3px 6px', fontSize: 11, borderRadius: 6,
                 border: '1px solid rgba(0,0,0,0.08)', background: '#fff' }} />
    </div>
  );
}

function ActivityCard({ activity, index, maxDay, onUpdate, onToggleDay, onRemove, onPickIcon, videos, courseId, videoUploadingId, uploadProgress, uploadPhase, activityId: propActivityId, onVideoUpload, onAddLink, onAddEmpty, onDeleteVideo, onPatchVideo, calls, onCreateCall, onDeleteCall, onPatchCall, tzOffsetMin, boundToCalendar, courseStartDate, collapsed = false, onToggleCollapsed, isDragging = false, isDragOver = false, onDragBegin, onDragOverKey, onDragEnd, onDropOn }) {
  // Trainer's timezone comes from THEIR profile (user_settings.tz_offset_min),
  // NOT from the browser — VPNs make browser tz unreliable; profile is the
  // single source of truth. Default fallback: Moscow (UTC+3, offset=180).
  const tzMin = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 180;
  const trainerTzLabel = (() => {
    const sign = tzMin >= 0 ? '+' : '-';
    const abs = Math.abs(tzMin);
    const hh = Math.floor(abs / 60);
    const mm = abs % 60;
    return `GMT${sign}${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}`;
  })();

  const numChange = (field) => (e) => {
    const raw = e.target.value;
    if (raw === '') { onUpdate(field, ''); return; }
    const n = parseInt(raw);
    if (!isNaN(n) && n >= 0) onUpdate(field, n);
  };

  const clamp = (field, min, max) => () => {
    const v = parseInt(activity[field]);
    onUpdate(field, isNaN(v) || v < min ? min : Math.min(v, max));
  };

  const activityId = activity.dbId || activity._key;

  // Check if any video has duration_sec — if so, duration is set by video
  const actVideos = videos.filter(v => v.activity_id === activityId);
  const videoDuration = actVideos.find(v => v.duration_sec)?.duration_sec;
  const hasDurationFromVideo = !!videoDuration;

  // «MM:SS» ввод длительности для media без видео. Держим сырой текст
  // в локальном state пока пользователь печатает; на blur парсим
  // «M[:SS]», клампим, ceil в durationMin для БД (integer minutes).
  const formatMMSS = (min) => {
    const total = (min || 0) * 60;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const [durationRaw, setDurationRaw] = useState(() => formatMMSS(activity.durationMin));
  useEffect(() => { setDurationRaw(formatMMSS(activity.durationMin)); }, [activity.durationMin]);

  // Chevron shape: pointing DOWN when expanded (M6 9L12 15L18 9),
  // pointing RIGHT when collapsed (M9 6L15 12L9 18). Same visual language
  // as the TopBar back arrow.
  const chevronPath = collapsed ? 'M9 6L15 12L9 18' : 'M6 9L12 15L18 9';

  // Touch-совместимый drag через pointer events + long-press guard.
  // Раньше drag стартовал сразу — обычный скролл по свёрнутой карточке
  // случайно перетаскивал её. Теперь: pointerdown запускает 400ms
  // таймер. Если за это время юзер уводит палец >8px — таймер отменяется
  // (юзер хотел скроллить, не тянуть). Только после «арма» появляется
  // визуальный feedback (лёгкое увеличение + тень) и любое движение
  // считается drag. Работает и на мыши, и на тач.
  const dragActiveRef = useRef(false);
  const startPtRef = useRef(null);
  const armTimerRef = useRef(null);
  const armedRef = useRef(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!collapsed) return undefined;
    const cancelAll = () => {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
      armedRef.current = false;
      setArmed(false);
      dragActiveRef.current = false;
      startPtRef.current = null;
    };
    const move = (e) => {
      const start = startPtRef.current;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.hypot(dx, dy);
      if (!armedRef.current) {
        // Ещё не armed — если сильное движение, значит юзер скроллит,
        // отменяем long-press таймер, отпускаем скролл.
        if (dist > 8) cancelAll();
        return;
      }
      // Armed — обычная drag-логика
      if (!dragActiveRef.current) {
        if (dist < 4) return;
        dragActiveRef.current = true;
        onDragBegin?.();
      }
      if (e.cancelable) e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest('[data-activity-key]');
      const key = card?.getAttribute('data-activity-key');
      if (key && key !== activity._key) onDragOverKey?.(key);
    };
    const up = (e) => {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
      const wasDrag = dragActiveRef.current;
      const wasArmed = armedRef.current;
      dragActiveRef.current = false;
      armedRef.current = false;
      setArmed(false);
      startPtRef.current = null;
      if (wasDrag) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest('[data-activity-key]');
        const key = card?.getAttribute('data-activity-key');
        if (key && key !== activity._key) onDropOn?.(key);
        else onDragEnd?.();
      } else if (wasArmed) {
        onDragEnd?.();
      }
    };
    document.addEventListener('pointermove', move, { passive: false });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      cancelAll();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, [collapsed, activity._key, onDragBegin, onDragOverKey, onDragEnd, onDropOn]);

  const onPointerDown = (e) => {
    if (!collapsed) return;
    if (e.target.closest && e.target.closest('button, input, a, textarea')) return;
    startPtRef.current = { x: e.clientX, y: e.clientY };
    // Долгое удержание 400ms — включаем drag mode
    clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => {
      armedRef.current = true;
      setArmed(true);
      // Тактильный отклик — если браузер поддерживает
      if (navigator.vibrate) navigator.vibrate(20);
    }, 400);
  };

  return (
    <div
      data-activity-key={activity._key}
      onPointerDown={collapsed ? onPointerDown : undefined}
      style={{
        ...glass, borderRadius: 16, padding: '14px 14px', marginBottom: 10,
        opacity: isDragging ? 0.4 : 1,
        outline: isDragOver ? '2px solid rgba(39,174,96,0.6)' : 'none',
        outlineOffset: isDragOver ? -2 : 0,
        cursor: collapsed ? (armed ? 'grabbing' : 'grab') : 'default',
        // pan-y пока не armed — юзер может свободно скроллить.
        // После арма — none, чтобы preventDefault на move работал.
        touchAction: collapsed ? (armed ? 'none' : 'pan-y') : 'auto',
        userSelect: collapsed ? 'none' : 'auto',
        // Приподнимаем + тень когда armed, чтобы юзер понимал что можно тянуть
        transform: armed && !isDragging ? 'scale(1.02)' : 'none',
        boxShadow: armed && !isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
        transition: 'outline 0.15s, opacity 0.15s, transform 0.15s, box-shadow 0.15s',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
            style={{
              width: 26, height: 26, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer', color: '#888',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <path d={chevronPath} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>Активность {index + 1}</span>
        </div>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', fontSize: 18, color: '#ccc', cursor: 'pointer', padding: 2 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: collapsed ? 0 : 10 }}>
        {collapsed ? (
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: '#fafafa', border: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4,
          }}>
            <img src={getIconPath(activity.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <button onClick={onPickIcon} style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            border: '2px solid rgba(0,0,0,0.08)', background: '#fafafa',
            cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={getIconPath(activity.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </button>
        )}
        {collapsed ? (
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activity.label || <span style={{ color: '#ccc', fontWeight: 400 }}>Без названия</span>}
          </div>
        ) : (
          <input value={activity.label} onChange={e => onUpdate('label', e.target.value)}
            placeholder="Название активности" style={{ ...inputStyle, flex: 1 }} />
        )}
      </div>

      {!collapsed && (<>
      {/* Practice type selector */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ ...labelStyle, fontSize: 11 }}>Тип практики</label>
        <Dropdown
          value={activity.practiceType || 'media'}
          onChange={(v) => onUpdate('practiceType', v)}
          options={PRACTICE_TYPE_OPTIONS}
          fullWidth
        />
      </div>

      {/* Description — теперь только для call (для media описание живёт
          per-media в activity_media.description_html и рисуется в MediaSection). */}
      {activity.practiceType === 'call' && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>Описание</label>
          <RichTextEditor
            content={activity.descriptionHtml || ''}
            onChange={val => onUpdate('descriptionHtml', val)}
            placeholder="Описание онлайн-практики..." />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>С дня</label>
          <input type="number" value={activity.firstDay}
            onChange={numChange('firstDay')}
            onBlur={clamp('firstDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>По день</label>
          <input type="number" value={activity.lastDay}
            onChange={numChange('lastDay')}
            onBlur={clamp('lastDay', 1, maxDay)}
            style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>Интервал</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" value={activity.intervalDays ?? 1}
              onChange={numChange('intervalDays')}
              onBlur={clamp('intervalDays', 1, maxDay)}
              style={{ ...inputStyle, padding: '8px 10px', fontSize: 14 }} />
            <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>дней</span>
          </div>
        </div>
      </div>

      {/* Visual day calendar — same look as in TrainerCabinet. Reflects the
          combined interval + extra/excluded state above, and clicks here
          edit the extras/excludes layer atomically. */}
      <ScheduleCalendar
        daysCount={maxDay}
        firstDay={activity.firstDay}
        lastDay={activity.lastDay}
        intervalDays={activity.intervalDays}
        excludedDays={activity.excludedDays || []}
        extraDays={activity.extraDays || []}
        onToggle={(day) => onToggleDay?.(day)}
      />

      {/* Media section — universal for media practice: video/audio/image/text/none.
          Активность автоматически создаётся в БД на add — dbId всегда доступен. */}
      {activity.practiceType === 'media' && courseId && activity.dbId && (() => {
        // Pre-compute the set of days where the practice itself is active —
        // VideoSection uses it to render "pale" cells for off-practice days.
        const activeDays = new Set();
        for (let d = 1; d <= maxDay; d++) {
          if (isActivityScheduled(activity, d)) activeDays.add(d);
        }
        return (
          <MediaSection
            media={videos}
            courseId={courseId}
            activityId={activity.dbId}
            maxDay={maxDay}
            defaultFirstDay={activity.firstDay || 1}
            defaultLastDay={activity.lastDay || maxDay}
            defaultIntervalDays={activity.intervalDays || 1}
            activityScheduledDays={activeDays}
            onUpload={onVideoUpload}
            onAddLink={onAddLink}
            onAddEmpty={onAddEmpty}
            onDelete={onDeleteVideo}
            onPatchMedia={onPatchVideo}
            uploading={videoUploadingId === activity.dbId}
            uploadProgress={videoUploadingId === activity.dbId ? uploadProgress : 0}
            uploadPhase={videoUploadingId === activity.dbId ? uploadPhase : 'downloading'}
            globalUploading={!!videoUploadingId}
          />
        );
      })()}

      {/* Call scheduling — auto-synced со списком дней активности.
          Звонки создаются автоматически для каждого scheduled дня курса
          (только если курс bound_to_calendar + есть start_date). Тренер
          меняет только время; день убран из расписания → звонок удаляется. */}
      {activity.practiceType === 'call' && courseId && activity.dbId && (
        <CallSchedule
          activity={activity}
          maxDay={maxDay}
          calls={calls}
          courseId={courseId}
          tzMin={tzMin}
          trainerTzLabel={trainerTzLabel}
          boundToCalendar={boundToCalendar}
          courseStartDate={courseStartDate}
          onCreateCall={onCreateCall}
          onDeleteCall={onDeleteCall}
          onPatchCall={onPatchCall}
        />
      )}
      </>)}
    </div>
  );
}
