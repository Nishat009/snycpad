# SyncPad

SyncPad is a real-time collaborative workspace for writing code and sketching ideas together. Create a room, invite collaborators, edit code in a Monaco editor, and draw on a shared whiteboard. Yjs CRDT synchronization merges simultaneous edits and reconnects missed changes; MongoDB stores room and document state between sessions.

**Stack:** Next.js 15 (App Router), React 19, Tailwind CSS 4, Monaco, Socket.io, Express, Yjs, MongoDB (Mongoose), and JWT.

## Features

- Account registration and login with password hashing and HTTP-only authentication cookies.
- Public and private rooms, invitations by account email, member removal, and live online presence.
- A shared Monaco code editor with language selection, remote cursors, and per-user undo.
- A collaborative whiteboard whose strokes synchronize with the room.
- Realtime Yjs document synchronization, including reconnect recovery and debounced MongoDB persistence.
- Room lifecycle management, idle-session cleanup, configurable retention, and graceful shutdown.

## Requirements

- Node.js 20 or later and npm.
- MongoDB running locally or reachable through a MongoDB connection URI.
- Internet access for the Monaco editor, which loads from the jsDelivr CDN by default.

## Installation and local development

1. Clone the repository and enter its directory:

   ```sh
   git clone https://github.com/Nishat009/snycpad.git
   cd snycpad
   ```

2. Install dependencies from the committed lockfile:

   ```sh
   npm ci
   ```

3. Start MongoDB. The default connection is `mongodb://127.0.0.1:27017/syncpad`. To use a different database, set `MONGO_URI` in the server environment file.

4. Create the server environment file:

   ```sh
   # Windows PowerShell
   Copy-Item server/.env.example server/.env

   # macOS / Linux
   cp server/.env.example server/.env
   ```

   Review the values in `server/.env`. For local development, the defaults use port `4000`, the local MongoDB URI, and the client origins on port `3000`. Set `JWT_SECRET` to a long, random value, especially outside local development.

5. Optionally configure the client. The defaults already connect the Next.js API proxy to `http://localhost:4000` and the browser socket to the current host on port `4000`. If either service runs elsewhere, copy `client/.env.example` to `client/.env.local` and set `API_URL` and/or `NEXT_PUBLIC_SOCKET_URL` to the appropriate addresses.

6. Start both applications:

   ```sh
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), register an account, and create a room. To try collaboration, open the room from another browser profile or an incognito window and sign in with another account.

## Configuration

Server settings belong in `server/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Express and Socket.io port |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/syncpad` | MongoDB connection |
| `JWT_SECRET` | Development-only fallback | Signing secret; must be explicitly set in production |
| `CLIENT_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | Comma-separated browser origins allowed by CORS |
| `PERSIST_DEBOUNCE_MS` | `1500` | Quiet period before persisting room edits |
| `PERSIST_MAX_WAIT_MS` | `10000` | Maximum wait before persisting during continuous edits |
| `SESSION_IDLE_MINUTES` | `5` | How long an empty room stays in memory before it is flushed and unloaded |
| `SOCKET_IDLE_MINUTES` | `30` | Inactivity timeout for a connected user |
| `ROOM_TTL_DAYS` | `30` | Delete rooms untouched for this many days; `0` disables expiry |

