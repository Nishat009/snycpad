'use client';

import { Lock, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRequireAuth } from '@/components/AuthProvider';
import { Button, Spinner } from '@/components/ui';
import { Workspace } from '@/components/workspace/Workspace';
import { ApiError, api } from '@/lib/api';
import type { Room } from '@/lib/types';

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useRequireAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!user) return;
    setRoom(null);
    setError(null);
    api<{ room: Room }>(`/rooms/${encodeURIComponent(code)}`)
      .then(({ room }) => setRoom(room))
      .catch((err: ApiError) => setError(err));
  }, [code, user]);

  if (error) {
    const isPrivate = error.status === 403;
    const Icon = isPrivate ? Lock : SearchX;
    return (
      <main className="bg-grid grid min-h-screen place-items-center p-4">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink-800 text-slate-300">
            <Icon className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-white">{isPrivate ? 'This room is private' : 'Room not found'}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isPrivate ? error.message : error.status === 404 ? 'Check the code, or the room may have been deleted.' : error.message}
          </p>
          <Link href="/dashboard" className="mt-6 inline-block">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </main>
    );
  }

  if (!user || !room) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Opening room…" />
      </div>
    );
  }

  return <Workspace room={room} user={user} />;
}
