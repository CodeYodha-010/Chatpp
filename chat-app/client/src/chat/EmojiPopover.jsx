import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function EmojiPopover({ dark, onSelect, onClose }) {
  const root = useRef(null);
  const [Picker, setPicker] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    // `error` is reset by the retry button instead of here, so this effect never
    // sets state synchronously (react-hooks/set-state-in-effect).
    import('emoji-picker-react').then((module) => {
      if (active) setPicker(() => module.default);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    root.current?.focus();
  }, []);
  useEffect(() => {
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !event.target.closest('[data-emoji-trigger]')) onClose(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);
  return (
    <section ref={root} className="ct-emoji-pop" id="ct-emoji-picker" role="dialog" aria-label="Choose an emoji" tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(true); }
      }}>
      <div className="ct-emoji-head"><strong>Pick an emoji</strong>
        <button type="button" className="ct-ib" aria-label="Close emoji picker" onClick={() => onClose(true)}><X size={16} /></button>
      </div>
      {error ? <div className="ct-emoji-status" role="alert">Could not load emojis. <button type="button" className="ct-link" onClick={() => { setError(false); setAttempt((n) => n + 1); }}>Try again</button></div>
        : Picker ? <Picker theme={dark ? 'dark' : 'light'} emojiStyle="native" width="100%" height={340}
          previewConfig={{ showPreview: false }} onEmojiClick={(data) => onSelect(data.emoji)} />
          : <div className="ct-emoji-status" role="status">Loading emojis…</div>}
    </section>
  );
}
