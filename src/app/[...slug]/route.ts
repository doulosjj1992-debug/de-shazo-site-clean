// Serves mirrored HTML from /public for any path.
// Examples:
//   /main/about-us            -> public/main/about-us.html (or /index.html)
//   /projects/retail          -> public/projects/retail/index.html
import { type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

function findHtmlForPathname(pn: string): string | null {
  // Normalize
  let p = pn.replace(/\/+$/, ''); // drop trailing slash (except for root)
  if (p === '') p = '/';

  const root = path.join(process.cwd(), 'public');

  // Candidates, in order:
  //   /index.html
  //   /path/index.html
  //   /path.html
  const candidates: string[] = [];
  if (p === '/') {
    candidates.push(path.join(root, 'index.html'));
  } else {
    candidates.push(path.join(root, p, 'index.html'));      // folder index
    candidates.push(path.join(root, p + '.html'));           // flat html
  }

  for (const f of candidates) {
    try {
      const st = fs.statSync(f);
      if (st.isFile()) return f;
    } catch { /* not found */ }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const pn = new URL(req.url).pathname;
  const file = findHtmlForPathname(pn);
  if (!file) {
    return new Response('Not found', { status: 404 });
  }
  const html = fs.readFileSync(file);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Browser 0s, CDN long cache; tweak as you prefer.
      'cache-control': 'public, max-age=0, s-maxage=31536000, immutable',
    },
  });
}
