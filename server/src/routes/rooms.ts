import { Router } from 'express';
import type { Types } from 'mongoose';
import { z } from 'zod';
import { HttpError, asyncHandler } from '../lib/http.js';
import { generateRoomCode, normalizeRoomCode } from '../lib/roomCode.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { Room } from '../models/Room.js';
import { DEFAULT_SNIPPET, Snippet } from '../models/Snippet.js';
import { User } from '../models/User.js';
import type { SessionManager } from '../realtime/sessions.js';
import { roleFor } from '../services/access.js';

type PopulatedUser = { _id: Types.ObjectId; name: string; email: string; avatar: string };

type PopulatedRoom = {
  _id: Types.ObjectId;
  title: string;
  room_code: string;
  is_private: boolean;
  owner_id: PopulatedUser;
  members: PopulatedUser[];
  last_active_at: Date;
  created_at: Date;
};

const USER_FIELDS = 'name email avatar';

const findRoom = (filter: Record<string, unknown>) =>
  Room.findOne(filter).populate<{ owner_id: PopulatedUser; members: PopulatedUser[] }>([
    { path: 'owner_id', select: USER_FIELDS },
    { path: 'members', select: USER_FIELDS },
  ]);

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(80),
  is_private: z.boolean().optional().default(false),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(80).optional(),
    is_private: z.boolean().optional(),
  })
  .refine((body) => body.title !== undefined || body.is_private !== undefined, 'Nothing to update');

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
});

export function createRoomsRouter(sessions: SessionManager) {
  const router = Router();
  router.use(requireAuth);

  const serialize = (room: PopulatedRoom, userId: string) => {
    const role = roleFor(room, userId);
    // Only the owner gets to see member emails.
    const lite = (user: PopulatedUser) => ({
      id: String(user._id),
      name: user.name,
      avatar: user.avatar,
      ...(role === 'owner' ? { email: user.email } : {}),
    });
    return {
      id: String(room._id),
      title: room.title,
      room_code: room.room_code,
      is_private: room.is_private,
      owner: lite(room.owner_id),
      members: room.members.filter(Boolean).map(lite),
      role,
      online: sessions.onlineCount(String(room._id)),
      last_active_at: room.last_active_at,
      created_at: room.created_at,
    };
  };

  /** Load a room by code and enforce that the caller may see it. */
  const loadAccessible = async (code: unknown, userId: string) => {
    const room = await findRoom({ room_code: normalizeRoomCode(code) });
    if (!room) throw new HttpError(404, 'Room not found');
    if (!roleFor(room, userId)) {
      throw new HttpError(403, 'This room is private. Ask the owner to invite you.');
    }
    return room;
  };

  const loadOwned = async (code: unknown, userId: string) => {
    const room = await loadAccessible(code, userId);
    if (roleFor(room, userId) !== 'owner') {
      throw new HttpError(403, 'Only the room owner can do that');
    }
    return room;
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const rooms = await Room.find({ $or: [{ owner_id: userId }, { members: userId }] })
        .sort({ last_active_at: -1 })
        .limit(100)
        .populate<{ owner_id: PopulatedUser; members: PopulatedUser[] }>([
          { path: 'owner_id', select: USER_FIELDS },
          { path: 'members', select: USER_FIELDS },
        ]);
      res.json({ rooms: rooms.map((room) => serialize(room, userId)) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const { title, is_private } = createSchema.parse(req.body);

      let created = null;
      for (let attempt = 0; attempt < 5 && !created; attempt++) {
        try {
          created = await Room.create({ title, is_private, owner_id: userId, room_code: generateRoomCode() });
        } catch (err) {
          // Duplicate room_code: astronomically unlikely, but retry with a new one.
          if ((err as { code?: number }).code !== 11000) throw err;
        }
      }
      if (!created) throw new HttpError(500, 'Could not allocate a room code');

      await Snippet.create({ room_id: created._id, content: DEFAULT_SNIPPET, language: 'javascript' });
      const room = await findRoom({ _id: created._id });
      res.status(201).json({ room: serialize(room!, userId) });
    }),
  );

  router.get(
    '/:code',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      let room = await loadAccessible(req.params.code, userId);
      if (roleFor(room, userId) === 'guest') {
        // Opening a public room adds it to your dashboard.
        await Room.updateOne({ _id: room._id }, { $addToSet: { members: userId } });
        room = (await findRoom({ _id: room._id }))!;
      }
      res.json({ room: serialize(room, userId) });
    }),
  );

  router.patch(
    '/:code',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const patch = updateSchema.parse(req.body);
      const room = await loadOwned(req.params.code, userId);
      if (patch.title !== undefined) room.title = patch.title;
      if (patch.is_private !== undefined) room.is_private = patch.is_private;
      await room.save();
      sessions.broadcastRoomUpdate(String(room._id), { title: room.title, is_private: room.is_private });
      res.json({ room: serialize(room, userId) });
    }),
  );

  router.post(
    '/:code/members',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const { email } = memberSchema.parse(req.body);
      const room = await loadOwned(req.params.code, userId);
      const invitee = await User.findOne({ email });
      if (!invitee) throw new HttpError(404, 'No SyncPad account uses that email');
      if (String(invitee._id) === userId) throw new HttpError(400, 'You already own this room');

      await Room.updateOne({ _id: room._id }, { $addToSet: { members: invitee._id } });
      const updated = await findRoom({ _id: room._id });
      res.json({ room: serialize(updated!, userId) });
    }),
  );

  /** Owner removes a member, or a member leaves (`:userId` = `me`). */
  router.delete(
    '/:code/members/:userId',
    asyncHandler(async (req, res) => {
      const userId = req.userId!;
      const targetId = req.params.userId === 'me' ? userId : req.params.userId;
      const room = await loadAccessible(req.params.code, userId);
      const role = roleFor(room, userId);
      const leaving = targetId === userId;

      if (leaving && role === 'owner') throw new HttpError(400, 'The owner cannot leave. Delete the room instead.');
      if (!leaving && role !== 'owner') throw new HttpError(403, 'Only the room owner can remove members');

      await Room.updateOne({ _id: room._id }, { $pull: { members: targetId } });
      sessions.kickUser(
        String(room._id),
        targetId,
        leaving ? 'left' : 'removed',
        leaving ? 'You left this room.' : 'The owner removed you from this room.',
      );
      const updated = await findRoom({ _id: room._id });
      res.json({ room: serialize(updated!, userId) });
    }),
  );

  router.delete(
    '/:code',
    asyncHandler(async (req, res) => {
      const room = await loadOwned(req.params.code, req.userId!);
      const roomId = String(room._id);
      sessions.destroyRoom(roomId, 'The owner deleted this room.');
      await Promise.all([Snippet.deleteOne({ room_id: roomId }), Room.deleteOne({ _id: roomId })]);
      res.status(204).end();
    }),
  );

  return router;
}
