import React, { useState, useRef, useEffect } from 'react';
import Layout from '../components/Layout';
import IconPicker from '../components/IconPicker';
import { getIconPath } from '../data/iconCatalog';
import { btnBack, glass, pageWrapper, topBar, topBarTitle } from '../styles/shared';
import { loadCourseForEdit, updateCourseWithActivities, canDeleteCourse, deleteCourse, getActivityVideos, uploadActivityVideo, addVideoLink, deleteActivityVideo, getActivityCalls, createActivityCall, deleteActivityCall } from '../lib/db';
import VideoSection from '../components/VideoSection';
import RichTextEditor from '../components/RichTextEditor';

const GREEN = '#27ae60';

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 12,
  border: '1.5px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.7)',
  fontSize: 15, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const labelStyle = { fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 6, display: 'block' };

function emptyActivity(daysCount) {
  return { dbId: null, label: '', iconNum: 'health/1', practiceType: 'media', descriptionHtml: '', firstDay: 1, lastDay: daysCount, durationMin: 10, intervalDays: 1, _key: Date.now() + Math.random() };
}

export default function EditCoursePage({ courseId, onBack, onSaved, onDeleted }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [daysCount, setDaysCount] = useState(30);
  const [avatarIcon, setAvatarIcon] = useState('health/1');
  const [avatarCustom, setAvatarCustom] = useState(null);
  const [activities, setActivities] = useState([]);
  const [deletedIds, setDeletedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [pickerTarget, setPickerTarget] = useState(null);
  const [videos, setVideos] = useState([]);
  const [calls, setCalls] = useState([]);
  const [videoUploadingId, setVideoUploadingId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef();

  // Load course data
  useEffect(() => {
    if (!courseId) return;
    (async () => {
      setLoading(true);
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
          _key: a.id,
        }));
      setActivities(acts.length > 0 ? acts : [emptyActivity(course.days_count)]);
      setLoading(false);
    })();
  }, [courseId]);

  const handleVideoUpload = async (activityId, file, firstDay, lastDay) => {
    setVideoUploadingId(activityId);
    setUploadProgress(0);
    const result = await uploadActivityVideo(courseId, activityId, file, firstDay, lastDay, (pct) => {
      setUploadProgress(pct);
    });
    setVideoUploadingId(null);
    setUploadProgress(0);
    if (result.error) { setError(`Ошибка загрузки видео: ${result.error}`); return; }
    setVideos(prev => [...prev, result.data]);
  };

  const handleAddLink = async (activityId, url, videoType, firstDay, lastDay) => {
    const result = await addVideoLink(courseId, activityId, url, videoType, firstDay, lastDay);
    if (result.error) { setError(`Ошибка добавления ссылки: ${result.error}`); return; }
    setVideos(prev => [...prev, result.data]);
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

  const updateActivity = (idx, field, val) => {
    setActivities(prev => prev.map((a, i) => i === idx ? { ...a, [field]: val } : a));
  };

  const removeActivity = (idx) => {
    const act = activities[idx];
    if (act.dbId) setDeletedIds(prev => [...prev, act.dbId]);
    setActivities(prev => prev.filter((_, i) => i !== idx));
  };

  const addActivity = () => setActivities(prev => [...prev, emptyActivity(daysCount)]);

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg')) { setError('Поддерживается только SVG'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setAvatarCustom(ev.target.result); setAvatarIcon(null); };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Введите название курса'); return; }
    const days = parseInt(daysCount) || 30;
    const valid = activities.filter(a => a.label.trim());
    if (valid.length === 0) { setError('Добавьте хотя бы одну активность'); return; }

    for (const a of valid) {
      const fd = parseInt(a.firstDay) || 1;
      const ld = Math.min(parseInt(a.lastDay) || days, days);
      if (fd < 1 || ld > days || fd > ld) {
        setError(`Активность "${a.label}": проверьте диапазон дней (1–${days})`);
        return;
      }
    }

    setSaving(true); setError('');
    const result = await updateCourseWithActivities(courseId, {
      title: title.trim(),
      description: description.trim(),
      avatarIcon: avatarCustom ? null : avatarIcon,
      avatarCustom,
      daysCount: days,
      deletedActivityIds: deletedIds,
      activities: valid.map(a => ({
        dbId: a.dbId,
        label: a.label.trim(),
        iconNum: a.iconNum,
        practiceType: a.practiceType || 'media',
        descriptionHtml: a.descriptionHtml || null,
        firstDay: parseInt(a.firstDay) || 1,
        lastDay: Math.min(parseInt(a.lastDay) || days, days),
        durationMin: a.practiceType === 'theory' ? 1 : Math.min(parseInt(a.durationMin) || 10, 1200),
        intervalDays: Math.max(parseInt(a.intervalDays) || 1, 1),
      })),
    });
    setSaving(false);

    if (result?.error) setError(result.error);
    else if (result?.id) onSaved();
    else setError('Не удалось сохранить курс');
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
          <div style={{ width: 42 }} />
        </div>

        {/* Avatar + Title + Description */}
        <div style={{ ...glass, borderRadius: 18, padding: '20px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setPickerTarget('avatar')} style={{
                width: 64, height: 64, borderRadius: 16, border: `2px solid ${GREEN}`,
                background: '#fafafa', cursor: 'pointer', padding: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: 28 }}>📚</span>}
              </button>
              <button onClick={() => fileRef.current?.click()} style={{
                position: 'absolute', bottom: -4, right: -4, width: 24, height: 24,
                borderRadius: 12, background: GREEN, color: '#fff', border: 'none',
                fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>↑</button>
              <input ref={fileRef} type="file" accept=".svg" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Название курса</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Мой курс" style={inputStyle} />
            </div>
          </div>

          <label style={labelStyle}>Описание</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Краткое описание курса..." rows={2}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} />

          <label style={labelStyle}>Длительность (дней)</label>
          <input type="number" value={daysCount} min={1} max={365}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') { setDaysCount(''); return; }
              const n = parseInt(raw);
              if (!isNaN(n) && n >= 0) setDaysCount(n);
            }}
            onBlur={() => {
              const v = parseInt(daysCount);
              setDaysCount(isNaN(v) || v < 1 ? 1 : Math.min(v, 365));
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
            onRemove={() => removeActivity(idx)}
            onPickIcon={() => setPickerTarget(idx)}
            videos={videos} courseId={courseId}
            videoUploadingId={videoUploadingId}
            uploadProgress={uploadProgress}
            activityId={a.dbId || a._key}
            onVideoUpload={(file, fd, ld) => handleVideoUpload(a.dbId || a._key, file, fd, ld)}
            onAddLink={(url, type, fd, ld) => handleAddLink(a.dbId || a._key, url, type, fd, ld)}
            onDeleteVideo={handleDeleteVideo}
            calls={calls}
            onCreateCall={handleCreateCall}
            onDeleteCall={handleDeleteCall} />
        ))}

        <button onClick={addActivity} style={{
          width: '100%', padding: 14, borderRadius: 14,
          border: '2px dashed rgba(39,174,96,0.3)', background: 'rgba(39,174,96,0.04)',
          color: GREEN, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 20,
        }}>+ Добавить активность</button>

        <button onClick={handleSave} disabled={saving || deleting} style={{
          width: '100%', padding: 16, background: '#1a1a2e', color: '#fff',
          border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600,
          cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
        }}>{saving ? 'Сохранение...' : 'Сохранить изменения'}</button>

        {/* Delete course */}
        {onDeleted && (
          <div style={{
            marginTop: 24, padding: '16px', borderRadius: 14,
            border: '1.5px solid rgba(231,76,60,0.2)', background: 'rgba(231,76,60,0.03)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e74c3c', marginBottom: 8 }}>
              Опасная зона
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              Курс можно удалить только если в нём нет учеников (кроме создателя).
            </div>
            <button onClick={handleDelete} disabled={deleting || saving} style={{
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
            if (pickerTarget === 'avatar') { setAvatarIcon(num); setAvatarCustom(null); }
            else updateActivity(pickerTarget, 'iconNum', num);
          }}
          onClose={() => setPickerTarget(null)} />
      )}
    </Layout>
  );
}

