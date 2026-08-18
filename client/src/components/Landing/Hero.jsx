import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useScroll, useTransform } from 'motion/react';
import Reveal from './Reveal';

const SCRIPT = [
  { name: 'ava', text: 'Deploy pushed to staging ✅', priority: 'fyi', color: '#f59e0b' },
  { name: 'ren', text: 'Server is down! Can anyone check?', priority: 'urgent', color: '#ef4444' },
  { name: 'leo', text: 'good morning team ☀️', priority: 'social', color: '#22c55e' },
  { name: 'ava', text: 'rolling back autoscaler config', priority: 'fyi', color: '#f59e0b' },
  { name: 'mia', text: 'lol that demo was a hit 🎉', priority: 'social', color: '#22c55e' }
];

function ChatPreview() {
  const [items, setItems] = useState([]);
  const [typing, setTyping] = useState(false);
  const [classifying, setClassifying] = useState(true);
  const idx = useRef(0);

  useEffect(() => {
    let alive = true;
    let t0, t1, t2;
    const pushNext = () => {
      if (!alive) return;
      setTyping(true);
      setClassifying(true);
      t1 = setTimeout(() => {
        if (!alive) return;
        const m = { ...SCRIPT[idx.current % SCRIPT.length], uid: `${idx.current}-${Date.now()}` };
        idx.current += 1;
        setItems((prev) => [...prev.slice(-4), m]);
        setTyping(false);
        t2 = setTimeout(() => {
          if (!alive) return;
          setClassifying(false);
          pushNext();
        }, 1500);
      }, 900);
    };
    t0 = setTimeout(pushNext, 500);
    return () => { alive = false; clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="lp-preview">
      <div className="lp-preview-bar">
        <div className="lp-preview-dots"><span /><span /><span /></div>
        <span className="lp-preview-title"># general</span>
        <span className="lp-preview-live"><span className="lp-pulse-dot" />live</span>
      </div>
      <div className="lp-preview-body">
        <AnimatePresence initial={false}>
          {items.map((m) => (
            <motion.div key={m.uid} className="lp-msg"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', duration: 0.45, bounce: 0.12 }}>
              <div className="lp-msg-avatar" style={{ background: m.color }}>{m.name[0].toUpperCase()}</div>
              <div className="lp-msg-main">
                <div className="lp-msg-meta">
                  <span className="lp-msg-name">{m.name}</span>
                  <span className="lp-msg-lock" title="AES-256-GCM encrypted">🔒</span>
                  <span className={`lp-priority lp-priority-${m.priority}`}>{m.priority}</span>
                </div>
                <div className="lp-msg-text">{m.text}</div>
                <span className="lp-msg-ticks">✓✓</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {typing && (
          <motion.div className="lp-typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <span className="lp-typing-dots"><span /><span /><span /></span>
            typing…
          </motion.div>
        )}
      </div>
      {classifying && (
        <motion.div className="lp-classify" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <span className="lp-classify-spark">✦</span> AI classifying priority…
        </motion.div>
      )}
    </div>
  );
}

function StatCounter({ value, suffix }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 1200;
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      setN(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);
  return <span ref={ref} className="lp-stat-value">{n}{suffix}</span>;
}

const STATS = [
  { value: 256, suffix: ' bit', label: 'AES-256-GCM encryption' },
  { value: 40, suffix: ' ms', label: 'median message delivery' },
  { value: 3, suffix: '', label: 'AI priority levels' }
];

function Hero({ onGetStarted }) {
  const { scrollY } = useScroll();
  const glowY = useTransform(scrollY, [0, 700], [0, 140]);
  const previewY = useTransform(scrollY, [0, 700], [0, 42]);

  return (
    <section className="lp-hero">
      <motion.div className="lp-hero-glow" style={{ y: glowY }} />
      <div className="lp-hero-inner">
        <Reveal>
          <span className="lp-eyebrow"><span className="lp-eyebrow-dot" /> Encrypted · Real-time · AI-sorted</span>
          <h1 className="lp-hero-title">Encrypted real-time chat<br /><span className="lp-hero-gradient">for modern teams.</span></h1>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="lp-hero-sub">AES-256-GCM encrypted messaging with instant Socket.IO delivery and Groq-powered priority sorting — self-hostable, developer-first, no vendor lock-in.</p>
        </Reveal>
        <Reveal delay={0.16}>
          <div className="lp-hero-actions">
            <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onGetStarted}>Start Chatting →</button>
            <a className="lp-btn lp-btn-ghost lp-btn-lg" href="https://github.com/CodeYodha-010/Chatpp" target="_blank" rel="noreferrer">View on GitHub</a>
          </div>
        </Reveal>
        <Reveal delay={0.22} className="lp-stats-row">
          {STATS.map((s) => (
            <div className="lp-stat" key={s.label}>
              <StatCounter value={s.value} suffix={s.suffix} />
              <span className="lp-stat-label">{s.label}</span>
            </div>
          ))}
        </Reveal>
        <motion.div className="lp-hero-preview-wrap" style={{ y: previewY }}>
          <div className="lp-preview-frame-glow" />
          <ChatPreview />
        </motion.div>
      </div>
    </section>
  );
}

export default Hero;