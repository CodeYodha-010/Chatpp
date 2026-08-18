import { useEffect, useState } from 'react';

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'Architecture', href: '#architecture' }
];

function Navbar({ onGetStarted }) {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(`#${e.target.id}`);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    LINKS.forEach((l) => {
      const el = document.getElementById(l.href.slice(1));
      if (el) observer.observe(el);
    });
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <header className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="lp-nav-inner">
        <a className="lp-brand" href="#top">
          <span className="lp-brand-icon">C</span>
          <span>Chat</span>
        </a>
        <nav className="lp-nav-links">
          {LINKS.map((l) => (
            <a
              key={l.label}
              className={`lp-nav-link ${active === l.href ? 'active' : ''}`}
              href={l.href}
            >
              {l.label}
            </a>
          ))}
          <a
            className="lp-nav-link"
            href="https://github.com/CodeYodha-010/Chatpp"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
        </nav>
        <div className="lp-nav-actions">
          <button className="lp-btn lp-btn-primary lp-btn-sm" onClick={onGetStarted}>
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;