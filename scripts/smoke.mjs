// End-to-end smoke test against a running server (npm run dev).
// Usage: node scripts/smoke.mjs [http://localhost:4000]
import { io } from 'socket.io-client';
import * as Y from 'yjs';

const BASE = process.argv[2] ?? 'http://localhost:4000';
const stamp = Date.now();
let failures = 0;

const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

async function http(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

async function register(name) {
  const res = await http('/auth/register', {
    method: 'POST',
    body: { name, email: `${name.toLowerCase()}-${stamp}@test.dev`, password: 'password123' },
  });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.data)}`);
  return { ...res.data.user, cookie: res.cookie };
}

/** Minimal version of the browser CollabProvider. */
async function connect(user, roomCode) {
  const { data } = await http('/auth/socket-token', { cookie: user.cookie });
  const doc = new Y.Doc();
  const socket = io(BASE, { auth: { token: data.token }, transports: ['websocket'] });
  socket.on('sync:update', (u) => Y.applyUpdate(doc, new Uint8Array(u), 'remote'));
  doc.on('update', (u, origin) => origin !== 'remote' && socket.emit('sync:update', u));
  const res = await new Promise((resolve, reject) => {
    socket.on('connect_error', reject);
    socket.on('connect', () =>
      socket.emit('room:join', { roomCode, stateVector: Y.encodeStateVector(doc) }, resolve),
    );
  });
  if (res.ok) Y.applyUpdate(doc, new Uint8Array(res.update), 'remote');
  return { doc, socket, res };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const alice = await register('Alice');
const bob = await register('Bob');
const carol = await register('Carol');
check('register 3 users', true);

const me = await http('/auth/me', { cookie: alice.cookie });
check('GET /auth/me with cookie', me.status === 200 && me.data.user.name === 'Alice');
check('GET /auth/me without cookie → 401', (await http('/auth/me')).status === 401);

const created = await http('/rooms', { method: 'POST', cookie: alice.cookie, body: { title: 'Smoke test' } });
const code = created.data.room.room_code;
check('create room', created.status === 201, code);

const a = await connect(alice, code);
const b = await connect(bob, code);
check('both users join via socket', a.res.ok && b.res.ok);
check('initial content synced', a.doc.getText('code').toString().includes('Welcome to SyncPad'));

// Concurrent edits at the same position — the classic overwrite scenario.
const ta = a.doc.getText('code');
const tb = b.doc.getText('code');
ta.insert(0, 'AAA ');
tb.insert(0, 'BBB ');
await wait(500);
const sa = ta.toString();
const sb = tb.toString();
check('concurrent edits converge', sa === sb, JSON.stringify(sa.slice(0, 12)));
check('no edit lost', sa.includes('AAA ') && sa.includes('BBB '));

// Whiteboard shares the same doc.
const stroke = new Y.Map();
stroke.set('color', '#fff');
stroke.set('size', 4);
stroke.set('points', Y.Array.from([1, 2, 3, 4]));
a.doc.getArray('strokes').push([stroke]);
await wait(300);
check('whiteboard stroke synced', b.doc.getArray('strokes').length === 1);

// Bob joined a public room → appears on his dashboard.
const bobRooms = await http('/rooms', { cookie: bob.cookie });
check('public room appears on joiner dashboard', bobRooms.data.rooms.some((r) => r.room_code === code));

// Make private: Carol (not a member) must be refused over HTTP and WebSocket.
await http(`/rooms/${code}`, { method: 'PATCH', cookie: alice.cookie, body: { is_private: true } });
check('private room → 403 for outsider', (await http(`/rooms/${code}`, { cookie: carol.cookie })).status === 403);
const c = await connect(carol, code);
check('private room → socket join refused', !c.res.ok && c.res.error === 'FORBIDDEN');
c.socket.disconnect();

// Owner removes Bob → Bob gets kicked live.
const kicked = new Promise((resolve) => b.socket.on('room:ended', resolve));
await http(`/rooms/${code}/members/${bob.id}`, { method: 'DELETE', cookie: alice.cookie });
const kickEvent = await Promise.race([kicked, wait(2000).then(() => null)]);
check('removed member is kicked in real time', kickEvent?.reason === 'removed');

// Persistence: wait for debounce, then a fresh client must see the edits.
a.socket.disconnect();
b.socket.disconnect();
await wait(2500);
const a2 = await connect(alice, code);
check('state persisted to MongoDB and reloaded', a2.doc.getText('code').toString() === sa);
a2.socket.disconnect();

// Owner deletes room.
const del = await http(`/rooms/${code}`, { method: 'DELETE', cookie: alice.cookie });
check('delete room', del.status === 204);
check('deleted room → 404', (await http(`/rooms/${code}`, { cookie: alice.cookie })).status === 404);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
