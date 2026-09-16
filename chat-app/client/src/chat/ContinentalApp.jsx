import { useState, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import socket from '../socket';
import { apiGet, apiPost } from '../api';
import { getAvatarColor } from '../utils/avatar';
import { Inbox, MessageSquare, Users, Bell, Settings } from 'lucide-react';
import { Moon, Sun, Search, Video, MoreHorizontal } from 'lucide-react';
import { Plus, X, Send, Paperclip, Smile } from 'lucide-react';
import { ChevronLeft, LogOut, CheckCheck, UserPlus } from 'lucide-react';
import { Mail, MapPin, Clock, Monitor, VolumeX, Archive } from 'lucide-react';
import './continental.css';
function ini(n) {
  return String(n || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function Av({ name, size, online }) {
  return (
    <span className="ct-avw" style={{ width: size, height: size }}>
      <span className="ct-av" style={{ width: size, height: size, fontSize: '0.36em', background: getAvatarColor(name) }}>{ini(name)}</span>
      {online !== undefined && <span className={online ? 'ct-on' : 'ct-off'} />}
    </span>
  );
}
function IB({ label, active, onClick, children }) {
  return (
    <button type="button" className={'ct-ib' + (active ? ' on' : '')} aria-label={label} title={label} onClick={onClick}>{children}</button>
  );
}
function ft(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function relTime(ts) {
  if (!ts) return 'never';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}
function fp(msg) {
  if (!msg) return 'No messages yet';
  const t = (msg.nickname ? msg.nickname + ': ' : '') + (msg.content || msg.message || '');
  return t.length > 42 ? t.slice(0, 42) + '...' : t;
}
const EM = ['😀', '😂', '❤️', '👍', '🎉', '🔥', '✨', '🙌', '😊', '👀', '🚀', '⭐'];
const M = memo(function M({ msg, prev, nickname }) {
  const own = msg.nickname === nickname;
  const grp = prev && prev.nickname === msg.nickname && (msg.timestamp - prev.timestamp) < 300000;
  return (
    <div className={'ct-m' + (own ? ' own' : '') + (grp ? ' grp' : '')}>
      {!grp && !own && (
        <div className="ct-mh"><span className="ct-ma">{msg.nickname}</span><span className="ct-mt">{ft(msg.timestamp)}</span></div>
      )}
      <div className="ct-b">
        <span>{msg.content || msg.message || ''}</span>
        {own && <span className="ct-r"><CheckCheck size={13} /></span>}
      </div>
    </div>
  );
});
const NAV = [
  { id: 'inbox', label: 'Inbox', Ic: Inbox },
  { id: 'dm', label: 'Direct messages', Ic: MessageSquare },
  { id: 'people', label: 'People', Ic: Users },
  { id: 'notify', label: 'Notifications', Ic: Bell },
  { id: 'settings', label: 'Settings', Ic: Settings },
];
export default function ContinentalApp({ user, nickname, onLogout }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [pplSearch, setPplSearch] = useState('');
  const [panel, setPanel] = useState(null);
  const [section, setSection] = useState('inbox');
  const [composer, setComposer] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [dark, setDark] = useState(true);
  const [compact, setCompact] = useState(false);
  const [mobileList, setMobileList] = useState(true);
  const [muted, setMuted] = useState(false);
  const [notif, setNotif] = useState([]);
  const [selUser, setSelUser] = useState(null);
  const listRef = useRef(null);
  const endRef = useRef(null);
  const typingRef = useRef(null);
  const onlineNames = new Set(onlineUsers.map((u) => u.nickname));
  const currentRoom = roomId ? decodeURIComponent(roomId) : 'general';
  const displayName = nickname || user?.display_name || user?.username || 'You';
  const myEmail = user?.email || '';
  useEffect(() => {
    socket.on('online_users', setOnlineUsers);
    socket.on('room_list', (l) => setRooms(Array.isArray(l) ? l : []));
    socket.on('room_created', (d) => { if (d?.room) setRooms((p) => (p.includes(d.room) ? p : [...p, d.room])); });
    socket.on('room_joined', (d) => { setMessages(d.messages || []); setTypingUsers([]); });
    socket.on('new_message', (m) => {
      setMessages((p) => [...p, m]);
      if (m.nickname !== nickname) setNotif((p) => [{ id: m.id || Date.now(), from: m.nickname, text: m.content || m.message || '', ts: m.timestamp || Date.now(), read: false }, ...p].slice(0, 20));
    });
    socket.on('new_messages_batch', (b) => setMessages((p) => [...p, ...(b || [])]));
    socket.on('message_delivered', (d) => { setMessages((p) => p.map((m) => (m.id === d.id ? { ...m, status: 'delivered' } : m))); });
    socket.on('user_typing', (d) => {
      if (d?.nickname && d.nickname !== nickname) setTypingUsers((p) => (p.includes(d.nickname) ? p : [...p, d.nickname]));
    });
    socket.on('user_stop_typing', (d) => { setTypingUsers((p) => p.filter((n) => n !== d?.nickname)); });
    socket.on('user_joined', (d) => {
      if (d?.nickname) setNotif((p) => [{ id: 'j' + Date.now(), from: d.nickname, text: 'came online', ts: Date.now(), read: false }, ...p].slice(0, 20));
    });
    return () => {
      socket.off('online_users'); socket.off('room_list'); socket.off('room_created');
      socket.off('room_joined'); socket.off('new_message'); socket.off('new_messages_batch');
      socket.off('message_delivered'); socket.off('user_typing'); socket.off('user_stop_typing');
      socket.off('user_joined');
    };
  }, [nickname]);
  useEffect(() => {
    setMessages([]); setMobileList(false);
    socket.emit('join_room', { room: currentRoom });
  }, [currentRoom]);
  useEffect(() => {
    const t = sessionStorage.getItem('chat_token');
    if (!t) return;
    apiGet('/api/users', t).then((d) => setAllUsers(d.users || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const c = listRef.current;
    if (!c) return;
    const near = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (near || messages.length <= 1) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setPanel(null); setSelUser(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const openRoom = (r) => navigate('/app/c/' + encodeURIComponent(r));
  const createRoom = () => {
    const name = newRoomName.trim();
    if (!name) return;
    socket.emit('create_room', { room: name });
    socket.emit('join_room', { room: name });
    setNewRoomName(''); setShowNewRoom(false);
    navigate('/app/c/' + encodeURIComponent(name));
  };
  const inviteFriend = async () => {
    const username = window.prompt('Enter the username of the friend you want to invite:');
    if (!username) return;
    const token = sessionStorage.getItem('chat_token');
    if (!token) return;
    try {
      const data = await apiPost('/api/invite', { username }, token);
      if (data.room) openRoom(data.room);
      window.alert(data.message || 'Invite sent!');
    } catch (err) { window.alert(err.message || 'Failed to send invite.'); }
  };
  const notifyTyping = () => {
    socket.emit('typing', { room: currentRoom, nickname });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => socket.emit('stop_typing', { room: currentRoom, nickname }), 2000);
  };
  const send = () => {
    const text = composer.trim();
    if (!text) return;
    socket.emit('send_message', { room: currentRoom, message: text, nickname });
    setComposer(''); setShowEmoji(false);
    clearTimeout(typingRef.current);
    socket.emit('stop_typing', { room: currentRoom, nickname });
  };
  const q = search.trim().toLowerCase();
  const filtered = rooms.filter((r) => !q || r.toLowerCase().includes(q));
  const unreadNotif = notif.filter((n) => !n.read).length;
  const pq = pplSearch.trim().toLowerCase();
  const shownUsers = allUsers.filter((u) => !pq || (u.username || '').toLowerCase().includes(pq) || (u.displayName || '').toLowerCase().includes(pq));
  const nameOf = (u) => u.displayName || u.username;
  const isOnlineU = (u) => onlineNames.has(nameOf(u)) || onlineNames.has(u.username);
  return (
    <div className={'ct-shell' + (compact ? ' compact' : '')}>
      <nav className="ct-rail" aria-label="Primary">
        <div className="ct-logo" title="Continental" aria-label="Continental home">C</div>
        <div className="ct-rail-group">
          {NAV.map(({ id, label, Ic }) => (
            <IB key={id} label={label} active={section === id}
              onClick={() => { setSection(id); setPanel(id === 'inbox' || id === 'dm' ? null : id); }}>
              <Ic size={19} strokeWidth={1.8} />
              {id === 'notify' && unreadNotif > 0 && <span className="ct-nb">{unreadNotif > 9 ? '9+' : unreadNotif}</span>}
            </IB>
          ))}
        </div>
        <div className="ct-rail-bottom">
          <IB label={dark ? 'Light theme' : 'Dark theme'} onClick={() => setDark((d) => !d)}>
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </IB>
          <button type="button" className="ct-railav" aria-label="Open profile" onClick={() => { setSelUser(null); setPanel('profile'); }}>
            <Av name={displayName} size={34} />
          </button>
        </div>
      </nav>
      <aside className={'ct-side' + (mobileList ? ' mob' : '')} aria-label="Conversations">
        <div className="ct-ws"><span className="ct-wsdot" /><strong>Continental</strong><span className="ct-wssub">{onlineUsers.length} online</span></div>
        <div className="ct-sh"><h2>Conversations</h2>
          <IB label="New conversation" onClick={() => setShowNewRoom((v) => !v)}><Plus size={17} /></IB>
        </div>
        {showNewRoom && (
          <div className="ct-nr">
            <input type="text" placeholder="Room name…" value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createRoom()} autoFocus aria-label="New room name" />
            <button type="button" className="ct-btn" onClick={createRoom}>Add</button>
          </div>
        )}
        <label className="ct-srch"><Search size={15} />
          <input type="search" placeholder="Search conversations" value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label="Search conversations" />
        </label>
        <ul className="ct-rooms">
          {filtered.length === 0 && <li className="ct-empty">No conversations yet</li>}
          {filtered.map((room) => (
            <li key={room}>
              <Link to={'/app/c/' + encodeURIComponent(room)} className={'ct-room' + (room === currentRoom ? ' on' : '')}>
                <Av name={room} size={38} online={onlineNames.has(room)} />
                <span className="ct-rm"><strong>{room}</strong>
                  <small>{room === currentRoom ? fp(messages[messages.length - 1]) : room}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="ct-sf">
          <button type="button" className="ct-ghost" onClick={inviteFriend}><UserPlus size={15} /> Invite</button>
          <button type="button" className="ct-ghost danger" onClick={onLogout}><LogOut size={15} /> Logout</button>
        </div>
      </aside>
      <main className="ct-main">
        <header className="ct-head">
          <button type="button" className="ct-back" aria-label="Back" onClick={() => setMobileList(true)}><ChevronLeft size={19} /></button>
          <Av name={currentRoom} size={38} online={onlineNames.has(currentRoom)} />
          <div className="ct-hi"><h1>{currentRoom}</h1>
            <span className="ct-st">{onlineNames.has(currentRoom) ? 'Online' : messages.length + ' messages'}</span>
          </div>
          <div className="ct-ha">
            <IB label="Search"><Search size={17} /></IB>
            <IB label="Video call"><Video size={17} /></IB>
            <IB label="More"><MoreHorizontal size={17} /></IB>
          </div>
        </header>
        <div className="ct-list" ref={listRef} role="log" aria-label="Messages" aria-live="polite">
          {messages.length === 0 ? (
            <div className="ct-emptychat"><div className="ct-ei">✦</div><h3>Start the conversation</h3><p>Be the first to say something in #{currentRoom}</p></div>
          ) : messages.map((m, i) => (
            <M key={m.id || i} msg={m} prev={i > 0 ? messages[i - 1] : null} nickname={nickname} />
          ))}
          <div ref={endRef} />
        </div>
        {typingUsers.length > 0 && !muted && (
          <div className="ct-typing"><span className="ct-dots"><span /><span /><span /></span>{typingUsers.join(', ')} typing</div>
        )}
        <div className="ct-comp">
          <div className="ct-cbox">
            <IB label="Attach"><Paperclip size={17} /></IB>
            <textarea rows={1} placeholder={'Message #' + currentRoom} value={composer} aria-label="Message"
              onChange={(e) => { setComposer(e.target.value); notifyTyping(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <IB label="Emoji" active={showEmoji} onClick={() => setShowEmoji((v) => !v)}><Smile size={17} /></IB>
            <button type="button" className="ct-send" aria-label="Send" disabled={!composer.trim()} onClick={send}><Send size={16} /></button>
          </div>
          {showEmoji && (
            <div className="ct-emo" role="toolbar" aria-label="Emoji">
              {EM.map((e) => (
                <button key={e} type="button" onClick={() => setComposer((c) => (c + e).slice(0, 500))}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </main>
      {panel && (
        <div className="ct-bd" onClick={() => { setPanel(null); setSelUser(null); }}>
          <aside className="ct-dr" role="dialog" aria-modal="true" aria-label={panel} onClick={(e) => e.stopPropagation()}>
            <div className="ct-ph"><h2>{panel === 'notify' ? 'Notifications' : panel.charAt(0).toUpperCase() + panel.slice(1)}</h2>
              <IB label={'Close ' + panel} onClick={() => { setPanel(null); setSelUser(null); }}><X size={16} /></IB>
            </div>
            {panel === 'profile' && !selUser && (
              <div className="ct-prof">
                <Av name={displayName} size={76} />
                <span className="ct-pill on"><span className="ct-dot" />Online</span>
                <h3>{displayName}</h3>
                <p className="ct-muted">@{user?.username || 'you'}</p>
                <p className="ct-email"><Mail size={13} /> {myEmail || 'No email on file'}</p>
                <div className="ct-facts">
                  <div><span><MapPin size={13} /> Location</span><b>—</b></div>
                  <div><span><Clock size={13} /> Time zone</span><b>—</b></div>
                  <div><span><Monitor size={13} /> Status</span><b>Online</b></div>
                </div>
                <div className="ct-stats">
                  <div><b>{rooms.length}</b><span>Rooms</span></div>
                  <div><b>{onlineUsers.length}</b><span>Online</span></div>
                  <div><b>{messages.length}</b><span>Messages</span></div>
                </div>
                <button type="button" className="ct-btn wide" onClick={() => setPanel('settings')}>Edit profile</button>
                <button type="button" className="ct-ghost danger wide" onClick={onLogout}><LogOut size={15} /> Sign out</button>
              </div>
            )}
            {panel === 'profile' && selUser && (
              <div className="ct-prof">
                <Av name={nameOf(selUser)} size={76} online={isOnlineU(selUser)} />
                <span className={'ct-pill' + (isOnlineU(selUser) ? ' on' : '')}><span className="ct-dot" />{isOnlineU(selUser) ? 'Online' : 'Offline'}</span>
                <h3>{nameOf(selUser)}</h3>
                <p className="ct-muted">@{selUser.username}</p>
                <p className="ct-email"><Mail size={13} /> {selUser.email || 'No email on file'}</p>
                <div className="ct-facts">
                  <div><span><Clock size={13} /> Last active</span><b>{isOnlineU(selUser) ? 'Now' : relTime(selUser.lastLoginAt ? new Date(selUser.lastLoginAt).getTime() : 0)}</b></div>
                  <div><span><Monitor size={13} /> Status</span><b>{isOnlineU(selUser) ? 'Online' : 'Offline'}</b></div>
                </div>
                <button type="button" className="ct-btn wide" onClick={() => { setPanel(null); setSelUser(null); }}>Message</button>
                <button type="button" className="ct-ghost wide" onClick={() => { setPanel(null); setSelUser(null); }}>Back to people</button>
              </div>
            )}
            {panel === 'settings' && (
              <div className="ct-set">
                <div className="ct-acct">
                  <Av name={displayName} size={44} />
                  <div><b>{displayName}</b><small><Mail size={12} /> {myEmail || 'No email on file'}</small></div>
                </div>
                <h3>Appearance</h3>
                <div className="ct-seg" role="radiogroup" aria-label="Theme">
                  <button type="button" role="radio" aria-checked={dark} className={dark ? 'on' : ''} onClick={() => setDark(true)}>Dark</button>
                  <button type="button" role="radio" aria-checked={!dark} className={!dark ? 'on' : ''} onClick={() => setDark(false)}>Light</button>
                </div>
                <label className="ct-toggle"><span>Compact mode</span>
                  <button type="button" role="switch" aria-checked={compact} className={'ct-sw' + (compact ? ' on' : '')} onClick={() => setCompact((c) => !c)}><span /></button>
                </label>
                <label className="ct-toggle"><span>Mute typing indicators</span>
                  <button type="button" role="switch" aria-checked={muted} className={'ct-sw' + (muted ? ' on' : '')} onClick={() => setMuted((m) => !m)}><span /></button>
                </label>
                <h3>Shortcuts</h3>
                <ul className="ct-keys">
                  <li><span>Send</span><kbd>Enter</kbd></li>
                  <li><span>New line</span><kbd>Shift+Enter</kbd></li>
                  <li><span>Close</span><kbd>Esc</kbd></li>
                </ul>
                <button type="button" className="ct-ghost danger wide" onClick={onLogout}><LogOut size={15} /> Sign out</button>
              </div>
            )}
            {panel === 'people' && (
              <div className="ct-pplw">
                <p className="ct-muted">{allUsers.length} members · {onlineUsers.length} online</p>
                <label className="ct-srch sm"><Search size={14} />
                  <input type="search" placeholder="Search people" value={pplSearch} onChange={(e) => setPplSearch(e.target.value)} aria-label="Search people" />
                </label>
                <ul className="ct-ppl">
                  {shownUsers.map((u) => (
                    <li key={u.id}>
                      <button type="button" className="ct-pplbtn" onClick={() => { setSelUser(u); setPanel('profile'); }}>
                        <Av name={nameOf(u)} size={34} online={isOnlineU(u)} />
                        <span className="ct-pplm"><strong>{nameOf(u)}</strong><small>@{u.username} · {isOnlineU(u) ? 'Online' : 'Offline'}</small></span>
                      </button>
                    </li>
                  ))}
                  {shownUsers.length === 0 && <li className="ct-muted">{allUsers.length === 0 ? 'Loading members…' : 'No matches'}</li>}
                </ul>
                <button type="button" className="ct-btn wide" onClick={inviteFriend}><UserPlus size={15} /> Invite teammate</button>
              </div>
            )}
            {panel === 'notify' && (
              <div className="ct-notw">
                <div className="ct-nothead">
                  <p className="ct-muted">{unreadNotif} unread</p>
                  <button type="button" className="ct-link" onClick={() => setNotif((p) => p.map((n) => ({ ...n, read: true })))}>Mark all read</button>
                </div>
                {notif.length === 0 && <p className="ct-muted">You are all caught up.</p>}
                <ul className="ct-not">
                  {notif.map((n) => (
                    <li key={n.id}>
                      <button type="button" className={'ct-notbtn' + (n.read ? '' : ' unread')} onClick={() => setNotif((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)))}>
                        <Av name={n.from} size={32} />
                        <span><strong>{n.from}</strong><small>{n.text}</small><time>{relTime(n.ts)}</time></span>
                        {!n.read && <span className="ct-undot" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {panel === 'details' && (
              <div className="ct-det">
                <h3>About #{currentRoom}</h3>
                <p className="ct-muted">{messages.length} messages · live via Socket.IO</p>
                <h3>Members ({onlineUsers.length} online)</h3>
                <ul className="ct-ppl">
                  {onlineUsers.slice(0, 8).map((u, i) => (
                    <li key={i}><Av name={u.nickname} size={30} online /><span>{u.nickname}</span></li>
                  ))}
                  {onlineUsers.length === 0 && <li className="ct-muted">No one online right now</li>}
                </ul>
                <button type="button" className={'ct-ghost wide' + (muted ? ' on' : '')} aria-pressed={muted} onClick={() => setMuted((m) => !m)}><VolumeX size={15} /> {muted ? 'Unmute' : 'Mute'}</button>
                <button type="button" className="ct-ghost wide"><Archive size={15} /> Archive</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
