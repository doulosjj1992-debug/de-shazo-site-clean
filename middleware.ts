import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: ['/ext/:path*'],
}

export default function middleware(req: NextRequest) {
  // Keep the raw encoded URL so spaces (%20) stay encoded
  const raw = req.url
  const cut = raw.split('/ext/')[1] // everything after "/ext/"
  if (!cut) return NextResponse.next()

  // Build the final external URL (no decoding)
  const dest = `https://${cut}`

  // Allowlist hosts (expand as needed)
  const allowed = new Set([
    'cdn.prod.website-files.com',
    'www.youtube.com',
    'ajax.googleapis.com',
    'fonts.gstatic.com',
    'fonts.googleapis.com',
    'd3e54v103j8qbb.cloudfront.net',
    'cdn.jsdelivr.net',
    'challenges.cloudflare.com',
  ])
  const host = cut.split('/')[0]
  if (!allowed.has(host)) return NextResponse.next()

  // 302 redirect so the browser fetches from the real host
  return NextResponse.redirect(dest, { status: 302 })
}
