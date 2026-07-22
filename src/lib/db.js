import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from './supabase';

// ═══════════════════════════════════════════════════════════
// USER SETTINGS
// ═══════════════════════════════════════════════════════════

export async function loadUserSettings(userId) {
  try {
    return await apiGet('/api/settings');
  } catch (err) {
    console.error('[DB] Load settings:', err);
    return null;
  }
}

export async function saveUserSettings(userId, updates) {
  try {
    await apiPatch('/api/settings', updates);
  } catch (err) {
    console.error('[DB] Save settings:', err);
  }
}

export async function saveActiveContext(userId, type, id) {
  await saveUserSettings(userId, { active_type: type, active_id: id });
}

// ═══════════════════════════════════════════════════════════
// AVAILABLE ITEMS — courses + trackers for switcher
// ═══════════════════════════════════════════════════════════

export async function getAvailableItems(userId) {
  try {
    return await apiGet('/api/items');
  } catch (err) {
    console.error('[DB] Get items:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// COURSE PROGRESS
// ═══════════════════════════════════════════════════════════

export async function loadCourseProgress(userId, courseId) {
  try {
    return await apiGet(`/api/progress/course/${courseId}`);
  } catch (err) {
    console.error('[DB] Load course progress:', err);
    return {};
  }
}

// v25: progression modes.
export async function closeCurrentDay(courseId) {
  try { return await apiPost(`/api/courses/${courseId}/close-day`, {}); }
  catch (err) { return { error: err.message }; }
}
export async function reopenClosedDay(courseId, day) {
  try { return await apiDelete(`/api/courses/${courseId}/closures/${day}`); }
  catch (err) { return { error: err.message }; }
}
export async function setEnrollmentMode(enrollmentId, mode, startDay) {
  const body = {};
  if (mode !== undefined) body.mode = mode;
  if (startDay !== undefined) body.startDay = startDay;
  try { return await apiPatch(`/api/trainer/enrollments/${enrollmentId}/mode`, body); }
  catch (err) { return { error: err.message }; }
}

export async function saveCourseActivityProgress(userId, courseId, activityId, day, elapsed, completed) {
  try {
    await apiPost('/api/progress/course', { courseId, activityId, day, elapsed, completed });
  } catch (err) {
    console.error('[DB] Save course progress:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// TRACKER PROGRESS
// ═══════════════════════════════════════════════════════════

export async function loadTrackerProgress(userId, trackerId) {
  try {
    return await apiGet(`/api/progress/tracker/${trackerId}`);
  } catch (err) {
    console.error('[DB] Load tracker progress:', err);
    return {};
  }
}

export async function saveTrackerActivityProgress(userId, trackerId, practiceId, day, elapsed, completed) {
  try {
    await apiPost('/api/progress/tracker', { trackerId, practiceId, day, elapsed, completed });
  } catch (err) {
    console.error('[DB] Save tracker progress:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// USER ROLES
// ═══════════════════════════════════════════════════════════

export async function getUserRole(userId) {
  try {
    const data = await apiGet('/api/role');
    return data.role || 'student';
  } catch {
    return 'student';
  }
}

export async function assignRole(adminId, targetEmail, newRole) {
  try {
    return await apiPost('/api/role/assign', { email: targetEmail, role: newRole });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function checkAndApplyPendingRole(userId, email) {
  // Handled server-side during registration/login
  return await getUserRole(userId);
}

// ═══════════════════════════════════════════════════════════
// COURSES — CONSTRUCTOR
// ═══════════════════════════════════════════════════════════

export async function createCourseWithActivities(ownerId, { title, description, avatarIcon, avatarCustom, daysCount, activities }) {
  try {
    return await apiPost('/api/courses', { title, description, avatarIcon, avatarCustom, daysCount, activities });
  } catch (err) {
    return { error: err.message };
  }
}

export async function createCourse(ownerId, title, description, daysCount) {
  return createCourseWithActivities(ownerId, { title, description, daysCount, activities: [] });
}

export async function loadCourseForEdit(courseId) {
  try {
    return await apiGet(`/api/courses/${courseId}`);
  } catch (err) {
    console.error('[DB] Load course for edit:', err);
    return null;
  }
}

export async function updateCourseWithActivities(courseId, { title, description, avatarIcon, avatarCustom, daysCount, activities, deletedActivityIds }) {
  try {
    return await apiPut(`/api/courses/${courseId}`, { title, description, avatarIcon, avatarCustom, daysCount, activities, deletedActivityIds });
  } catch (err) {
    return { error: err.message };
  }
}

// ─── Auto-save granular endpoints ─────────────────────────────────────────

export async function patchCourseMeta(courseId, fields) {
  try {
    return await apiPatch(`/api/courses/${courseId}/meta`, fields);
  } catch (err) {
    return { error: err.message };
  }
}

export async function createActivity(courseId, fields) {
  try {
    const res = await apiPost(`/api/courses/${courseId}/activities`, fields || {});
    return res?.data || res;
  } catch (err) {
    return { error: err.message };
  }
}

export async function patchActivity(activityId, fields) {
  try {
    return await apiPatch(`/api/activities/${activityId}`, fields);
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteActivity(activityId) {
  try {
    return await apiDelete(`/api/activities/${activityId}`);
  } catch (err) {
    return { error: err.message };
  }
}

export async function getOwnCourses(ownerId) {
  try {
    return await apiGet('/api/courses-own');
  } catch {
    return [];
  }
}

export async function inviteToCourse(courseId, email, role, invitedBy) {
  try {
    return await apiPost(`/api/courses/${courseId}/invite`, { email, role });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getMyInvitations(email) {
  try {
    return await apiGet('/api/invitations');
  } catch {
    return [];
  }
}

export async function acceptInvitation(invitationId) {
  try {
    return await apiPost(`/api/invitations/${invitationId}/accept`);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function declineInvitation(invitationId) {
  try {
    return await apiPost(`/api/invitations/${invitationId}/decline`);
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════

export async function sendMessage(courseId, recipientId, body) {
  if (!body || body.length > 500) return { success: false, error: 'Сообщение должно быть от 1 до 500 символов' };
  try {
    return await apiPost('/api/messages/send', { courseId, recipientId, body });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getConversation(courseId, otherUserId) {
  try {
    return await apiGet(`/api/messages/conversation?courseId=${courseId}&otherUserId=${otherUserId}`);
  } catch {
    return [];
  }
}

export async function markMessagesRead(courseId, senderId) {
  try {
    await apiPost('/api/messages/mark-read', { courseId, senderId });
  } catch (err) {
    console.error('[DB] Mark read:', err);
  }
}

export async function getUnreadCount() {
  try {
    return await apiGet('/api/messages/unread-count');
  } catch {
    return 0;
  }
}

export async function getCourseStaff(courseId) {
  try {
    return await apiGet(`/api/messages/staff/${courseId}`);
  } catch {
    return [];
  }
}

export async function getUnreadByConversation() {
  try {
    return await apiGet('/api/messages/unread-by-conversation');
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// PERSONAL TRACKERS
// ═══════════════════════════════════════════════════════════

export async function createTracker(userId, { title, avatarIcon, avatarCustom, daysCount, practices }) {
  try {
    return await apiPost('/api/trackers', { title, avatarIcon, avatarCustom, daysCount, practices });
  } catch (err) {
    console.error('[DB] Create tracker:', err);
    return null;
  }
}

export async function getMyTrackers(userId) {
  try {
    return await apiGet('/api/trackers');
  } catch {
    return [];
  }
}

export async function deleteTracker(trackerId) {
  try {
    const result = await apiDelete(`/api/trackers/${trackerId}`);
    return result?.ok !== false;
  } catch {
    return false;
  }
}

export async function loadTrackerForEdit(trackerId) {
  try {
    return await apiGet(`/api/trackers/${trackerId}`);
  } catch {
    return null;
  }
}

export async function updateTrackerWithPractices(trackerId, { title, avatarIcon, avatarCustom, daysCount, practices, deletedPracticeIds }) {
  try {
    return await apiPut(`/api/trackers/${trackerId}`, { title, avatarIcon, avatarCustom, daysCount, practices, deletedPracticeIds });
  } catch (err) {
    return { error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// COURSE DELETE
// ═══════════════════════════════════════════════════════════

export async function canDeleteCourse(courseId) {
  try {
    return await apiPost(`/api/courses/${courseId}/can-delete`);
  } catch {
    return { canDelete: false, reason: 'Ошибка проверки' };
  }
}

export async function deleteCourse(courseId) {
  try {
    return await apiDelete(`/api/courses/${courseId}`);
  } catch (err) {
    return { deleted: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// TRAINER CABINET
// ═══════════════════════════════════════════════════════════

export async function getCourseStudentsInfo(courseId) {
  try {
    return await apiGet(`/api/trainer/students/${courseId}`);
  } catch {
    return [];
  }
}

export async function getCourseAllStudentsProgress(courseId) {
  try {
    return await apiGet(`/api/trainer/progress/${courseId}`);
  } catch {
    return {};
  }
}

export async function toggleStudentPause(enrollmentId) {
  try {
    return await apiPost('/api/trainer/toggle-pause', { enrollmentId });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function removeStudentFromCourse(enrollmentId) {
  try {
    return await apiPost('/api/trainer/remove-student', { enrollmentId });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function changeStudentRole(enrollmentId, newRole) {
  try {
    return await apiPost('/api/trainer/change-role', { enrollmentId, newRole });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function trainerToggleExclusion(courseId, userId, activityId, day) {
  try {
    return await apiPost('/api/trainer/toggle-exclusion', { courseId, userId, activityId, day });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function trainerAddStudentActivity(courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays, practiceType, descriptionHtml) {
  try {
    return await apiPost('/api/trainer/add-activity', {
      courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays,
      practiceType, descriptionHtml,
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function trainerToggleCompletion(courseId, userId, activityId, day, completed) {
  try {
    return await apiPost('/api/trainer/toggle-completion', { courseId, userId, activityId, day, completed });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function trainerDeleteStudentActivity(activityId) {
  try {
    return await apiPost('/api/trainer/delete-activity', { activityId });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getCourseExclusions(courseId) {
  try {
    return await apiGet(`/api/trainer/exclusions/${courseId}`);
  } catch {
    return {};
  }
}

export async function getCourseCustomActivities(courseId) {
  try {
    return await apiGet(`/api/trainer/custom-activities/${courseId}`);
  } catch {
    return [];
  }
}

export async function loadStudentExclusions(userId, courseId) {
  try {
    return await apiGet(`/api/exclusions/${courseId}`);
  } catch {
    return {};
  }
}

export async function loadStudentCustomActivities(userId, courseId) {
  try {
    return await apiGet(`/api/custom-activities/${courseId}`);
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY VIDEOS
// ═══════════════════════════════════════════════════════════

// Extract video duration from file metadata (client-side)
function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const dur = Math.round(video.duration);
      URL.revokeObjectURL(video.src);
      resolve(dur > 0 && isFinite(dur) ? dur : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
    video.src = URL.createObjectURL(file);
  });
}

export async function uploadActivityMedia(courseId, activityId, file, firstDay, lastDay, intervalDays, onProgress, mediaType = 'video') {
  const durationSec = mediaType === 'video' || mediaType === 'audio' ? await getVideoDuration(file) : null;
  const token = localStorage.getItem('is_token');
  const apiUrl = import.meta.env.VITE_API_URL || '';

  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('mediaType', mediaType);
    formData.append('firstDay', firstDay);
    formData.append('lastDay', lastDay);
    if (intervalDays) formData.append('intervalDays', intervalDays);
    if (durationSec) formData.append('durationSec', durationSec);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/api/files/upload/${courseId}/${activityId}`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(result);
        else resolve({ error: result.error || `HTTP ${xhr.status}` });
      } catch {
        resolve({ error: `HTTP ${xhr.status}` });
      }
    };
    xhr.onerror = () => resolve({ error: 'Ошибка сети' });
    xhr.send(formData);
  });
}

// Import a Google Drive video to our own storage. Returns once the backend
// finishes streaming the file, with the same { data } shape as a regular
// upload. Calls onProgress(percent) while polling.
export async function importDriveMedia(courseId, activityId, url, firstDay, lastDay, intervalDays, onProgress) {
  const start = await apiPost('/api/files/import-drive', { courseId, activityId, url, firstDay, lastDay, intervalDays });
  if (start?.error || !start?.jobId) return { error: start?.error || 'Не удалось начать импорт' };
  const { jobId } = start;
  const token = localStorage.getItem('is_token');
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const poll = async () => {
    // cache:no-store + cache-busting query so we never get a 304 (which fetch
    // surfaces as ok=false and broke the polling loop early).
    const res = await fetch(`${apiUrl}/api/files/import-drive/${jobId}?t=${Date.now()}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  };
  while (true) {
    let job;
    try { job = await poll(); }
    catch (err) { return { error: err.message }; }
    const phase = job.phase || 'downloading';
    if (onProgress) {
      let pct;
      if (phase === 'downloading') {
        pct = job.totalBytes ? Math.min(99, Math.round((job.bytesDone / job.totalBytes) * 100)) : 0;
      } else if (phase === 'transcoding') {
        // ffmpeg parses progress from -progress pipe:1 lines; updates job.transcodeProgress (0-100)
        pct = typeof job.transcodeProgress === 'number' ? job.transcodeProgress : 0;
      } else {
        // 'remux' / 'processing' — fast container-only step, indeterminate
        pct = 0;
      }
      onProgress(pct, phase);
    }
    if (job.status === 'done') {
      onProgress?.(100, 'done');
      return { data: job.videoData };
    }
    if (job.status === 'error') return { error: job.error || 'Ошибка импорта' };
    await new Promise(r => setTimeout(r, 700));
  }
}

export async function addMediaLink(courseId, activityId, url, sourceType, firstDay, lastDay, intervalDays, mediaType = 'video') {
  try {
    return await apiPost('/api/media/link', { courseId, activityId, url, sourceType, mediaType, firstDay, lastDay, intervalDays });
  } catch (err) {
    return { error: err.message };
  }
}

export async function addEmptyMedia(courseId, activityId, mediaType, firstDay, lastDay, intervalDays, textContent = null) {
  try {
    return await apiPost('/api/media/empty', { courseId, activityId, mediaType, textContent, firstDay, lastDay, intervalDays });
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteActivityMedia(mediaId) {
  try {
    return await apiDelete(`/api/media/${mediaId}`);
  } catch (err) {
    return { error: err.message };
  }
}

export async function patchMedia(mediaId, fields) {
  try {
    return await apiPatch(`/api/media/${mediaId}`, fields);
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateMediaDuration(mediaId, durationSec) {
  try {
    await apiPatch(`/api/media/${mediaId}/duration`, { durationSec });
  } catch (err) {
    console.error('[DB] Update media duration:', err);
  }
}

export async function updateActivityDuration(activityId, durationMin) {
  try {
    return await apiPatch(`/api/activities/${activityId}/duration`, { durationMin });
  } catch (err) {
    return { error: err.message };
  }
}

export async function getActivityMedia(courseId) {
  try {
    return await apiGet(`/api/media/${courseId}`);
  } catch {
    return [];
  }
}

export function getMediaForDay(mediaList, activityId, day) {
  const matching = (mediaList || [])
    .filter(m => m.activity_id === activityId && isMediaScheduledRaw(m, day))
    .sort((a, b) => b.sort_order - a.sort_order);
  return matching[0] || null;
}

// Inline copy of isVideoScheduled to avoid pulling the whole constants module
// into this lib (db.js is import-heavy as it is).
function isMediaScheduledRaw(v, day) {
  const excluded = v.excluded_days || [];
  const extra    = v.extra_days || [];
  if (excluded.includes(day)) return false;
  if (extra.includes(day)) return true;
  if (day < v.first_day || day > v.last_day) return false;
  const step = Math.max(1, v.interval_days || 1);
  return ((day - v.first_day) % step) === 0;
}

export async function getMediaSignedUrl(filePath) {
  // For self-hosted: serve directly through our API
  const token = localStorage.getItem('is_token');
  const apiUrl = import.meta.env.VITE_API_URL || '';
  return `${apiUrl}/api/files/video/${filePath}?token=${token}`;
}

// ═══════════════════════════════════════════════════════════
// ACTIVITY CALLS
// ═══════════════════════════════════════════════════════════

export async function getActivityCalls(courseId) {
  const res = await apiGet(`/api/calls/${courseId}`);
  return res || [];
}

export async function createActivityCall(courseId, activityId, day, scheduledAt, durationMin) {
  return await apiPost('/api/calls', { courseId, activityId, day, scheduledAt, durationMin });
}

export async function patchActivityCall(callId, fields) {
  // fields: { scheduledAt?, durationMin?, status? }
  return await apiPut(`/api/calls/${callId}`, fields);
}

export async function deleteActivityCall(callId) {
  return await apiDelete(`/api/calls/${callId}`);
}

export async function getCallToken(callId) {
  return await apiPost(`/api/calls/${callId}/token`);
}

export async function uploadTheoryMedia(file) {
  const token = localStorage.getItem('is_token');
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${apiUrl}/api/files/upload-media`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return await res.json();
}

export async function getCallAttendance(callId) {
  try {
    return await apiGet(`/api/calls/${callId}/attendance`);
  } catch (err) {
    console.error('[DB] Get call attendance:', err);
    return null;
  }
}

export async function saveCallAttendance(callId, attendedUserIds) {
  try {
    return await apiPost(`/api/calls/${callId}/attendance`, { attendedUserIds });
  } catch (err) {
    return { success: false, error: err.message };
  }
}
