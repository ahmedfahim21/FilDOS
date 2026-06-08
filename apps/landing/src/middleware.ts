import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Allow home page and API routes
  if (pathname === '/' || pathname.startsWith('/api/')) {
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
