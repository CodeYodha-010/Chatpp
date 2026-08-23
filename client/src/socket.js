import { io } from 'socket.io-client';

// Socket.IO endpoint.
// - Default: SAME-ORIGIN (window.location.origin) — Vite's dev proxy forwards
//   /socket.io (ws: true) to the API server; production uses a reverse proxy.
// - Or set VITE_SOCKET_URL to target an absolute host directly.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const token = localStorage.getItem('chat_token');

const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: { token: token || undefined }
});

export default socket;