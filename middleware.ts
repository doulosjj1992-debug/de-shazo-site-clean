import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Serve the exported Webflow landing page at "/"
  if (pathname === '/') {
    return NextResponse.rewrite(new URL('/index.html', req.url));
  }
  return NextResponse.next();
}
