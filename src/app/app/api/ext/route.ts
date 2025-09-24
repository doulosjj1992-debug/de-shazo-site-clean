export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const HOP_BY_HOP = [
  'connection','keep-alive','proxy-authenticate','proxy-authorization',
  'te','trailer','transfer-encoding','upgrade',
];

export async function GET(req: Request) {
  try {
    const inUrl = new URL(req.url);
    const uParam = inUrl.searchParams.get('u');

    if (!uParam) {
      return new Response('Missing "u" query', { status: 400 });
    }
    if (!/^https:\/\//i.test(uParam)) {
      return new Response('Only https targets are allowed', { status: 400 });
    }

    const upstreamUrl = uParam;

    // forward a few safe headers
    const inHeaders = new Headers(req.headers);
    const fwd = new Headers();
    const copy = (h: string) => { const v = inHeaders.get(h); if (v) fwd.set(h, v); };
    copy('user-agent'); copy('accept'); copy('accept-encoding'); copy('accept-language'); copy('range');

    try {
      const hostOnly = new URL(upstreamUrl).host;
      fwd.set('origin', `https://${hostOnly}`);
      fwd.set('referer', `https://${hostOnly}/`);
    } catch {}

    const upstream = await fetch(upstreamUrl, {
      credentials: 'omit',
      redirect: 'follow',
      headers: fwd,
    });

    const out = new Headers(upstream.headers);
    for (const h of HOP_BY_HOP) out.delete(h);
    out.set('access-control-allow-origin', '*');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Upstream fetch failed: ${msg}`, { status: 502 });
  }
}
