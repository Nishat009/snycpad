import { compare, hash } from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { clearAuthCookie, setAuthCookie, signToken } from '../lib/auth.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { User, avatarFor } from '../models/User.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

export const authRouter = Router();

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (await User.exists({ email })) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const user = await User.create({
      name,
      email,
      passwordHash: await hash(password, 10),
      avatar: avatarFor(name),
    });
    setAuthCookie(res, signToken(String(user._id)));
    res.status(201).json({ user });
  }),
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    setAuthCookie(res, signToken(String(user._id)));
    res.json({ user });
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new HttpError(401, 'Not authenticated');
    res.json({ user });
  }),
);

/** Short-lived token for the Socket.io handshake (see lib/auth.ts). */
authRouter.get('/socket-token', requireAuth, (req, res) => {
  res.json({ token: signToken(req.userId!, 'socket') });
});
