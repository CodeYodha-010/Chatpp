const STACK = ['React', 'Node.js', 'Express', 'Socket.IO', 'Prisma', 'PostgreSQL', 'AES-256-GCM', 'Web Crypto API', 'Groq AI', 'JWT', 'bcrypt', 'Helmet'];

function TrustBar() {
  const track = [...STACK, ...STACK];
  return (
    <section className="lp-trust" aria-hidden="true">
      <div className="lp-marquee">
        <div className="lp-marquee-track">
          {track.map((s, i) => (
            <span key={i} className="lp-marquee-item">
              {s}
              <span className="lp-marquee-sep">•</span>
            </span>
          ))}
        </div>
      </div>
      <p className="lp-trust-note">Self-hostable · Open source · No vendor lock-in</p>
    </section>
  );
}

export default TrustBar;