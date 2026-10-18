import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import { jsonOptions, timestamps } from './json.js';

export interface IRoom {
  title: string;
  room_code: string;
  owner_id: Types.ObjectId;
  is_private: boolean;
  /** Users who joined (public room) or were invited (private room). */
  members: Types.ObjectId[];
  last_active_at: Date;
  created_at: Date;
  updated_at: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    room_code: { type: String, required: true, unique: true },
    owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    is_private: { type: Boolean, default: false },
    members: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    last_active_at: { type: Date, default: Date.now, index: true },
  },
  { timestamps, toJSON: jsonOptions },
);

export const Room = model<IRoom>('Room', roomSchema);
export type RoomDoc = HydratedDocument<IRoom>;
