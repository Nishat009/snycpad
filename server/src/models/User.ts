import { Schema, model, type HydratedDocument } from 'mongoose';
import { jsonOptions, timestamps } from './json.js';

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  avatar: string;
  created_at: Date;
  updated_at: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: '' },
  },
  { timestamps, toJSON: jsonOptions },
);

export const User = model<IUser>('User', userSchema);
export type UserDoc = HydratedDocument<IUser>;

export const avatarFor = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`;
