import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { apiPost } from '../api';

function AuthPage({ onAuthSuccess }) {
  const [view, setView] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get('email');
    if (prefill) {
      setForm(prev => ({ ...prev, email: prefill }));
      setView('login');
    }
  }, []);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = view === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = view === 'login'
        ? { email: form.email, password: form.password }
        : { username: form.username, email: form.email, password: form.password, display_name: form.display_name || undefined };

      const data = await apiPost(endpoint, body);
      localStorage.setItem('chat_token', data.token);
      if (data.refreshToken) localStorage.setItem('chat_refresh_token', data.refreshToken);
      onAuthSuccess(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleView = () => {
    setView(prev => prev === 'login' ? 'signup' : 'login');
    setError('');
  };

  return (
    <div className="auth-page">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', duration: 0.5, bounce: 0.15 }}
      >
        <span className="auth-logo">Chat</span>
        <h1>{view === 'login' ? 'Welcome back' : 'Create account'}</h1>
        <p className="auth-subtitle">
          {view === 'login'
            ? 'Sign in to continue to your workspace.'
            : 'Start a new account in seconds.'}
        </p>

        <form onSubmit={handleSubmit}>
          {view === 'signup' && (
            <>
              <div className="input-group">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  placeholder="johndoe"
                  value={form.username}
                  onChange={handleChange}
                  maxLength={30}
                  minLength={3}
                  pattern="[a-zA-Z0-9_]+"
                  required
                />
              </div>
              <div className="input-group">
                <label>Display name</label>
                <input
                  type="text"
                  name="display_name"
                  placeholder="How others see you"
                  value={form.display_name}
                  onChange={handleChange}
                  maxLength={50}
                />
              </div>
            </>
          )}

          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Min 6 characters"
                value={form.password}
                onChange={handleChange}
                minLength={6}
                maxLength={100}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '●' : '○'}
              </button>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <motion.button
            type="submit"
            className="auth-btn"
            disabled={loading}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Please wait...
              </>
            ) : view === 'login' ? 'Sign in' : 'Create account'}
          </motion.button>
        </form>

        <p className="auth-toggle" onClick={toggleView}>
          {view === 'login'
            ? <>Don't have an account? <span>Sign up</span></>
            : <>Already have an account? <span>Sign in</span></>}
        </p>
      </motion.div>
    </div>
  );
}

export default AuthPage;
