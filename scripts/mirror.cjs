/* Mirror the live site HTML + assets into public/mirror so Vercel serves locally.
 * Node 18+ required (global fetch available).
 */
const fs   = require('fs');
const path = require('path');
const { URL } = require('url');

const ORIGIN   = 'https://www.deshazogroup.com';
const OUT_DIR  = path.join(process.cwd(), 'public', 'mirror');
const ORIG_DIR = path.join(OUT_DIR, '_origin');

// Top-level HTML pages we want to host locally
const PAGES = [
  'index.html',
  'services.html',
  'projects.html',
  'team.html',
  'contact.html',
  'news.html',
];

// Recognized asset extensions we’ll download
const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|webp|svg|gif|ico|pdf|woff2?|ttf|eot|map)(\?.*)?$/i;

// Third-party domains we DO NOT mirror (leave as-is)
const EXTERNAL_ALLOW = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'd3e54v103j8qbb.cloudfront.net', // webflow jquery CDN etc
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function saveFile(filePath, buf) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buf);
}

function absUrl(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isSameOrigin(u) {
  try {
    const url = new URL(u);
    return url.origin === ORIGIN;
  } catch { return false; }
}

function isExternalAllowed(u) {
  try {
    const url = new URL(u);
    return EXTERNAL_ALLOW.includes(url.hostname);
  } catch { return false; }
}

function toOriginLocalPath(u) {
  const { pathname, search } = new URL(u);
  const safe = pathname.replace(/^\/+/, ''); // remove leading slash
  return path.join(ORIG_DIR, safe);
}

// naive attribute scanner (href/src) – good enough for static pages
function extractLinks(html) {
  const links = new Set();
  const re = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.add(m[1]);
  }
  return [...links];
}

async function fetchText(u) {
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}

async function fetchBuffer(u) {
  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function rewriteHtmlToLocal(html, pageOutPath) {
  // 1) Point top-nav clean paths to our local mirrored html
  html = html
    .replace(/href=["']\/index\.html["']/g, 'href="/mirror/index.html"')
    .replace(/href=["']\/["']/g, 'href="/mirror/index.html"')
    .replace(/href=["']\/services(?:\.html)?["']/g, 'href="/mirror/services.html"')
    .replace(/href=["']\/projects(?:\.html)?["']/g, 'href="/mirror/projects.html"')
    .replace(/href=["']\/team(?:\.html)?["']/g, 'href="/mirror/team.html"')
    .replace(/href=["']\/contact(?:\.html)?["']/g, 'href="/mirror/contact.html"')
    .replace(/href=["']\/news(?:\.html)?["']/g, 'href="/mirror/news.html"');

  // 2) Convert root-relative or same-origin asset URLs to /mirror/_origin/...
  //    We do NOT touch http(s) assets from other domains.
  html = html.replace(/\b(href|src)=["']([^"']+)["']/gi, (full, attr, url) => {
    // leave mailto:, tel:, #, javascript: alone
    if (!url || /^(#|mailto:|tel:|javascript:)/i.test(url)) return full;

    // If it's absolute http(s) to OTHER domain, leave it
    if (/^https?:\/\//i.test(url)) {
      if (isSameOrigin(url)) {
        const local = '/mirror/_origin' + new URL(url).pathname;
        return `${attr}="${local}"`;
      }
      if (isExternalAllowed(url)) return full;
      return full; // keep truly external as-is
    }

    // Root-relative or relative: treat as same-origin
    const abs = absUrl(ORIGIN + '/', url);
    if (!abs) return full;

    // If it looks like an asset we mirrored, point to our local copy
    if (ASSET_EXT.test(abs)) {
      const local = '/mirror/_origin' + new URL(abs).pathname;
      return `${attr}="${local}"`;
    }

    // If it’s a same-origin html page link:
    if (/\.html?(?:\?.*)?$/i.test(abs)) {
      const filename = new URL(abs).pathname.replace(/^\/+/, '');
      // Keep relative “foo.html” intact (browser resolves against /mirror/)
      // but make root links explicit to /mirror/foo.html
      if (url.startsWith('/')) {
        return `${attr}="/mirror/${filename}"`;
      }
      return full; // relative page links are okay inside /mirror/*
    }

    return full;
  });

  return html;
}

async function mirrorOne(page) {
  const pageUrl = `${ORIGIN}/${page}`;
  console.log('→ Fetch', pageUrl);
  let html = await fetchText(pageUrl);

  // Extract href/src and collect candidate asset URLs to download
  const refs = extractLinks(html);
  const toDownload = new Set();

  for (const ref of refs) {
    if (!ref || /^(#|mailto:|tel:|javascript:)/i.test(ref)) continue;

    let abs = ref;
    if (!/^https?:\/\//i.test(ref)) {
      abs = absUrl(ORIGIN + '/', ref);
    }

    if (!abs) continue;

    // Download only same-origin assets (css/js/fonts/images/etc)
    if ((isSameOrigin(abs) || new URL(abs).origin === ORIGIN) && ASSET_EXT.test(abs)) {
      toDownload.add(abs);
    }
  }

  // Download assets
  for (const asset of toDownload) {
    const outPath = toOriginLocalPath(asset);
    const urlObj = new URL(asset);
    console.log('   asset:', urlObj.pathname);
    try {
      const buf = await fetchBuffer(asset);
      saveFile(outPath, buf);
    } catch (e) {
      console.warn('   asset failed:', asset, e.message);
    }
  }

  // Rewrite HTML links to local mirror
  html = rewriteHtmlToLocal(html, path.join(OUT_DIR, page));

  // Save HTML at same relative path under /public/mirror
  const outFile = path.join(OUT_DIR, page);
  saveFile(outFile, Buffer.from(html, 'utf8'));
  console.log('  saved', outFile);
}

(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);
  ensureDir(ORIG_DIR);

  for (const p of PAGES) {
    try { await mirrorOne(p); }
    catch (e) { console.error('Page fail:', p, e); }
  }
  console.log('Done. Mirrored into', OUT_DIR);
})();
