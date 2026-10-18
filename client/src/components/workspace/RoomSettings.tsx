'use client';

import { Globe, Lock, LogOut, Trash2, UserMinus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar, Button, Input } from '@/components/ui';
import { api } from '@/lib/api';
import type { Room } from '@/lib/types';
import { cx } from '@/lib/utils';

interface Props {
  room: Room;
  onClose: () => void;
  onChange: (room: Room) => void;
  /** Called after the room was deleted or the user left it. */
  onExit: () => void;
}

export function RoomSettings({ room, onClose, onChange, onExit }: Props) {
  const isOwner = room.role === 'owner';
  const [title, setTitle] = useState(room.title);
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const patch = (body: Partial<Pick<Room, 'title' | 'is_private'>>) =>
    run('patch', async () => {
      const { room: updated } = await api<{ room: Room }>(`/rooms/${room.room_code}`, { method: 'PATCH', body });
      onChange(updated);
    });

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    return run('invite', async () => {
      const { room: updated } = await api<{ room: Room }>(`/rooms/${room.room_code}/members`, {
        method: 'POST',
        body: { email: inviteEmail },
      });
      onChange(updated);
      setInviteEmail('');
    });
  };

  const removeMember = (userId: string) =>
    run(`remove:${userId}`, async () => {
      const { room: updated } = await api<{ room: Room }>(`/rooms/${room.room_code}/members/${userId}`, { method: 'DELETE' });
      onChange(updated);
    });

  const leave = () =>
    confirm('Leave this room? It will disappear from your dashboard.') &&
    run('leave', async () => {
      await api(`/rooms/${room.room_code}/members/me`, { method: 'DELETE' });
      onExit();
    });

  const destroy = () =>
    confirm(`Delete "${room.title}" for everyone? This cannot be undone.`) &&
    run('delete', async () => {
      await api(`/rooms/${room.room_code}`, { method: 'DELETE' });
      onExit();
    });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md animate-fade-in flex-col overflow-y-auto border-l border-white/10 bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="font-semibold text-white">Room settings</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-8 p-5">
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/20">{error}</p>}

          {isOwner && (
            <section className="space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">General</h3>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void patch({ title });
                }}
              >
                <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
                <Button type="submit" variant="secondary" loading={busy === 'patch'} disabled={!title.trim() || title === room.title}>
                  Save
                </Button>
              </form>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: false, label: 'Public', icon: Globe, hint: 'Anyone with the link can join' },
                  { value: true, label: 'Private', icon: Lock, hint: 'Only invited members' },
                ].map(({ value, label, icon: Icon, hint }) => (
                  <button
                    key={label}
                    disabled={busy !== null}
                    onClick={() => room.is_private !== value && patch({ is_private: value })}
                    className={cx(
                      'rounded-xl border p-3 text-left transition-colors',
                      room.is_private === value ? 'border-accent/60 bg-accent/10' : 'border-ink-600 hover:bg-ink-800',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-white">
                      <Icon className="size-4" /> {label}
                    </span>
                    <span className="mt-1 block text-xs text-slate-400">{hint}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Members · {room.members.length + 1}
            </h3>
            {isOwner && (
              <form onSubmit={invite} className="flex gap-2">
                <Input
                  type="email"
                  required
                  placeholder="Invite by email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Button type="submit" variant="secondary" loading={busy === 'invite'}>
                  Invite
                </Button>
              </form>
            )}
            <ul className="divide-y divide-white/5 rounded-xl border border-white/5">
              {[{ ...room.owner, isOwner: true }, ...room.members.map((m) => ({ ...m, isOwner: false }))].map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar name={member.name} src={member.avatar} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{member.name}</p>
                    {member.email && <p className="truncate text-xs text-slate-500">{member.email}</p>}
                  </div>
                  {member.isOwner ? (
                    <span className="text-xs text-slate-500">Owner</span>
                  ) : (
                    isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `remove:${member.id}`}
                        onClick={() => removeMember(member.id)}
                        aria-label={`Remove ${member.name}`}
                      >
                        <UserMinus className="size-4" />
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">Danger zone</h3>
            {isOwner ? (
              <Button variant="danger" className="w-full" loading={busy === 'delete'} onClick={destroy}>
                <Trash2 className="size-4" /> Delete room for everyone
              </Button>
            ) : (
              <Button variant="danger" className="w-full" loading={busy === 'leave'} onClick={leave}>
                <LogOut className="size-4" /> Leave room
              </Button>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
