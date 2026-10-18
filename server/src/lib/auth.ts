import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const AUTH_COOKIE = 'syncpad_token';

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SOCKET_TTL_SECONDS = 5 * 60;

/**
 * `session` tokens live in an httpOnly cookie. `socket` tokens are short-lived and are
 * handed to the browser so the WebSocket handshake works even when the socket server
 * lives on a different origin than the web app (where the cookie would not be sent).
 */
export type TokenPurpose = 'session' | 'socket';

export function signToken(userId: string, purpose: TokenPurpose = 'session') {
  return jwt.sign({ purpose }, config.jwtSecret, {
    subject: userId,
    expiresIn: purpose === 'session' ? SESSION_TTL_SECONDS : SOCKET_TTL_SECONDS,
  });
}

export function verifyToken(token: string, allowed: TokenPurpose[]): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (!allowed.includes(payload.purpose) || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}
