import Reveal from './Reveal';

const ITEMS = [
  { icon: '🔐', title: 'AES-256-GCM', text: 'Unique IV + auth tag per message; decrypted client-side.' },
  { icon: '🪪', title: 'JWT auth', text: 'Signed access tokens with bcrypt-hashed credentials.' },
  { icon: '🛡️', title: 'Helmet headers', text: 'Secure HTTP response headers by default.' },
  { icon: '🚧', title: '3-tier rate limiting', text: 'General, auth, and strict lanes against abuse.' },
  { icon: '🧾', title: 'Audit logging', text: 'Register, login, and logout events tracked with IP.' },
  { icon: '🗄️', title: 'PostgreSQL', text: 'Persistent relational storage via the Prisma ORM.' }
];

function Security() {
  return (
    <section className="lp-security" id="security">
      <div className="lp-sec-inner">
        <Reveal>
          <span className="lp-kicker">Security</span>
          <h2 className="lp-sec-title">Security isn’t a feature. It’s the foundation.</h2>
          <p className="lp-sec-sub">From passwords to packets, every layer is designed with least privilege in mind.</p>
        </Reveal>
        <div className="lp-sec-grid">
          {ITEMS.map((it, i) => (
            <Reveal key={it.title} delay={i * 0.05} className="lp-sec-item">
              <span className="lp-sec-icon">{it.icon}</span>
              <div>
                <h4>{it.title}</h4>
                <p>{it.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Security;