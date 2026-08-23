// Base URL for all REST calls.
// - Unset/empty (default): SAME-ORIGIN requests — Vite's dev proxy handles /api
//   locally, and production sits behind a reverse proxy routing /api upstream.
// - Or set VITE_API_URL (e.g. http://localhost:3001) to target an absolute host.
const API = import.meta.env.VITE_API_URL ?? '';

export async function apiPost(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function apiGet(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}