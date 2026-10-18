'use client';

import { ArrowLeft, Check, Code2, Copy, Download, Globe, Link2, Lock, PenTool, Settings, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Spinner } from '@/components/ui';
import { useCollab, usePeers, useProviderState, useYMapValue, type ProviderState } from '@/lib/collab/hooks';
import type { RoomEnded } from '@/lib/collab/provider';
import { LANGUAGES, extensionFor } from '@/lib/languages';
import type { Room, User } from '@/lib/types';
import { colorFor, cx } from '@/lib/utils';
import { CodeEditor } from './CodeEditor';
import { RoomSettings } from './RoomSettings';
import { Whiteboard } from './Whiteboard';

type Tab = 'code' | 'board';

export function Workspace({ room: initialRoom, user }: { room: Room; user: User }) {
  const router = useRouter();
  const [room, setRoom] = useState(initialRoom);
  const [tab, setTab] = useState<Tab>('code');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const localUser = useMemo(
    () => ({ id: user.id, name: user.name, avatar: user.avatar, color: colorFor(user.id) }),
    [user.id, user.name, user.avatar],
  );
  const collab = useCollab(room.room_code, localUser);
  const state = useProviderState(collab?.provider);
  const peers = usePeers(collab?.provider.awareness);
  const meta = useMemo(() => collab?.doc.getMap('meta'), [collab]);
  const language = useYMapValue(meta, 'language', 'javascript');

  // Live title / privacy changes made by the owner.
  useEffect(() => collab?.provider.on('roomUpdated', (patch) => setRoom((r) => ({ ...r, ...patch }))), [collab]);

  // Real interaction keeps the server-side inactivity timer from firing.
  useEffect(() => {
    if (!collab) return;
    const beat = () => collab.provider.heartbeat();
    const events = ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, beat, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, beat));
  }, [collab]);

  const exit = () => router.push('/dashboard');

  const download = () => {
    if (!collab) return;
    const blob = new Blob([collab.doc.getText('code').toString()], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${room.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'snippet'}.${extensionFor(language)}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-900 px-3 sm:px-4">
        <Link href="/dashboard" className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-white" aria-label="Back to dashboard">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate text-sm font-medium text-white">
            {room.is_private ? <Lock className="size-3.5 shrink-0 text-slate-400" /> : <Globe className="size-3.5 shrink-0 text-slate-400" />}
            <span className="truncate">{room.title}</span>
          </h1>
          <p className="font-mono text-[11px] text-slate-500">{room.room_code}</p>
        </div>

        <nav className="ml-4 hidden rounded-lg bg-ink-800 p-1 sm:flex">
          {(
            [
              ['code', 'Code', Code2],
              ['board', 'Whiteboard', PenTool],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === id ? 'bg-ink-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <ConnectionBadge state={state} />
          <div className="hidden -space-x-2 md:flex">
            {peers.slice(0, 5).map(({ clientId, user: peer, isSelf }) => (
              <span key={clientId} className="rounded-full ring-2 ring-ink-900">
                <Avatar name={isSelf ? `${peer.name} (you)` : peer.name} src={peer.avatar} color={peer.color} size={28} />
              </span>
            ))}
            {peers.length > 5 && (
              <span className="grid size-7 place-items-center rounded-full bg-ink-700 text-[11px] text-slate-300 ring-2 ring-ink-900">
                +{peers.length - 5}
              </span>
            )}
          </div>
          <CopyButton text={() => window.location.href} label="Copy link" icon={<Link2 className="size-4" />} />
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)} aria-label="Room settings">
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      {/* Mobile tab switcher */}
      <nav className="flex border-b border-white/5 bg-ink-900 sm:hidden">
        {(['code', 'board'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cx('flex-1 py-2 text-sm', tab === id ? 'border-b-2 border-accent text-white' : 'text-slate-400')}
          >
            {id === 'code' ? 'Code' : 'Whiteboard'}
          </button>
        ))}
      </nav>

      <main className="relative min-h-0 flex-1">
        {!collab || !state.synced ? (
          !state.ended && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-ink-950/70">
              <Spinner label={state.status === 'disconnected' ? 'Reconnecting…' : 'Joining room…'} />
            </div>
          )
        ) : null}

        {collab && (
          <>
            {/* Both panes stay mounted so editor state survives tab switches. */}
            <section className={cx('flex h-full flex-col', tab !== 'code' && 'hidden')}>
              <div className="flex items-center gap-2 border-b border-white/5 bg-ink-900 px-3 py-2">
                <select
                  value={language}
                  onChange={(e) => meta?.set('language', e.target.value)}
                  className="h-8 rounded-lg border border-ink-600 bg-ink-800 px-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                  aria-label="Language"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <span className="hidden text-xs text-slate-500 md:inline">Language is shared with everyone in the room</span>
                <div className="ml-auto flex items-center gap-1">
                  <CopyButton text={() => collab.doc.getText('code').toString()} label="Copy code" icon={<Copy className="size-4" />} />
                  <Button variant="ghost" size="sm" onClick={download} aria-label="Download snippet">
                    <Download className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <CodeEditor doc={collab.doc} awareness={collab.provider.awareness} language={language} />
              </div>
            </section>
            <section className={cx('h-full', tab !== 'board' && 'hidden')}>
              <Whiteboard doc={collab.doc} awareness={collab.provider.awareness} active={tab === 'board'} />
            </section>
          </>
        )}
      </main>

      {settingsOpen && (
        <RoomSettings room={room} onClose={() => setSettingsOpen(false)} onChange={setRoom} onExit={exit} />
      )}
      {state.ended && !isSelfInitiated(state.ended, room) && <EndedOverlay ended={state.ended} />}
    </div>
  );
}

