import { useState, useRef } from 'react';
import socket from '../socket';

function MessageInput({ currentRoom, nickname }) {
  const [message, setMessage] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleSend = () => {
    if (!message.trim()) return;
    socket.emit('send_message', {
      room: currentRoom,
      message: message.trim(),
      nickname
    });
    setMessage('');
    // Stop typing on send
    clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { room: currentRoom, nickname });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setMessage(e.target.value);

    // Typing indicator with debounce
    socket.emit('typing', { room: currentRoom, nickname });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stop_typing', { room: currentRoom, nickname });
    }, 2000);
  };

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <input
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          maxLength={500}
          autoFocus
        />
        <button onClick={handleSend} disabled={!message.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export default MessageInput;