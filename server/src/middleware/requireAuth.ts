import type { RequestHandler } from 'express';
import { AUTH_COOKIE, verifyToken } from '../lib/auth.js';

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token =
    (req.cookies?.[AUTH_COOKIE] as string | undefined) ??
    (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

  const userId = token ? verifyToken(token, ['session']) : null;
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  req.userId = userId;
  next();
};
