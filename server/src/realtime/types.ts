import type { Server, Socket } from 'socket.io';

export type EndReason = 'destroyed' | 'removed' | 'left' | 'timeout';

export type JoinResponse =
  | {
      ok: true;
      /** Updates the client is missing (diffed against the state vector it sent). */
      update: Uint8Array;
      /** Server state vector, so the client can send back what the server is missing. */
      stateVector: Uint8Array;
      /** Current presence (cursors, pointers) of everyone in the room. */
      awareness: Uint8Array;
    }
  | { ok: false; error: 'NOT_FOUND' | 'FORBIDDEN' | 'SERVER_ERROR' };

export interface ClientToServerEvents {
  'room:join': (
    payload: { roomCode: string; stateVector?: Uint8Array },
    ack: (res: JoinResponse) => void,
  ) => void;
  'room:leave': () => void;
  'sync:update': (update: Uint8Array, ack?: (res: { ok: boolean }) => void) => void;
  'awareness:update': (update: Uint8Array) => void;
  /** Sent (throttled) on real user interaction; drives the inactivity timeout. */
  'presence:heartbeat': () => void;
}

export interface ServerToClientEvents {
  'sync:update': (update: Uint8Array) => void;
  'awareness:update': (update: Uint8Array) => void;
  'room:updated': (patch: { title?: string; is_private?: boolean }) => void;
  'room:ended': (payload: { reason: EndReason; message: string }) => void;
}

export interface SocketData {
  user: { id: string; name: string; avatar: string };
  roomId?: string;
  lastActiveAt: number;
}

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
export type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
