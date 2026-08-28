// API client — replaces Supabase SDK
const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('is_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('is_token', token);
  else localStorage.removeItem('is_token');
}

export function isAuthenticated() {
  return !!getToken();
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
  });

  // 401 от НЕ-auth endpoint = токен просрочен → форс-релогин.
  // 401 от /api/auth/* — валидная бизнес-ошибка (например «неверный пароль») →
  // не рестартуем сессию, возвращаем json с error.
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    setToken(null);
    window.location.reload();
    throw new Error('Unauthorized');
  }

  return res.json();
}

export async function apiGet(path) {
  return api(path);
}

export async function apiPost(path, body) {
  return api(path, { method: 'POST', body });
}

export async function apiPut(path, body) {
  return api(path, { method: 'PUT', body });
}

export async function apiPatch(path, body) {
  return api(path, { method: 'PATCH', body });
}

export async function apiDelete(path) {
  return api(path, { method: 'DELETE' });
}

// Auth helpers
export async function signInWithPassword(email, password) {
  const data = await apiPost('/api/auth/login', { email, password });
  if (data.token) setToken(data.token);
  return data;
}

export async function signUp(email, password, name, consent) {
  const data = await apiPost('/api/auth/register', { email, password, name, consent });
  if (data.token) setToken(data.token);
  return data;
}

// v26: email verification / password reset / change / geo.
export async function verifyEmail(email, code) {
  return await apiPost('/api/auth/verify-email', { email, code });
}
export async function resendVerification(email) {
  return await apiPost('/api/auth/resend-verification', { email });
}
export async function requestPasswordReset(email) {
  return await apiPost('/api/auth/reset-request', { email });
}
export async function confirmPasswordReset(email, code, newPassword) {
  return await apiPost('/api/auth/reset-confirm', { email, code, newPassword });
}
export async function changePassword(oldPassword, newPassword) {
  return await apiPost('/api/auth/change-password', { oldPassword, newPassword });
}
export async function getGeo() {
  try { return await apiGet('/api/auth/geo'); }
  catch { return { country: null }; }
}

// v28: Course Store — тренер (submit/withdraw) и публичная витрина для учеников.
export async function storeSubmitCourse(courseId, price) {
  return await apiPost(`/api/courses/${courseId}/store/submit`, { price });
}
export async function storeWithdrawCourse(courseId) {
  return await apiPost(`/api/courses/${courseId}/store/withdraw`, {});
}
export async function getStore() { return await apiGet('/api/store'); }
export async function getStoreCourse(courseId) { return await apiGet(`/api/store/${courseId}`); }
export async function enrollFromStore(courseId) {
  return await apiPost(`/api/store/${courseId}/enroll`, {});
}

// v28: Admin panel — модерация витрины, блокировки, аудит.
export async function adminGetTrainers() { return await apiGet('/api/admin/trainers'); }
export async function adminGetTrainerCourses(trainerId) { return await apiGet(`/api/admin/trainers/${trainerId}/courses`); }
export async function adminGetCourse(courseId) { return await apiGet(`/api/admin/courses/${courseId}`); }
export async function adminGetAudit(limit = 100) { return await apiGet(`/api/admin/audit?limit=${limit}`); }
export async function adminApproveCourse(courseId) { return await apiPost(`/api/admin/courses/${courseId}/approve`, {}); }
export async function adminRejectCourse(courseId, reason) { return await apiPost(`/api/admin/courses/${courseId}/reject`, { reason }); }
export async function adminBlockCourse(courseId, reason) { return await apiPost(`/api/admin/courses/${courseId}/block`, { reason }); }
export async function adminUnblockCourse(courseId) { return await apiPost(`/api/admin/courses/${courseId}/unblock`, {}); }
export async function adminBlockTrainer(trainerId, reason) { return await apiPost(`/api/admin/trainers/${trainerId}/block`, { reason }); }
export async function adminUnblockTrainer(trainerId) { return await apiPost(`/api/admin/trainers/${trainerId}/unblock`, {}); }

// v27: Practice Library
export async function getLibrary() {
  return await apiGet('/api/library');
}
export async function saveActivityToLibrary(activityId) {
  return await apiPost('/api/library', { activityId });
}
export async function refreshLibraryFromActivity(libraryId, activityId) {
  return await apiPatch(`/api/library/${libraryId}`, { activityId });
}
export async function deleteLibraryEntry(libraryId) {
  return await apiDelete(`/api/library/${libraryId}`);
}
export async function copyLibraryToCourse(courseId, libraryIds) {
  return await apiPost(`/api/courses/${courseId}/activities/from-library`, { libraryIds });
}

export function signInWithGoogle() {
  window.location.href = `${API_BASE}/api/auth/google`;
}

export async function getMe() {
  if (!isAuthenticated()) return null;
  try {
    return await apiGet('/api/auth/me');
  } catch {
    return null;
  }
}

export function signOut() {
  setToken(null);
}

// Check for token in URL hash (after Google OAuth redirect)
export function checkOAuthCallback() {
  const hash = window.location.hash;
  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get('access_token');
    if (token) {
      setToken(token);
      window.history.replaceState(null, '', window.location.pathname);
      return true;
    }
  }
  return false;
}
