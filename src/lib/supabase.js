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

  if (res.status === 401) {
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

export async function signUp(email, password, name) {
  const data = await apiPost('/api/auth/register', { email, password, name });
  if (data.token) setToken(data.token);
  return data;
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
