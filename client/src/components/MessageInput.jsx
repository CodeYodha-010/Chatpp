import { useState, useRef } from 'react';
import socket from '../socket';

const MAX_CHARS = 500;

function MessageInput({ currentRoom, nickname, onSend }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const notifyTyping = () => {
    socket.emit('typing', { room: currentRoom, nickname });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { room: currentRoom, nickname });
    }, 2000);
  };

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    onSend(message.trim());
    setMessage('');
    clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { room: currentRoom, nickname });
    setTimeout(() => setIsSending(false), 80);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    notifyTyping();
  };

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          placeholder="Message..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          autoFocus
        />
        <button className="send-btn" onClick={handleSend} disabled={!message.trim() || isSending}>
          Send
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
