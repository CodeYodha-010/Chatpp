import Reveal from './Reveal';

function CTA({ onGetStarted }) {
  return (
    <section className="lp-cta">
      <Reveal className="lp-cta-card">
        <h2>Ready to deploy secure chat?</h2>
        <p>Self-host in minutes. Full control. No third-party dependencies.</p>
        <div className="lp-cta-actions">
          <button className="lp-btn lp-btn-primary lp-btn-lg" onClick={onGetStarted}>
            Start Chatting →
          </button>
          <a className="lp-btn lp-btn-ghost lp-btn-lg" href="https://github.com/CodeYodha-010/Chatpp" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </div>
      </Reveal>
    </section>
  );
}

export default CTA;