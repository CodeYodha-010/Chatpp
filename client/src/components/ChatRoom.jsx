import MessageList from './MessageList';
import MessageInput from './MessageInput';

function ChatRoom({ currentRoom, messages, nickname, typingUsers }) {
  return (
    <div className="chat-main">
      <div className="chat-header">
        <h2><span className="room-hash">#</span>{currentRoom}</h2>
      </div>
      <MessageList messages={messages} nickname={nickname} />
      <div className="typing-indicator">
        {typingUsers.length > 0 && (
          <span>{typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</span>
        )}
      </div>
      <MessageInput currentRoom={currentRoom} nickname={nickname} />
    </div>
  );
}

export default ChatRoom;