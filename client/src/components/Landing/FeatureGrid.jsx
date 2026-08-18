import Reveal from './Reveal';

const FEATURES = [
  { icon: '🔒', title: 'AES-256-GCM encryption', text: 'Every message is encrypted with a unique 96-bit IV and an authentication tag, decrypted only in the browser via the Web Crypto API.', span: 'wide' },
  { icon: '⚡', title: 'Real-time delivery', text: 'Socket.IO rooms push messages the instant they are sent — with typing indicators and delivered ticks.' },
  { icon: '🤖', title: 'AI priority sorting', text: 'Groq LLM classifies every message as urgent, fyi, or social — automatically.' },
  { icon: '⌘K', title: 'Instant search', text: 'Cmd+K overlay with keyboard navigation and match highlighting.' },
  { icon: '🟢', title: 'Live presence', text: 'Online user list with real-time green-dot status.' },
  { icon: '🛡️', title: 'Hardened by default', text: 'JWT auth, bcrypt hashing, Helmet headers, Joi validation, 3-tier rate limiting and audit logging.', span: 'wide' }
];

function FeatureGrid() {
  return (
    <section className="lp-section" id="features">
      <Reveal>
        <span className="lp-kicker">Features</span>
        <h2 className="lp-sec-title">Everything a team chat needs.</h2>
        <p className="lp-sec-sub">No bloat. No lock-in. Just fast, secure, focused messaging.</p>
      </Reveal>
      <div className="lp-bento">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 0.07} className={`lp-card ${f.span === 'wide' ? 'lp-card-wide' : ''}`}>
            <div className="lp-card-icon">{f.icon}</div>
            <h3 className="lp-card-title">{f.title}</h3>
            <p className="lp-card-text">{f.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default FeatureGrid;