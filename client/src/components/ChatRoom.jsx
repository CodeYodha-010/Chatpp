import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PriorityTabs from './PriorityTabs';
import { decryptMessage } from '../utils/crypto';
import SearchBar from './SearchBar';
import MessageInput from './MessageInput';

function ChatRoom({ currentRoom, messages, currentUser, nickname, typingUsers }) {
  const user = currentUser || nickname;

  // Safe diagnostic logging
  React.useEffect(() => {
    console.log('[ChatRoom] room=', currentRoom, 'messages=', messages?.length, 'typing=', typingUsers?.length);
    if (messages?.length) {
      console.log('[ChatRoom] sample=', messages[0]);
    }
  }, [currentRoom, messages, typingUsers]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const prevMessagesRef = useRef([]);

  useEffect(() => {
    const prevIds = new Set(prevMessagesRef.current.map(m => m.id));
    const newMsgs = messages.filter(m => !prevIds.has(m.id));

    if (newMsgs.length === 0) return;

    let mounted = true;
    const decryptNew = async () => {
      const updates = {};
      await Promise.all(
        newMsgs.map(async (msg) => {
          if (msg.content && msg.iv && msg.authTag) {
            try {
              updates[msg.id] = await decryptMessage(msg.content, msg.iv, msg.authTag);
            } catch {
              updates[msg.id] = msg.message || msg.content || '';
            }
          } else {
            updates[msg.id] = msg.message || msg.content || '';
          }
        })
      );
      if (mounted) {
        setDecryptedMessages(prev => ({ ...prev, ...updates }));
      }
    };
    decryptNew();

    prevMessagesRef.current = messages;
    return () => { mounted = false; };
  }, [messages]);

  const filteredMessages = activeFilter === 'all' ? messages : messages.filter(m => m.priority === activeFilter);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let currentDate = '';

    filteredMessages.forEach((msg) => {
      const msgDate = new Date(msg.timestamp).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      if (msgDate !== currentDate) {
        groups.push({ type: 'date', date: msgDate, id: `date-${msgDate}` });
        currentDate = msgDate;
      }
      groups.push({ type: 'message', ...msg });
    });

    return groups;
  }, [filteredMessages]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom || filteredMessages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeFilter]);

  const handleJumpToMessage = (id) => {
    const el = document.querySelector(`[data-msg-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('message-highlight');
      setTimeout(() => el.classList.remove('message-highlight'), 2000);
    }
    setIsSearchOpen(false);
  };

  const getAvatarColor = (name) => {
    const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `hsl(${hash * 7 % 360}, 65%, 55%)`;
  };

  return (
    <div className="chat-main">
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="room-avatar">#</div>
          <div className="room-info">
            <h2>{currentRoom}</h2>
            <span className="room-meta">
              {filteredMessages.length} message{filteredMessages.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="chat-header-right">
          <button className="header-btn" onClick={() => setIsSearchOpen(true)} title="Search">
            ⌕
          </button>
        </div>
      </div>

      <PriorityTabs
        messages={messages}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onOpenSearch={() => setIsSearchOpen(true)}
      />

      <div className="messages-container" ref={containerRef}>
        {filteredMessages.length === 0 ? (
          <motion.div
            className="empty-chat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
          >
            <div className="empty-icon">#</div>
            <h3>No messages yet</h3>
            <p>Be the first to say hello.</p>
          </motion.div>
        ) : (
          groupedMessages.map((item, index) => {
            if (item.type === 'date') {
              return (
                <div key={item.id} className="date-separator">
                  <span>{item.date}</span>
                </div>
              );
            }

            const msg = item;
            const isOwn = msg.nickname === user;
            const msgAvatarColor = getAvatarColor(msg.nickname);

            return (
              <motion.div
                key={msg.id}
                data-msg-id={msg.id}
                className={`message ${msg.priority || ''} ${isOwn ? 'own' : 'other'}`}
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  type: 'spring',
                  duration: 0.35,
                  bounce: 0.08
                }}
              >
                {!isOwn && (
                  <div className="msg-header">
                    <div className="msg-avatar" style={{ background: msgAvatarColor }}>
                      {msg.nickname?.[0]?.toUpperCase()}
                    </div>
                    <span className="msg-author">{msg.nickname}</span>
                    {msg.priority && (
                      <span className={`priority-badge priority-${msg.priority}`}>{msg.priority}</span>
                    )}
                  </div>
                )}
                <div className="msg-bubble">
                  {decryptedMessages[msg.id] ?? 'Decrypting...'}
                </div>
                <div className="msg-footer">
                  <span className="msg-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isOwn && (
                    <span className={`msg-status ${msg.status === 'delivered' ? 'delivered' : ''}`}>
                      {msg.status === 'delivered' ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            className="typing-indicator"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0.1 }}
          >
            <span className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            {typingUsers.join(', ')} typing...
          </motion.div>
        )}
      </AnimatePresence>

      <MessageInput currentRoom={currentRoom} nickname={user} />

      <AnimatePresence>
        {isSearchOpen && (
          <SearchBar
            messages={messages}
            decryptedMessages={decryptedMessages}
            onJumpToMessage={handleJumpToMessage}
            onClose={() => setIsSearchOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default ChatRoom;
