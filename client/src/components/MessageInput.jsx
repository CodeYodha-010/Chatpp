import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import socket from '../socket';

const MAX_CHARS = 500;

function MessageInput({ currentRoom, nickname }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const typingTimeoutRef = useRef(null);

  const charCount = message.length;
  const nearLimit = charCount > MAX_CHARS * 0.8;
  const atLimit = charCount >= MAX_CHARS;

  const handleSend = async () => {
    if (!message.trim() || isSending) return;

    setIsSending(true);
    socket.emit('send_message', {
      room: currentRoom,
      message: message.trim(),
      nickname
    });
    setMessage('');
    clearTimeout(typingTimeoutRef.current);
    socket.emit('stop_typing', { room: currentRoom, nickname });

    // Brief delay to show send animation
    setTimeout(() => setIsSending(false), 80);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e) => {
    setMessage(e.target.value);
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
          placeholder="Message..."
          value={message}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          autoFocus
        />
        {charCount > 0 && (
          <span className={`char-count ${atLimit ? 'at-limit' : nearLimit ? 'near-limit' : ''}`}>
            {charCount}/{MAX_CHARS}
          </span>
        )}
        <motion.button
          className="send-btn"
          onClick={handleSend}
          disabled={!message.trim() || isSending}
          whileTap={{ scale: 0.95 }}
          animate={isSending ? { scale: [1, 1.05, 1] } : {}}
          transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
        >
          Send
        </motion.button>
      </div>
    </div>
  );
}

export default MessageInput;
