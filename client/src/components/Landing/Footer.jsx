function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <span className="lp-brand-icon">C</span>
          <span>Chat</span>
        </div>
        <div className="lp-footer-links">
          <a href="#features">Features</a>
          <a href="#security">Security</a>
          <a href="#architecture">Architecture</a>
          <a href="https://github.com/CodeYodha-010/Chatpp" target="_blank" rel="noreferrer">GitHub</a>
        </div>
        <span className="lp-footer-copy">© {new Date().getFullYear()} ChatApp · MIT</span>
      </div>
    </footer>
  );
}

export default Footer;