import { useEffect, useRef, memo } from 'react';
import socket from '../socket';
import MessageInput from './MessageInput';

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(ts) {
  const now = Date.now();
  const diff = now - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function isSameDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
         da.getMonth() === db.getMonth() &&
         da.getDate() === db.getDate();
}

function formatDateLabel(ts) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(ts, today)) return 'Today';
  if (isSameDay(ts, yesterday)) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

const MessageItem = memo(({ msg, prev, idx, nickname }) => {
  const grouped = shouldGroup(msg, prev);
  const isOwn = msg.nickname === nickname;

  const showDateSeparator = !prev || !isSameDay(msg.timestamp, prev.timestamp);
  const dateSeparator = showDateSeparator ? (
    <div className="date-separator">{formatDateLabel(msg.timestamp)}</div>
  ) : null;

  return (
    <div key={msg.id}>
      {dateSeparator}
      <div
        className={`message ${isOwn ? 'own' : 'other'} ${grouped ? 'message-grouped' : ''}`}
        style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
      >
        {!grouped && (
          <div className="msg-header">
            <span className="msg-author">{msg.nickname}</span>
            <span className="msg-time" title={new Date(msg.timestamp).toLocaleString()}>
              {formatTime(msg.timestamp)}
            </span>
          </div>
        )}
        <div className="msg-bubble">
          {msg.content || msg.message || ''}
          {isOwn && (
            <span className="msg-receipt">
              <span className={`receipt-icon ${msg.status === 'read' ? 'read' : ''}`}>
                ✓✓
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

function ChatRoom({ currentRoom, messages, nickname, typingUsers }) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = (text) => {
    socket.emit('send_message', { room: currentRoom, message: text, nickname });
  };

  const shouldGroup = (msg, prev) => {
    if (!prev) return false;
    if (prev.nickname !== msg.nickname) return false;
    const diff = msg.timestamp - prev.timestamp;
    if (diff > 5 * 60 * 1000) return false;
    return true;
  };

  const lastDateRef = useRef(null);

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="room-avatar">#</div>
          <div className="room-info">
            <h2>{currentRoom}</h2>
            <span className="room-meta">
              {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            </span>
          </div>
        </div>
      </div>

      <div className="message-list" ref={containerRef}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">✦</div>
            <h3>Start the conversation</h3>
            <p>Be the first to say something in #{currentRoom}</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            return <MessageItem key={msg.id} msg={msg} prev={prev} idx={idx} nickname={nickname} />;
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="typing-indicator">
        {typingUsers.length > 0 && (
          <>
            <span className="typing-dots"><span></span><span></span><span></span></span>
            <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing</span>
          </>
        )}
      </div>

      <MessageInput currentRoom={currentRoom} nickname={nickname} onSend={handleSend} />
    </div>
  );
}

export default ChatRoom;
