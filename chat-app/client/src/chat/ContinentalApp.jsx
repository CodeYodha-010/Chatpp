import { useState, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import socket from '../socket';
import { apiGet, apiPost } from '../api';
import { getAvatarColor } from '../utils/avatar';
import { Inbox, MessageSquare, Users, Bell, Settings } from 'lucide-react';
import { Moon, Sun, Search, Video, MoreHorizontal } from 'lucide-react';
import { X, Send, Paperclip, Smile } from 'lucide-react';
import { ChevronLeft, LogOut, CheckCheck, UserPlus, ChevronUp, ChevronDown } from 'lucide-react';
import { Heart, Trash2, ThumbsUp, Check, CheckSquare, Copy } from 'lucide-react';
import { Mail, MapPin, Clock, Monitor, VolumeX, Archive, Info } from 'lucide-react';
import EmojiPopover from './EmojiPopover';
import { insertEmoji, MESSAGE_LIMIT } from './emojiInsertion.mjs';
import { reactionView, setOwnReaction } from './reactionState.mjs';
import './continental.css';
function ini(n) {
  return String(n || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}
function LogoMark({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width={size} height={size}>
      <path d="M2.5 9c2.5 0 2.5 4.2 5 4.2S10 9 12 9s2.5 4.2 5 4.2S19.5 9 21.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2.5 15c2.5 0 2.5 4.2 5 4.2S10 15 12 15s2.5 4.2 5 4.2S19.5 15 21.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
function Av({ name, size, online }) {
  return (
    <span className="ct-avw" style={{ width: size, height: size }}>
      <span className="ct-av" style={{ width: size, height: size, fontSize: Math.max(13, Math.round(size * 0.42)), background: getAvatarColor(name) }}>{ini(name)}</span>
      {online !== undefined && <span className={online ? 'ct-on' : 'ct-off'} />}
    </span>
  );
}
function IB({ label, active, onClick, children, ...rest }) {
  return (
    <button type="button" className={'ct-ib' + (active ? ' on' : '')} aria-label={label} title={label} onClick={onClick} {...rest}>{children}</button>
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
const M = memo(function M({ msg, prev, nickname, userId, highlighted, selected, selectMode, onToggleSelect, onReact, onPickReaction }) {
  const own = msg.userId != null && userId != null ? String(msg.userId) === String(userId) : msg.nickname === nickname;
  const grp = prev && prev.nickname === msg.nickname && (msg.timestamp - prev.timestamp) < 300000;
  const reactions = reactionView(msg.reactions || [], userId);
  // Long-press starts selection on touch; mouse users get the checkbox.
  const pressTimer = useRef(null);
  const pressMoved = useRef(false);
  const onPointerDown = (e) => {
    if (e.pointerType !== 'touch') return;
    pressMoved.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => { if (!pressMoved.current) onToggleSelect(msg.id); }, 450);
  };
  const onPointerMove = (e) => {
    if (e.pointerType !== 'touch') return;
    pressMoved.current = true;
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const onPointerUp = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  const onBubbleClick = () => {
    if (selectMode) onToggleSelect(msg.id);
  };
  return (
    <div id={'ct-msg-' + msg.id} className={'ct-m' + (own ? ' own' : '') + (grp ? ' grp' : '') + (highlighted ? ' hilite' : '') + (selected ? ' sel' : '')}>
      {selectMode && (
        <button type="button" className={'ct-selbox' + (selected ? ' on' : '')} aria-label={selected ? 'Deselect message' : 'Select message'}
          aria-pressed={!!selected} onClick={(e) => { e.stopPropagation(); onToggleSelect(msg.id); }}>
          {selected && <Check size={13} />}
        </button>
      )}
      {!grp && !own && (
        <div className="ct-mh"><span className="ct-ma">{msg.nickname}</span><span className="ct-mt">{ft(msg.timestamp)}</span></div>
      )}
      <div className="ct-bwrap">
        <div className="ct-b" role="button" tabIndex={0}
          onClick={onBubbleClick} onKeyDown={(e) => { if (selectMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggleSelect(msg.id); } }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span>{msg.content || msg.message || ''}</span>
          {own && <span className="ct-r"><CheckCheck size={13} /></span>}
        </div>
        {!selectMode && (
          <div className="ct-macts" aria-label="Message actions">
            <IB label="Select message" onClick={() => onToggleSelect(msg.id)}><CheckSquare size={15} /></IB>
            <IB label="Add reaction" disabled={msg.reactionPending || !/^\d+$/.test(String(msg.id))} onClick={(e) => onPickReaction(msg, e.currentTarget)}><Smile size={15} /></IB>
            <IB label="React 👍" disabled={msg.reactionPending} onClick={() => onReact(msg, '👍')}><ThumbsUp size={13} /></IB>
            <IB label="React ❤️" disabled={msg.reactionPending} onClick={() => onReact(msg, '❤️')}><Heart size={13} /></IB>
          </div>
        )}
      </div>
      {reactions.length > 0 && (
        <div className="ct-rxs" aria-label="Reactions">
          {reactions.map((r) => (
            <button key={r.emoji} type="button" className={'ct-rx' + (r.mine ? ' mine' : '')}
              aria-label={r.count + (r.count > 1 ? ' reactions' : ' reaction') + ' with ' + r.emoji}
              title={r.count + (r.count > 1 ? ' reactions' : ' reaction')}
              disabled={msg.reactionPending} aria-pressed={r.mine}
              onClick={() => onReact(msg, r.emoji)}>
              <span aria-hidden="true">{r.emoji}</span><span className="ct-rxc">{r.count}</span>
            </button>
          ))}
        </div>
      )}
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
  // New group composer: name plus the ticked people. groupTick is user ids.
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupTick, setGroupTick] = useState([]);
  const [groupBusy, setGroupBusy] = useState(false);
  const [dark, setDark] = useState(true);
  const [compact, setCompact] = useState(false);
  const [mobileList, setMobileList] = useState(true);
  const [muted, setMuted] = useState(false);
  const [notif, setNotif] = useState([]);
  const [selUser, setSelUser] = useState(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgResults, setMsgResults] = useState([]);
  const [msgSearching, setMsgSearching] = useState(false);
  const [msgSearched, setMsgSearched] = useState(false);
  const [hiliteId, setHiliteId] = useState(null);
  const [msgSearchScope, setMsgSearchScope] = useState('all'); // 'all' | 'mine'
  const [msgSender, setMsgSender] = useState('');
  const [msgHitIndex, setMsgHitIndex] = useState(0);
  // Selection mode (WhatsApp-style): tap/long-press bubbles, then act on the
  // whole selection from the header bar. `selectedIds` holds message ids.
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [deleteScopeTarget, setDeleteScopeTarget] = useState('messages'); // 'messages' | 'conversation'
  const [moreOpen, setMoreOpen] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [reactionError, setReactionError] = useState('');
  // Server-built sidebar list (public rooms + this user's DMs/groups).
  const [convos, setConvos] = useState([]);
  const [actionError, setActionError] = useState('');
  const [copiedUname, setCopiedUname] = useState(false);
  // Join loading state: the join effect clears the transcript, and the server
  // answers asynchronously, so the screen names the wait instead of going
  // silently blank.
  const [joinLoading, setJoinLoading] = useState(false);
  const joinTimerRef = useRef(null);
  // Invite dialog state — the flow lives in an in-app dialog now instead of
  // the browser's prompt()/alert() popups.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteDone, setInviteDone] = useState(null); // { room, label } once sent
  const reactionTriggerRef = useRef(null);
  const pendingReactions = useRef(new Map());
  const composerRef = useRef(null);
  const caretRef = useRef({ start: null, end: null });
  const listRef = useRef(null);
  const endRef = useRef(null);
  const typingRef = useRef(null);
  const hiliteRef = useRef(null);
  // `online_users` carries nicknames (server filters them per viewer for
  // privacy); keep the raw list plus a lowercase lookup for dots/pills/labels.
  const onlineNicknames = new Set(onlineUsers.map((u) => String(u?.nickname || '').toLowerCase()));
  const onlineById = new Set((onlineUsers || []).map((u) => u?.userId).filter((v) => v != null).map(String));
  const currentRoom = roomId ? decodeURIComponent(roomId) : null; // no conversation selected yet
  const currentRoomRef = useRef(currentRoom);
  // Latest-ref: react-router v7 changes `navigate` identity on every route
  // change, so listing it in the listener effect deps would tear down and
  // re-subscribe every socket handler on each navigation. The effect calls the
  // current function through the ref instead, keeping listeners stable.
  const navigateRef = useRef(navigate);
  // Refs are written in effects (not during render) per react-hooks/refs;
  // handlers only read them at event time, so the post-commit update is fine.
  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const displayName = nickname || user?.display_name || user?.username || 'You';
  const myEmail = user?.email || '';
  useEffect(() => {
    socket.on('online_users', setOnlineUsers);
    socket.on('conversation_list', (l) => setConvos(Array.isArray(l) ? l : []));
    socket.on('dm_created', (d) => {
      if (d?.room) setConvos((p) => (p.some((c) => c.room === d.room) ? p : [...p, d]));
    });
    socket.on('group_created', (d) => {
      if (d?.room) setConvos((p) => (p.some((c) => c.room === d.room) ? p : [...p, d]));
    });
    socket.on('group_members_changed', (d) => {
      if (!d?.room) return;
      // Rooms the socket no longer belongs to silently vanish from its list.
      if (d.removedUserId && String(d.removedUserId) === String(user?.id)) {
        setConvos((p) => p.filter((c) => c.room !== d.room));
        return;
      }
      setConvos((p) => (p.some((c) => c.room === d.room) ? p.map((c) => (c.room === d.room ? { ...c, label: d.label || c.label } : c)) : [...p, { room: d.room, label: d.label || d.room, type: 'group', peerId: null }]));
    });
    socket.on('error', (e) => {
      if (joinTimerRef.current) { clearTimeout(joinTimerRef.current); joinTimerRef.current = null; }
      setJoinLoading(false);
      if (e?.message) setActionError(e.message);
    });
    socket.on('messages_deleted', (d) => {
      if (!d?.ids) return;
      const gone = new Set((d.ids || []).map(String));
      setMessages((p) => p.filter((m) => !gone.has(String(m.id))));
      setSelectedIds((p) => p.filter((id) => !gone.has(String(id))));
    });
    socket.on('messages_hidden', (d) => {
      if (!d?.ids) return;
      const gone = new Set((d.ids || []).map(String));
      setMessages((p) => p.filter((m) => !gone.has(String(m.id))));
      setSelectedIds((p) => p.filter((id) => !gone.has(String(id))));
    });
    socket.on('conversation_deleted', (d) => {
      if (!d?.room) return;
      if (d.room === currentRoomRef.current) {
        setMessages([]);
        navigateRef.current('/app', { replace: true });
      }
      setConvos((p) => p.filter((c) => c.room !== d.room));
      if (d.scope === 'everyone') {
        setNotif((p) => [{ id: 'conv-' + d.room + '-' + Date.now(), from: 'Continental', text: 'This conversation was deleted.', ts: Date.now(), read: false }, ...p].slice(0, 20));
      }
    });
    // History: join_room is answered with room_joined. Apply it only when the
    // answer still matches the room being shown — the socket stays in
    // previously joined rooms, so a slow answer for an abandoned conversation
    // must not stomp the new transcript.
    socket.on('room_joined', (d) => {
      if (!d || d.room !== currentRoomRef.current) return;
      if (joinTimerRef.current) { clearTimeout(joinTimerRef.current); joinTimerRef.current = null; }
      setJoinLoading(false);
      // A successful join clears any stale error banner (e.g. the previous
      // room's failure or a "database is waking up" notice).
      setActionError('');
      setMessages(d.messages || []);
      setTypingUsers([]);
    });
    // Live messages carry their room. Append only the conversation being
    // shown (unfiltered appends would bleed other chats into this
    // transcript); other rooms still raise the notification bell.
    socket.on('new_message', (m) => {
      if (!m?.room || m.room === currentRoomRef.current) setMessages((p) => [...p, m]);
      if (m.nickname !== nickname) setNotif((p) => [{ id: m.id || Date.now(), from: m.nickname, text: m.content || m.message || '', ts: m.timestamp || Date.now(), read: false }, ...p].slice(0, 20));
    });
    socket.on('new_messages_batch', (b) => {
      const batchRoom = (b || [])[0]?.room;
      if (!batchRoom || batchRoom === currentRoomRef.current) setMessages((p) => [...p, ...(b || [])]);
    });
    socket.on('message_delivered', (d) => { setMessages((p) => p.map((m) => (m.id === d.id ? { ...m, status: 'delivered' } : m))); });
    socket.on('user_typing', (d) => {
      if (d?.nickname && d.nickname !== nickname) setTypingUsers((p) => (p.includes(d.nickname) ? p : [...p, d.nickname]));
    });
    socket.on('user_stop_typing', (d) => { setTypingUsers((p) => p.filter((n) => n !== d?.nickname)); });
    socket.on('user_joined', (d) => {
      if (d?.nickname) setNotif((p) => [{ id: 'j' + Date.now(), from: d.nickname, text: 'came online', ts: Date.now(), read: false }, ...p].slice(0, 20));
    });
    socket.on('reaction_updated', (d) => {
      if (!d?.messageId) return;
      const pending = pendingReactions.current.get(String(d.messageId));
      if (pending) pending.base = d.reactions || [];
      setMessages((p) => p.map((m) => String(m.id) === String(d.messageId) ? {
        ...m, reactions: pending ? setOwnReaction(d.reactions || [], pending.emoji, user?.id, pending.active) : d.reactions || []
      } : m));
    });
    socket.on('message_deleted', (d) => {
      if (d?.id) setMessages((p) => p.filter((m) => String(m.id) !== String(d.id)));
    });
    socket.on('search_results', (d) => {
      setMsgSearching(false);
      setMsgSearched(true);
      setMsgResults(Array.isArray(d?.results) ? d.results : []);
    });
    return () => {
      socket.off('online_users');
      socket.off('room_joined'); socket.off('new_message'); socket.off('new_messages_batch');
      socket.off('message_delivered'); socket.off('user_typing'); socket.off('user_stop_typing');
      socket.off('user_joined');
      socket.off('reaction_updated'); socket.off('message_deleted'); socket.off('search_results');
      socket.off('conversation_list'); socket.off('dm_created'); socket.off('error');
      socket.off('messages_deleted'); socket.off('messages_hidden'); socket.off('conversation_deleted');
      socket.off('group_created'); socket.off('group_members_changed');
    };
  }, [nickname, user?.id]);
  // The previous room's transcript is cleared up front on purpose: join_room
  // history arrives asynchronously, so the list must not show stale messages.
  useEffect(() => {
    // Reset on room switch, before the new history arrives.
    // Intentional bulk cleanup: runs only when currentRoom changes and is
    // idempotent. The compliant alternative (key-remount of the transcript)
    // is a larger refactor deferred to a future pass.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]); setMobileList(false);
    pendingReactions.current.clear(); setReactionTarget(null); setReactionError(''); setActionError('');
    setMsgResults([]); setMsgSearch(''); setMsgSearchOpen(false); setMsgSearched(false); setHiliteId(null);
    setMsgSender(''); setMsgSearchScope('all'); setMsgHitIndex(0);
    setSelectedIds([]); setDeleteScopeOpen(false); setDeleteScopeTarget('messages'); setMoreOpen(false);
    // No conversation selected (the app's landing state) joins nothing — the
    // legacy auto-join of the public 'general' room is gone with the rework.
    if (!currentRoom) return;
    // The welcome screen never loads: only a real conversation join pays for a
    // transcript round-trip.
    if (joinTimerRef.current) clearTimeout(joinTimerRef.current);
    setJoinLoading(true);
    joinTimerRef.current = setTimeout(() => {
      setJoinLoading((still) => {
        if (still) setActionError('Still loading — the database is waking up. It usually answers within a few seconds.');
        return still;
      });
    }, 4000);
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
  // ESC exits selection first, then dialogs, then panels — selection is topmost.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (selectedIds.length > 0) { setSelectedIds([]); setDeleteScopeOpen(false); return; }
      if (deleteScopeOpen) { setDeleteScopeOpen(false); return; }
      if (moreOpen) { setMoreOpen(false); return; }
      setPanel(null); setSelUser(null); setShowEmoji(false); setReactionTarget(null); setMsgSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds.length, deleteScopeOpen, moreOpen]);
  const openRoom = (r) => navigate('/app/c/' + encodeURIComponent(r));
  // Group composer helpers for the sidebar's "new" form. All group mutations
  // ask the server and surface the answer, so the sidebar never shows a group
  // that failed server-side.
  const toggleGroupTick = (id) => {
    setGroupTick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };
  const closeNewGroup = () => { setShowNewGroup(false); setNewGroupName(''); setGroupTick([]); };
  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name || groupBusy) return;
    if (groupTick.length === 0) { setActionError('Pick at least one person for the group.'); return; }
    setGroupBusy(true); setActionError('');
    socket.timeout(15000).emit('create_group', { name, userIds: groupTick }, (err, res) => {
      setGroupBusy(false);
      if (err || !res?.ok) {
        setActionError(err ? 'Could not create the group. Check your connection.' : res?.error || 'Could not create the group.');
        return;
      }
      setConvos((p) => (p.some((c) => c.room === res.room) ? p : [...p, { room: res.room, label: res.label, type: 'group', peerId: null }]));
      closeNewGroup();
      openRoom(res.room);
    });
  };
  // Open (or reopen) a direct conversation. The server owns the room identity,
  // so tapping the same person twice always lands in the same thread.
  const startDm = (u) => {
    if (!u?.id) return;
    setPanel(null); setSelUser(null); setActionError('');
    socket.timeout(15000).emit('create_dm', { userId: u.id }, (err, res) => {
      if (err || !res?.ok) {
        setActionError(err ? 'Could not start the conversation. Check your connection.' : res?.error || 'Could not start the conversation.');
        return;
      }
      // Show the conversation immediately; the server's conversation_list may
      // arrive later (it needs a database round-trip).
      setConvos((p) => (p.some((c) => c.room === res.room) ? p : [...p, { room: res.room, label: res.label, type: res.type, peerId: res.peerId }]));
      openRoom(res.room);
    });
  };
  const openInvite = () => {
    setInviteName('');
    setInviteError('');
    setInviteDone(null);
    setInviteBusy(false);
    setInviteOpen(true);
  };
  const closeInvite = () => { if (inviteBusy) return; setInviteOpen(false); };
  const copyInviteHandle = async () => {
    const v = '@' + (user?.username || '');
    try {
      await navigator.clipboard.writeText(v);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = v; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* clipboard unavailable */ }
      ta.remove();
    }
    setCopiedUname(true);
    setTimeout(() => setCopiedUname(false), 2000);
  };
  // Mirrors the server's invite schema (alphanum, 3-30) so bad input fails
  // right here with a friendly line instead of a round-trip.
  const submitInvite = async (e) => {
    e.preventDefault();
    if (inviteBusy) return;
    const clean = inviteName.trim().replace(/^@+/, '');
    if (!/^[A-Za-z0-9]{3,30}$/.test(clean)) {
      setInviteError('Usernames are 3-30 letters or numbers, no spaces.');
      return;
    }
    if (clean.toLowerCase() === String(user?.username || '').toLowerCase()) {
      setInviteError('That is you — share your own handle instead.');
      return;
    }
    setInviteBusy(true);
    setInviteError('');
    const token = sessionStorage.getItem('chat_token');
    if (!token) { setInviteBusy(false); return; }
    try {
      const data = await apiPost('/api/invite', { username: clean }, token);
      // The invite route creates the DM for real, so surface it immediately.
      if (data.room) {
        setConvos((p) => (p.some((c) => c.room === data.room) ? p : [...p, { room: data.room, label: data.label || clean, type: 'dm', peerId: data.user?.id ?? null }]));
      }
      setInviteDone({ room: data.room, label: data.label || clean });
    } catch (err) {
      setInviteError(err.message || 'Could not send the invite.');
    } finally {
      setInviteBusy(false);
    }
  };
  // Esc closes the dialog, matching the app's shortcut list.
  useEffect(() => {
    if (!inviteOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !inviteBusy) setInviteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inviteOpen, inviteBusy]);
  const notifyTyping = () => {
    if (!currentRoom) return;
    socket.emit('typing', { room: currentRoom, nickname });
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => socket.emit('stop_typing', { room: currentRoom, nickname }), 2000);
  };
  const rememberCaret = () => {
    const el = composerRef.current;
    if (!el) return;
    caretRef.current = { start: el.selectionStart, end: el.selectionEnd };
  };
  const applyEmoji = (emoji) => {
    const next = insertEmoji(composer, emoji, caretRef.current.start, caretRef.current.end);
    if (!next) return;
    setComposer(next.value);
    caretRef.current = { start: next.cursor, end: next.cursor };
    notifyTyping();
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };
  const toggleEmoji = () => {
    rememberCaret();
    setReactionTarget(null);
    setShowEmoji((v) => !v);
  };
  const closeEmoji = (refocus) => {
    setShowEmoji(false);
    if (refocus) {
      const el = composerRef.current;
      if (!el) return;
      const at = caretRef.current.start ?? el.value.length;
      el.focus();
      el.setSelectionRange(at, at);
    }
  };
  // Reactions/deletes only work on DB-persisted messages: temp ids
  // ("1768..._ab3") have no server row yet, so the request would be rejected.
  const isPersisted = (id) => id != null && /^\d+$/.test(String(id));
  // Declared before pickReaction/closeReactionPicker, which toggle it.
  const [selectionReactOpen, setSelectionReactOpen] = useState(false);
  const toggleReaction = (msg, emoji) => {
    const id = String(msg?.id);
    if (!isPersisted(msg?.id) || pendingReactions.current.has(id)) return;
    if (!socket.connected) { setReactionError('Reconnect before reacting.'); return; }
    const active = !reactionView(msg.reactions || [], user?.id).find((r) => r.emoji === emoji)?.mine;
    const operation = { emoji, active, base: msg.reactions || [] };
    pendingReactions.current.set(id, operation);
    setReactionError('');
    setMessages((p) => p.map((m) => String(m.id) === id ? {
      ...m, reactions: setOwnReaction(m.reactions, emoji, user?.id, active), reactionPending: true
    } : m));
    socket.timeout(15000).emit('toggle_reaction', { room: currentRoom, messageId: id, emoji, active }, (err, response) => {
      if (pendingReactions.current.get(id) !== operation) return;
      pendingReactions.current.delete(id);
      const confirmed = !err && response?.ok;
      setMessages((p) => p.map((m) => String(m.id) === id ? {
        ...m, reactions: confirmed ? response.reactions : operation.base, reactionPending: false
      } : m));
      if (!confirmed) setReactionError(err ? 'Reaction confirmation timed out. Reopen the room to check its saved state.' : response?.error || 'Reaction could not be saved.');
    });
  };
  const pickReaction = (msg, trigger) => {
    reactionTriggerRef.current = trigger;
    setShowEmoji(false);
    setSelectionReactOpen(false);
    setReactionTarget(msg.id);
  };
  const closeReactionPicker = (refocus) => {
    setReactionTarget(null);
    setSelectionReactOpen(false);
    if (refocus) reactionTriggerRef.current?.focus();
  };
  // Header React routes through the server-side picker state, matching the
  // single-message flow, so one confirmation path serves both bulk and solo.
  // ---- Selection mode (Phase 3) ----
  const selectMode = selectedIds.length > 0;
  const selectedMsgs = messages.filter((m) => selectedIds.includes(String(m.id)));
  const allSelectedMine = selectedMsgs.length > 0 && selectedMsgs.every((m) => (
    m.userId != null && user?.id != null ? String(m.userId) === String(user.id) : m.nickname === nickname
  ));
  const toggleSelect = (id) => {
    if (!isPersisted(id)) return;
    const key = String(id);
    setSelectedIds((p) => (p.includes(key) ? p.filter((x) => x !== key) : [...p, key]));
  };
  const clearSelection = () => { setSelectedIds([]); setDeleteScopeOpen(false); setDeleteScopeTarget('messages'); };
  const copySelection = async () => {
    if (selectedMsgs.length === 0) return;
    const lines = selectedMsgs.map((m) => `${m.nickname || 'Someone'}, ${ft(m.timestamp)} — ${m.content || m.message || ''}`);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* clipboard blocked */ }
      document.body.removeChild(ta);
    }
    clearSelection();
  };
  const reactOnSelection = (emoji) => {
    const targets = selectedMsgs.filter((m) => isPersisted(m.id) && !pendingReactions.current.has(String(m.id)));
    if (targets.length === 0) { clearSelection(); return; }
    if (!socket.connected) { setReactionError('Reconnect before reacting.'); return; }
    setReactionError('');
    for (const m of targets) toggleReaction(m, emoji);
    clearSelection();
  };
  const runBulkDelete = (scope) => {
    if (selectedMsgs.length === 0 || busyDelete) return;
    setBusyDelete(true);
    setActionError('');
    socket.timeout(15000).emit('delete_messages', { messageIds: selectedIds, scope }, (err, res) => {
      setBusyDelete(false);
      if (err || !res?.ok) {
        setActionError(err ? 'Delete timed out. Reopen the room to check what was removed.' : res?.error || 'Delete failed.');
        return;
      }
      const gone = new Set([...(res.deleted || []), ...(res.hidden || [])].map(String));
      setMessages((p) => p.filter((m) => !gone.has(String(m.id))));
      clearSelection();
      if ((res.missing || []).length > 0 || (res.denied || []).length > 0) {
        setActionError('Some messages could not be deleted (' + [...(res.missing || []), ...(res.denied || [])].length + ' skipped).');
      }
    });
  };
  const clearChatForMe = () => {
    setMoreOpen(false);
    setActionError('');
    socket.timeout(15000).emit('clear_conversation', { room: currentRoom }, (err, res) => {
      if (err || !res?.ok) {
        setActionError(err ? 'Clear timed out. Check your connection.' : res?.error || 'Could not clear the chat.');
        return;
      }
      setMessages([]);
      setSelectedIds([]);
    });
  };
  const deleteConversation = (scope) => {
    setMoreOpen(false);
    setDeleteScopeOpen(false);
    setActionError('');
    socket.timeout(15000).emit('delete_conversation', { room: currentRoom, scope }, (err, res) => {
      if (err || !res?.ok) {
        setActionError(err ? 'Delete timed out. Check your connection.' : res?.error || 'Could not delete the conversation.');
        return;
      }
      if (res.waitingForPeer) {
        setActionError('Waiting for the other person to also choose "for everyone". Hidden from your view for now.');
      }
      setConvos((p) => p.filter((c) => c.room !== currentRoom));
      setMessages([]);
      setSelectedIds([]);
      navigate('/app', { replace: true });
    });
  };
  const runMsgSearch = () => {
    const query = msgSearch.trim();
    if (!query) { setMsgResults([]); setMsgSearched(false); return; }
    setMsgSearching(true);
    socket.emit('search_messages', {
      room: currentRoom,
      query,
      sender: msgSender.trim() || undefined,
      onlyMine: msgSearchScope === 'mine'
    });
  };
  const closeMsgSearch = () => {
    setMsgSearchOpen(false); setMsgResults([]); setMsgSearch(''); setMsgSearching(false); setMsgSearched(false); setHiliteId(null);
    setMsgSender(''); setMsgSearchScope('all'); setMsgHitIndex(0);
  };
  const jumpToResult = (id) => {
    setHiliteId(String(id));
    requestAnimationFrame(() => {
      document.getElementById('ct-msg-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    clearTimeout(hiliteRef.current);
    hiliteRef.current = setTimeout(() => setHiliteId(null), 2500);
  };
  // Prev/next through results without closing the panel.
  const stepHit = (dir) => {
    if (msgResults.length === 0) return;
    const next = (msgHitIndex + dir + msgResults.length) % msgResults.length;
    setMsgHitIndex(next);
    jumpToResult(msgResults[next].id);
  };
  const send = () => {
    const text = composer.trim();
    if (!text || !currentRoom) return;
    socket.emit('send_message', { room: currentRoom, message: text, nickname });
    setComposer(''); setShowEmoji(false); caretRef.current = { start: null, end: null };
    clearTimeout(typingRef.current);
    socket.emit('stop_typing', { room: currentRoom, nickname });
  };
  const peerOnline = (c) => {
    if (!c) return false;
    if (c.type === 'group') return false;
    if (c.peerId != null && onlineById.has(String(c.peerId))) return true;
    const label = String(c.label || '').toLowerCase();
    if (label && onlineNicknames.has(label)) return true;
    return allUsers.some((u) => {
      const byPeer = c.peerId != null && String(u.id) === String(c.peerId);
      const byLabel = !!label && (String(u.username || '').toLowerCase() === label || String(u.displayName || '').toLowerCase() === label);
      if (!byPeer && !byLabel) return false;
      if (u?.id != null && onlineById.has(String(u.id))) return true;
      const keys = [String(u?.username || '').toLowerCase()];
      if (u?.displayName) keys.push(String(u.displayName).toLowerCase());
      return keys.some((k) => k && onlineNicknames.has(k));
    });
  };
  const q = search.trim().toLowerCase();
  // WhatsApp-style: the sidebar shows only the server's per-user conversation
  // list (DMs + groups). No public-room fallback — a new user sees Demo only.
  const convoItems = convos;
  const filtered = convoItems.filter((c) => !q || c.label.toLowerCase().includes(q) || c.room.toLowerCase().includes(q));
  const currentConvo = convoItems.find((c) => c.room === currentRoom);
  const currentLabel = currentConvo?.label || currentRoom;
  const isDm = currentConvo?.type === 'dm';
  // Declared here (not up with the group state) because it reads currentConvo;
  // hoisting it above the declaration hit the temporal dead zone and crashed.
  const groupRoomId = currentConvo?.id || null;
  // Roster + removal actions for the group currently open. groupRoomId pins the
  // request to the numeric id listForUser gave the sidebar, so leaving a group
  // from a stale view cannot hit the wrong conversation.
  const [groupInfo, setGroupInfo] = useState(null);
  const [groupInfoBusy, setGroupInfoBusy] = useState(false);
  const loadGroupInfo = async (roomId) => {
    const token = sessionStorage.getItem('chat_token');
    if (!token || !roomId) { setGroupInfo(null); return; }
    setGroupInfoBusy(true);
    try {
      const data = await apiGet('/api/rooms/' + roomId + '/members', token);
      setGroupInfo(data);
    } catch (err) { setGroupInfo(null); setActionError(err.message || 'Could not load group members.'); }
    setGroupInfoBusy(false);
  };
  const changeGroupMember = (action, targetId) => {
    if (!currentRoom) return;
    setActionError('');
    socket.timeout(15000).emit(action, { room: currentRoom, userId: targetId }, (err, res) => {
      if (err || !res?.ok) {
        setActionError(err ? 'Could not update the group. Check your connection.' : res?.error || 'Could not update the group.');
        return;
      }
      if (res.removedUserId && String(res.removedUserId) === String(user?.id)) {
        setConvos((p) => p.filter((c) => c.room !== currentRoom));
        setGroupInfo(null);
        openRoom('general');
        return;
      }
      setGroupInfo((prev) => ({
        room: prev?.room || { id: groupRoomId, name: currentRoom, label: res.label || currentRoom, type: 'group', ownerId: null },
        members: res.members || []
      }));
    });
  };
  const unreadNotif = notif.filter((n) => !n.read).length;
  const pq = pplSearch.trim().toLowerCase();
  const shownUsers = allUsers.filter((u) => !pq || (u.username || '').toLowerCase().includes(pq) || (u.displayName || '').toLowerCase().includes(pq));
  const nameOf = (u) => u?.displayName || u?.username || '';
  const nameKey = (u) => String(u?.username || '').toLowerCase();
  const isOnlineU = (u) => {
    if (u?.id != null && onlineById.has(String(u.id))) return true;
    const keys = [nameKey(u)];
    if (u?.displayName) keys.push(String(u.displayName).toLowerCase());
    return keys.some((k) => k && onlineNicknames.has(k));
  };
  const onlineContactCount = allUsers.filter((u) => isOnlineU(u)).length;
  return (
    <div className={'ct-shell' + (compact ? ' compact' : '')}>
      <nav className="ct-rail" aria-label="Primary">
        <div className="ct-logo" title="Continental" aria-label="Continental home"><LogoMark size={21} /></div>
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
        <div className="ct-ws"><span className="ct-wslogo" aria-hidden="true"><LogoMark size={17} /></span><strong>Continental</strong><span className="ct-wssub">{onlineContactCount} online</span></div>
        <div className="ct-sh"><h2>Conversations</h2>
          <IB label="New group" onClick={() => { setShowNewGroup((v) => !v); }}><Users size={17} /></IB>
        </div>
        {showNewGroup && (
          <div className="ct-nr" role="dialog" aria-label="New group">
            <input type="text" placeholder="Group name…" value={newGroupName} maxLength={50}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createGroup(); if (e.key === 'Escape') closeNewGroup(); }} autoFocus aria-label="New group name" />
            <ul className="ct-grp" aria-label="Group members">
              {shownUsers.filter((u) => String(u.id) !== String(user?.id)).map((u) => (
                <li key={u.id}>
                  <label className="ct-grprow">
                    <input type="checkbox" checked={groupTick.includes(u.id)} onChange={() => toggleGroupTick(u.id)} aria-label={'Add ' + nameOf(u)} />
                    <Av name={nameOf(u)} size={28} online={isOnlineU(u)} />
                    <span className="ct-grpm"><strong>{nameOf(u)}</strong><small>@{u.username}</small></span>
                  </label>
                </li>
              ))}
              {shownUsers.filter((u) => String(u.id) !== String(user?.id)).length === 0 && <li className="ct-muted">{allUsers.length === 0 ? 'Loading people…' : 'No one to add'}</li>}
            </ul>
            <div className="ct-grpfoot">
              <span className="ct-muted">{groupTick.length} selected</span>
              <button type="button" className="ct-ghost" onClick={closeNewGroup}>Cancel</button>
              <button type="button" className="ct-btn" disabled={groupBusy || !newGroupName.trim() || groupTick.length === 0} onClick={createGroup}>{groupBusy ? 'Creating…' : 'Create group'}</button>
            </div>
          </div>
        )}
        <label className="ct-srch"><Search size={15} />
          <input type="search" placeholder="Search conversations" value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label="Search conversations" />
        </label>
        <ul className="ct-rooms">
          {filtered.length === 0 && <li className="ct-empty">No conversations yet</li>}
          {filtered.map((c) => (
            <li key={c.room}>
              <Link to={'/app/c/' + encodeURIComponent(c.room)} className={'ct-room' + (c.room === currentRoom ? ' on' : '')}>
                <Av name={c.label} size={38} online={peerOnline(c)} />
                <span className="ct-rm"><strong>{c.label}</strong>
                  <small>{c.room === currentRoom ? fp(messages[messages.length - 1]) : (c.type === 'dm' ? 'Direct message' : (c.type === 'group' ? 'Group' : c.room))}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="ct-sf">
          <button type="button" className="ct-ghost" onClick={openInvite}><UserPlus size={15} /> Invite</button>
          <button type="button" className="ct-ghost danger" onClick={onLogout}><LogOut size={15} /> Logout</button>
        </div>
      </aside>
      <main className="ct-main">
        <header className="ct-head">
          {selectMode ? (
            <>
              <IB label="Clear selection" onClick={clearSelection}><X size={17} /></IB>
              <div className="ct-hi"><h1>{selectedIds.length} selected</h1>
                <span className="ct-st">{allSelectedMine ? 'Yours — delete for everyone available' : 'Includes others\u2019 messages'}</span>
              </div>
              <div className="ct-ha">
                <IB label="Copy selected" onClick={copySelection}><Copy size={17} /></IB>
                <IB label="React to selected" onClick={() => {
                  const first = selectedMsgs.find((m) => isPersisted(m.id));
                  if (!first) return;
                  setReactionTarget(first.id);
                  setSelectionReactOpen(true);
                }}><Smile size={17} /></IB>
                <IB label="Delete selected" onClick={() => { setDeleteScopeTarget('messages'); setDeleteScopeOpen(true); }}><Trash2 size={17} /></IB>
              </div>
            </>
          ) : (
            <>
              <button type="button" className="ct-back" aria-label="Back" onClick={() => setMobileList(true)}><ChevronLeft size={19} /></button>
              {!currentRoom ? (
                <div className="ct-hi"><h1>Continental</h1>
                  <span className="ct-st">Pick a conversation — or invite someone</span>
                </div>
              ) : (<>
              <Av name={currentLabel} size={38} online={peerOnline(currentConvo)} />
              <div className="ct-hi"><h1>{currentLabel}</h1>
                <span className="ct-st">{peerOnline(currentConvo) ? 'Online' : messages.length + ' messages'}</span>
              </div>
              <div className="ct-ha">
                <IB label="Search messages" active={msgSearchOpen} onClick={() => (msgSearchOpen ? closeMsgSearch() : setMsgSearchOpen(true))}><Search size={17} /></IB>
                <IB label="Video call"><Video size={17} /></IB>
                <IB label="Group details" onClick={() => { if (currentConvo?.type === 'group') loadGroupInfo(groupRoomId); setPanel('details'); }}><Info size={17} /></IB>
                <IB label="More" active={moreOpen} onClick={() => setMoreOpen((v) => !v)} aria-haspopup="menu" aria-expanded={moreOpen}><MoreHorizontal size={17} /></IB>
              </div>
              </>)}
            </>
          )}
        </header>
        {moreOpen && !selectMode && (
          <div className="ct-menu" role="menu" aria-label="Conversation options">
            <button type="button" role="menuitem" className="ct-menuitem" onClick={() => { setMoreOpen(false); setMsgSearchOpen(true); }}>
              <Search size={14} /> Search in conversation
            </button>
            <button type="button" role="menuitem" className="ct-menuitem" onClick={() => { if (currentConvo?.type === 'group') loadGroupInfo(groupRoomId); setMoreOpen(false); setPanel('details'); }}>
              <Info size={14} /> Conversation details
            </button>
            <button type="button" role="menuitem" className="ct-menuitem" onClick={clearChatForMe}>
              <Archive size={14} /> Clear chat for me
            </button>
            {currentConvo && currentConvo.type !== 'public' && (
              <button type="button" role="menuitem" className="ct-menuitem danger" onClick={() => { setMoreOpen(false); setDeleteScopeOpen(true); setDeleteScopeTarget('conversation'); }}>
                <Trash2 size={14} /> Delete conversation…
              </button>
            )}
            <button type="button" role="menuitem" className="ct-menuitem" onClick={() => setMoreOpen(false)}>
              <X size={14} /> Close
            </button>
          </div>
        )}
        {msgSearchOpen && (
          <div className="ct-msch">
            <div className="ct-msrow">
              <Search size={14} aria-hidden="true" />
              <input type="search" placeholder={'Search in ' + (isDm ? currentLabel : '#' + currentRoom)} value={msgSearch} autoFocus aria-label="Search messages in room"
                onChange={(e) => setMsgSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runMsgSearch(); }} />
              {(msgSearching || msgResults.length > 0) && (
                <span className="ct-mscount">{msgSearching ? 'Searching…' : (msgHitIndex + 1) + ' of ' + msgResults.length}</span>
              )}
              {msgResults.length > 1 && (
                <>
                  <IB label="Previous match" onClick={() => stepHit(-1)}><ChevronUp size={14} /></IB>
                  <IB label="Next match" onClick={() => stepHit(1)}><ChevronDown size={14} /></IB>
                </>
              )}
              <IB label="Close message search" onClick={closeMsgSearch}><X size={14} /></IB>
            </div>
            <div className="ct-msrow sub">
              <input type="search" placeholder="From person (optional)" value={msgSender} autoFocus={false}
                onChange={(e) => setMsgSender(e.target.value)} aria-label="Filter search by sender"
                onKeyDown={(e) => { if (e.key === 'Enter') runMsgSearch(); }} />
              <button type="button" className={'ct-chip' + (msgSearchScope === 'mine' ? ' on' : '')}
                aria-pressed={msgSearchScope === 'mine'}
                onClick={() => setMsgSearchScope((s) => (s === 'mine' ? 'all' : 'mine'))}>
                Only mine
              </button>
              <button type="button" className="ct-btn sm" onClick={runMsgSearch} disabled={msgSearching || !msgSearch.trim()}>
                {msgSearching ? '…' : 'Search'}
              </button>
            </div>
            {msgSearched && !msgSearching && msgResults.length === 0 && (
              <div className="ct-msnone">No messages found in the recent history.</div>
            )}
            {msgResults.length > 0 && (
              <ul className="ct-msres">
                {msgResults.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="ct-msitem" onClick={() => jumpToResult(r.id)}>
                      <span className="ct-msra">{r.nickname}</span>
                      <span className="ct-msrb">{r.content}</span>
                      <span className="ct-msrt">{ft(r.timestamp)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {deleteScopeOpen && (
          <div className="ct-scope" role="dialog" aria-modal="true" aria-label="Choose delete scope">
            <div className="ct-scopebox">
              <h3>{deleteScopeTarget === 'conversation' ? 'Delete conversation' : `Delete ${selectedIds.length} message${selectedIds.length === 1 ? '' : 's'}`}</h3>
              <p className="ct-muted">
                {deleteScopeTarget === 'conversation'
                  ? (currentConvo?.type === 'dm'
                    ? '"For everyone" needs the other person to choose it too. Until then it hides from your view.'
                    : 'Group owners delete the group for everyone. Members leave instead.')
                  : allSelectedMine
                    ? 'Delete just for you, or for everyone in this chat.'
                    : 'These include someone else\u2019s messages, so they can only be deleted for you.'}
              </p>
              <button type="button" className="ct-btn wide" disabled={busyDelete}
                onClick={() => (deleteScopeTarget === 'conversation' ? deleteConversation('me') : runBulkDelete('me'))}>
                {busyDelete ? 'Working…' : (deleteScopeTarget === 'conversation' ? 'Delete for me' : `Delete for me (${selectedIds.length})`)}
              </button>
              <button type="button" className="ct-btn wide danger" disabled={busyDelete || (deleteScopeTarget === 'messages' && !allSelectedMine)}
                title={deleteScopeTarget === 'messages' && !allSelectedMine ? 'For-everyone delete needs all selected messages to be yours' : undefined}
                onClick={() => (deleteScopeTarget === 'conversation' ? deleteConversation('everyone') : runBulkDelete('everyone'))}>
                {busyDelete ? 'Working…' : 'Delete for everyone'}
              </button>
              <button type="button" className="ct-ghost wide" disabled={busyDelete} onClick={() => { setDeleteScopeOpen(false); setDeleteScopeTarget('messages'); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className="ct-list" ref={listRef} role="log" aria-label="Messages" aria-live="polite">
          {!currentRoom ? (
            <div className="ct-emptychat"><div className="ct-ei">✦</div><h3>Welcome back</h3><p>Pick a conversation on the left — or invite someone with their @username.</p></div>
          ) : joinLoading && messages.length === 0 ? (
            <div className="ct-emptychat"><div className="ct-ei">✦</div><h3>Loading conversation…</h3><p>Fetching the latest messages.</p></div>
          ) : messages.length === 0 ? (
            <div className="ct-emptychat"><div className="ct-ei">✦</div><h3>Start the conversation</h3><p>Be the first to say something in {isDm ? currentLabel : '#' + currentRoom}</p></div>
          ) : messages.map((m, i) => (
            <M key={m.id || i} msg={m} prev={i > 0 ? messages[i - 1] : null} nickname={nickname} userId={user?.id}
              highlighted={String(m.id) === hiliteId} selected={selectedIds.includes(String(m.id))} selectMode={selectMode}
              onToggleSelect={toggleSelect} onReact={toggleReaction} onPickReaction={pickReaction} />
          ))}
          <div ref={endRef} />
        </div>
        {currentRoom && typingUsers.length > 0 && !muted && (
          <div className="ct-typing"><span className="ct-dots"><span /><span /><span /></span>{typingUsers.join(', ')} typing</div>
        )}
        {currentRoom && (
        <div className="ct-comp">
          <div className="ct-cbox">
            <IB label="Attach"><Paperclip size={17} /></IB>
            {/* maxLength mirrors the server's 5,000-unit cap: the server rejects
                oversize text and send() clears the composer, so uncapped text is lost. */}
            <textarea rows={1} maxLength={MESSAGE_LIMIT} ref={composerRef} placeholder={isDm ? 'Message ' + currentLabel : 'Message #' + currentRoom} value={composer} aria-label="Message"
              onChange={(e) => { setComposer(e.target.value); caretRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd }; notifyTyping(); }}
              onSelect={rememberCaret} onKeyUp={rememberCaret} onClick={rememberCaret} onBlur={rememberCaret}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <IB label="Emoji" active={showEmoji} onClick={toggleEmoji} data-emoji-trigger=""
              aria-haspopup="dialog" aria-expanded={showEmoji} aria-controls={showEmoji ? 'ct-emoji-picker' : undefined}><Smile size={17} /></IB>
            <button type="button" className="ct-send" aria-label="Send" disabled={!composer.trim()} onClick={send}><Send size={16} /></button>
          </div>
          {(reactionError || actionError) && <div className="ct-reaction-error" role="alert">{reactionError || actionError}<button type="button" className="ct-link" onClick={() => { setReactionError(''); setActionError(''); }}>Dismiss</button></div>}
          {reactionTarget != null && <div className="ct-reaction-picker">
            <EmojiPopover dark={dark} onClose={(refocus) => { setSelectionReactOpen(false); closeReactionPicker(refocus); }} onSelect={(emoji) => {
              if (selectionReactOpen) {
                reactOnSelection(emoji);
                setSelectionReactOpen(false);
                setReactionTarget(null);
              } else {
                const target = messages.find((m) => String(m.id) === String(reactionTarget));
                if (target) toggleReaction(target, emoji);
                closeReactionPicker(true);
              }
            }} />
          </div>}
          {showEmoji && <EmojiPopover dark={dark} onSelect={applyEmoji} onClose={closeEmoji} />}
        </div>
        )}
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
                {user?.username && (
                  <div className="ct-uname">
                    <span className="ct-unameval">@{user.username}</span>
                    <button type="button" className="ct-unamecopy" aria-label="Copy username"
                      onClick={async () => {
                        const v = '@' + user.username;
                        try {
                          await navigator.clipboard.writeText(v);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = v; document.body.appendChild(ta); ta.select();
                          try { document.execCommand('copy'); } catch { /* clipboard unavailable */ }
                          ta.remove();
                        }
                        setCopiedUname(true);
                        setTimeout(() => setCopiedUname(false), 2000);
                      }}>
                      {copiedUname ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUname ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <div className="ct-facts">
                  <div><span><MapPin size={13} /> Location</span><b>—</b></div>
                  <div><span><Clock size={13} /> Time zone</span><b>—</b></div>
                  <div><span><Monitor size={13} /> Status</span><b>Online</b></div>
                </div>
                <div className="ct-stats">
                  <div><b>{convos.length}</b><span>Chats</span></div>
                  <div><b>{allUsers.length}</b><span>Contacts</span></div>
                  <div><b>{onlineContactCount}</b><span>Online</span></div>
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
                <button type="button" className="ct-btn wide" onClick={() => startDm(selUser)}>Message</button>
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
                <p className="ct-muted">{allUsers.length} contacts · {onlineContactCount} online</p>
                {allUsers.length === 0 ? (
                  // Privacy: People only shows users you share a dm/group with.
                  // Empty = you have not connected with anyone yet.
                  <div className="ct-empty">
                    <p className="ct-emptytitle">No contacts yet</p>
                    <p className="ct-muted">Invite someone by @username — once connected, you both appear here. Nobody else can see you until you invite them.</p>
                    <button type="button" className="ct-btn wide" onClick={openInvite}><UserPlus size={15} /> Invite by username</button>
                  </div>
                ) : (
                  <>
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
                  {shownUsers.length === 0 && <li className="ct-muted">No matches</li>}
                </ul>
                  </>
                )}
                {allUsers.length > 0 && <button type="button" className="ct-btn wide" onClick={openInvite}><UserPlus size={15} /> Invite teammate</button>}
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
                <h3>About {currentConvo?.type === 'group' ? groupInfo?.room?.label || currentLabel : '#' + currentRoom}</h3>
                <p className="ct-muted">{messages.length} messages · live via Socket.IO</p>
                {currentConvo?.type === 'group' && (
                  <>
                    <h3>Members{groupInfo ? ' (' + groupInfo.members.length + ')' : ''}</h3>
                    {groupInfoBusy && <p className="ct-muted">Loading members…</p>}
                    {!groupInfoBusy && groupInfo && (
                      <ul className="ct-ppl">
                        {groupInfo.members.map((m) => {
                          const mine = String(m.id) === String(user?.id);
                          const owner = String(groupInfo.room?.ownerId) === String(m.id);
                          return (
                            <li key={m.id}>
                              <span className="ct-grpmem">
                                <Av name={nameOf(m)} size={30} online={isOnlineU(m)} />
                                <span className="ct-pplm"><strong>{nameOf(m)}{mine ? ' (you)' : ''}{owner ? ' · owner' : ''}</strong><small>@{m.username}</small></span>
                                {!mine && String(groupInfo.room?.ownerId) === String(user?.id) && (
                                  <button type="button" className="ct-ghost danger" onClick={() => changeGroupMember('remove_group_member', m.id)}>Remove</button>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {!groupInfoBusy && !groupInfo && <p className="ct-muted">Open the group to load its roster.</p>}
                    <button type="button" className="ct-ghost wide" onClick={() => loadGroupInfo(groupRoomId)} disabled={groupInfoBusy || !groupRoomId}><Users size={15} /> Refresh members</button>
                    {groupInfo && String(groupInfo.room?.ownerId) !== String(user?.id) && (
                      <button type="button" className="ct-ghost danger wide" onClick={() => changeGroupMember('leave_group', user?.id)}><LogOut size={15} /> Leave group</button>
                    )}
                  </>
                )}
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
      {inviteOpen && (
        <div className="ct-invite" role="dialog" aria-modal="true" aria-label="Invite someone" onClick={closeInvite}>
          <div className="ct-invitebox" onClick={(e) => e.stopPropagation()}>
            {inviteDone ? (
              <div className="ct-invdone">
                <span className="ct-invicon done"><Check size={22} /></span>
                <h3>Invite sent</h3>
                <p className="ct-muted">You can now chat with <b>@{inviteDone.label}</b> — the conversation is ready on both sides.</p>
                <div className="ct-invbtns">
                  {inviteDone.room && (
                    <button type="button" className="ct-btn" onClick={() => { setInviteOpen(false); openRoom(inviteDone.room); }}>
                      <Send size={14} /> Open conversation
                    </button>
                  )}
                  <button type="button" className="ct-ghost" onClick={openInvite}><UserPlus size={14} /> Invite another</button>
                </div>
              </div>
            ) : (
              <>
                <div className="ct-invhead">
                  <span className="ct-invicon"><UserPlus size={20} /></span>
                  <div>
                    <h3>Invite someone</h3>
                    <p className="ct-muted">Start a private chat with their @username.</p>
                  </div>
                  <IB label="Close invite" onClick={closeInvite}><X size={16} /></IB>
                </div>
                {user?.username && (
                  <div className="ct-invown">
                    <span>Share yours: <b>@{user.username}</b></span>
                    <button type="button" className="ct-unamecopy" onClick={copyInviteHandle}>
                      {copiedUname ? <Check size={13} /> : <Copy size={13} />}
                      {copiedUname ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}
                <form onSubmit={submitInvite}>
                  <label className={'ct-invfield' + (inviteError ? ' invalid' : '')}>
                    <span className="at" aria-hidden="true">@</span>
                    <input value={inviteName}
                      onChange={(e) => { setInviteName(e.target.value); setInviteError(''); }}
                      placeholder="their username, e.g. priya"
                      autoFocus spellCheck={false} autoComplete="off" maxLength={30}
                      aria-label="Username to invite" disabled={inviteBusy} />
                  </label>
                </form>
                {inviteError && <p className="ct-inverror" role="alert">{inviteError}</p>}
                <div className="ct-invbtns">
                  <button type="button" className="ct-btn" disabled={inviteBusy || !inviteName.trim()} onClick={submitInvite}>
                    {inviteBusy ? 'Inviting…' : 'Send invite'}
                  </button>
                  <button type="button" className="ct-ghost" disabled={inviteBusy} onClick={closeInvite}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
