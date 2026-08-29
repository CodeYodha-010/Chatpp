import { useEffect, useRef } from 'react';
import socket from '../socket';
import MessageInput from './MessageInput';

function ChatRoom({ currentRoom, messages, nickname, typingUsers }) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (text) => {
    socket.emit('send_message', { room: currentRoom, message: text, nickname });
  };

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="room-avatar">#</div>
          <div className="room-info">
            <h2>{currentRoom}</h2>
            <span className="room-meta">{messages.length} messages</span>
          </div>
        </div>
      </div>

      <div className="message-list" ref={containerRef}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">#</div>
            <h3>No messages yet</h3>
            <p>Be the first to say hello.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message ${msg.nickname === nickname ? 'own' : 'other'}`}>
              <div className="msg-header">
                <span className="msg-author">{msg.nickname}</span>
                <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="msg-bubble">{msg.content || msg.message || ''}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="typing-indicator">
        {typingUsers.length > 0 && <span>{typingUsers.join(', ')} typing...</span>}
      </div>

      <MessageInput currentRoom={currentRoom} nickname={nickname} onSend={handleSend} />
    </div>
  );
}

export default ChatRoom;