import { config } from '../config.js';
import { Room } from '../models/Room.js';
import { Snippet } from '../models/Snippet.js';
import type { SessionManager } from '../realtime/sessions.js';

const HOUR = 60 * 60 * 1000;

/** Periodically deletes rooms nobody has touched for `ROOM_TTL_DAYS`. */
export function startJanitor(sessions: SessionManager) {
  if (config.roomTtlMs <= 0) return;

  const run = async () => {
    const cutoff = new Date(Date.now() - config.roomTtlMs);
    const stale = await Room.find({ last_active_at: { $lt: cutoff } }).select('_id');
    const ids = stale.map((room) => room._id).filter((id) => !sessions.peek(String(id)));
    if (!ids.length) return;

    await Promise.all([
      Snippet.deleteMany({ room_id: { $in: ids } }),
      Room.deleteMany({ _id: { $in: ids } }),
    ]);
    console.log(`[janitor] removed ${ids.length} inactive room(s)`);
  };

  const tick = () => run().catch((err) => console.error('[janitor] failed', err));
  void tick();
  setInterval(tick, HOUR).unref();
}
