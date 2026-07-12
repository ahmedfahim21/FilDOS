import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Known pages — let these through; everything else (404s) bounces home.
  const ALLOWED = ['/', '/roadmap', '/privacy', '/terms'];
  if (ALLOWED.includes(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // For all other routes (404s), redirect to home with 307 status
  return NextResponse.redirect(new URL('/', request.url), 307);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - Files with extensions (static assets like .ico, .png, .jpg, etc.)
     */
    '/((?!_next/static|_next/image|.*\\..*).*)',
  ],
};
