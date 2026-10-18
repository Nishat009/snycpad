'use client';

import { ArrowRight, Globe, Lock, Plus, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useRequireAuth } from '@/components/AuthProvider';
import { Navbar } from '@/components/Navbar';
import { Avatar, Button, Input, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { Room } from '@/lib/types';
import { cx, parseRoomCode, timeAgo } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useRequireAuth();
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const load = useCallback(async () => {
    try {
      const { rooms } = await api<{ rooms: Room[] }>('/rooms');
      setRooms(rooms);
    } catch (err) {
      setError((err as Error).message);
      setRooms([]);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { room } = await api<{ room: Room }>('/rooms', {
        method: 'POST',
        body: { title: title.trim() || 'Untitled room', is_private: isPrivate },
      });
      router.push(`/room/${room.room_code}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(joinCode);
    if (code) router.push(`/room/${code}`);
  }

  /** Optimistic delete: remove from the list immediately, roll back if the server refuses. */
  async function deleteRoom(room: Room) {
    if (!confirm(`Delete "${room.title}"? Everyone in it will be disconnected. This cannot be undone.`)) return;
    const previous = rooms;
    setRooms((list) => list?.filter((r) => r.id !== room.id) ?? null);
    try {
      await api(`/rooms/${room.room_code}`, { method: 'DELETE' });
    } catch (err) {
      setRooms(previous);
      setError(err instanceof ApiError ? err.message : 'Could not delete the room');
    }
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="animate-fade-in">
          <h1 className="text-2xl font-semibold text-white">Hi, {user.name.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-slate-400">Start a new session or jump back into one.</p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <form onSubmit={createRoom} className="rounded-2xl border border-white/5 bg-ink-900 p-5">
            <h2 className="font-medium text-white">New room</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Input placeholder="e.g. Interview — LRU cache" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
              <Button type="submit" loading={creating} className="shrink-0">
                <Plus className="size-4" /> Create
              </Button>
            </div>
            <div className="mt-3 inline-flex rounded-lg bg-ink-800 p-1 text-sm">
              {[
                { value: false, label: 'Public', icon: Globe, hint: 'Anyone with the link' },
                { value: true, label: 'Private', icon: Lock, hint: 'Invite only' },
              ].map(({ value, label, icon: Icon, hint }) => (
                <button
                  key={label}
                  type="button"
                  title={hint}
                  onClick={() => setIsPrivate(value)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
                    isPrivate === value ? 'bg-ink-600 text-white' : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {isPrivate ? 'Only people you invite by email can join.' : 'Anyone signed in with the link or code can join.'}
            </p>
          </form>

          <form onSubmit={joinRoom} className="rounded-2xl border border-white/5 bg-ink-900 p-5">
            <h2 className="font-medium text-white">Join with a code</h2>
            <div className="mt-4 flex gap-3">
              <Input
                placeholder="abc-defg-hij or paste a link"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="font-mono"
              />
              <Button type="submit" variant="secondary" disabled={!joinCode.trim()} aria-label="Join room">
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </form>
        </div>

        {error && <p className="mt-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300 ring-1 ring-red-500/20">{error}</p>}

        <section className="mt-10">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">Your rooms</h2>
          {rooms === null ? (
            <div className="py-16">
              <Spinner />
            </div>
          ) : rooms.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-ink-600 p-12 text-center text-slate-400">
              No rooms yet. Create one above and share the link with a friend.
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((room) => (
                <li key={room.id} className="group relative animate-fade-in">
                  <Link
                    href={`/room/${room.room_code}`}
                    className="block h-full rounded-2xl border border-white/5 bg-ink-900 p-5 transition-colors hover:border-accent/40 hover:bg-ink-850"
                  >
                    <div className="flex items-start justify-between gap-3 pr-8">
                      <h3 className="truncate font-medium text-white">{room.title}</h3>
                    </div>
                    <p className="mt-1 font-mono text-xs text-slate-500">{room.room_code}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-md bg-ink-800 px-2 py-1 text-slate-300">
                        {room.is_private ? <Lock className="size-3" /> : <Globe className="size-3" />}
                        {room.is_private ? 'Private' : 'Public'}
                      </span>
                      <span className="rounded-md bg-ink-800 px-2 py-1 text-slate-300">{room.role === 'owner' ? 'Owner' : 'Shared with you'}</span>
                      {room.online > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300">
                          <span className="size-1.5 rounded-full bg-emerald-400" /> {room.online} online
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-2">
                        <Avatar name={room.owner.name} src={room.owner.avatar} size={20} />
                        {room.owner.name}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3" /> {room.members.length + 1}
                        </span>
                        {timeAgo(room.last_active_at)}
                      </span>
                    </div>
                  </Link>
                  {room.role === 'owner' && (
                    <button
                      onClick={() => deleteRoom(room)}
                      aria-label={`Delete ${room.title}`}
                      className="absolute right-3 top-3 rounded-lg p-2 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
