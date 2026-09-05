// Base URL for all REST calls.
// - Empty string (default): SAME-ORIGIN requests — Vite's dev proxy handles /api
//   locally, and in production the Express server serves both frontend + API.
// - Set VITE_API_URL (e.g. http://localhost:3001) to target an absolute host.
const API = import.meta.env.VITE_API_URL ?? '';

let csrfToken = null;

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  try {
    const res = await fetch(`${API}/api/auth/csrf-token`, { credentials: 'include' });
    const data = await res.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch {
    return null;
  }
}

export async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const csrf = await getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function apiGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers, credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
