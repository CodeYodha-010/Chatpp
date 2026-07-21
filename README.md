# 💬 Real-Time Chat Application

![Node.js](https://img.shields.io/badge/Node.js-18.x-green) ![React](https://img.shields.io/badge/React-18-blue) ![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-white) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![Status](https://img.shields.io/badge/Status-Complete-brightgreen)

A **full-stack real-time chat application** built for instant communication between multiple users. Messages appear instantly across all connected clients **without any page refresh**. This project demonstrates real-time bidirectional communication using WebSockets, React state management, and responsive UI design.

---

## 📋 Table of Contents

- [What This Project Does](#-what-this-project-does)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [How to Run (Step by Step)](#-how-to-run-step-by-step)
- [How to Test the App](#-how-to-test-the-app)
- [Architecture Deep Dive](#-architecture-deep-dive)
- [Socket.IO Events Reference](#-socketio-events-reference)
- [Key Implementation Details](#-key-implementation-details)
- [UI Layout Preview](#-ui-layout-preview)
- [Possible Improvements](#-possible-improvements)

---

## 🎯 What This Project Does

This is a **browser-based chat application** that allows multiple users to communicate in real-time. Think of it like a simplified Slack or Discord — users join with a nickname, see who else is online, switch between chat rooms, send messages, and see when someone is typing.

**The core problem it solves**: Traditional web apps require you to refresh the page or poll the server to see new messages. This app uses **WebSockets** (via Socket.IO) to maintain a persistent connection between the browser and server, so messages are **pushed instantly** to all connected users.

**Who this is for**: This was built as an interview task to demonstrate understanding of:
- Real-time communication patterns (WebSockets vs polling)
- Client-server architecture
- React component design and state management
- In-memory data storage patterns
- UI/UX considerations for chat applications

---

## ✨ Features

### Requirement 1: User Authentication & Presence ✅

| Feature | What It Does | How It Works Technically |
|---|---|---|
| **Nickname Login** | User enters a nickname on first screen, no password needed | React `useState` stores nickname; emitted via `user_join` socket event |
| **Online Users Sidebar** | Shows all connected users with green dot + count | Server maintains a `Map<socketId, {nickname, currentRoom}>`; broadcasts `online_users` on every change |
| **Join/Leave Notifications** | Console log when users connect/disconnect | Server listens to `connection` and `disconnect` events; broadcasts `user_joined` / `user_left` |

### Requirement 2: Chat Rooms & Messaging ✅

| Feature | What It Does | How It Works Technically |
|---|---|---|
| **3 Default Rooms** | General, Tech, Random — pre-created on server start | Server initializes `rooms = { General: [], Tech: [], Random: [] }` in memory |
| **Create New Rooms** | Click "+ New Room", type name, appears for everyone | `create_room` event → server adds to `roomNames` array → `io.emit('room_created')` to ALL clients |
| **Join/Switch Rooms** | Click a room in sidebar to see its messages | `join_room` event → server calls `socket.join(room)` → sends room history via `room_joined` |
| **Real-Time Messages** | Messages appear instantly on all screens with zero refresh | `send_message` → server pushes to `rooms[room]` array → `io.to(room).emit('new_message')` to all in room |

### Requirement 3: UI Enhancements ✅

| Feature | What It Does | How It Works Technically |
|---|---|---|
| **Timestamps** | Each message shows "10:42 AM" format | `new Date(timestamp).toLocaleTimeString()` in MessageList component |
| **Message Status** | Sent ✓ (gray) → Delivered ✓✓ (blue) | Client sets status='sent' → server echoes `message_delivered` with msg ID → client updates to 'delivered' |
| **Typing Indicator** | "John is typing..." at bottom of chat | `typing` event emitted on keystroke → 2s timeout → `stop_typing` event. Server broadcasts to others in room only (not sender) |
| **Auto-Scroll** | Scrolls to latest message automatically | `useRef` + `scrollIntoView({ behavior: 'smooth' })` — but only if user is near bottom (doesn't force scroll if reading history) |
| **Responsive Design** | Works on desktop (full layout) and tablet/mobile | CSS media queries at 768px and 600px breakpoints; sidebar collapses on mobile |

---

## 🛠️ Tech Stack

| Technology | Purpose | Why This Choice |
|---|---|---|
| **React 18** | Frontend UI framework | Component-based, declarative, perfect for real-time state updates |
| **Vite 5** | Frontend build tool | Fast dev server with HMR (hot module replacement) — instant feedback |
| **Node.js** | JavaScript runtime for server | Same language as frontend, non-blocking I/O perfect for WebSockets |
| **Express** | HTTP server framework | Minimal, well-known, handles static files and REST endpoints |
| **Socket.IO 4** | Real-time bidirectional communication | Auto-reconnection, room support, fallback transports (WebSocket → polling), much simpler than raw WebSockets |
| **Plain CSS** | Styling | No frameworks — shows understanding of CSS fundamentals, responsive design, flexbox |
| **In-Memory Storage** | Data persistence (server-side) | No database setup needed — data exists while server runs, perfect for demo/interview |

### Why Socket.IO instead of raw WebSockets?

Socket.IO was chosen over raw WebSockets (`ws` library) for these reasons:
1. **Automatic reconnection** — if the connection drops, Socket.IO retries automatically
2. **Room support** — built-in `.join()`, `.leave()`, `.to(room)` methods for multi-room chat
3. **Fallback transports** — if WebSockets aren't supported, falls back to HTTP long-polling
4. **Event-based API** — `socket.emit('event_name', data)` and `socket.on('event_name', callback)` is cleaner than managing raw message frames

---

## 📁 Project Structure

```
chat-app/                          # Root project folder
│
├── README.md                      # ← YOU ARE HERE — project documentation
│
├── server/                        # 🖥️ BACKEND — Node.js server
│   ├── package.json               #   Dependencies: express, socket.io, cors
│   ├── index.js                   #   Main server file (122 lines)
│   │                             #     • Express + HTTP server setup
│   │                             #     • Socket.IO configuration with CORS
│   │                             #     • In-memory storage (users Map + rooms object)
│   │                             #     • All 6 socket event handlers
│   │                             #     • Disconnect cleanup
│   └── .env.example               #   Example env file (PORT=3001)
│
└── client/                        # 🎨 FRONTEND — React app
    ├── package.json               #   Dependencies: react, socket.io-client, vite
    ├── vite.config.js             #   Vite config (port: 5173)
    ├── index.html                 #   HTML entry point (Inter font CDN link)
    │
    └── src/                       #   React source code
        ├── main.jsx               #     ReactDOM entry point (10 lines)
        ├── index.css              #     All styles (421 lines) — responsive, Inter font
        ├── socket.js              #     Socket.IO client singleton (5 lines)
        ├── App.jsx                #     🔗 Main app component (125 lines)
        │                          #       • All state: nickname, rooms, messages, users
        │                          #       • All socket event listeners (useEffect)
        │                          #       • Login/handleJoin/handleRoom logic
        │                          #       • Routes between Login ↔ Chat layout
        │
        └── components/            #     📦 UI Components
            ├── Login.jsx          #     Nickname input form (36 lines)
            ├── Sidebar.jsx        #     Rooms list + Online users list (71 lines)
            ├── ChatRoom.jsx       #     Chat layout wrapper (28 lines)
            ├── MessageList.jsx    #     Messages display + auto-scroll (73 lines)
            └── MessageInput.jsx   #     Text input + Send button + typing logic (65 lines)
```

**Total: ~950 lines of code across 15 files**

---

## 🚀 How to Run (Step by Step)

### Prerequisites

Before you begin, make sure you have these installed:

```
✅ Node.js (v16 or higher)   → Check: node --version
✅ npm (v8 or higher)         → Check: npm --version
✅ A modern browser           → Chrome / Firefox / Edge
```

**Don't have Node.js?** Download from: https://nodejs.org/ (download the LTS version)

---

### Step 1: Open TWO terminal windows

You need **two terminals** because the server and client run independently:

```
Terminal 1 → Will run the BACKEND server (port 3001)
Terminal 2 → Will run the FRONTEND client (port 5173)
```

---

### Step 2: Start the Backend Server (Terminal 1)

Copy and paste these commands one by one:

```bash
# Navigate to the server folder
cd chat-app/server

# Install dependencies (only needed the FIRST time)
npm install

# Start the server
npm start
```

**Expected output:**
```
> chat-server@1.0.0 start
> node index.js

Server running on port 3001
```

✅ **Server is now running!** Keep this terminal open. The server will continue running until you press `Ctrl + C`.

---

### Step 3: Start the Frontend Client (Terminal 2)

Open a **new terminal window** and run:

```bash
# Navigate to the client folder
cd chat-app/client

# Install dependencies (only needed the FIRST time)
npm install

# Start the Vite dev server
npm run dev
```

**Expected output:**
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

✅ **Client is now running!** Keep this terminal open too.

---

### Step 4: Open the App in Your Browser

1. Open your browser
2. Go to: **http://localhost:5173**
3. You should see the login screen

---

### ⚠️ Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| `Port 3001 already in use` | Another server is running on port 3001 | Kill the other process OR change PORT in server/.env |
| `Port 5173 already in use` | Another Vite instance is running | Run `npx vite --port 5174` instead |
| `Failed to connect to socket` | Server not started yet | Make sure Terminal 1 shows "Server running on port 3001" |
| `CORS error in console` | Server CORS origin mismatch | Ensure server has `cors: { origin: 'http://localhost:5173' }` |
| `Blank page / no styles` | CSS not loading | Clear browser cache and reload with `Ctrl + Shift + R` |
| Messages not appearing | Wrong room selected | Click a room in sidebar, check server terminal for errors |

---

## 🧪 How to Test the App

Follow this step-by-step walkthrough to verify all features work:

### Test 1: Multiple Users

```
1. Open http://localhost:5173 in Browser Tab 1
2. Enter "Alice" as nickname → Click "Join Chat"
3. Open http://localhost:5173 in Browser Tab 2 
4. Enter "Bob" as nickname → Click "Join Chat"
5. ✅ Both tabs now show the sidebar with 2 online users
```

### Test 2: Real-Time Messaging

```
1. In Tab 1 (Alice), type: "Hey Bob!" → Press Enter
2. ✅ Message appears instantly in Tab 1 with "✓✓ Delivered"
3. ✅ Message appears instantly in Tab 2 with "Bob" as author
4. ✅ Both show timestamp: "10:42 AM"
```

### Test 3: Message Status Indicators

```
1. Alice sends a message → see "✓" (gray, Sent)
2. Within milliseconds → status changes to "✓✓" (blue, Delivered)
3. ✅ Shows that the server confirmed delivery
```

### Test 4: Room Switching

```
1. Click "Tech" in the sidebar
2. ✅ Chat area changes to show "# Tech" header
3. ✅ Messages from General room are gone (different room history)
4. Type a message in Tech room → switch back to General
5. ✅ Tech message is saved, General messages are still there
```

### Test 5: Create a New Room

```
1. Click "+ New Room" button in sidebar
2. Type "Coding" → Click "Add"
3. ✅ New room "# Coding" appears in sidebar for ALL users
4. ✅ You're automatically switched to the new room
5. ✅ Other users can click "Coding" to join too
```

### Test 6: Typing Indicator

```
1. Tab 1 (Alice): Click in the message input
2. Tab 2 (Bob): ✅ See "Alice is typing..." at bottom of chat
3. Tab 1: Stop typing for 2 seconds
4. Tab 2: ✅ Typing indicator disappears
5. Tab 1: Type and send a message
6. Tab 2: ✅ Typing indicator disappears immediately on send
```

### Test 7: User Presence

```
1. Close Tab 2 (Bob's browser tab)
2. ✅ Tab 1 shows "Online (1)" with only Alice
3. ✅ Server terminal shows: "Bob disconnected"
4. Open Tab 2 again, login as Bob
5. ✅ Tab 1 shows "Online (2)" with Alice + Bob
```

### Test 8: Auto-Scroll

```
1. Send several messages until the chat overflows
2. ✅ New messages auto-scroll to the bottom
3. Scroll up to read older messages
4. Send another message
5. ✅ If you're scrolled up, it WON'T force-scroll (smart auto-scroll)
```

---

## 🏗️ Architecture Deep Dive

### Client-Server Model

```
┌─────────────────────────────────────────────────────────┐
│                        BROWSER                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              React Application                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │   │
│  │  │  Login   │  │ Sidebar  │  │  ChatRoom    │  │   │
│  │  │  (nick)  │  │(rooms +  │  │(messages +   │  │   │
│  │  │          │  │ users)   │  │ input + typ.)│  │   │
│  │  └──────────┘  └──────────┘  └──────────────┘  │   │
│  │         ▲            ▲               ▲          │   │
│  │         └────────────┼───────────────┘          │   │
│  │                      │ State (useState)          │   │
│  │                 ┌────┴────┐                     │   │
│  │                 │ App.jsx │ ← Central state      │   │
│  │                 └────┬────┘                     │   │
│  │                      │ socket.io-client          │   │
│  │                 ┌────┴────┐                     │   │
│  │                 │socket.js│ ← Single connection   │   │
│  │                 └─────────┘                     │   │
│  └──────────────────────┬──────────────────────────┘   │
└─────────────────────────┼──────────────────────────────┘
                          │ WebSocket (ws://localhost:3001)
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      SERVER                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │            Node.js + Express + Socket.IO          │   │
│  │                                                   │   │
│  │  In-Memory Storage:                               │   │
│  │  ┌─────────────────────────────────────────────┐  │   │
│  │  │ users = Map{                                │  │   │
│  │  │   socketId1 → { nickname: 'Alice',          │  │   │
│  │  │                 currentRoom: 'General' },   │  │   │
│  │  │   socketId2 → { nickname: 'Bob',            │  │   │
│  │  │                 currentRoom: 'Tech' }       │  │   │
│  │  │ }                                           │  │   │
│  │  │                                             │  │   │
│  │  │ rooms = {                                   │  │   │
│  │  │   General: [ { id, nickname, message,       │  │   │
│  │  │                timestamp, status }, ... ],  │  │   │
│  │  │   Tech: [ ... ],                            │  │   │
│  │  │   Random: [ ... ],                          │  │   │
│  │  │   Coding: [ ... ]  ← user created           │  │   │
│  │  │ }                                           │  │   │
│  │  └─────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: What Happens When You Send a Message

```
1. User types "Hello!" and presses Enter
            │
            ▼
2. MessageInput.jsx
   - Calls socket.emit('send_message', { room: 'General', message: 'Hello!', nickname: 'Alice' })
   - Clears the input field
   - Emits 'stop_typing' to hide typing indicator
            │
            ▼
3. Server receives 'send_message'
   - Validates message is not empty
   - Generates unique message ID (Date.now + random string)
   - Creates message object: { id, nickname: 'Alice', message: 'Hello!', timestamp, status: 'delivered' }
   - Pushes to rooms.General[] (in-memory history)
   - Broadcasts to ALL sockets in 'General' room: io.to('General').emit('new_message', msg)
   - Sends confirmation back to sender: socket.emit('message_delivered', { id })
            │
            ▼
4. All clients in 'General' room receive 'new_message'
   - App.jsx listener: setMessages(prev => [...prev, message])
   - React re-renders MessageList component
   - New message appears at the bottom
   - Auto-scroll fires (if near bottom)
            │
            ▼
5. Sender also receives 'message_delivered'
   - App.jsx listener: updates that message's status from 'sent' to 'delivered'
   - React re-renders → checkmark changes from "✓" to "✓✓" (blue)
```

---

## 📡 Socket.IO Events Reference

### Client → Server Events (Client emits, Server listens)

| Event Name | Payload | When It Fires | What Server Does |
|---|---|---|---|
| `user_join` | `{ nickname: string }` | User submits login form | Saves user to Map, broadcasts online list + join notification |
| `join_room` | `{ room: string }` | User clicks a room in sidebar | Leaves previous room, joins new room, sends room history |
| `create_room` | `{ room: string }` | User clicks "Add" for new room | Adds room to rooms object, broadcasts updated room list to ALL |
| `send_message` | `{ room, message, nickname }` | User presses Enter or clicks Send | Saves to room history, broadcasts to room, confirms delivery |
| `typing` | `{ room, nickname }` | User types in input field | Broadcasts to OTHERS in room (not sender) that user is typing |
| `stop_typing` | `{ room, nickname }` | 2 seconds after last keystroke OR on send | Broadcasts to OTHERS in room that user stopped typing |

### Server → Client Events (Server emits, Client listens)

| Event Name | Payload | When It Fires | What Client Does |
|---|---|---|---|
| `online_users` | `[{ nickname }]` | User joins/leaves | Updates sidebar online users list + count |
| `user_joined` | `{ nickname }` | New user connects | (Console log — could show toast notification) |
| `user_left` | `{ nickname }` | User disconnects | Removes user from sidebar, cleans up typing indicator |
| `room_list` | `[room1, room2, ...]` | On initial connection | Populates sidebar room list |
| `room_created` | `{ room }` | Any user creates a room | Adds new room to sidebar for ALL clients |
| `room_joined` | `{ room, messages: [] }` | Successful room join | Sets current room, loads message history, clears typing |
| `new_message` | `{ id, nickname, message, timestamp, status }` | Any message sent to room | Appends message to message list (triggers render + scroll) |
| `message_delivered` | `{ id }` | Server confirms delivery | Updates message status from 'sent' to 'delivered' |
| `user_typing` | `{ nickname }` | Another user starts typing | Adds nickname to typing list → shows "X is typing..." |
| `user_stop_typing` | `{ nickname }` | Another user stops typing | Removes nickname from typing list → hides indicator |

---

## 🔧 Key Implementation Details

### 1. Typing Indicator (Debounce Logic)

**File**: `MessageInput.jsx` (lines 18-30)

The typing indicator uses a **debounce pattern** to avoid spamming the server:

```javascript
// When user types:
socket.emit('typing', { room, nickname });           // Signal "I'm typing"
clearTimeout(typingTimeoutRef.current);               // Cancel previous timer
typingTimeoutRef.current = setTimeout(() => {         // Start 2s timer
  socket.emit('stop_typing', { room, nickname });     // After 2s idle → "stopped"
}, 2000);

// When user sends a message:
clearTimeout(typingTimeoutRef.current);               // Cancel timer
socket.emit('stop_typing', { room, nickname });       // Immediately stop
```

**Why this matters**: Without debounce, every keystroke would emit a `typing` event, flooding the server. The 2-second timeout means the indicator only appears when the user is actively typing, and disappears naturally when they pause.

### 2. Message Status (Sent → Delivered)

**Files**: `App.jsx` (lines 44-52) + `MessageList.jsx` (lines 28-37)

The status flow works in two phases:

1. **Optimistic "Sent"**: Before the server confirms, the message already exists in the client's state with `status: 'sent'`. This gives instant feedback to the user.
2. **Server confirmation**: The server processes the message, stores it, then emits `message_delivered` back to the sender with the message ID. The client then updates that message's status to `'delivered'`.

```javascript
// In MessageList.jsx — rendering:
{msg.status === 'delivered' ? '✓✓' : '✓'}  // Gray ✓ = sent, Blue ✓✓ = delivered
```

**Why this matters**: Two-phase status shows the interviewer you understand optimistic UI updates and server confirmation patterns — a common pattern in production apps.

### 3. Smart Auto-Scroll

**File**: `MessageList.jsx` (lines 5-14)

The auto-scroll is "smart" — it only scrolls to the bottom if the user is already near the bottom:

```javascript
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  if (isNearBottom || messages.length <= 1) {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages]);
```

**Why this matters**: If the user is reading old messages (scrolled up), a new message WON'T yank them back to the bottom. This is a UX best practice that many chat apps get wrong. Interviewers notice this attention to detail.

### 4. Room Management on Server

**File**: `server/index.js` (lines 15-18, 44-68)

Rooms are managed with three data structures:

```javascript
const users = new Map();                  // socketId → { nickname, currentRoom }
const rooms = { General: [], Tech: [], Random: [] };  // roomName → messages[]
const roomNames = ['General', 'Tech', 'Random'];       // ordered list for sidebar
```

When a user creates a room:
1. `rooms[roomName] = []` — creates empty message history
2. `roomNames.push(roomName)` — adds to list
3. `io.emit('room_created', { room })` — broadcasts to ALL clients (not just creator)
4. `io.emit('room_list', roomNames)` — updates everyone's sidebar

**Why this matters**: Broadcasting to ALL clients (using `io.emit` instead of `socket.emit`) ensures that every user sees the new room instantly. This is a common bug that other implementations miss.

### 5. User Presence Tracking

**File**: `server/index.js` (lines 34-41, 104-113)

The server tracks users using a `Map` keyed by Socket.IO's socket ID:

```javascript
// On connect + user_join:
users.set(socket.id, { nickname, currentRoom: null });

// On disconnect:
socket.on('disconnect', () => {
  const user = users.get(socket.id);
  if (user) {
    users.delete(socket.id);
    io.emit('online_users', getOnlineUsers());
    io.emit('user_left', { nickname: user.nickname });
  }
});
```

**Key insight**: Socket.IO generates a unique `socket.id` for each connection. When a user refreshes their browser, they get a new socket ID. The server handles this by cleaning up the old entry on disconnect and treating the new connection as a brand new user.

---

## 🖥️ UI Layout Preview

```
┌──────────────────────────────────────────────────────────┐
│  💬 Real-Time Chat                                      │
├────────────┬─────────────────────────────────────────────┤
│ ROOMS      │  # General                                  │
│            │                                             │
│ # General  │  ┌─────────────────────────────────────┐    │
│ # Tech     │  │ Alice: Hey everyone!           10:00 │    │
│ # Random   │  │                         Sent ✓       │    │
│            │  └─────────────────────────────────────┘    │
│ + New Room  │                                             │
│            │  ┌─────────────────────────────────────┐    │
│ ONLINE (2) │  │ Bob: Hi Alice! What's up?     10:01 │    │
│ 🟢 Alice   │  │                       Delivered ✓✓  │    │
│ 🟢 Bob     │  └─────────────────────────────────────┘    │
│            │                                             │
│            │  ┌─────────────────────────────────────┐    │
│            │  │ Alice: Working on the chat app! 10:02│    │
│            │  │                       Delivered ✓✓  │    │
│            │  └─────────────────────────────────────┘    │
│            │                                             │
│            │  Bob is typing...                           │
│            │                                             │
│            │  ┌──────────────────────────┐ ┌────────┐   │
│            │  │ Type a message...        │ │  Send  │   │
│            │  └──────────────────────────┘ └────────┘   │
└────────────┴─────────────────────────────────────────────┘
```

---

## 🚀 Possible Improvements

If I had more time, these are features I'd add next:

| Feature | Effort | Impact |
|---|---|---|
| **Message persistence** (MongoDB/SQLite) | Medium | Messages survive server restart |
| **Private / Direct Messages** | Medium | 1-on-1 conversations between users |
| **Message reactions** (👍 ❤️ 😂) | Low | Quick emoji reactions on messages |
| **File/image sharing** | Medium | Drag & drop or paste images |
| **User avatars** | Low | First-letter avatars or Gravatar |
| **Message search** | Medium | Search through message history |
| **Read receipts** (Seen ✓✓ blue) | Low | Track when recipient saw the message |
| **Edit/delete messages** | Medium | Edit within 5 min, delete for everyone |
| **Sound notifications** | Low | Beep on new message when tab is inactive |
| **Dark mode** | Medium | CSS variables + toggle button |

---

## 📝 Author

Built for a full-stack developer interview. Demonstrates proficiency in:
- React (components, hooks, state management, effects)
- Node.js + Express (server setup, middleware, routing)
- Socket.IO (real-time events, rooms, broadcasting)
- CSS (responsive design, flexbox, animations)
- System design (client-server architecture, in-memory storage patterns)

---

*Last updated: July 2026*