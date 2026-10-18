import 'dotenv/config';

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const config = {
  port: num(process.env.PORT, 4000),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/syncpad',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  isProd: process.env.NODE_ENV === 'production',
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  persistDebounceMs: num(process.env.PERSIST_DEBOUNCE_MS, 1500),
  persistMaxWaitMs: num(process.env.PERSIST_MAX_WAIT_MS, 10_000),
  sessionIdleMs: num(process.env.SESSION_IDLE_MINUTES, 5) * MINUTE,
  socketIdleMs: num(process.env.SOCKET_IDLE_MINUTES, 30) * MINUTE,
  roomTtlMs: num(process.env.ROOM_TTL_DAYS, 30) * DAY,
};

if (config.isProd && config.jwtSecret === 'dev-only-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
