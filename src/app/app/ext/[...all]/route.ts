export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = [
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailers','transfer-encoding','upgrade','accept-encoding'
];

function makeForwardHeaders(src: Headers) {
  const h = new Headers(src);

  // Remove problematic hop-by-hop headers & stuff we re-derive
  for (const k of HOP_BY_HOP) h.delete(k);
  h.delete('host');
  h.delete('content-length');

  // Ensure Referer and User-Agent are present (some CDNs require them)
  if (!h.get('referer')) {
    h.set('referer', 'https://deshazos-fresh-site.webflow.io/');
  }
  if (!h.get('user-agent')) {
    h.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36');
  }

  // Accept: let upstream choose; but ensure we accept images/videos/css/js
  if (!h.get('accept')) {
    h.set('accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/*,*/*;q=0.8');
  }

  return h;
}

export async function GET(req: Request, ctx: any) {
  const parts: string[] | undefined = ctx?.params?.all;
  if (!parts || parts.length === 0) {
    return new Response('Missing host/path', { status: 400 });
  }

  const host = parts[0];
  const path = parts.slice(1).join('/');
  const search = new URL(req.url).search;
  const url = `https://${host}/${path}${search}`;

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: makeForwardHeaders(req.headers),
      redirect: 'follow',
      cache: 'no-store',
    });

    // Copy headers, strip hop-by-hop, allow CORS
    const resHeaders = new Headers(upstream.headers);
    for (const h of HOP_BY_HOP) resHeaders.delete(h);
    resHeaders.set('access-control-allow-origin', '*');

    // Return upstream body + status exactly
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${(err as Error).message}`, { status: 502 });
  }
}

export async function HEAD(req: Request, ctx: any) {
  return GET(req, ctx);
}
