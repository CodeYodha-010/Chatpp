import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';

function SearchBar({ messages, decryptedMessages, onJumpToMessage, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const lower = query.toLowerCase();
    const matched = messages.filter(m => {
      const text = (decryptedMessages?.[m.id] || m.message || '').toLowerCase();
      const author = (m.nickname || '').toLowerCase();
      return text.includes(lower) || author.includes(lower);
    }).slice(0, 20);
    setResults(matched);
    setActiveIndex(0);
  }, [query, messages, decryptedMessages]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIndex]) { e.preventDefault(); onJumpToMessage(results[activeIndex].id); }
  };

  return (
    <motion.div
      className="search-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="search-modal"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
      >
        <div className="search-bar-header">
          <span className="search-icon">⌕</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search messages..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="search-kbd">ESC</kbd>
          <button onClick={onClose} className="search-close-btn">✕</button>
        </div>
        {query && (
          <div className="search-results">
            {results.length === 0 ? (
              <div className="search-empty">
                <span style={{ fontSize: '28px', opacity: 0.5 }}>–</span>
                <p>No messages found</p>
              </div>
            ) : (
              results.map((msg, i) => (
                <motion.div
                  key={msg.id}
                  className={`search-result ${i === activeIndex ? 'active' : ''}`}
                  onClick={() => onJumpToMessage(msg.id)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.15 }}
                >
                  <div className="search-result-meta">
                    <span className="search-result-author">{msg.nickname}</span>
                    <span className="search-result-room">#{msg.room}</span>
                    <span className="search-result-time">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="search-result-text">
                    {highlightMatch(decryptedMessages?.[msg.id] || msg.message || '', query)}
                  </div>
                </motion.div>
              ))
            )}
            <div className="search-footer">
              <span>↑↓ to navigate</span>
              <span>↵ to select</span>
              <span>esc to close</span>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function highlightMatch(text, query) {
  if (!query) return text;
  const escaped = escapeRegex(query);
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part
  );
}
function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export default SearchBar;
