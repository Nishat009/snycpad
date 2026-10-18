import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { config } from './config.js';
import { errorHandler } from './lib/http.js';
import { SessionManager } from './realtime/sessions.js';
import { setupRealtime } from './realtime/socket.js';
import type { AppServer } from './realtime/types.js';
import { authRouter } from './routes/auth.js';
import { createRoomsRouter } from './routes/rooms.js';
import { startJanitor } from './services/janitor.js';

const app = express();
const httpServer = createServer(app);
const io: AppServer = new Server(httpServer, {
  cors: { origin: config.clientOrigins, credentials: true },
  maxHttpBufferSize: 2e6,
});
const sessions = new SessionManager(io);

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, liveRooms: sessions.size, connections: io.engine.clientsCount });
});
app.use('/api/auth', authRouter);
app.use('/api/rooms', createRoomsRouter(sessions));
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
app.use(errorHandler);

setupRealtime(io, sessions);

await mongoose.connect(config.mongoUri);
console.log(`[db] connected to ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
startJanitor(sessions);

httpServer.listen(config.port, () => {
  console.log(`[http] SyncPad server listening on http://localhost:${config.port}`);
});

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, flushing live rooms…`);
  await sessions.persistAll();
  io.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
