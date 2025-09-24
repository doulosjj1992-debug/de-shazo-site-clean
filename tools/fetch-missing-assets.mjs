import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXT_ROOT = path.join(PUBLIC_DIR, 'ext');

// Hosts we deliberately keep external (don’t cache/rewite)
const KEEP_EXTERNAL = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
  'www.linkedin.com',
  'www.google.com',
  'drive.google.com',
]);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function listHtml(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) out.push(p);
    }
  })(dir);
  return out;
}

function listCss(dir) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.css')) out.push(p);
    }
  })(dir);
  return out;
}

// Pull http(s) URLs from common HTML attrs + inline CSS url(...)
function extractUrls(html) {
  const urls = new Set();

  // Attributes
  const attrRe = /\b(?:src|href|content|poster)=(['"])(.*?)\1/gi;
  let m;
  while ((m = attrRe.exec(html))) {
    const v = m[2].trim();
    if (/^https?:\/\//i.test(v)) urls.add(v);
    // skip data:, mailto:, tel:, etc.
  }

  // Inline CSS url(...)
  const urlRe = /url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
  while ((m = urlRe.exec(html))) {
    urls.add(m[2]);
  }
  return Array.from(urls);
}

function toAbsolute(raw) {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return 'https:' + raw;
  return raw;
}

function isExternal(abs) {
  return /^https?:\/\//i.test(abs);
}

function diskPathFor(absUrl) {
  const u = new URL(absUrl);
  return path.join(EXT_ROOT, u.host, u.pathname.replace(/\/+/g, '/'));
}

async function ensureFile(absUrl, outPath) {
  // Already exists?
  try {
    const st = fs.statSync(outPath);
    if (st.isFile()) return 'exists';
  } catch {}

  // Don’t fetch hosts we keep external (fonts, embeds)
  if (KEEP_EXTERNAL.has(new URL(absUrl).host)) return 'skip';

  // Guard against data-URI-like accidents (shouldn’t get here, but be safe)
  if (!/^https?:\/\//i.test(absUrl)) return 'skip';

  ensureDir(path.dirname(outPath));

  // Add a short file name if the path ends with a slash (no filename)
  let finalPath = outPath;
  if (finalPath.endsWith(path.sep)) {
    const hash = crypto.createHash('sha1').update(absUrl).digest('hex').slice(0, 8);
    finalPath = path.join(finalPath, 'index-' + hash);
  }

  const res = await fetch(absUrl, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(finalPath, buf);
  return 'fetched';
}

function localPathForHttp(full) {
  try {
    const u = new URL(full);
    return path.join(EXT_ROOT, u.host, u.pathname.replace(/\/+/g, '/'));
  } catch {
    return null;
  }
}

function rewriteHtml(html) {
  // Fix protocol-relative to https://
  html = html.replace(/\b(src|href|content|poster)=(['"])\/\/([^'"]+)\2/gi, '$1="https://$3"');

  // Promote Webflow lazy attrs, remove bogus data: placeholders on src
  html = html
    .replace(/\bdata-srcset=([\'"])(.*?)\1/gi, 'srcset=$1$2$1')
    .replace(/\bdata-src=([\'"])(.*?)\1/gi, 'src=$1$2$1')
    .replace(/\bsrc=(['"])data:[^'"]*\1/gi, '');

  // Ensure sizes= when srcset present but no sizes
  html = html.replace(
    /(<img\b((?:(?!>).)*?)srcset=(?:\"[^\"]+\"|'[^']+')(?![^>]*\bsizes=))/gi,
    '$1 sizes="100vw"',
  );

  // Attributes → only rewrite to /ext if local file is present
  html = html.replace(/\b(src|href|content|poster)=(['"])(https?:\/\/[^'"]+)\2/gi, (_, attr, q, full) => {
    try {
      const u = new URL(full);
      if (KEEP_EXTERNAL.has(u.host)) return `${attr}=${q}${full}${q}`;
      const local = localPathForHttp(full);
      if (local && fs.existsSync(local)) return `${attr}=${q}/ext/${u.host}${u.pathname}${q}`;
      return `${attr}=${q}${full}${q}`;
    } catch {
      return `${attr}=${q}${full}${q}`;
    }
  });

  // Inline style url(...) → only rewrite if local exists
  html = html.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    try {
      const u = new URL(full);
      if (KEEP_EXTERNAL.has(u.host)) return `url(${full})`;
      const local = localPathForHttp(full);
      if (local && fs.existsSync(local)) return `url(/ext/${u.host}${u.pathname})`;
      return `url(${full})`;
    } catch {
      return `url(${full})`;
    }
  });

  return html;
}

function rewriteCss(css) {
  // url(http...) → only rewrite if local exists
  return css.replace(/url\((['"]?)(https?:\/\/[^)'"]+)\1\)/gi, (_, q, full) => {
    try {
      const u = new URL(full);
      if (KEEP_EXTERNAL.has(u.host)) return `url(${full})`;
      const local = localPathForHttp(full);
      if (local && fs.existsSync(local)) return `url(/ext/${u.host}${u.pathname})`;
      return `url(${full})`;
    } catch {
      return `url(${full})`;
    }
  });
}

async function main() {
  if (!fs.existsSync(PUBLIC_DIR)) {
    console.error('No public/ directory found. Run from repo root.');
    process.exit(1);
  }
  ensureDir(EXT_ROOT);

  const htmlFiles = listHtml(PUBLIC_DIR);
  const cssFiles  = listCss(PUBLIC_DIR);

  // Collect unique external asset URLs from HTML + CSS
  const all = new Map(); // url -> outPath
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, 'utf8');
    for (const u of extractUrls(html)) {
      if (!isExternal(u)) continue;
      const out = diskPathFor(u);
      all.set(u, out);
    }
  }
  for (const f of cssFiles) {
    const css = fs.readFileSync(f, 'utf8');
    const urlRe = /url\((['"]?)(https?:\/\/[^'")]+)\1\)/gi;
    let m;
    while ((m = urlRe.exec(css))) {
      const u = m[2];
      const out = diskPathFor(u);
      all.set(u, out);
    }
  }

  // Create files (only for allowed hosts; data: are ignored)
  const list = [...all.entries()].filter(([u]) => {
    try {
      const host = new URL(u).host;
      return !KEEP_EXTERNAL.has(host); // we keep those external
    } catch { return false; }
  });

  console.log(`Need to fetch ${list.length} assets.`);
  const queue = [...list];
  const CONC = 6;
  let ok = 0, skip = 0, fail = 0;

  async function worker() {
    while (queue.length) {
      const [u, outPath] = queue.shift();
      try {
        const state = await ensureFile(u, outPath);
        if (state === 'exists' || state === 'skip') skip++; else ok++;
      } catch (e) {
        fail++;
        console.error(`x ${u} -> ${outPath}: ${String(e)}`);
      }
      await delay(50);
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  console.log(`Fetched: ${ok}, skipped/existing: ${skip}, failed: ${fail}`);

  // Rewrite HTML/CSS to local /ext *only if* file exists
  for (const f of htmlFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd  = rewriteHtml(orig);
    if (upd !== orig) {
      fs.writeFileSync(f, upd);
      console.log('rewrote HTML', path.relative(PUBLIC_DIR, f));
    }
  }
  for (const f of cssFiles) {
    const orig = fs.readFileSync(f, 'utf8');
    const upd  = rewriteCss(orig);
    if (upd !== orig) {
      fs.writeFileSync(f, upd);
      console.log('rewrote CSS ', path.relative(PUBLIC_DIR, f));
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
