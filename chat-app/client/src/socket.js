import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const token = sessionStorage.getItem('chat_token');

const socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: { token: token || undefined },
  reconnection: true,
  reconnectionDelayMax: 10000,
  reconnectionAttempts: 5,
  timeout: 10000,
  transports: ['websocket', 'polling']
});

export default socket;