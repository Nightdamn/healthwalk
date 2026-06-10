import React, { useState, useRef, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import AvatarPicker, { processAvatarFile } from '../components/AvatarPicker';
import ScheduleCalendar, { toggleDayInActivity } from '../components/ScheduleCalendar';
import { getIconPath } from '../data/iconCatalog';
import { formatInTz } from '../data/constants';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import {
  loadCourseForEdit, canDeleteCourse, deleteCourse,
  getActivityVideos, uploadActivityVideo, addVideoLink, importDriveVideo, deleteActivityVideo,
  getActivityCalls, createActivityCall, deleteActivityCall,
  updateActivityDuration, updateVideoDuration,
  patchCourseMeta, createActivity, patchActivity, deleteActivity,
} from '../lib/db';
import { createAutoSaver } from '../lib/autoSave';
import VideoSection, { extractYoutubeId } from '../components/VideoSection';
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
  { value: 'media', label: 'Практика с медиа' },
  { value: 'theory', label: 'Текстовая теория' },
  { value: 'call', label: 'Онлайн с мастером' },
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
        fontSize: 11, color: '#888', whiteSpace: 'nowrap',
      }}>•••</span>
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
      getActivityVideos(courseId),
      getActivityCalls(courseId),
    ]);
    if (!course) { setError('Не удалось загрузить курс'); setLoading(false); return; }

    setTitle(course.title || '');
    setDescription(course.description || '');
    setDaysCount(course.days_count || 30);
    setAvatarIcon(course.avatar_icon || 'health/1');
    setAvatarCustom(course.avatar_custom || null);
    setVideos(vids);
    setCalls(callsData || []);

    const acts = (course.course_activities || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(a => ({
        dbId: a.id,
        activityId: a.activity_id,
        label: a.label,
        iconNum: a.icon_num || 'health/1',
        practiceType: a.practice_type || 'media',
        descriptionHtml: a.description_html || '',
        firstDay: a.first_day || 1,
        lastDay: a.last_day || course.days_count,
        durationMin: a.duration_min || 10,
        intervalDays: a.interval_days || 1,
        excludedDays: Array.isArray(a.excluded_days) ? a.excluded_days : [],
        extraDays: Array.isArray(a.extra_days) ? a.extra_days : [],
        _key: a.id,
      }));
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

  const handleVideoUpload = async (activityId, file, firstDay, lastDay, intervalDays) => {
    setVideoUploadingId(activityId);
    setUploadProgress(0);
    const result = await uploadActivityVideo(courseId, activityId, file, firstDay, lastDay, intervalDays, (pct) => {
      setUploadProgress(pct);
    });
    setVideoUploadingId(null);
    setUploadProgress(0);
    if (result.error) { setError(`Ошибка загрузки видео: ${result.error}`); return; }
    setVideos(prev => [...prev, result.data]);
    // Server already extracts duration_sec from upload metadata when client sent it.
    if (result.data?.duration_sec) {
      await syncActivityDuration(activityId, result.data.duration_sec);
    }
  };

  const handleAddLink = async (activityId, url, videoType, firstDay, lastDay, intervalDays) => {
    // Drive URLs route through import-drive: backend pulls the file to our
    // storage, frontend shows a progress bar like a normal upload, and the
    // result becomes a regular type='file' video (timer fully syncs).
    if (videoType === 'drive') {
      setVideoUploadingId(activityId);
      setUploadProgress(0);
      setUploadPhase('downloading');
      const result = await importDriveVideo(
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

    const result = await addVideoLink(courseId, activityId, url, videoType, firstDay, lastDay, intervalDays);
    if (result.error) { setError(`Ошибка добавления ссылки: ${result.error}`); return; }
    const created = result.data;
    setVideos(prev => [...prev, created]);
    // Background duration detection — YouTube + direct mp4/webm.
    let detected = null;
    try {
      if (videoType === 'youtube') {
        const ytId = extractYoutubeId(url);
        if (ytId) detected = await detectYoutubeDuration(ytId);
      } else if (videoType === 'link') {
        detected = await detectDirectDuration(url);
      }
    } catch {}
    if (detected && created?.id) {
      try { await updateVideoDuration(created.id, detected); } catch {}
      setVideos(prev => prev.map(v => (v.id === created.id ? { ...v, duration_sec: detected } : v)));
      await syncActivityDuration(activityId, detected);
    }
  };

  const handleDeleteVideo = async (videoId, videoUrl, videoType) => {
    const result = await deleteActivityVideo(videoId, videoUrl, videoType);
    if (result.error) { setError(`Ошибка удаления видео: ${result.error}`); return; }
    setVideos(prev => prev.filter(v => v.id !== videoId));
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

  // Calendar tap: compute new excluded/extra arrays atomically and PATCH both.
  const toggleActivityDay = (idx, day) => {
    const act = activities[idx];
    if (!act) return;
    const next = toggleDayInActivity(act, day);
    setActivities(prev => prev.map((a, i) => (i === idx ? { ...a, ...next } : a)));
    if (act.dbId) scheduleActivityPatch(act.dbId, next);
  };

  const removeActivity = async (idx) => {
    const act = activities[idx];
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
  const onDaysCountChange = (v) => {
    setDaysCount(v);
    const n = parseInt(v);
    if (!isNaN(n) && n >= 1) scheduleMetaSave({ daysCount: Math.min(n, 365) });
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
        <div style={topBar}>
          <button onClick={onBack} style={btnBack}>←</button>
          <h2 style={topBarTitle}>Редактировать курс</h2>
          <div style={{ width: 42, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <SaveStatusBadge status={saveStatus} />
          </div>
        </div>

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
            }}
            style={{ ...inputStyle, width: 100 }} />
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
            onVideoUpload={(file, fd, ld, iv) => handleVideoUpload(a.dbId || a._key, file, fd, ld, iv)}
            onAddLink={(url, type, fd, ld, iv) => handleAddLink(a.dbId || a._key, url, type, fd, ld, iv)}
            onDeleteVideo={handleDeleteVideo}
            calls={calls}
            onCreateCall={handleCreateCall}
            onDeleteCall={handleDeleteCall}
            tzOffsetMin={tzOffsetMin} />
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

function ActivityCard({ activity, index, maxDay, onUpdate, onToggleDay, onRemove, onPickIcon, videos, courseId, videoUploadingId, uploadProgress, uploadPhase, activityId: propActivityId, onVideoUpload, onAddLink, onDeleteVideo, calls, onCreateCall, onDeleteCall, tzOffsetMin }) {
  // Draft call. As soon as date + time + duration are all valid the row is
  // auto-saved (debounced ~700ms) and the form resets — no Save button.
  const [showCallForm, setShowCallForm] = useState(false);
  const [callDay, setCallDay] = useState(1);
  const [callDate, setCallDate] = useState('');
  const [callTime, setCallTime] = useState('10:00');
  const [callDuration, setCallDuration] = useState(30);
  const [callSaving, setCallSaving] = useState(false);
  const savedDraftRef = useRef('');
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

  // Auto-save call draft when all fields valid (debounced)
  useEffect(() => {
    if (!showCallForm) return;
    if (!callDate || !callTime || !callDay || !callDuration) return;
    const key = `${callDay}|${callDate}|${callTime}|${callDuration}`;
    if (savedDraftRef.current === key || callSaving) return;
    const t = setTimeout(async () => {
      // Interpret trainer's input as wall-clock time in HER profile tz, not
      // in browser tz. naive_utc = same digits parsed as UTC; subtract the
      // profile offset → real UTC moment.
      const [y, mo, d] = callDate.split('-').map(Number);
      const [h, mi] = callTime.split(':').map(Number);
      const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
      if (!isFinite(naiveUtcMs)) return;
      const scheduledAt = new Date(naiveUtcMs - tzMin * 60000).toISOString();
      setCallSaving(true);
      savedDraftRef.current = key;
      try {
        await onCreateCall(activity.activityId || propActivityId, callDay, scheduledAt, callDuration);
        // Reset draft so a new entry can be added without re-opening the form
        setCallDate('');
        setCallTime('10:00');
      } catch {}
      setCallSaving(false);
    }, 700);
    return () => clearTimeout(t);
  }, [showCallForm, callDay, callDate, callTime, callDuration, callSaving, activity.activityId, propActivityId, onCreateCall]);

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

  return (
    <div style={{ ...glass, borderRadius: 16, padding: '14px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>Активность {index + 1}</span>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', fontSize: 18, color: '#ccc', cursor: 'pointer', padding: 2 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <button onClick={onPickIcon} style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          border: '2px solid rgba(0,0,0,0.08)', background: '#fafafa',
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={getIconPath(activity.iconNum)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </button>
        <input value={activity.label} onChange={e => onUpdate('label', e.target.value)}
          placeholder="Название активности" style={{ ...inputStyle, flex: 1 }} />
      </div>

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

      {/* Description / theory text */}
      {(activity.practiceType === 'theory' || activity.practiceType === 'call' || activity.practiceType === 'media') && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>{
            activity.practiceType === 'theory' ? 'Текст теории'
            : activity.practiceType === 'call' ? 'Описание'
            : 'Введение к уроку (необязательно)'
          }</label>
          <RichTextEditor
            content={activity.descriptionHtml || ''}
            onChange={val => onUpdate('descriptionHtml', val)}
            placeholder={
              activity.practiceType === 'theory' ? 'Содержание теоретического материала...'
              : activity.practiceType === 'call' ? 'Описание онлайн-практики...'
              : 'Краткое введение, инструкция, контекст для практики...'
            } />
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

      {/* Duration (hidden for theory and call — call duration is set per scheduled session) */}
      {activity.practiceType !== 'theory' && activity.practiceType !== 'call' && (
      <div>
        <label style={{ ...labelStyle, fontSize: 11 }}>Длительность</label>
        {hasDurationFromVideo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              ...inputStyle, padding: '8px 10px', fontSize: 14, width: 80,
              background: 'rgba(39,174,96,0.06)', color: '#27ae60', fontWeight: 600,
            }}>
              {Math.ceil(videoDuration / 60)}
            </div>
            <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>мин (из видео)</span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" value={activity.durationMin}
              onChange={numChange('durationMin')}
              onBlur={clamp('durationMin', 1, 1200)}
              style={{ ...inputStyle, padding: '8px 10px', fontSize: 14, width: 80 }} />
            <span style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap' }}>минут</span>
          </div>
        )}
      </div>
      )}

      {/* Video section — for media practice. Activities are auto-created in DB
          on add so dbId is always available; no more "save first" wall. */}
      {activity.practiceType === 'media' && courseId && activity.dbId && (
        <VideoSection
          videos={videos}
          courseId={courseId}
          activityId={activity.dbId}
          maxDay={maxDay}
          defaultFirstDay={activity.firstDay || 1}
          defaultLastDay={activity.lastDay || maxDay}
          defaultIntervalDays={activity.intervalDays || 1}
          onUpload={onVideoUpload}
          onAddLink={onAddLink}
          onDelete={onDeleteVideo}
          uploading={videoUploadingId === activity.dbId}
          uploadProgress={videoUploadingId === activity.dbId ? uploadProgress : 0}
          uploadPhase={videoUploadingId === activity.dbId ? uploadPhase : 'downloading'}
          globalUploading={!!videoUploadingId}
        />
      )}

      {/* Call scheduling */}
      {activity.practiceType === 'call' && courseId && activity.dbId && (() => {
        const actId = activity.activityId || activity.dbId;
        const actCalls = (calls || []).filter(c => c.activity_id === actId);
        return (
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', marginBottom: 6, textTransform: 'uppercase' }}>
              Расписание звонков
            </div>

            {actCalls.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                marginBottom: 3, borderRadius: 8, background: 'rgba(155,89,182,0.06)', fontSize: 12,
              }}>
                <span style={{ fontSize: 14 }}>📞</span>
                <span style={{ flex: 1, color: '#555' }}>
                  День {c.day} — {formatInTz(c.scheduled_at, tzMin)}
                  {' '}({c.duration_min} мин)
                </span>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: c.status === 'scheduled' ? 'rgba(39,174,96,0.1)' : 'rgba(0,0,0,0.05)',
                  color: c.status === 'scheduled' ? '#27ae60' : '#999',
                }}>{c.status === 'scheduled' ? 'Запланирован' : c.status}</span>
                <button onClick={() => onDeleteCall(c.id)} style={{
                  background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 11, padding: '0 4px',
                }}>✕</button>
              </div>
            ))}

            {showCallForm ? (
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: 10, color: '#999' }}>День:</span>
                    <input type="number" value={callDay === '' ? '' : callDay} min={1} max={maxDay}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '') { setCallDay(''); return; }
                        const n = parseInt(v);
                        if (!isNaN(n)) setCallDay(n);
                      }}
                      onBlur={() => {
                        const n = parseInt(callDay);
                        setCallDay(isNaN(n) || n < 1 ? 1 : Math.min(n, maxDay));
                      }}
                      style={{ ...inputStyle, width: 50, padding: '4px 6px', fontSize: 11 }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: '#999' }}>Дата:</span>
                    <input type="date" value={callDate}
                      onChange={e => setCallDate(e.target.value)}
                      style={{ ...inputStyle, width: 130, padding: '4px 6px', fontSize: 11 }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: '#999' }}>Время:</span>
                    <input type="time" value={callTime}
                      onChange={e => setCallTime(e.target.value)}
                      style={{ ...inputStyle, width: 80, padding: '4px 6px', fontSize: 11 }} />
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: '#999' }}>Мин:</span>
                    <input type="number" value={callDuration === '' ? '' : callDuration} min={5} max={180}
                      onChange={e => {
                        const v = e.target.value;
                        if (v === '') { setCallDuration(''); return; }
                        const n = parseInt(v);
                        if (!isNaN(n)) setCallDuration(n);
                      }}
                      onBlur={() => {
                        const n = parseInt(callDuration);
                        setCallDuration(isNaN(n) || n < 5 ? 30 : Math.min(n, 180));
                      }}
                      style={{ ...inputStyle, width: 50, padding: '4px 6px', fontSize: 11 }} />
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                  Время указывается в вашем часовом поясе из Профиля ({trainerTzLabel}).
                  У учеников отобразится в их собственном.
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: callSaving ? '#9b59b6' : '#aaa' }}>
                    {callSaving
                      ? 'Сохранение...'
                      : (callDate ? '✓ Сохранится автоматически' : 'Заполните дату — звонок сохранится автоматически')}
                  </span>
                  <button onClick={() => setShowCallForm(false)} style={{
                    marginLeft: 'auto', padding: '4px 8px', borderRadius: 6, border: 'none',
                    background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 11, cursor: 'pointer',
                  }}>Закрыть</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCallForm(true)} style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                border: '1px dashed rgba(155,89,182,0.3)', background: 'rgba(155,89,182,0.04)',
                color: '#9b59b6', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>+ Запланировать звонок</button>
            )}

          </div>
        );
      })()}
    </div>
  );
}
