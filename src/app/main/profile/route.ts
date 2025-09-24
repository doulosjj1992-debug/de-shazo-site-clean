// Serves the mirrored HTML for /main/profile and injects <base href="/"> so
// relative paths like "images/foo.jpg" resolve to "/images/foo.jpg".
import fs from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET(_req: NextRequest) {
  // Adjust this path if your mirrored HTML lives elsewhere
  const htmlPath = path.join(
    process.cwd(),
    'public',
    'webflow-export',
    'www.deshazogroup.com',
    'main',
    'profile.html'
  );

  let html = fs.readFileSync(htmlPath, 'utf8');

  // Inject <base href="/"> if it's not already present
  if (!/<base\s+/i.test(html)) {
    html = html.replace(/<\/head>/i, `<base href="/">\n</head>`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=31536000, immutable',
    },
  });
}
