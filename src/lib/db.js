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

export async function trainerAddStudentActivity(courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays) {
  try {
    return await apiPost('/api/trainer/add-activity', { courseId, userId, label, iconNum, durationMin, firstDay, lastDay, intervalDays });
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

export async function uploadActivityVideo(courseId, activityId, file, firstDay, lastDay, onProgress) {
  const durationSec = await getVideoDuration(file);
  const token = localStorage.getItem('hw_token');
  const apiUrl = import.meta.env.VITE_API_URL || '';

  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append('video', file);
    formData.append('firstDay', firstDay);
    formData.append('lastDay', lastDay);
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

export async function addVideoLink(courseId, activityId, url, videoType, firstDay, lastDay) {
  try {
    return await apiPost('/api/videos/link', { courseId, activityId, url, videoType, firstDay, lastDay });
  } catch (err) {
    return { error: err.message };
  }
}

export async function deleteActivityVideo(videoId, videoUrl, videoType) {
  try {
    return await apiDelete(`/api/videos/${videoId}`);
  } catch (err) {
    return { error: err.message };
  }
}

export async function updateVideoDuration(videoId, durationSec) {
  try {
    await apiPatch(`/api/videos/${videoId}/duration`, { durationSec });
  } catch (err) {
    console.error('[DB] Update video duration:', err);
  }
}

export async function getActivityVideos(courseId) {
  try {
    return await apiGet(`/api/videos/${courseId}`);
  } catch {
    return [];
  }
}

export function getVideoForDay(videos, activityId, day) {
  const matching = videos
    .filter(v => v.activity_id === activityId && day >= v.first_day && day <= v.last_day)
    .sort((a, b) => b.sort_order - a.sort_order);
  return matching[0] || null;
}

export async function getVideoSignedUrl(filePath) {
  // For self-hosted: serve directly through our API
  const token = localStorage.getItem('hw_token');
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

export async function deleteActivityCall(callId) {
  return await apiDelete(`/api/calls/${callId}`);
}
