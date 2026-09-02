import { useState, useRef } from 'react';
import socket from '../socket';

const MAX_CHARS = 500;
const WARN_CHARS = 400;

const COMMON_EMOJI = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '✨', '💯', '🙌', '😊', '🤔', '👀', '🚀', '💪', '⭐'];

function MessageInput({ currentRoom, nickname, onSend }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
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
    setShowEmoji(false);
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

  const insertEmoji = (emoji) => {
    const newMessage = message + emoji;
    if (newMessage.length <= MAX_CHARS) {
      setMessage(newMessage);
      inputRef.current?.focus();
    }
    setShowEmoji(false);
  };

  const charCount = message.length;
  const charClass = charCount >= MAX_CHARS
    ? 'danger'
    : charCount >= WARN_CHARS
      ? 'warn'
      : '';

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <button
          type="button"
          className="emoji-btn"
          onClick={() => setShowEmoji(!showEmoji)}
          title="Emoji"
          aria-label="Insert emoji"
        >
          ☺
        </button>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={MAX_CHARS}
          autoFocus
        />
        {charCount > WARN_CHARS * 0.6 && (
          <span className={`char-counter ${charClass}`}>
            {charCount}/{MAX_CHARS}
          </span>
        )}
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!message.trim() || isSending}
        >
          Send
        </button>
      </div>
      {showEmoji && (
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 0 0',
          flexWrap: 'wrap',
          maxWidth: '100%'
        }}>
          {COMMON_EMOJI.map((emoji, i) => (
            <button
              key={i}
              type="button"
              onClick={() => insertEmoji(emoji)}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 10px',
                fontSize: '18px',
                cursor: 'pointer',
                transition: 'all 150ms'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--surface-3)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--surface-2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageInput;
