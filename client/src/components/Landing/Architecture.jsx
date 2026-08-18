import Reveal from './Reveal';

const FLOW = ['React Client', 'Socket.IO', 'Express', 'Prisma', 'PostgreSQL'];

function Architecture() {
  return (
    <section className="lp-section" id="architecture">
      <Reveal>
        <span className="lp-kicker">For developers</span>
        <h2 className="lp-sec-title">Self-host in minutes.</h2>
      </Reveal>
      <div className="lp-arch-grid">
        <Reveal className="lp-terminal">
          <div className="lp-terminal-bar">
            <span className="lp-terminal-dot red" />
            <span className="lp-terminal-dot yellow" />
            <span className="lp-terminal-dot green" />
            <span className="lp-terminal-title">bash — deploy</span>
          </div>
          <pre className="lp-terminal-code">
            <code>{`git clone https://github.com/CodeYodha-010/Chatpp
cd server  && npm install && npm start
cd ../client && npm run dev`}<span className="lp-cursor" /></code>
          </pre>
        </Reveal>
        <Reveal delay={0.08}>
          <div className="lp-flow">
            {FLOW.map((s, i) => (
              <div className="lp-flow-step" key={s}>
                <span className="lp-flow-box">{s}</span>
                {i < FLOW.length - 1 && <span className="lp-flow-arrow">→</span>}
              </div>
            ))}
          </div>
          <p className="lp-flow-note">Bring your own Groq API key for AI sorting — core chat runs on zero paid services.</p>
        </Reveal>
      </div>
    </section>
  );
}

export default Architecture;