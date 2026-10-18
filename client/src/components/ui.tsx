'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/lib/utils';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-accent text-ink-950 hover:bg-[#9bb4ff]',
        variant === 'secondary' && 'border border-ink-600 bg-ink-800 text-slate-200 hover:bg-ink-700',
        variant === 'ghost' && 'text-slate-300 hover:bg-ink-700 hover:text-white',
        variant === 'danger' && 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30 hover:bg-red-500/25',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        'h-10 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25',
        className,
      )}
    />
  );
}

export function Avatar({ name, src, color, size = 32 }: { name: string; src?: string; color?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <span
      title={name}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-700 text-xs font-semibold text-slate-200"
      style={{ width: size, height: size, boxShadow: color ? `0 0 0 2px ${color}` : undefined }}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-400">
      <Loader2 className="size-6 animate-spin text-accent" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight text-white', className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-accent to-fuchsia-400 font-mono text-sm font-bold text-ink-950">
        {'{}'}
      </span>
      SyncPad
    </span>
  );
}
