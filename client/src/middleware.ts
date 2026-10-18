import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cheap edge check: no auth cookie → straight to /login. The token itself is verified by
 * the API server; an expired cookie is handled client-side by useRequireAuth().
 */
export function middleware(req: NextRequest) {
  if (req.cookies.has('syncpad_token')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/dashboard/:path*', '/room/:path*'] };
