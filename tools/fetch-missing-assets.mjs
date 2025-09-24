import fs from 'fs';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXT_ROOT = path.join(PUBLIC_DIR, 'ext');
const UA = 'Mozilla/5.0 (compatible; DeShazoMirror/1.1)';

function listFiles(dir, exts) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, exts));
    else if (entry.isFile() && exts.some(e => entry.name.toLowerCase().endsWith(e))) out.push(p);
  }
  return out;
}

function uniq(arr) { return [...new Set(arr)]; }

function normProto(u) { return u.startsWith('//') ? 'https:' + u : u; }

function isHttp(u) { return /^https?:\/\//i.test(u); }
function isLocalExt(u) { return /^\/ext\/[^/]+\/.+/.test(u); }

function diskPathForHttp(u) {
  const url = new URL(u);
  return path.join(EXT_ROOT, url.host, url.pathname.replace(/\/+/g, '/'));
}

function diskPathForLocalExt(u) {
  // /ext/<host>/<path> -> <public>/ext/<host>/<path>
  return path.join(PUBLIC_DIR, u.replace(/^\/+/, ''));
}

function httpFromLocalExt(u) {
  // /ext/<host>/<path> -> https://<host>/<path>
  const m = /^\/ext\/([^/]+)(\/.+)$/.exec(u);
  if (!m) return null;
  const host = m[1];
  const p = m[2];
  return `https://${host}${p}`;
}

async function ensureFileFromHttp(u, outPath) {
  if (fs.existsSync(outPath)) return 'exists';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const res = await fetch(u, {
    headers: {
      'user-agent': UA,
      'accept': '*/*',
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

  // src / href / content
  const attrRe = /\b(?:src|href|content)\s*=\s*(['"])(.*?)\1/gi;
  for (const m of html.matchAll(attrRe)) urls.push(m[2]);

  // srcset (split by comma)
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;
  for (const m of html.matchAll(srcsetRe)) {
    m[2].split(',').forEach(part => {
      const u = part.trim().split(/\s+/)[0];
      if (u) urls.push(u);
    });
  }

  // video poster
  const posterRe = /\bposter\s*=\s*(['"])(.*?)\1/gi;
  for (const m of html.matchAll(posterRe)) urls.push(m[2]);

  // inline style background-image/background with url(...)
  const styleUrlRe = /style\s*=\s*(['"])(.*?)\1/gi;
  for (const m of html.matchAll(styleUrlRe)) {
    for (const n of m[2].matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) {
      urls.push(n[2]);
    }
  }

  return uniq(urls.map(normProto));
}

function gatherUrlsFromCss(css) {
  const urls = [];
  for (const m of css.matchAll(/url\((['"]?)([^)'"]+)\1\)/gi)) {
    urls.push(normProto(m[2]));
  }
  return uniq(urls);
}

function rewriteHtml(html) {
  // Promote Webflow lazy attrs
  html = html
    .replace(/\bdata-srcset=([\'"])(.*?)\1/gi, 'srcset=$1$2$1')
    .replace(/\bdata-src=([\'"])(.*?)\1/gi, 'src=$1$2$1')
    .replace(/\bsrc=(['"])data:[^'"]*\1/gi, '');

  // Normalize protocol-relative
  html = html.replace(/\b(src|href|content|poster)=(['"])\/\/([^'"]+)\2/gi, '$1="https://$3"');

  // Ensure sizes if srcset present and no sizes
  html = html.replace(/(<img\b((?:(?!>).)*?)srcset=(?:\"[^\"]+\"|'[^']+')(?![^>]*\bsizes=))/gi, '$1 sizes="100vw"');

  // Rewrite external to /ext/…  (keep queries in HTML; file path on disk is queryless)
  html = html.replace(/\b(src|href|content|poster)=(['"])(https?:\/\/[^'"]+)\2/gi, (_, attr, q, full) => {
    try {
      const u = new URL(full);
      return `${attr}=${q}/ext/${u.host}${u.pathname}${q}`;
    } catch { return `${attr}=${q}${full}${q}`; }
  });

  // Inline style url(https://...) -> url(/ext/host/path)
  html = html.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    const u = new URL(full);
    return `url(/ext/${u.host}${u.pathname})`;
  });

  return html;
}

function rewriteCss(css) {
  // url(https://host/path) -> url(/ext/host/path)
  return css.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    const u = new URL(full);
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

  // 1) Collect all URLs
  const urls = new Set();

  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    gatherUrlsFromHtml(html).forEach(u => urls.add(u));
  }
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, 'utf8');
    gatherUrlsFromCss(css).forEach(u => urls.add(u));
  }

  // 2) Decide what needs fetching
  const fetchList = [];
  for (const u0 of urls) {
    // local /ext/<host>/<path> — ensure file exists; if not, fetch from https://host/path
    if (isLocalExt(u0)) {
      const out = diskPathForLocalExt(u0);
      if (!fs.existsSync(out)) {
        const http = httpFromLocalExt(u0);
        if (http) fetchList.push([http, out]);
      }
      continue;
    }
    // external http(s)
    if (isHttp(u0)) {
      const out = diskPathForHttp(u0);
      if (!fs.existsSync(out)) fetchList.push([u0, out]);
      continue;
    }
  }

  console.log(`Need to fetch ${fetchList.length} assets.`);

  // 3) Fetch with small concurrency
  let ok = 0, fail = 0, exist = 0;
  const queue = [...fetchList];
  const CONC = 6;

  async function worker() {
    while (queue.length) {
      const [u, out] = queue.shift();
      try {
        const r = await ensureFileFromHttp(u, out);
        if (r === 'exists') exist++; else ok++;
      } catch (e) {
        fail++;
        console.error(`x ${u} -> ${out}: ${String(e)}`);
      }
      await delay(50);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  console.log(`Fetched: ${ok}, failed: ${fail}`);

  // 4) Rewrite HTML and CSS to /ext/ paths & fix lazy attrs
  for (const f of htmlFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd = rewriteHtml(orig);
    if (upd !== orig) {
      fs.writeFileSync(f, upd);
      console.log('rewrote HTML', path.relative(PUBLIC_DIR, f));
    }
  }
  for (const f of cssFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd = rewriteCss(orig);
    if (upd !== orig) {
      fs.writeFileSync(f, upd);
      console.log('rewrote CSS ', path.relative(PUBLIC_DIR, f));
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
