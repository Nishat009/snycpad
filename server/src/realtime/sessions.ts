import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { config } from '../config.js';
import { Room } from '../models/Room.js';
import { DEFAULT_SNIPPET, Snippet } from '../models/Snippet.js';
import type { AppServer, AppSocket, EndReason } from './types.js';

export const channelFor = (roomId: string) => `room:${roomId}`;

/** Transaction origins that are not a socket id. */
const ORIGIN_LOAD = 'load';
const ORIGIN_SEED = 'seed';

/**
 * One live, in-memory Yjs document per active room.
 *
 * - Every client update is applied here (the server is just another CRDT peer), then
 *   relayed to the rest of the room. Yjs guarantees all peers converge regardless of
 *   arrival order, so concurrent edits never overwrite each other.
 * - The document is persisted to MongoDB with a debounce (+ max wait) so a burst of
 *   keystrokes costs one write instead of hundreds.
 * - When the last socket leaves, the session is kept warm for `sessionIdleMs`, then
 *   flushed and evicted from memory.
 */
export class RoomSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly sockets = new Map<string, AppSocket>();
  /** socket id → Yjs client ids whose presence that socket controls. */
  private readonly presenceOwners = new Map<string, Set<number>>();

  private persistTimer: NodeJS.Timeout | null = null;
  private dirtySince: number | null = null;
  private evictTimer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    readonly roomId: string,
    private readonly io: AppServer,
    private readonly onDispose: (session: RoomSession) => void,
  ) {
    // The server never has a cursor of its own.
    this.awareness.setLocalState(null);
    this.doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    this.scheduleEviction();
  }

  get channel() {
    return channelFor(this.roomId);
  }

  get onlineUsers() {
    return new Set([...this.sockets.values()].map((socket) => socket.data.user.id)).size;
  }

  /** Load persisted state, or seed a brand-new document. */
  hydrate(snippet: { yjs_state?: Buffer; content?: string; language?: string } | null) {
    if (snippet?.yjs_state?.length) {
      Y.applyUpdate(this.doc, new Uint8Array(snippet.yjs_state), ORIGIN_LOAD);
      return;
    }
    this.doc.transact(() => {
      this.doc.getText('code').insert(0, (snippet?.content ?? DEFAULT_SNIPPET).replace(/\r\n/g, '\n'));
      this.doc.getMap('meta').set('language', snippet?.language ?? 'javascript');
    }, ORIGIN_SEED);
  }

  addSocket(socket: AppSocket) {
    this.cancelEviction();
    this.sockets.set(socket.id, socket);
    this.presenceOwners.set(socket.id, new Set());
    socket.join(this.channel);
  }

  removeSocket(socket: AppSocket) {
    if (!this.sockets.delete(socket.id)) return;
    socket.leave(this.channel);

    const clientIds = this.presenceOwners.get(socket.id);
    this.presenceOwners.delete(socket.id);
    // Drop their cursor immediately instead of waiting for the 30s awareness timeout.
    if (clientIds?.size) removeAwarenessStates(this.awareness, [...clientIds], 'server');

    if (this.sockets.size === 0) this.scheduleEviction();
  }

  /** Initial sync payload for a joining client (state-vector based diff). */
  snapshot(clientStateVector?: Uint8Array) {
    return {
      update: Y.encodeStateAsUpdate(this.doc, clientStateVector),
      stateVector: Y.encodeStateVector(this.doc),
      awareness: encodeAwarenessUpdate(this.awareness, [...this.awareness.getStates().keys()]),
    };
  }

  applyClientUpdate(socket: AppSocket, update: Uint8Array) {
    try {
      Y.applyUpdate(this.doc, update, socket.id);
      return true;
    } catch (err) {
      console.warn(`[room ${this.roomId}] rejected malformed update from ${socket.id}`, err);
      return false;
    }
  }

  applyClientAwareness(socket: AppSocket, update: Uint8Array) {
    try {
      applyAwarenessUpdate(this.awareness, update, socket.id);
    } catch (err) {
      console.warn(`[room ${this.roomId}] rejected malformed awareness from ${socket.id}`, err);
    }
  }

  /** Remove every socket belonging to `userId` (kicked, or left voluntarily). */
  kickUser(userId: string, reason: EndReason, message: string) {
    for (const socket of [...this.sockets.values()]) {
      if (socket.data.user.id !== userId) continue;
      socket.emit('room:ended', { reason, message });
      this.removeSocket(socket);
      socket.data.roomId = undefined;
    }
  }

  /** Room deleted: tell everyone, drop all sockets, discard state without persisting. */
  end(reason: EndReason, message: string) {
    this.io.to(this.channel).emit('room:ended', { reason, message });
    for (const socket of this.sockets.values()) {
      socket.leave(this.channel);
      socket.data.roomId = undefined;
    }
    this.sockets.clear();
    this.presenceOwners.clear();
    this.dispose();
  }

  async persist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    if (this.dirtySince === null || this.disposed) return;
    this.dirtySince = null;

    const content = this.doc.getText('code').toString();
    const language = String(this.doc.getMap('meta').get('language') ?? 'javascript');
    const yjsState = Buffer.from(Y.encodeStateAsUpdate(this.doc));
    const now = new Date();

    try {
      await Promise.all([
        Snippet.updateOne(
          { room_id: this.roomId },
          { content, language, yjs_state: yjsState },
          { upsert: true },
        ),
        Room.updateOne({ _id: this.roomId }, { last_active_at: now }),
      ]);
    } catch (err) {
      console.error(`[room ${this.roomId}] persist failed, will retry`, err);
      this.markDirty();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.cancelEviction();
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.doc.destroy(); // also destroys the awareness instance
    this.onDispose(this);
  }

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === ORIGIN_LOAD) return;
    const isSocket = typeof origin === 'string' && this.sockets.has(origin);
    const target = this.io.to(this.channel);
    (isSocket ? target.except(origin) : target).emit('sync:update', update);
    this.markDirty();
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    const isSocket = typeof origin === 'string' && this.sockets.has(origin);
    if (isSocket) {
      const owned = this.presenceOwners.get(origin)!;
      for (const id of [...added, ...updated]) owned.add(id);
      for (const id of removed) owned.delete(id);
    }
    const changed = [...added, ...updated, ...removed];
    if (!changed.length) return;
    const payload = encodeAwarenessUpdate(this.awareness, changed);
    const target = this.io.to(this.channel);
    (isSocket ? target.except(origin) : target).emit('awareness:update', payload);
  };

  private markDirty() {
    const now = Date.now();
    this.dirtySince ??= now;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    const maxWaitLeft = this.dirtySince + config.persistMaxWaitMs - now;
    const wait = Math.max(0, Math.min(config.persistDebounceMs, maxWaitLeft));
    this.persistTimer = setTimeout(() => void this.persist(), wait);
  }

  private scheduleEviction() {
    this.cancelEviction();
    this.evictTimer = setTimeout(async () => {
      if (this.sockets.size) return;
      await this.persist();
      // Someone may have joined while we were writing.
      if (!this.sockets.size) this.dispose();
    }, config.sessionIdleMs);
  }

  private cancelEviction() {
    if (this.evictTimer) clearTimeout(this.evictTimer);
    this.evictTimer = null;
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, RoomSession>();
  private readonly loading = new Map<string, Promise<RoomSession>>();

  constructor(private readonly io: AppServer) {}

  get size() {
    return this.sessions.size;
  }

  peek(roomId: string) {
    return this.sessions.get(roomId);
  }

  onlineCount(roomId: string) {
    return this.sessions.get(roomId)?.onlineUsers ?? 0;
  }

  /** Get the live session for a room, loading it from MongoDB at most once. */
  async acquire(roomId: string): Promise<RoomSession> {
    const live = this.sessions.get(roomId);
    if (live) return live;
    const pending = this.loading.get(roomId);
    if (pending) return pending;

    const load = (async () => {
      // Not `.lean()`: hydrated docs cast the binary field to a real Buffer.
      const snippet = await Snippet.findOne({ room_id: roomId }).select('+yjs_state');
      const session = new RoomSession(roomId, this.io, (disposed) => {
        if (this.sessions.get(roomId) === disposed) this.sessions.delete(roomId);
      });
      session.hydrate(snippet);
      this.sessions.set(roomId, session);
      return session;
    })();

    this.loading.set(roomId, load);
    try {
      return await load;
    } finally {
      this.loading.delete(roomId);
    }
  }

  destroyRoom(roomId: string, message: string) {
    this.sessions.get(roomId)?.end('destroyed', message);
  }

  kickUser(roomId: string, userId: string, reason: EndReason, message: string) {
    this.sessions.get(roomId)?.kickUser(userId, reason, message);
  }

  broadcastRoomUpdate(roomId: string, patch: { title?: string; is_private?: boolean }) {
    this.io.to(channelFor(roomId)).emit('room:updated', patch);
  }

  async persistAll() {
    await Promise.all([...this.sessions.values()].map((session) => session.persist()));
  }
}
