import { useEffect, useRef } from 'react';

function MessageList({ messages, nickname }) {
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (isNearBottom || messages.length <= 1) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="message-list" ref={containerRef}>
      {messages.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 }}>
          No messages yet. Start the conversation!
        </div>
      )}
      {messages.map((msg) => {
        const isOwn = msg.nickname === nickname;
        return (
          <div key={msg.id} className={`message ${isOwn ? 'own' : 'other'}`}>
            {!isOwn && <div className="message-author">{msg.nickname}</div>}
            <div className="message-bubble">{msg.message}</div>
            <div className="message-meta">
              <span className="message-time">{formatTime(msg.timestamp)}</span>
              {isOwn && (
                <span className={`message-status ${msg.status === 'delivered' ? 'delivered' : 'sent'}`}>
                  {msg.status === 'delivered' ? '✓✓' : '✓'}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

export default MessageList;