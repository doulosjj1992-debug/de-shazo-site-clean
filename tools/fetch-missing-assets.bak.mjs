import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXT_ROOT = path.join(PUBLIC_DIR, 'ext');
const UA = 'Mozilla/5.0 (compatible; DeShazoMirror/1.2)';
const KEEP_EXTERNAL = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'www.linkedin.com',
  'drive.google.com',
]);

function listFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, exts));
    else if (entry.isFile() && exts.some(e => entry.name.toLowerCase().endsWith(e))) out.push(p);
  }
  return out;
}

function uniq(a) { return [...new Set(a)]; }
function normProto(u) { return u.startsWith('//') ? 'https:' + u : u; }

function isHttp(u)       { return /^https?:\/\//i.test(u); }
function isDataUri(u)    { return /^data:/i.test(u); }
function isJsMail(u)     { return /^(javascript:|mailto:|tel:)/i.test(u); }
function isLocalExt(u)   { return /^\/ext\/[^/]+\/.+/.test(u); }

function diskPathForHttp(u) {
  const url = new URL(u);
  return path.join(EXT_ROOT, url.host, url.pathname.replace(/\/+/g, '/'));
}
function diskPathForLocalExt(u) {
  return path.join(PUBLIC_DIR, u.replace(/^\/+/, ''));
}
function httpFromLocalExt(u) {
  const m = /^\/ext\/([^/]+)(\/.+)$/.exec(u);
  if (!m) return null;
  return `https://${m[1]}${m[2]}`;
}

async function ensureFileFromHttp(u, outPath) {
  if (fs.existsSync(outPath)) return 'exists';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const res = await fetch(u, {
    headers: {
      'user-agent': UA,
      'accept': '*/*',
      // some CDNs gate on referer; a benign referer helps
      'referer': 'https://deshazos-fresh-site.webflow.io/'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return 'fetched';
}

function gatherUrlsFromHtml(html) {
  const urls = [];

  // src / href / content / poster
  for (const m of html.matchAll(/\b(?:src|href|content|poster)\s*=\s*(['"])(.*?)\1/gi)) urls.push(m[2]);

  // srcset (split)
  for (const m of html.matchAll(/\bsrcset\s*=\s*(['"])(.*?)\1/gi)) {
    m[2].split(',').forEach(part => {
      const u = part.trim().split(/\s+/)[0];
      if (u) urls.push(u);
    });
  }

  // inline style url(...)
  for (const m of html.matchAll(/style\s*=\s*(['"])(.*?)\1/gi)) {
    for (const n of m[2].matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) urls.push(n[2]);
  }

  return uniq(urls.map(normProto));
}

function gatherUrlsFromCss(css) {
  const urls = [];
  for (const m of css.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) urls.push(normProto(m[2]));
  return uniq(urls);
}

function shouldKeepExternal(u) {
  try {
    const h = new URL(u).host;
    return KEEP_EXTERNAL.has(h);
  } catch { return false; }
}

function rewriteHtml(html) {
  // promote Webflow lazy attrs, drop data src
  html = html
    .replace(/\bdata-srcset=([\'"])(.*?)\1/gi, 'srcset=$1$2$1')
    .replace(/\bdata-src=([\'"])(.*?)\1/gi, 'src=$1$2$1')
    .replace(/\bsrc=(['"])data:[^'"]*\1/gi, '');

  // normalize protocol-relative
  html = html.replace(/\b(src|href|content|poster)=(['"])\/\/([^'"]+)\2/gi, '$1="https://$3"');

  // ensure sizes if srcset present and no sizes
  html = html.replace(/(<img\b((?:(?!>).)*?)srcset=(?:\"[^\"]+\"|'[^']+')(?![^>]*\bsizes=))/gi, '$1 sizes="100vw"');

  // Do NOT rewrite data:, javascript:, mailto:, tel:
  // Only rewrite true http(s) and only if host not in KEEP_EXTERNAL
  html = html.replace(/\b(src|href|content|poster)=(['"])(https?:\/\/[^'"]+)\2/gi, (_, attr, q, full) => {
    try {
      const u = new URL(full);
      if (KEEP_EXTERNAL.has(u.host)) return `${attr}=${q}${full}${q}`;
      return `${attr}=${q}/ext/${u.host}${u.pathname}${q}`;
    } catch { return `${attr}=${q}${full}${q}`; }
  });

  // inline style url(http...) -> url(/ext/...), unless keep-external
  html = html.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    const u = new URL(full);
    if (KEEP_EXTERNAL.has(u.host)) return `url(${full})`;
    return `url(/ext/${u.host}${u.pathname})`;
  });

  return html;
}

function rewriteCss(css) {
  // url(http...) -> url(/ext/...), unless keep-external
  return css.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    const u = new URL(full);
    if (KEEP_EXTERNAL.has(u.host)) return `url(${full})`;
    return `url(/ext/${u.host}${u.pathname})`;
  });
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('No public/ directory found.');
    process.exit(1);
  }

  const htmlFiles = listFiles(PUBLIC_DIR, ['.html']);
  const cssFiles  = listFiles(PUBLIC_DIR, ['.css']);

  // 1) Collect URLs (skip data:, javascript:, mailto:, tel:)
  const urls = new Set();
  for (const f of htmlFiles) for (const u of gatherUrlsFromHtml(fs.readFileSync(f,'utf8'))) {
    if (isDataUri(u) || isJsMail(u)) continue;
    urls.add(u);
  }
  for (const f of cssFiles) for (const u of gatherUrlsFromCss(fs.readFileSync(f,'utf8'))) {
    if (isDataUri(u) || isJsMail(u)) continue;
    urls.add(u);
  }

  // 2) Figure out what to fetch
  const fetchList = [];
  for (const u0 of urls) {
    if (isLocalExt(u0)) {
      const out = diskPathForLocalExt(u0);
      if (!fs.existsSync(out)) {
        const http = httpFromLocalExt(u0);
        if (http && !shouldKeepExternal(http)) fetchList.push([http, out]);
      }
      continue;
    }
    if (isHttp(u0)) {
      if (shouldKeepExternal(u0)) continue;
      const out = diskPathForHttp(u0);
      if (!fs.existsSync(out)) fetchList.push([u0, out]);
      continue;
    }
  }

  console.log(`Need to fetch ${fetchList.length} assets.`);

  // 3) Fetch
  let ok = 0, fail = 0;
  const queue = [...fetchList];
  const CONC = 6;
  async function worker() {
    while (queue.length) {
      const [u, out] = queue.shift();
      try { await ensureFileFromHttp(u, out); ok++; }
      catch (e) { fail++; console.error(`x ${u} -> ${out}: ${String(e)}`); }
      await delay(50);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`Fetched: ${ok}, failed: ${fail}`);

  // 4) Rewrite HTML and CSS
  for (const f of htmlFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd = rewriteHtml(orig);
    if (upd !== orig) { fs.writeFileSync(f, upd); console.log('rewrote HTML', path.relative(PUBLIC_DIR, f)); }
  }
  for (const f of cssFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd = rewriteCss(orig);
    if (upd !== orig) { fs.writeFileSync(f, upd); console.log('rewrote CSS ', path.relative(PUBLIC_DIR, f)); }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
