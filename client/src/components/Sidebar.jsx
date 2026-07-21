import { useState } from 'react';

function Sidebar({ rooms, currentRoom, onlineUsers, nickname, onJoinRoom, onCreateRoom }) {
  const [showNewRoomInput, setShowNewRoomInput] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      onCreateRoom(newRoomName.trim());
      setNewRoomName('');
      setShowNewRoomInput(false);
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>💬 Real-Time Chat</h2>
      </div>
      
      <div className="sidebar-sections">
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
                onKeyPress={(e) => e.key === 'Enter' && handleCreateRoom()}
                autoFocus
              />
              <button onClick={handleCreateRoom}>Add</button>
            </div>
          )}
        </div>
        
        <div className="sidebar-section">
          <h3>Online ({onlineUsers.length})</h3>
          <ul className="online-users-list">
            {onlineUsers.map((user, index) => (
              <li key={index} className="online-user">
                <span className="online-dot"></span>
                {user.nickname}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;