import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { EMOJI_CATEGORIES } from './emoji-data';

function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState(EMOJI_CATEGORIES[0].id);
  const pickerRef = useRef(null);
  const current = EMOJI_CATEGORIES.find((cat) => cat.id === activeCategory) || EMOJI_CATEGORIES[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={pickerRef}
      className="emoji-picker"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: 'spring', duration: 0.28, bounce: 0.15 }}
    >
      <div className="emoji-picker-categories">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`emoji-cat-btn ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
            title={cat.label}
            aria-label={cat.label}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div className="emoji-picker-grid">
        {current.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-btn"
            onClick={() => onSelect(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

export default EmojiPicker;