import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

function Sidebar({ rooms, currentRoom, onlineUsers, nickname, onJoinRoom, onCreateRoom, onLogout, user }) {
  const [showNewRoomInput, setShowNewRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowNewRoomInput(false);
    }
  };

  const displayName = user?.display_name || user?.username || nickname || 'Guest';
  const initials = displayName.slice(0, 2).toUpperCase();

  const getAvatarColor = (name) => {
    const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `hsl(${hash * 7 % 360}, 65%, 55%)`;
  };

  const avatarColor = user?.avatar_color || getAvatarColor(displayName);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="app-brand">
          <div className="brand-icon">C</div>
          <h2>Chat</h2>
        </div>
        <div className="sidebar-user-card">
          <div className="user-avatar" style={{ background: avatarColor }}>
            {initials}
          </div>
          <div className="user-details">
            <div className="user-name">{displayName}</div>
            <div className="user-status">Online</div>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Disconnect">
            ⏻
          </button>
        </div>
      </div>

      <div className="sidebar-content">
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Rooms</h3>
            <span className="section-count">{rooms.length}</span>
          </div>
          <ul className="room-list">
            {rooms.map((room) => (
              <motion.li
                key={room}
                className={`room-item ${currentRoom === room ? 'active' : ''}`}
                onClick={() => onJoinRoom(room)}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
              >
                <span className="room-icon">#</span>
                {room}
              </motion.li>
            ))}
          </ul>

          <AnimatePresence>
            {!showNewRoomInput ? (
              <motion.button
                className="new-room-btn"
                onClick={() => setShowNewRoomInput(true)}
                whileTap={{ scale: 0.97 }}
              >
                + New Room
              </motion.button>
            ) : (
              <motion.div
                className="new-room-input"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
              >
                <input
                  type="text"
                  placeholder="Room name..."
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                  autoFocus
                />
                <button onClick={handleCreateRoom}>Add</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Online</h3>
            <span className="section-count">{onlineUsers.length}</span>
          </div>
          <ul className="online-users-list">
            {onlineUsers.map((u, i) => (
              <motion.li
                key={i}
                className="online-user-item"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05, type: 'spring', duration: 0.3 }}
              >
                <div
                  className="user-avatar-sm"
                  style={{ background: getAvatarColor(u.nickname) }}
                >
                  {u.nickname?.[0]?.toUpperCase()}
                  <span className="online-dot"></span>
                </div>
                {u.nickname}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
