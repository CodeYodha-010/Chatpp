import { useState, useEffect } from 'react';
import socket from './socket';
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';
import { apiGet, apiPost } from './api';

async function refreshToken() {
  try {
    const data = await apiPost('/api/auth/refresh', {});
    sessionStorage.setItem('chat_token', data.token);
    return data.token;
  } catch {
    sessionStorage.removeItem('chat_token');
    return null;
  }
}

function App() {
  const [view, setView] = useState('landing');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('general');
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shouldEnter = urlParams.has('enter');

    const initAuth = async () => {
      let token = sessionStorage.getItem('chat_token');
      if (!token) {
        token = await refreshToken();
      }
      if (token) {
        try {
          const data = await apiGet('/api/auth/me', token);
          setUser(data.user);
          setNickname(data.user.display_name || data.user.username);
          socket.auth = { token };
        socket.connect();
          setView('chat');
        } catch {
        sessionStorage.removeItem('chat_token');
          setView('landing');
        }
      } else {
        if (shouldEnter) {
          setView('auth');
        } else {
          setView('landing');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  useEffect(() => {
    let reconnectAttempts = 0;

    socket.on('connect_error', (err) => {
      reconnectAttempts++;
      if (err.message === 'Authentication required' || err.message.includes('token')) {
        refreshToken().then(newToken => {
          if (newToken) {
            socket.auth = { token: newToken };
            socket.connect();
            reconnectAttempts = 0;
          } else {
            sessionStorage.removeItem('chat_token');
            setView('landing');
          }
        });
      }
      if (reconnectAttempts >= 5) {
        socket.disconnect();
        setView('landing');
      }
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err.message);
    });

    socket.on('online_users', (users) => setOnlineUsers(users));
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
      socket.off('connect_error');
      socket.off('error');
      socket.off('online_users');
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

  useEffect(() => {
    if (!loading && view === 'landing') {
      window.location.href = '/landing.html';
    }
  }, [view, loading]);

  const handleAuthSuccess = (userData, token) => {
    setUser(userData);
    setNickname(userData.display_name || userData.username);
    socket.auth = { token };

    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    } else {
      socket.connect();
    }

    const onConnect = () => {
      socket.emit('user_join', { nickname: userData.display_name || userData.username });
      socket.emit('join_room', { room: 'general' });
      socket.off('connect', onConnect);
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.on('connect', onConnect);
    }

    setView('chat');
  };

  const handleLogout = async () => {
    try {
      const token = sessionStorage.getItem('chat_token');
      if (token) await apiPost('/api/auth/logout', {}, token);
    } catch {}
    sessionStorage.removeItem('chat_token');
    setUser(null);
    setNickname('');
    socket.disconnect();
    setView('landing');
    setCurrentRoom('general');
    setMessages([]);
    setOnlineUsers([]);
  };

  const handleJoinRoom = (room) => {
    setMessages([]);
    socket.emit('join_room', { room });
  };

  const handleCreateRoom = (roomName) => {
    setMessages([]);
    socket.emit('create_room', { room: roomName });
    socket.emit('join_room', { room: roomName });
  };

  const handleInviteFriend = async () => {
    const username = window.prompt('Enter the username of the friend you want to invite:');
    if (!username) return;
    const token = sessionStorage.getItem('chat_token');
    if (!token) return;
    try {
      const data = await apiPost('/api/invite', { username }, token);
      if (data.room) {
        setMessages([]);
        setCurrentRoom(data.room);
        socket.emit('join_room', { room: data.room });
      }
      window.alert(data.message || 'Invite sent!');
    } catch (err) {
      window.alert(err.message || 'Failed to send invite. User may not exist.');
    }
  };

  if (loading) {
    return (
      <div className='chat-app' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className='spinner' style={{ width: 32, height: 32, border: '3px solid var(--surface-3)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }

  if (view === 'auth') {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  if (view === 'landing') {
    return null;
  }

  return (
    <div className='chat-app'>
      <Sidebar
        rooms={rooms}
        currentRoom={currentRoom}
        onlineUsers={onlineUsers}
        nickname={nickname}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={handleCreateRoom}
        onLogout={handleLogout}
        user={user}
        onInviteFriend={handleInviteFriend}
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