function ConnectionBadge({ state }: { state: ProviderState }) {
  const { status, synced, pending } = state;
  const [label, tone] =
    status === 'disconnected'
      ? ['Offline', 'bg-red-500/10 text-red-300']
      : !synced
        ? ['Connecting', 'bg-amber-500/10 text-amber-300']
        : pending > 0
          ? ['Syncing', 'bg-sky-500/10 text-sky-300']
          : ['Live', 'bg-emerald-500/10 text-emerald-300'];

  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', tone)} title={status === 'disconnected' ? 'Your edits are kept locally and will sync when you reconnect' : undefined}>
      {status === 'disconnected' ? <WifiOff className="size-3" /> : <span className={cx('size-1.5 rounded-full bg-current', label !== 'Live' && 'animate-pulse')} />}
      {label}
    </span>
  );
}

function CopyButton({ text, label, icon }: { text: () => string; label: string; icon: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={async () => {
        await navigator.clipboard.writeText(text());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4 text-emerald-400" /> : icon}
    </Button>
  );
}

/** You left, or you (the owner) deleted it — we're already navigating away. */
const isSelfInitiated = (ended: RoomEnded, room: Room) =>
  ended.reason === 'left' || (ended.reason === 'destroyed' && room.role === 'owner');

const ENDED_TITLES: Record<RoomEnded['reason'], string> = {
  destroyed: 'Room deleted',
  removed: 'Removed from room',
  left: 'You left the room',
  timeout: 'Session timed out',
  forbidden: 'Access revoked',
  not_found: 'Room not found',
  unauthorized: 'Signed out',
};

function EndedOverlay({ ended }: { ended: RoomEnded }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-fade-in rounded-2xl border border-white/10 bg-ink-900 p-6 text-center">
        <h2 className="text-lg font-semibold text-white">{ENDED_TITLES[ended.reason]}</h2>
        <p className="mt-2 text-sm text-slate-400">{ended.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          {ended.reason === 'timeout' && <Button onClick={() => window.location.reload()}>Rejoin</Button>}
          {ended.reason === 'unauthorized' ? (
            <Link href={`/login?next=${encodeURIComponent(window.location.pathname)}`}>
              <Button>Sign in</Button>
            </Link>
          ) : (
            <Link href="/dashboard">
              <Button variant={ended.reason === 'timeout' ? 'secondary' : 'primary'}>Back to dashboard</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
