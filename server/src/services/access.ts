import type { Types } from 'mongoose';

export type RoomRole = 'owner' | 'member' | 'guest';

type IdLike = Types.ObjectId | { _id: Types.ObjectId } | string;

export const idOf = (value: IdLike) =>
  String(typeof value === 'object' && value !== null && '_id' in value ? value._id : value);

/**
 * `guest` = not yet a member of a public room (allowed in, gets added as a member).
 * `null`  = private room and the user was not invited.
 */
export function roleFor(
  room: { owner_id: IdLike; members: IdLike[]; is_private: boolean },
  userId: string,
): RoomRole | null {
  if (idOf(room.owner_id) === userId) return 'owner';
  if (room.members.some((member) => idOf(member) === userId)) return 'member';
  return room.is_private ? null : 'guest';
}
