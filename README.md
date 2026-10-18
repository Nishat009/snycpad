# SyncPad — Real-Time Collaborative Code & Whiteboard

A collaborative code editor (Monaco, the VS Code editor) plus a shared whiteboard. Everyone in a room edits the same document at the same time. Concurrent edits are merged with **Yjs CRDTs**, so no one's work gets lost or overwritten.

**Stack:** Next.js 15 (App Router) · React 19 · Tailwind v4 · Monaco · Socket.io · Express · Yjs · MongoDB (Mongoose) · JWT

---

## Quick start

Requirements: Node 20+ and MongoDB running on `mongodb://127.0.0.1:27017`.

```bash
npm install
cp server/.env.example server/.env   # adjust if needed
npm run dev                          # server :4000 + client :3000
```

Open http://localhost:3000, create an account, and create a room. To try collaboration, open the room link in a second browser profile or an incognito window and sign in as a different user.

```bash
npm run test:smoke     # end-to-end checks against the running server
npm run typecheck
npm run build
```

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
