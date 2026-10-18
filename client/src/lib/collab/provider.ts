import { io, type Socket } from 'socket.io-client';
import * as Y from 'yjs';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import { fetchSocketToken } from '@/lib/api';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export type EndReason = 'destroyed' | 'removed' | 'left' | 'timeout' | 'forbidden' | 'not_found' | 'unauthorized';
export type RoomEnded = { reason: EndReason; message: string };
export type RoomPatch = { title?: string; is_private?: boolean };

export interface LocalUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

type JoinResponse =
  | { ok: true; update: ArrayBuffer; stateVector: ArrayBuffer; awareness: ArrayBuffer }
  | { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' | 'SERVER_ERROR' };

type Events = {
  status: ConnectionStatus;
  synced: boolean;
  pending: number;
  ended: RoomEnded;
  roomUpdated: RoomPatch;
};

const HEARTBEAT_THROTTLE_MS = 20_000;
/** An empty Yjs update (no structs, no deletes) encodes to exactly two bytes. */
const EMPTY_UPDATE_LENGTH = 2;

function socketUrl() {
  return process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
}

/**
 * Connects a local Y.Doc to a room over Socket.io.
 *
 * Local-first / optimistic: edits are applied to the local doc instantly and streamed to
 * the server in the background. If the connection drops, edits keep accumulating locally;
 * on reconnect both sides exchange state vectors and send each other only what's missing.
 */
export class CollabProvider {
  readonly awareness: Awareness;
  status: ConnectionStatus = 'connecting';
  synced = false;
  pending = 0;
  ended: RoomEnded | null = null;

  private readonly socket: Socket;
  private readonly listeners = new Map<keyof Events, Set<(value: never) => void>>();
  private lastHeartbeat = 0;

  constructor(
    readonly roomCode: string,
    readonly doc: Y.Doc,
    user: LocalUser,
  ) {
    this.awareness = new Awareness(doc);
    this.awareness.setLocalStateField('user', user);

    this.socket = io(socketUrl(), {
      withCredentials: true,
      // Called on every (re)connect, so an expired token is never reused.
      auth: (cb) => {
        fetchSocketToken()
          .then((token) => cb({ token }))
          .catch(() => cb({}));
      },
    });

    this.socket.on('connect', this.join);
    this.socket.on('disconnect', this.handleDisconnect);
    this.socket.on('connect_error', (err) => {
      if (err.message === 'UNAUTHORIZED') {
        this.end({ reason: 'unauthorized', message: 'Your session has expired. Please sign in again.' });
      } else {
        this.setStatus('disconnected');
      }
    });
    this.socket.on('sync:update', (update: ArrayBuffer) => {
      Y.applyUpdate(this.doc, new Uint8Array(update), this);
    });
    this.socket.on('awareness:update', (update: ArrayBuffer) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(update), this);
    });
    this.socket.on('room:updated', (patch: RoomPatch) => this.emit('roomUpdated', patch));
    this.socket.on('room:ended', (payload: RoomEnded) => this.end(payload));

    doc.on('update', this.handleDocUpdate);
    this.awareness.on('update', this.handleAwarenessUpdate);
    window.addEventListener('beforeunload', this.handleUnload);
  }

  on<K extends keyof Events>(event: K, fn: (value: Events[K]) => void) {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (value: never) => void);
    return () => {
      set.delete(fn as (value: never) => void);
    };
  }

  /** Call on real user interaction; keeps the server-side inactivity timer from firing. */
  heartbeat() {
    const now = Date.now();
    if (now - this.lastHeartbeat < HEARTBEAT_THROTTLE_MS || !this.socket.connected) return;
    this.lastHeartbeat = now;
    this.socket.emit('presence:heartbeat');
  }

  destroy() {
    window.removeEventListener('beforeunload', this.handleUnload);
    // Tell others we're gone right away rather than after the awareness timeout.
    this.awareness.setLocalState(null);
    this.doc.off('update', this.handleDocUpdate);
    this.awareness.off('update', this.handleAwarenessUpdate);
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.awareness.destroy();
    this.listeners.clear();
  }

  private join = () => {
    this.setStatus('connecting');
    this.socket.emit(
      'room:join',
      { roomCode: this.roomCode, stateVector: Y.encodeStateVector(this.doc) },
      (res: JoinResponse) => {
        if (!res.ok) {
          if (res.error === 'NOT_FOUND') this.end({ reason: 'not_found', message: 'This room no longer exists.' });
          else if (res.error === 'FORBIDDEN') this.end({ reason: 'forbidden', message: 'You no longer have access to this room.' });
          else this.setStatus('disconnected');
          return;
        }

        // 1. Apply what we were missing.
        Y.applyUpdate(this.doc, new Uint8Array(res.update), this);
        // 2. Send what the server is missing (e.g. edits made while offline).
        this.synced = true;
        const diff = Y.encodeStateAsUpdate(this.doc, new Uint8Array(res.stateVector));
        if (diff.length > EMPTY_UPDATE_LENGTH) this.send(diff);
        // 3. Presence.
        applyAwarenessUpdate(this.awareness, new Uint8Array(res.awareness), this);
        this.socket.emit('awareness:update', encodeAwarenessUpdate(this.awareness, [this.doc.clientID]));

        this.setStatus('connected');
        this.emit('synced', true);
      },
    );
  };

  private handleDisconnect = () => {
    this.synced = false;
    this.emit('synced', false);
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    removeAwarenessStates(this.awareness, others, this);
    this.setStatus('disconnected');
  };

  private handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Remote updates are already on the server; unsynced local edits are sent on (re)join.
    if (origin === this || !this.synced || !this.socket.connected) return;
    this.send(update);
  };

  private handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === this || !this.socket.connected) return;
    const changed = added.concat(updated, removed);
    this.socket.emit('awareness:update', encodeAwarenessUpdate(this.awareness, changed));
  };

  private send(update: Uint8Array) {
    this.setPending(this.pending + 1);
    this.socket.timeout(10_000).emit('sync:update', update, () => this.setPending(this.pending - 1));
  }

  private handleUnload = () => {
    this.awareness.setLocalState(null);
  };

  private end(payload: RoomEnded) {
    if (this.ended) return;
    this.ended = payload;
    this.socket.disconnect();
    this.emit('ended', payload);
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status);
  }

  private setPending(pending: number) {
    this.pending = Math.max(0, pending);
    this.emit('pending', this.pending);
  }

  private emit<K extends keyof Events>(event: K, value: Events[K]) {
    this.listeners.get(event)?.forEach((fn) => (fn as (value: Events[K]) => void)(value));
  }
}
