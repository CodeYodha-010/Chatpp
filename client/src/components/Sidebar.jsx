import { useState } from 'react';

function Sidebar({ rooms, currentRoom, onlineUsers, nickname, onJoinRoom, onCreateRoom, onLogout, user, onInviteFriend, showSearch, onSearch }) {
  const [showNewRoomInput, setShowNewRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowNewRoomInput(false);
    }
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim());
      setSearchQuery('');
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Chat</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onInviteFriend && (
            <button className="invite-btn" onClick={() => onInviteFriend()} title="Invite friend">
              Invite
            </button>
          )}
          <button className="logout-btn" onClick={onLogout} title="Logout">Logout</button>
        </div>
      </div>

      {showSearch && (
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search rooms or users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          />
        </div>
      )}

      <div className="sidebar-content">
        <div className="sidebar-section">
          <h3>Rooms</h3>
          <ul className="room-list">
            {rooms.map((room) => (
              <li
                key={room}
                className={`room-item ${currentRoom === room ? 'active' : ''}`}
                onClick={() => onJoinRoom(room)}
              >
                {room}
              </li>
            ))}
          </ul>

          {!showNewRoomInput ? (
            <button className="new-room-btn" onClick={() => setShowNewRoomInput(true)}>
              + New Room
            </button>
          ) : (
            <div className="new-room-input">
              <input
                type="text"
                placeholder="Room name..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                autoFocus
              />
              <button onClick={handleCreateRoom}>Add</button>
            </div>
          )}
        </div>

        <div className="sidebar-section">
          <h3>Online ({onlineUsers.length})</h3>
          <ul className="online-users-list">
            {onlineUsers.map((userItem, index) => (
              <li key={index} className="online-user">
                <span className="online-dot"></span>
                {userItem.nickname}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;