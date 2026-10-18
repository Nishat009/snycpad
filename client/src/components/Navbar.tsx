'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { Avatar, Button, Logo } from './ui';

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink-950/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        {!loading && (
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link href="/dashboard" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-ink-800 hover:text-white">
                  Dashboard
                </Link>
                <span className="ml-1 hidden items-center gap-2 text-sm text-slate-300 sm:flex">
                  <Avatar name={user.name} src={user.avatar} size={28} />
                  {user.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Sign out"
                  onClick={async () => {
                    await logout();
                    router.push('/');
                  }}
                >
                  <LogOut className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white">
                  Sign in
                </Link>
                <Link href="/register">
                  <Button size="sm">Get started</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </nav>
    </header>
  );
}
