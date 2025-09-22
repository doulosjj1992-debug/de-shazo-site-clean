/* Mirror the live site by crawling internal links, reading /sitemap.xml,
 * and saving HTML + assets into public/mirror.
 * Node 18+ required (global fetch).
 */
const fs   = require('fs');
const path = require('path');
const { URL } = require('url');

const ORIGIN   = 'https://www.deshazogroup.com';
const OUT_DIR  = path.join(process.cwd(), 'public', 'mirror');
const ORIG_DIR = path.join(OUT_DIR, '_origin');

// Add any known pages here (copy exact URLs from the browser bar if needed)
const MANUAL_SEEDS = [
  `${ORIGIN}/`,
  `${ORIGIN}/contact`,
  // Add more exact URLs if you know them, e.g.:
  // `${ORIGIN}/services`,
  // `${ORIGIN}/team`,
  // `${ORIGIN}/projects`,
  // `${ORIGIN}/news`,
];

const MAX_PAGES = 400; // ceiling so we don't go infinite
const ASSET_EXT = /\.(css|js|mjs|png|jpe?g|webp|svg|gif|ico|pdf|woff2?|ttf|eot|map)(\?.*)?$/i;
const EXTERNAL_ALLOW = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'cdn.jsdelivr.net',
  'd3e54v103j8qbb.cloudfront.net',
];

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function saveFile(filePath, buf) { ensureDir(path.dirname(filePath)); fs.writeFileSync(filePath, buf); }
function isHtml(res) { return (res.headers.get('content-type') || '').includes('text/html'); }
function sameOrigin(u) { try { return new URL(u).origin === ORIGIN; } catch { return false; } }
function externalAllowed(u){ try { return EXTERNAL_ALLOW.includes(new URL(u).hostname); } catch { return false; } }

function normalizePath(pathname) {
  if (pathname === '/' || pathname === '') return 'index';
  if (pathname.endsWith('/')) pathname = pathname.slice(0,-1);
  const slug = pathname.split('/').pop();
  return slug || 'index';
}

function pageOutFile(pathname) {
  return path.join(OUT_DIR, `${normalizePath(pathname)}.html`);
}

function originAssetOut(absUrl) {
  const { pathname } = new URL(absUrl);
  const safe = pathname.replace(/^\/+/, '');
  return path.join(ORIG_DIR, safe);
}

async function fetchFollow(url, opts = {}) {
  const res = await fetch(url, { redirect: 'follow', ...opts });
  return res;
}

function extractLinks(html) {
  const links = new Set();
  const re = /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) links.add(m[1]);
  return [...links];
}

function rewriteHtml(html) {
  // rewrite root & clean links to mirror/*.html
  html = html
    .replace(/href=["']\/["']/g, 'href="/mirror/index.html"')
    .replace(/href=["']\/index\.html["']/g, 'href="/mirror/index.html"')
    .replace(/href=["']\/([^"'/#?]+)\/?["']/g, (full, slug) => `href="/mirror/${slug}.html"`);

  // assets → /mirror/_origin/...
  html = html.replace(/\b(href|src)=["']([^"']+)["']/gi, (full, attr, val) => {
    if (!val || /^(#|mailto:|tel:|javascript:)/i.test(val)) return full;

    if (/^https?:\/\//i.test(val)) {
      if (sameOrigin(val)) {
        const u = new URL(val);
        if (ASSET_EXT.test(u.pathname)) return `${attr}="/mirror/_origin${u.pathname}"`;
        return `${attr}="/mirror/${normalizePath(u.pathname)}.html"`;
      }
      return externalAllowed(val) ? full : full;
    }

    try {
      const abs = new URL(val, ORIGIN + '/');
      if (ASSET_EXT.test(abs.pathname)) return `${attr}="/mirror/_origin${abs.pathname}"`;
      return `${attr}="/mirror/${normalizePath(abs.pathname)}.html"`;
    } catch { return full; }
  });

  return html;
}

async function downloadAsset(absUrl) {
  try {
    const res = await fetchFollow(absUrl);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const out = originAssetOut(absUrl);
    saveFile(out, buf);
    console.log('   asset:', new URL(absUrl).pathname);
  } catch (e) {
    console.warn('   asset failed:', absUrl, e.message);
  }
}

async function processPage(absUrl) {
  const u = new URL(absUrl);
  console.log('→ Fetch', absUrl);
  const res = await fetchFollow(absUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  if (!isHtml(res)) throw new Error(`Non-HTML: ${(res.headers.get('content-type')||'').slice(0,60)}`);

  let html = await res.text();

  // grab assets
  const refs = extractLinks(html);
  const assets = [];
  for (const ref of refs) {
    if (!ref || /^(#|mailto:|tel:|javascript:)/i.test(ref)) continue;
    let target = ref;
    if (!/^https?:\/\//i.test(ref)) {
      try { target = new URL(ref, u).toString(); } catch { continue; }
    }
    if (sameOrigin(target) && ASSET_EXT.test(new URL(target).pathname)) {
      assets.push(target);
    }
  }
  await Promise.all(assets.map(downloadAsset));

  // rewrite + save page
  const outFile = pageOutFile(u.pathname);
  html = rewriteHtml(html);
  saveFile(outFile, Buffer.from(html, 'utf8'));
  console.log('  saved', outFile);

  // collect internal doc links to crawl
  const next = [];
  for (const ref of refs) {
    if (!ref || /^(#|mailto:|tel:|javascript:)/i.test(ref)) continue;
    let target = ref;
    if (!/^https?:\/\//i.test(ref)) {
      try { target = new URL(ref, u).toString(); } catch { continue; }
    }
    if (!sameOrigin(target)) continue;
    const t = new URL(target);
    if (!ASSET_EXT.test(t.pathname)) next.push(t.toString());
  }
  return next;
}

async function trySitemap() {
  const urls = new Set();
  try {
    const res = await fetchFollow(`${ORIGIN}/sitemap.xml`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const re = /<loc>([^<]+)<\/loc>/gi;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const u = m[1].trim();
      if (sameOrigin(u)) urls.add(u);
    }
    console.log(`Sitemap URLs discovered: ${urls.size}`);
  } catch (e) {
    console.warn('No sitemap or failed to read sitemap.xml:', e.message);
  }
  return [...urls];
}

(async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR); ensureDir(ORIG_DIR);

  const sitemapSeeds = await trySitemap();
  const queue = [...new Set([...MANUAL_SEEDS, ...sitemapSeeds])];
  const visited = new Set();
  let count = 0;

  while (queue.length && count < MAX_PAGES) {
    const cur = queue.shift();
    let key;
    try { key = new URL(cur).pathname; } catch { continue; }
    if (visited.has(key)) continue;
    visited.add(key);

    try {
      const next = await processPage(cur);
      count++;
      for (const n of next) {
        const k = new URL(n).pathname;
        if (!visited.has(k)) queue.push(n);
      }
    } catch (e) {
      console.warn('Page fail:', key, e.message);
    }
  }
  console.log(`Done. Mirrored ${count} page(s) into ${OUT_DIR}`);
})();
