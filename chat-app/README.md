# ChatApp

![Node.js](https://img.shields.io/badge/Node.js-18.x-green) ![React](https://img.shields.io/badge/React-18-blue) ![Socket.IO](https://img.shields.io/badge/Socket.IO-4.7-white) ![Prisma](https://img.shields.io/badge/Prisma-5.22-black) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple)

A full-stack real-time chat application with JWT authentication, AES-256-GCM message encryption, AI-powered message priority classification, and PostgreSQL persistence.

---

## Features

- **JWT Authentication** — Register/login with email and password, refresh token rotation, session management
- **Real-Time Messaging** — Instant message delivery via Socket.IO WebSockets with room support
- **Message Encryption** — AES-256-GCM encryption for all messages, client-side decryption via Web Crypto API
- **AI Priority Classification** — Groq LLM automatically classifies messages as urgent, fyi, or social
- **Priority Filtering** — Filter chat messages by priority level with dedicated tabs
- **Message Search** — Cmd+K search with keyboard navigation (arrow keys, enter, escape)
- **Typing Indicators** — Debounced typing status with animated indicator
- **Online Presence** — Real-time online user list with green dot status
- **Message Status** — Sent (single check) to Delivered (double check) confirmation
- **Smart Auto-Scroll** — Only scrolls to bottom when user is near bottom
- **Responsive Dark UI** — Geist font, Framer Motion animations, mobile-friendly
- **Rate Limiting** — 3-tier rate limiting (general, auth, strict)
- **Audit Logging** — Tracks user registrations, logins, and logouts
- **Database Persistence** — PostgreSQL via Prisma ORM with proper schema and migrations

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, Vite 5, Framer Motion | UI framework, build tool, animations |
| **Real-Time** | Socket.IO 4 | WebSocket communication with rooms |
| **Backend** | Node.js, Express | HTTP server and REST API |
| **Database** | PostgreSQL, Prisma 5 | Persistent storage and ORM |
| **Auth** | JWT, bcrypt | Token-based authentication, password hashing |
| **Encryption** | AES-256-GCM (Web Crypto API) | Message encryption/decryption |
| **AI** | Groq SDK (Llama 3.3) | Message priority classification |
| **Security** | Helmet, express-rate-limit, Joi | Headers, rate limiting, validation |
| **Logging** | Winston | Structured logging with file transports |

---

## Project Structure

```
chat-app/
├── README.md
├── server/                          # Backend
│   ├── index.js                     # Express + Socket.IO server entry
│   ├── config/
│   │   ├── database.js              # Prisma client singleton
│   │   └── env.js                   # Joi-validated environment config
│   ├── middleware/
│   │   ├── auth.js                  # JWT auth (HTTP + Socket)
│   │   ├── errorHandler.js          # Global error handler
│   │   ├── rateLimit.js             # 3-tier rate limiting
│   │   ├── requestLogger.js         # HTTP request logging
│   │   └── validate.js              # Joi request validation
│   ├── models/
│   │   ├── Message.js               # Message CRUD operations
│   │   ├── Room.js                  # Room CRUD + membership
│   │   └── User.js                  # User CRUD + auth
│   ├── routes/
│   │   ├── auth.js                  # Register, login, logout, me
│   │   ├── rooms.js                 # Room CRUD + messages
│   │   └── users.js                 # User listing
│   ├── lib/
│   │   ├── crypto.js                # AES-256-GCM encryption
│   │   └── groq.js                  # AI priority classification
│   ├── utils/
│   │   ├── jwt.js                   # Token signing/verification
│   │   ├── logger.js                # Winston logger
│   │   └── password.js              # bcrypt hash/verify
│   ├── db/
│   │   └── seed.js                  # Database seeding
│   ├── prisma/
│   │   └── schema.prisma            # Database schema
│   ├── .env.example                 # Environment template
│   └── package.json
│
└── client/                          # Frontend
    ├── index.html
    ├── vite.config.js               # Vite + API proxy
    ├── package.json
    └── src/
        ├── main.jsx                 # React entry point
        ├── App.jsx                  # Root component, state, socket events
        ├── socket.js                # Socket.IO client singleton
        ├── api.js                   # HTTP API helpers
        ├── index.css                # Design system (Geist, dark theme)
        ├── utils/
        │   └── crypto.js            # Client-side AES decryption
        └── components/
            ├── AuthPage.jsx         # Login/register form
            ├── Sidebar.jsx          # Rooms + online users
            ├── ChatRoom.jsx         # Messages + search + priority tabs
            ├── MessageInput.jsx     # Message input + typing logic
            ├── SearchBar.jsx        # Cmd+K search overlay
            └── PriorityTabs.jsx     # Priority filter tabs
```

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or cloud like Supabase)
- npm or yarn

### 1. Clone and install

```bash
git clone https://github.com/CodeYodha-010/Chatpp.git
cd Chatpp

# Server
cd server
cp .env.example .env    # Edit with your values
npm install

# Client
cd ../client
npm install
```

### 2. Configure environment

