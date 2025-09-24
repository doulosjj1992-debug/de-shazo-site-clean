export const runtime = 'edge';

/**
 * Proxy: /ext/:host/:path*  ->  https://:host/:path*
 * Examples:
 *   /ext/cdn.prod.website-files.com/img/favicon.ico
 *   /ext/www.youtube.com/embed/VIDEOID
 */
export async function GET(request: Request, { params }: { params: { all?: string[] } }) {
  const parts = params.all ?? [];
  if (parts.length === 0) {
    return new Response('Bad Request: missing host/path', { status: 400 });
  }

  const host = parts[0];
  const rest = parts.slice(1).join('/');
  const target = `https://${host}${rest ? `/${rest}` : ''}`;

  // Drop hop-by-hop headers
  const hopByHop = new Set([
    'connection','keep-alive','proxy-authenticate','proxy-authorization',
    'te','trailers','transfer-encoding','upgrade'
  ]);

  const fwdHeaders = new Headers();
  for (const [k, v] of (request.headers as any)) {
    const key = k.toLowerCase();
    if (!hopByHop.has(key) && key !== 'host') fwdHeaders.set(k, v);
  }

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: fwdHeaders,
      redirect: 'follow',
    });

    const resHeaders = new Headers(upstream.headers);
    for (const h of hopByHop) resHeaders.delete(h);
    // allow your HTML to fetch cross-origin assets through this proxy
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
