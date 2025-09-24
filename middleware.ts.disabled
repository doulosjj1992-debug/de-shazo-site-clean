import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
  matcher: ['/ext/:path*'],
};

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const after = url.pathname.slice('/ext/'.length); // keep raw encoding like %20

  if (!after) {
    return new NextResponse('Missing target', { status: 400 });
  }

  // Build /api/ext?u=https://<raw-after><original-query>
  const rewrite = req.nextUrl.clone();
  rewrite.pathname = '/api/ext';

  const sp = new URLSearchParams(rewrite.search);
  let u = `https://${after}`;
  if (url.search) u += url.search; // append original query (starts with ?)
  sp.set('u', u);
  rewrite.search = `?${sp.toString()}`;

  return NextResponse.rewrite(rewrite);
}
