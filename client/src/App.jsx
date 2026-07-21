import { useState, useEffect } from 'react';
import socket from './socket';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import ChatRoom from './components/ChatRoom';

function App() {
  const [nickname, setNickname] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('General');
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    socket.on('online_users', (users) => {
      setOnlineUsers(users);
    });

    socket.on('user_joined', (data) => {
      console.log(`${data.nickname} joined`);
    });

    socket.on('user_left', (data) => {
      console.log(`${data.nickname} left`);
      setTypingUsers(prev => prev.filter(u => u !== data.nickname));
    });

    socket.on('room_list', (roomList) => {
      setRooms(roomList);
    });

    socket.on('room_created', (data) => {
      setRooms(prev => [...prev, data.room]);
    });

    socket.on('room_joined', (data) => {
      setCurrentRoom(data.room);
      setMessages(data.messages);
      setTypingUsers([]);
    });

    socket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('message_delivered', (data) => {
      setMessages(prev => prev.map(msg => 
        msg.id === data.id ? { ...msg, status: 'delivered' } : msg
      ));
    });

    socket.on('user_typing', (data) => {
      setTypingUsers(prev => {
        if (!prev.includes(data.nickname)) {
          return [...prev, data.nickname];
        }
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
      socket.off('user_typing');
      socket.off('user_stop_typing');
    };
  }, []);

  const handleJoin = (name) => {
    setNickname(name);
    socket.emit('user_join', { nickname: name });
    setTimeout(() => {
      socket.emit('join_room', { room: 'General' });
    }, 100);
    setIsLoggedIn(true);
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

  if (!isLoggedIn) {
    return <Login onJoin={handleJoin} />;
  }

  return (
    <div className="chat-container">
      <Sidebar 
        rooms={rooms} 
        currentRoom={currentRoom} 
        onlineUsers={onlineUsers}
        nickname={nickname}
        onJoinRoom={handleJoinRoom}
        onCreateRoom={handleCreateRoom}
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