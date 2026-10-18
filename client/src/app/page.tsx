import { ArrowRight, GitMerge, Lock, MousePointer2, PenTool, Timer, Zap } from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';

const FEATURES = [
  {
    icon: GitMerge,
    title: 'Conflict-free editing',
    body: 'Built on Yjs CRDTs. Ten people can type on the same line and nobody’s work is lost or overwritten.',
  },
  {
    icon: Zap,
    title: 'Instant, optimistic UI',
    body: 'Your keystrokes apply locally first and sync in the background — zero input lag, even on slow networks.',
  },
  {
    icon: MousePointer2,
    title: 'Live cursors & presence',
    body: 'See exactly who is in the room, where their cursor is, and what they have selected.',
  },
  {
    icon: PenTool,
    title: 'Shared whiteboard',
    body: 'Switch to the whiteboard to sketch architecture or explain an algorithm. Same room, same sync engine.',
  },
  {
    icon: Lock,
    title: 'Private rooms',
    body: 'JWT-authenticated sockets. Make a room private and only the people you invite can get in.',
  },
  {
    icon: Timer,
    title: 'Session management',
    body: 'Idle users are timed out, empty rooms are unloaded from memory, and stale rooms clean themselves up.',
  },
];

function EditorPreview() {
  const line = 'block whitespace-pre';
  return (
    <div className="relative mx-auto mt-16 max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl shadow-accent/10">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="size-3 rounded-full bg-red-400/80" />
        <span className="size-3 rounded-full bg-amber-400/80" />
        <span className="size-3 rounded-full bg-emerald-400/80" />
        <span className="ml-3 font-mono text-xs text-slate-500">room/k7m-p2xq-9ad · fibonacci.ts</span>
        <span className="ml-auto flex -space-x-2">
          {['#f472b6', '#34d399', '#60a5fa'].map((c) => (
            <span key={c} className="size-6 rounded-full ring-2 ring-ink-900" style={{ background: c }} />
          ))}
        </span>
      </div>
      <pre className="p-6 text-left font-mono text-[13px] leading-6 text-slate-300">
        <code>
          <span className={line}>
            <span className="text-fuchsia-400">export function</span> <span className="text-sky-300">fib</span>(n:{' '}
            <span className="text-emerald-300">number</span>): <span className="text-emerald-300">number</span> {'{'}
          </span>
          <span className={line}>
            {'  '}
            <span className="text-fuchsia-400">if</span> (n {'<'} <span className="text-amber-300">2</span>){' '}
            <span className="text-fuchsia-400">return</span> n;
            <span className="relative ml-0.5 inline-block h-5 border-l-2 border-pink-400 align-middle">
              <span className="absolute -top-5 left-0 rounded bg-pink-400 px-1.5 text-[10px] font-semibold text-ink-950">Nadia</span>
            </span>
          </span>
          <span className={line}>
            {'  '}
            <span className="text-fuchsia-400">const</span> memo = <span className="text-fuchsia-400">new</span>{' '}
            <span className="rounded-sm bg-emerald-400/25">Map&lt;number, number&gt;()</span>;
            <span className="relative inline-block h-5 border-l-2 border-emerald-400 align-middle">
              <span className="absolute -top-5 left-0 rounded bg-emerald-400 px-1.5 text-[10px] font-semibold text-ink-950">Rafi</span>
            </span>
          </span>
          <span className={line}>
            {'  '}
            <span className="text-fuchsia-400">return</span> <span className="text-sky-300">fib</span>(n -{' '}
            <span className="text-amber-300">1</span>) + <span className="text-sky-300">fib</span>(n -{' '}
            <span className="text-amber-300">2</span>);
          </span>
          <span className={line}>{'}'}</span>
        </code>
      </pre>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="bg-grid relative overflow-hidden px-4 pb-24 pt-20 text-center sm:px-6">
          <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
          <div className="relative mx-auto max-w-3xl animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Real-time · CRDT-powered · Code + Whiteboard
            </span>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Code together. <span className="bg-gradient-to-r from-accent to-fuchsia-400 bg-clip-text text-transparent">Think together.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-slate-400">
              A collaborative code editor and whiteboard for pair programming, interviews and teaching. Share a link — everyone edits live.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-ink-950 hover:bg-[#9bb4ff]"
              >
                Create a room <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-lg border border-ink-600 bg-ink-800 px-5 text-sm font-medium text-slate-200 hover:bg-ink-700"
              >
                I have an account
              </Link>
            </div>
          </div>
          <EditorPreview />
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-2xl font-semibold text-white sm:text-3xl">Everything a shared session needs</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-white/5 bg-ink-900 p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-medium text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
          <div className="rounded-2xl border border-white/5 bg-ink-900 p-8">
            <h2 className="text-xl font-semibold text-white">How a keystroke travels</h2>
            <ol className="mt-6 grid gap-4 text-sm sm:grid-cols-4">
              {[
                ['1. Local apply', 'Monaco change → Yjs transaction on your local doc. UI updates instantly.'],
                ['2. Broadcast', 'A tiny binary update goes over Socket.io to your room.'],
                ['3. Merge', 'Server merges it into the room’s CRDT and relays it to everyone else.'],
                ['4. Persist', 'Debounced snapshot to MongoDB — one write per burst, not per key.'],
              ].map(([title, body]) => (
                <li key={title} className="rounded-xl bg-ink-800 p-4">
                  <p className="font-medium text-white">{title}</p>
                  <p className="mt-1 leading-6 text-slate-400">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/5 py-8 text-center text-sm text-slate-500">
        Built with Next.js, Socket.io, Yjs & MongoDB.
      </footer>
    </>
  );
}
