import { useState } from 'react';

function Login({ onJoin }) {
  const [nickname, setNickname] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (nickname.trim()) {
      onJoin(nickname.trim());
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>💬 Real-Time Chat</h1>
        <p>Enter your nickname to join the chat</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Your nickname..."
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <button type="submit" disabled={!nickname.trim()}>
            Join Chat
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;