Edit `server/.env` with your values:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/chatdb
JWT_SECRET=your-32-char-random-secret-here
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
GROQ_API_KEY=your-groq-api-key       # Optional: for AI priority
CHAT_ENCRYPTION_KEY=                  # Auto-generated if empty
```

### 3. Set up database

```bash
cd server
npx prisma generate
npx prisma db push
```

### 4. Run

```bash
# Terminal 1 - Server
cd server && npm start

# Terminal 2 - Client
cd client && npm run dev
```

Open http://localhost:5173

---

## Database Schema

```
users          rooms           room_members    messages
├── id         ├── id          ├── room_id     ├── id
├── username   ├── name        ├── user_id     ├── room_id
├── email      ├── description ├── role        ├── user_id
├── password_hash  ├── type    └── joined_at   ├── username
├── display_name   ├── created_by             ├── encrypted_content
├── avatar_color   └── is_archived            ├── iv
├── is_active                              ├── auth_tag
├── last_login_at                          ├── priority
├── created_at                             ├── parent_id
└── updated_at                             ├── is_edited
                                           ├── is_deleted
sessions       audit_log                         └── created_at
├── id         ├── id
├── user_id    ├── user_id
├── refresh_token  ├── action
├── ip_address ├── resource_type
├── user_agent ├── resource_id
├── expires_at ├── metadata
└── created_at ├── ip_address
               └── created_at
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Sign in |
| GET | `/api/auth/me` | Yes | Get current user |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/users` | Yes | List users |
| GET | `/api/users/:id` | Yes | Get user by ID |
| GET | `/api/rooms` | Yes | List rooms |
| POST | `/api/rooms` | Yes | Create room |
| GET | `/api/rooms/:id/messages` | Yes | Get room messages |

---

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `user_join` | `{ nickname }` | Join with display name |
| `join_room` | `{ room }` | Join a chat room |
| `create_room` | `{ room }` | Create new room |
| `send_message` | `{ room, message, nickname }` | Send message |
| `typing` | `{ room, nickname }` | Started typing |
| `stop_typing` | `{ room, nickname }` | Stopped typing |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `online_users` | `[{ nickname }]` | Updated user list |
| `room_list` | `[rooms]` | Updated room list |
| `room_created` | `{ room }` | New room created |
| `room_joined` | `{ room, messages }` | Joined room with history |
| `new_message` | `{ id, nickname, content, priority, timestamp }` | New message |
| `message_delivered` | `{ id }` | Delivery confirmation |
| `priority_updated` | `{ id, priority }` | AI classification result |
| `user_typing` | `{ nickname }` | User started typing |
| `user_stop_typing` | `{ nickname }` | User stopped typing |
| `user_joined` | `{ nickname }` | User connected |
| `user_left` | `{ nickname }` | User disconnected |

---

## Security

- **Passwords**: bcrypt hashed with configurable rounds
- **Sessions**: JWT access tokens + refresh token rotation with 30-day expiry
- **Encryption**: AES-256-GCM for message content with unique IV per message
- **Rate Limiting**: 100 req/15min general, 5 req/15min auth, 10 req/min strict
- **Headers**: Helmet middleware for security headers
- **Validation**: Joi schemas on all input endpoints
- **Audit**: Tracks register, login, logout events with IP address

---

## Testing

API integration tests live in [`server/tests/`](server/tests/) and run on Node's built-in test runner — no test-framework dependency.

```bash
cd server
npm i -D supertest && npm i socket.io-client    # one-time deps
npm start                                        # terminal 2: keep the app running
node --env-file=.env --test tests/               # run the suite
node --env-file=.env tests/cleanup.js --apply    # optional: delete generated test data
```

- Without a reachable server or `DATABASE_URL`, every suite **self-skips** (CI-safe).
- See [`server/tests/README.md`](server/tests/README.md) for the full guide, including rate-limit caveats.

---

## Load Testing (Baseline)

`k6/` contains a Socket.IO-aware load harness — `k6/lib/socketio.js` implements
engine.io v4 framing (namespace handshake, ping/pong) on top of k6's raw
WebSocket API, so real socket traffic can be measured.

```bash
# prerequisites: k6 installed (https://k6.io) + API running in another terminal
cd server && npm start

# from the repo root — pick one:
k6 run --env SCENARIO=smoke  k6/chat-load.js
k6 run --env SCENARIO=load   k6/chat-load.js
k6 run --env SCENARIO=stress k6/chat-load.js
```

Env knobs: `BASE_URL`, `WS_BASE`, `SCENARIO`, `SETUP_USERS`, `MSG_EVERY_MS`, `SESSION_MS`, `K6_ROOM`.

Each VU: registers/logs in → opens a WebSocket → `user_join` → `join_room` → sends
one encrypted message per second → measures **send → `message_delivered` latency**.
Test rows land in the `agentb-k6` room — removable with the cleanup script.

### Baseline — BEFORE Redis (single Node process, in-memory state)

| Metric | Threshold | Measured |
|---|---|---|
| message delivery p95 | < 500 ms | _(pending first smoke run)_ |
| HTTP p95 | < 500 ms | _(pending)_ |
| checks pass rate | > 99 % | _(pending)_ |

_After the Redis adapter / BullMQ phases land, the AFTER numbers go in this
same table so the scaling story is documented with data._

---

## License

MIT
