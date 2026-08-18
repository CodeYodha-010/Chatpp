import Reveal from './Reveal';

const QUOTES = [
  { name: 'Alex Rivera', role: 'Founder · Northwind', initials: 'AR', text: 'We spun up secure team chat on our own VPS in an afternoon. Encrypted, fast, no SaaS bill.', color: '#6366f1' },
  { name: 'Priya Nair', role: 'DevRel · Chroma Labs', initials: 'PN', text: 'The AI priority classification actually works — urgent messages float to the top of every room.', color: '#8b5cf6' },
  { name: 'Sam Keller', role: 'Engineering Lead · Bluepeak', initials: 'SK', text: 'Clean codebase, real encryption, honest auth. Exactly what I look for in a self-hosted tool.', color: '#06b6d4' }
];

function Testimonials() {
  return (
    <section className="lp-section" id="testimonials">
      <Reveal>
        <span className="lp-kicker">Loved by teams</span>
        <h2 className="lp-sec-title">Trusted where privacy matters.</h2>
      </Reveal>
      <div className="lp-quotes">
        {QUOTES.map((q, i) => (
          <Reveal key={q.name} delay={i * 0.08} className="lp-quote">
            <p className="lp-quote-text">“{q.text}”</p>
            <span className="lp-quote-note">Sample testimonial — replace with real users</span>
            <div className="lp-quote-person">
              <div className="lp-quote-avatar" style={{ background: q.color }}>{q.initials}</div>
              <div>
                <div className="lp-quote-name">{q.name}</div>
                <div className="lp-quote-role">{q.role}</div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export default Testimonials;