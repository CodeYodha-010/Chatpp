import { useState, useEffect, useRef } from 'react';
import socket from './socket';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';
import LandingPage from './components/Landing/LandingPage';
import { apiGet, apiPost } from './api';

function App() {
  const entryParams = new URLSearchParams(window.location.search);
  const enteringApp = entryParams.get('enter') === '1';
  const [view, setView] = useState(enteringApp ? 'auth' : 'landing');
  const [user, setUser] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  // "/" hands the first impression to the CONTINENTAL showcase page.
  useEffect(() => {
    if (!loading && view === 'landing') {
      window.location.replace('/landing.html');
    }
  }, [loading, view]);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('chat_token');
      if (token) {
        try {
          const data = await apiGet('/api/auth/me', token);
          setUser(data.user);
          setNickname(data.user.display_name || data.user.username);
          socket.auth = { token };
          socket.connect();
          setAuthView('chat');
          setView('chat');
        } catch {
          localStorage.removeItem('chat_token');
          localStorage.removeItem('chat_refresh_token');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    socket.on('online_users', (users) => setOnlineUsers(users));
    socket.on('user_joined', () => {});
    socket.on('user_left', (data) => {
      setTypingUsers(prev => prev.filter(u => u !== data.nickname));
    });
    socket.on('room_list', (roomList) => setRooms(roomList));
    socket.on('room_created', (data) => setRooms(prev => [...prev, data.room]));
    socket.on('room_joined', (data) => {
      setCurrentRoom(data.room);
      setMessages(data.messages);
      setTypingUsers([]);
    });
    socket.on('new_message', (message) => setMessages(prev => [...prev, message]));
    socket.on('message_delivered', (data) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.id ? { ...msg, status: 'delivered' } : msg
      ));
    });
    socket.on('priority_updated', (data) => {
      setMessages(prev => prev.map(msg =>
        msg.id === data.id ? { ...msg, priority: data.priority } : msg
      ));
    });
    socket.on('user_typing', (data) => {
      setTypingUsers(prev => {
        if (!prev.includes(data.nickname)) return [...prev, data.nickname];
        return prev;
      });
    });
    socket.on('user_stop_typing', (data) => {
      setTypingUsers(prev => prev.filter(u => u !== data.nickname));
    });

    return () => {
      socket.off('online_users');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('room_list');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('new_message');
      socket.off('message_delivered');
      socket.off('priority_updated');
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, []);

  const handleAuthSuccess = (userData, token) => {
    setUser(userData);
    setNickname(userData.display_name || userData.username);
    socket.auth = { token };
    socket.connect();
    setTimeout(() => {
      socket.emit('user_join', { nickname: userData.display_name || userData.username });
      socket.emit('join_room', { room: 'general' });
    }, 100);
    setAuthView('chat');
    setView('chat');
  };

  const handleGetStarted = () => setView('chat');

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('chat_token');
      if (token) await apiPost('/api/auth/logout', {}, token);
    } catch {}
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_refresh_token');
    setUser(null);
    setNickname('');
    socket.disconnect();
    setAuthView('login');
    setView('landing');
    setCurrentRoom('general');
    setMessages([]);
    setOnlineUsers([]);
  };

  const handleJoinRoom = (room) => {
    socket.emit('join_room', { room });
  };

  const handleCreateRoom = (roomName) => {
    socket.emit('create_room', { room: roomName });
    setTimeout(() => {
      socket.emit('join_room', { room: roomName });
    }, 200);
  };

  if (view === 'landing' && !loading) {
    return <LandingPage onGetStarted={handleGetStarted} />;
  }

  if (loading) {
    return (
      <div className="chat-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32, border: '3px solid var(--surface-3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }

  if (authView !== 'chat') {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="chat-app">
      <Sidebar
        rooms={rooms}
        currentRoom={currentRoom}
        onlineUsers={onlineUsers}
        nickname={nickname}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={handleCreateRoom}
        onLogout={handleLogout}
        user={user}
      />
      <ChatRoom
        currentRoom={currentRoom}
        messages={messages}
        nickname={nickname}
        typingUsers={typingUsers}
      />
    </div>
  );
}

export default App;