function ActivityCard({ activity, index, maxDay, onUpdate, onRemove, onPickIcon, videos, courseId, videoUploadingId, uploadProgress, activityId: propActivityId, onVideoUpload, onAddLink, onDeleteVideo, calls, onCreateCall, onDeleteCall }) {
  const [showCallForm, setShowCallForm] = useState(false);
  const [callDay, setCallDay] = useState(1);
  const [callDate, setCallDate] = useState('');
  const [callTime, setCallTime] = useState('10:00');
  const [callDuration, setCallDuration] = useState(30);
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
        <select value={activity.practiceType || 'media'} onChange={e => onUpdate('practiceType', e.target.value)}
          style={{
            ...inputStyle, padding: '8px 32px 8px 12px', fontSize: 13,
            background: "rgba(255,255,255,0.85) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' width='12' height='8'><path d='M1 1l5 5 5-5' stroke='%231a1a2e' stroke-width='1.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>\") no-repeat right 12px center",
            appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
            cursor: 'pointer', fontWeight: 500,
          }}>
          <option value="media">Практика с медиа</option>
          <option value="theory">Текстовая теория</option>
          <option value="call">Онлайн с мастером</option>
        </select>
      </div>

      {/* Description / theory text */}
      {(activity.practiceType === 'theory' || activity.practiceType === 'call') && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ ...labelStyle, fontSize: 11 }}>{activity.practiceType === 'theory' ? 'Текст теории' : 'Описание'}</label>
          <RichTextEditor
            content={activity.descriptionHtml || ''}
            onChange={val => onUpdate('descriptionHtml', val)}
            placeholder={activity.practiceType === 'theory' ? 'Содержание теоретического материала...' : 'Описание онлайн-практики...'} />
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

      {/* Video section — only for media practice (theory/call have their own content) */}
      {activity.practiceType === 'media' && courseId && propActivityId && (
        <VideoSection
          videos={videos}
          courseId={courseId}
          activityId={propActivityId}
          maxDay={maxDay}
          onUpload={onVideoUpload}
          onAddLink={onAddLink}
          onDelete={onDeleteVideo}
          uploading={videoUploadingId === propActivityId}
          uploadProgress={videoUploadingId === propActivityId ? uploadProgress : 0}
          globalUploading={!!videoUploadingId}
        />
      )}

      {/* Call scheduling — only for call type with saved activity */}
      {activity.practiceType === 'call' && courseId && propActivityId && (() => {
        const actId = activity.activityId || propActivityId;
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
                  День {c.day} — {new Date(c.scheduled_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                    <input type="number" value={callDay} min={1} max={maxDay}
                      onChange={e => setCallDay(parseInt(e.target.value) || 1)}
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
                    <input type="number" value={callDuration} min={5} max={180}
                      onChange={e => setCallDuration(parseInt(e.target.value) || 30)}
                      style={{ ...inputStyle, width: 50, padding: '4px 6px', fontSize: 11 }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => {
                    if (!callDate) return;
                    const scheduledAt = new Date(`${callDate}T${callTime}:00`).toISOString();
                    onCreateCall(activity.activityId || propActivityId, callDay, scheduledAt, callDuration);
                    setShowCallForm(false);
                  }} style={{
                    padding: '6px 10px', borderRadius: 8, border: 'none',
                    background: '#9b59b6', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}>Создать</button>
                  <button onClick={() => setShowCallForm(false)} style={{
                    padding: '6px 8px', borderRadius: 8, border: 'none',
                    background: 'rgba(0,0,0,0.05)', color: '#999', fontSize: 11, cursor: 'pointer',
                  }}>Отмена</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowCallForm(true)} style={{
                width: '100%', padding: '7px 10px', borderRadius: 8,
                border: '1px dashed rgba(155,89,182,0.3)', background: 'rgba(155,89,182,0.04)',
                color: '#9b59b6', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}>+ Запланировать звонок</button>
            )}

            <div style={{ fontSize: 10, color: '#bbb', marginTop: 4 }}>
              Комната для звонка будет создана после подключения Daily.co
            </div>
          </div>
        );
      })()}
    </div>
  );
}
