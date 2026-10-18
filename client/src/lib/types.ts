export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  created_at: string;
}

export interface UserLite {
  id: string;
  name: string;
  avatar: string;
  /** Only present when the viewer owns the room. */
  email?: string;
}

export type RoomRole = 'owner' | 'member' | 'guest';

export interface Room {
  id: string;
  title: string;
  room_code: string;
  is_private: boolean;
  owner: UserLite;
  members: UserLite[];
  role: RoomRole;
  online: number;
  last_active_at: string;
  created_at: string;
}
