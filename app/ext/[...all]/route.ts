export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = [
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailers','transfer-encoding','upgrade','accept-encoding'
];

function forwardableHeaders(src: Headers) {
  const h = new Headers(src);
  h.delete('host');
  h.delete('accept-encoding');
  h.delete('content-length');
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
      headers: forwardableHeaders(req.headers),
      redirect: 'follow',
      cache: 'no-store',
    });

    const resHeaders = new Headers(upstream.headers);
    for (const h of HOP_BY_HOP) resHeaders.delete(h);
    resHeaders.set('access-control-allow-origin', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${(err as Error).message}`, { status: 502 });
  }
}

// HEAD mirrors GET so CDNs/preloaders work
export async function HEAD(req: Request, ctx: any) {
  return GET(req, ctx);
}
