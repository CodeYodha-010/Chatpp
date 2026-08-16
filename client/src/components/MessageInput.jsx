import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import socket from '../socket';
import EmojiPicker from './EmojiPicker';

const MAX_CHARS = 500;

function MessageInput({ currentRoom, nickname }) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const charCount = message.length;
  const nearLimit = charCount > MAX_CHARS * 0.8;
  const atLimit = charCount >= MAX_CHARS;

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
    notifyTyping();
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input ? (input.selectionStart ?? message.length) : message.length;
    const end = input ? (input.selectionEnd ?? message.length) : message.length;
    let next = message.slice(0, start) + emoji + message.slice(end);
    if (next.length > MAX_CHARS) next = next.slice(0, MAX_CHARS);
    setMessage(next);
    notifyTyping();
    requestAnimationFrame(() => {
      if (input) {
        const pos = Math.min(start + emoji.length, MAX_CHARS);
        input.setSelectionRange(pos, pos);
        input.focus();
      }
    });
  };

  const handleEmojiSelect = (emoji) => {
    insertEmoji(emoji);
    setIsPickerOpen(false);
  };

  return (
    <div className="message-input-container">
      <AnimatePresence>
        {isPickerOpen && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setIsPickerOpen(false)}
          />
        )}
      </AnimatePresence>
      <div className="message-input-wrapper">
        <button
          type="button"
          className={`input-btn ${isPickerOpen ? 'active' : ''}`}
          aria-label="Insert emoji"
          title="Emoji"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setIsPickerOpen((o) => !o)}
        >
          😊
        </button>
        <input
          ref={inputRef}
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