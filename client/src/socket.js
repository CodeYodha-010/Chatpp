import { io } from 'socket.io-client';

const token = localStorage.getItem('chat_token');
const socket = io('http://localhost:3001', {
  auth: { token: token || undefined }
});

export default socket;