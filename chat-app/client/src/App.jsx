import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import socket from './socket';
import AuthPage from './components/AuthPage';
import ContinentalApp from './chat/ContinentalApp';
import { apiGet, apiPost } from './api';
async function refreshToken() {
  try {
    const data = await apiPost('/api/auth/refresh', {});
    sessionStorage.setItem('chat_token', data.token);
    return data.token;
  } catch {
    sessionStorage.removeItem('chat_token');
    return null;
  }
}
function Shell() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState('');
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const shouldEnter = urlParams.has('enter');
    const initAuth = async () => {
      let token = sessionStorage.getItem('chat_token');
      if (!token) { token = await refreshToken(); }
      if (token) {
        try {
          const data = await apiGet('/api/auth/me', token);
          setUser(data.user);
          setNickname(data.user.display_name || data.user.username);
          socket.auth = { token };
          socket.connect();
          socket.emit('user_join', { nickname: data.user.display_name || data.user.username });
          navigate('/app', { replace: true });
        } catch { sessionStorage.removeItem('chat_token'); }
      } else if (shouldEnter) {
        navigate('/auth?enter=1', { replace: true });
      } else {
        window.location.href = '/landing.html';
        return;
      }
      setLoading(false);
    };
    initAuth();
  // Auth bootstrap runs once on mount. `navigate` is deliberately absent from the
  // dependency array: react-router rebuilds it on every navigation (its useCallback
  // deps include `locationPathname`), so listing it would re-run the /api/auth/me +
  // user_join bootstrap on every route change — and this effect itself calls
  // navigate(), which would keep retriggering it.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let n = 0;
    const onErr = (err) => {
      n++;
      if (err.message === 'Authentication required' || err.message.includes('token')) {
        refreshToken().then((t) => {
          if (t) { socket.auth = { token: t }; socket.connect(); n = 0; }
          else { sessionStorage.removeItem('chat_token'); navigate('/auth', { replace: true }); }
        });
      }
      if (n >= 5) { socket.disconnect(); navigate('/auth', { replace: true }); }
    };
    socket.on('connect_error', onErr);
    // Named handler + off(event, fn): a bare socket.off('error') here would
    // also remove ContinentalApp's banner listener (ContinentalApp.jsx) on
    // every navigation, since this effect re-runs whenever `navigate` changes.
    const onSockErr = (e) => console.error('Socket error:', e.message);
    socket.on('error', onSockErr);
    return () => {
      socket.off('connect_error', onErr);
      socket.off('error', onSockErr);
    };
  }, [navigate]);
  const ok = (u, token) => {
    setUser(u);
    setNickname(u.display_name || u.username);
    socket.auth = { token };
    socket.connect();
    socket.emit('user_join', { nickname: u.display_name || u.username });
    navigate('/app', { replace: true });
  };
  const out = async () => {
    try {
      const t = sessionStorage.getItem('chat_token');
      if (t) await apiPost('/api/auth/logout', {}, t);
    } catch { /* logout is best-effort — the local session is cleared below regardless */ }
    sessionStorage.removeItem('chat_token');
    setUser(null); setNickname('');
    socket.disconnect();
    window.location.href = '/landing.html';
  };
  if (loading) {
    return (
      <div className="chat-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }
  const authed = !!sessionStorage.getItem('chat_token');
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage onAuthSuccess={ok} />} />
      <Route path="/app" element={authed ? <ContinentalApp user={user} nickname={nickname} onLogout={out} /> : <Navigate to="/auth" replace />} />
      <Route path="/app/c/:roomId" element={authed ? <ContinentalApp user={user} nickname={nickname} onLogout={out} /> : <Navigate to="/auth" replace />} />
      <Route path="*" element={<Navigate to={authed ? '/app' : '/auth'} replace />} />
    </Routes>
  );
}
function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
export default App;
