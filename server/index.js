import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// In-memory storage
const users = new Map(); // socketId -> { nickname, currentRoom }
const rooms = { General: [], Tech: [], Random: [] };
const roomNames = ['General', 'Tech', 'Random'];

function getOnlineUsers() {
  return [...users.values()].map(u => ({ nickname: u.nickname }));
}

function getUsersInRoom(room) {
  return [...users.values()]
    .filter(u => u.currentRoom === room)
    .map(u => ({ nickname: u.nickname }));
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1a. User joins with nickname
  socket.on('user_join', ({ nickname }) => {
    users.set(socket.id, { nickname, currentRoom: null });
    console.log(`${nickname} joined`);

    io.emit('online_users', getOnlineUsers());
    io.emit('user_joined', { nickname });
    socket.emit('room_list', roomNames);
  });

  // 2a/2b. Join a room
  socket.on('join_room', ({ room }) => {
    const user = users.get(socket.id);
    if (!user) return;

    // Leave previous room
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
    }

    user.currentRoom = room;
    socket.join(room);

    const roomMessages = rooms[room] || [];
    socket.emit('room_joined', { room, messages: roomMessages });
    console.log(`${user.nickname} joined room: ${room}`);
  });

  // 2b. Create a new room
  socket.on('create_room', ({ room }) => {
    if (!room || rooms[room]) return;
    rooms[room] = [];
    roomNames.push(room);
    io.emit('room_created', { room });
    io.emit('room_list', roomNames);
  });

  // 2c. Send message
  socket.on('send_message', ({ room, message, nickname }) => {
    if (!message || !message.trim()) return;
    const user = users.get(socket.id);
    if (!user) return;

    const msgId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const msg = {
      id: msgId,
      nickname,
      message: message.trim(),
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };

    if (rooms[room]) {
      rooms[room].push(msg);
    }

    // Broadcast to all in room including sender
    io.to(room).emit('new_message', msg);
    // Confirm delivery back to sender
    socket.emit('message_delivered', { id: msgId });
  });

  // 3c. Typing indicator
  socket.on('typing', ({ room, nickname }) => {
    socket.to(room).emit('user_typing', { nickname });
  });

  socket.on('stop_typing', ({ room, nickname }) => {
    socket.to(room).emit('user_stop_typing', { nickname });
  });

  // 1c. Handle disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`${user.nickname} disconnected`);
      users.delete(socket.id);
      io.emit('online_users', getOnlineUsers());
      io.emit('user_left', { nickname: user.nickname });
    }
  });
});

app.get('/', (req, res) => {
  res.json({ status: 'Chat server running' });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});