Client settings belong in `client/.env.local` when defaults are not suitable:

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:4000` | Server-side destination for the Next.js `/api/*` proxy |
| `NEXT_PUBLIC_SOCKET_URL` | Current browser host on port `4000` | Socket.io server URL used in the browser |

When deploying across domains, configure `API_URL`, `NEXT_PUBLIC_SOCKET_URL`, and `CLIENT_ORIGIN` to match your frontend and backend addresses. Use HTTPS/WSS and a strong, private `JWT_SECRET` in production.

## Commands

Run from the repository root:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API server on port 4000 and web app on port 3000 |
| `npm run typecheck` | Type-check both workspaces |
| `npm run build` | Build the server and web app |
| `npm run start` | Start both built applications |
| `npm run test:smoke` | Exercise the API and realtime behavior against a running server |

The smoke test creates test accounts and rooms in the configured database. Run it against a development or dedicated test database, not production. Start the server with `npm run dev` in one terminal, then run `npm run test:smoke` in another.

## Production build

1. Set production environment variables, including `NODE_ENV=production`, `JWT_SECRET`, `MONGO_URI`, and the deployed client origin. Configure the client environment values for the deployed server as well.
2. Install dependencies with `npm ci`.
3. Build both workspaces using `npm run build`.
4. Start both processes using `npm run start`, or run the server and client workspace start scripts under your process manager.

The server refuses to start in production with its development fallback JWT secret. Use a process manager and configure MongoDB backups and network access for your deployment.

## API and realtime overview

REST API calls use `/api/*`; the Next.js app proxies them to the server so authentication cookies remain first-party.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Account and session management |
| `GET` | `/api/auth/me`, `/api/auth/socket-token` | Current account and short-lived socket token |
| `GET`, `POST` | `/api/rooms` | List accessible rooms and create a room |
| `GET`, `PATCH`, `DELETE` | `/api/rooms/:code` | Open, update, or delete a room |
| `POST`, `DELETE` | `/api/rooms/:code/members`, `/api/rooms/:code/members/:userId` | Invite, remove, or leave a room |
| `GET` | `/api/health` | Server health and live connection counts |

Socket.io events include `room:join`, `sync:update`, `awareness:update`, `presence:heartbeat`, `room:updated`, and `room:ended`. Private-room access is checked on both HTTP requests and socket joins.

---

## Architecture

```
 Browser A                         Server (Express + Socket.io)                 MongoDB
┌──────────────────┐   binary    ┌──────────────────────────────┐   debounced  ┌──────────┐
│ Monaco ⇄ Y.Text  │  updates    │ SessionManager                │   snapshot   │ users    │
│ Canvas ⇄ Y.Array │ ──────────► │  └ RoomSession (per room)     │ ───────────► │ rooms    │
│ Awareness        │ ◄────────── │     Y.Doc + Awareness         │              │ snippets │
└──────────────────┘  io.to(room)│     relays to other sockets   │              └──────────┘
 Browser B ...                   └──────────────────────────────┘
```

### 1. Client ↔ server communication
- **REST** (`/api/*`) handles auth, rooms, and members. Next.js proxies it ([next.config.ts](client/next.config.ts)), so the auth cookie stays first-party.
- The **WebSocket** connects to Socket.io directly. Every handshake fetches a short-lived (5 min) *socket token*, so the socket also works when the API is on a different domain.

### 2. State synchronization ([provider.ts](client/src/lib/collab/provider.ts), [sessions.ts](server/src/realtime/sessions.ts))
- The server holds one in-memory `Y.Doc` per active room. The server is just another CRDT peer: it applies each update, then relays it to the rest of the room (`io.to(room).except(sender)`).
- **Join/reconnect handshake.** The client sends its *state vector*. The server replies with only the updates the client is missing, plus the server's own state vector. The client then sends back only what the server is missing. Edits made while offline sync automatically.
- **Awareness** (y-protocols) carries cursors, selections, and whiteboard pointers. When a socket disconnects, its presence is removed immediately.

### 3. Optimistic UI
- Every keystroke is applied to the local `Y.Doc` first, so typing has no lag. The update goes to the server in the background.
- The `Live / Syncing / Offline` badge tracks unacknowledged updates.
- On the dashboard, deleting a room is optimistic and rolls back on failure.

### 4. Conflict resolution
- `Y.Text` handles the code and `Y.Array<Y.Map>` holds the whiteboard strokes. Both live in **one shared doc**.
- There is a custom [Monaco binding](client/src/lib/collab/monaco-binding.ts) instead of `y-monaco`, because `y-monaco` breaks under Next.js SSR and with CDN-loaded Monaco. The custom binding:
  - preserves your caret with CRDT *relative positions* when remote edits land near it
  - gives each user their own undo stack (`Y.UndoManager`). **Ctrl+Z only undoes your own changes**, never a teammate's.
  - renders remote cursors and selections with name labels

### 5. Auth & authorization
- Passwords are hashed with bcrypt. A JWT is stored in an `httpOnly`, `SameSite=Lax` cookie.
- The Socket.io middleware verifies the token before a connection is accepted. `room:join` re-checks access on every join.
- **Public room:** any signed-in user with the link can join. Joining adds the room to their dashboard.
- **Private room:** only the owner and invited members can join (403 over HTTP, `FORBIDDEN` over the socket). If the owner removes a member, that member is kicked from the live session immediately.

### 6. Session management
| Mechanism | Default | Config |
|---|---|---|
| Persist debounce: one DB write per burst of edits | 1.5 s (max wait 10 s) | `PERSIST_DEBOUNCE_MS`, `PERSIST_MAX_WAIT_MS` |
| Empty room is flushed to the DB and unloaded from memory | 5 min | `SESSION_IDLE_MINUTES` |
| Idle user is disconnected; awareness renewals don't count as activity | 30 min | `SOCKET_IDLE_MINUTES` |
| Room untouched for N days is deleted by the janitor | 30 days | `ROOM_TTL_DAYS` (0 = off) |
| Owner deletes a room: everyone gets `room:ended` live | — | — |
| Graceful shutdown (SIGINT/SIGTERM) flushes all live rooms | — | — |

---

## Data model

| Collection | Fields |
|---|---|
| `users` | `name`, `email` (unique), `passwordHash`, `avatar`, `created_at` |
| `rooms` | `title`, `room_code` (unique, e.g. `k7m-p2xq-9ad`), `owner_id`, `is_private`, `members[]`, `last_active_at`, `created_at` |
| `snippets` | `room_id` (unique), `content` (plain-text projection), `language`, `yjs_state` (binary CRDT state, the source of truth), `updated_at` |

## API

| Method | Path | |
|---|---|---|
| POST | `/api/auth/register` · `/login` · `/logout` | |
| GET | `/api/auth/me` · `/api/auth/socket-token` | |
| GET / POST | `/api/rooms` | list mine / create |
| GET / PATCH / DELETE | `/api/rooms/:code` | open (joins public) / rename + privacy / delete (owner) |
| POST | `/api/rooms/:code/members` | invite by email (owner) |
| DELETE | `/api/rooms/:code/members/:userId` | remove (owner) · `me` = leave |

Socket events: `room:join` (ack), `sync:update`, `awareness:update`, `presence:heartbeat`, `room:updated`, `room:ended`.

## Project layout

```
server/src
  index.ts              Express + Socket.io bootstrap, graceful shutdown
  realtime/sessions.ts  RoomSession (Y.Doc, awareness, persistence, eviction) + SessionManager
  realtime/socket.ts    handshake auth, join/sync/awareness handlers, idle sweeper
  routes/               auth, rooms (REST)
  models/               User, Room, Snippet
  services/             access rules, janitor
client/src
  app/                  / · /login · /register · /dashboard · /room/[code]
  lib/collab/           CollabProvider, MonacoBinding, React hooks
  components/workspace/ Workspace, CodeEditor, Whiteboard, RoomSettings
scripts/smoke.mjs       end-to-end test (2 users, concurrent edits, privacy, persistence)
```

> Note: Monaco loads from the jsDelivr CDN (the `@monaco-editor/react` default), so the editor needs internet access.
# snycpad
