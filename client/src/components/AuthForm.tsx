'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { safeNext } from '@/lib/utils';
import { useAuth } from './AuthProvider';
import { Button, Input, Logo } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { user, loading, login, register } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  const isLogin = mode === 'login';
  const otherHref = `${isLogin ? '/register' : '/login'}${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`;

  return (
    <main className="bg-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-in">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo className="text-lg" />
        </Link>
        <div className="rounded-2xl border border-white/5 bg-ink-900/90 p-6 shadow-2xl shadow-black/40">
          <h1 className="text-xl font-semibold text-white">{isLogin ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isLogin ? 'Sign in to jump back into your rooms.' : 'Start collaborating in under a minute.'}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {!isLogin && (
              <label className="block space-y-1.5">
                <span className="text-sm text-slate-300">Name</span>
                <Input required minLength={2} autoComplete="name" placeholder="Ada Lovelace" {...field('name')} />
              </label>
            )}
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-300">Email</span>
              <Input required type="email" autoComplete="email" placeholder="you@example.com" {...field('email')} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-slate-300">Password</span>
              <Input
                required
                type="password"
                minLength={isLogin ? 1 : 8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={isLogin ? '••••••••' : 'At least 8 characters'}
                {...field('password')}
              />
            </label>

            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300 ring-1 ring-red-500/20">{error}</p>}

            <Button type="submit" loading={submitting} className="w-full">
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <Link href={otherHref} className="font-medium text-accent hover:underline">
            {isLogin ? 'Sign up' : 'Sign in'}
          </Link>
        </p>
      </div>
    </main>
  );
}
