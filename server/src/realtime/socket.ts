import { parse as parseCookie } from 'cookie';
import { config } from '../config.js';
import { AUTH_COOKIE, verifyToken } from '../lib/auth.js';
import { normalizeRoomCode } from '../lib/roomCode.js';
import { Room } from '../models/Room.js';
import { User } from '../models/User.js';
import { roleFor } from '../services/access.js';
import type { SessionManager } from './sessions.js';
import type { AppServer, AppSocket } from './types.js';

const toBytes = (value: unknown): Uint8Array | null => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
};

export function setupRealtime(io: AppServer, sessions: SessionManager) {
  // ── Handshake auth: short-lived socket token (preferred) or the session cookie ──
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown } | undefined;
      const token =
        (typeof auth?.token === 'string' && auth.token) ||
        parseCookie(socket.handshake.headers.cookie ?? '')[AUTH_COOKIE];
      const userId = token ? verifyToken(token, ['socket', 'session']) : null;
      const user = userId ? await User.findById(userId) : null;
      if (!user) return next(new Error('UNAUTHORIZED'));

      socket.data.user = { id: String(user._id), name: user.name, avatar: user.avatar };
      socket.data.lastActiveAt = Date.now();
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket: AppSocket) => {
    const touch = () => {
      socket.data.lastActiveAt = Date.now();
    };
    const currentSession = () =>
      socket.data.roomId ? sessions.peek(socket.data.roomId) : undefined;
    const leaveCurrent = () => {
      currentSession()?.removeSocket(socket);
      socket.data.roomId = undefined;
    };

    socket.on('room:join', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      try {
        touch();
        const room = await Room.findOne({ room_code: normalizeRoomCode(payload?.roomCode) });
        if (!room) return ack({ ok: false, error: 'NOT_FOUND' });

        const userId = socket.data.user.id;
        const role = roleFor(room, userId);
        if (!role) return ack({ ok: false, error: 'FORBIDDEN' });
        if (role === 'guest') await Room.updateOne({ _id: room._id }, { $addToSet: { members: userId } });

        leaveCurrent();
        const session = await sessions.acquire(String(room._id));
        if (!socket.connected) return;

        session.addSocket(socket);
        socket.data.roomId = session.roomId;
        void Room.updateOne({ _id: room._id }, { last_active_at: new Date() }).exec();

        ack({ ok: true, ...session.snapshot(toBytes(payload?.stateVector) ?? undefined) });
      } catch (err) {
        console.error('[socket] join failed', err);
        ack({ ok: false, error: 'SERVER_ERROR' });
      }
    });

    socket.on('sync:update', (raw, ack) => {
      const session = currentSession();
      const update = toBytes(raw);
      if (!session || !update) return ack?.({ ok: false });
      touch();
      // Not `ack?.({ ok: session.apply(...) })` — optional call skips evaluating its arguments.
      const ok = session.applyClientUpdate(socket, update);
      ack?.({ ok });
    });

    // Awareness (cursor moves) is deliberately NOT counted as activity: clients renew it
    // automatically every 15s, which would make the idle timeout meaningless.
    socket.on('awareness:update', (raw) => {
      const update = toBytes(raw);
      if (update) currentSession()?.applyClientAwareness(socket, update);
    });

    socket.on('presence:heartbeat', touch);
    socket.on('room:leave', leaveCurrent);
    socket.on('disconnect', leaveCurrent);
  });

  // ── Inactivity timeout: disconnect sockets with no real interaction ──
  const sweep = setInterval(() => {
    const cutoff = Date.now() - config.socketIdleMs;
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.lastActiveAt >= cutoff) continue;
      socket.emit('room:ended', {
        reason: 'timeout',
        message: 'You were disconnected after a period of inactivity.',
      });
      socket.disconnect(true);
    }
  }, 60_000);
  sweep.unref();
}
