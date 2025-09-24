import { type NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

export async function GET(_req: NextRequest) {
  const filePath = path.join(
    process.cwd(),
    'public',
    'webflow-export',
    'www.deshazogroup.com',
    'main',
    'profile.html'
  );
  const html = fs.readFileSync(filePath);
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=31536000, immutable',
    },
  });
}
