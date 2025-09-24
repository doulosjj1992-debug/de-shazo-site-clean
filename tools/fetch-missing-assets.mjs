import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as delay } from 'timers/promises';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const EXT_ROOT = path.join(PUBLIC_DIR, 'ext');
const UA = 'Mozilla/5.0 (compatible; DeShazoMirror/1.0)';

function listHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtml(p));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(p);
  }
  return out;
}

// Extract src + srcset URLs
function extractUrls(html) {
  const urls = new Set();
  const srcRe = /\b(?:src|href)\s*=\s*(['"])(.*?)\1/gi;
  const srcsetRe = /\bsrcset\s*=\s*(['"])(.*?)\1/gi;

  let m;
  while ((m = srcRe.exec(html))) {
    urls.add(m[2]);
  }
  while ((m = srcsetRe.exec(html))) {
    const parts = m[2].split(',');
    for (const part of parts) {
      const u = part.trim().split(/\s+/)[0];
      if (u) urls.add(u);
    }
  }
  return [...urls];
}

function toAbsolute(u) {
  // normalize protocol-relative
  if (u.startsWith('//')) return 'https:' + u;
  return u;
}

function isExternal(u) {
  return /^https?:\/\//i.test(u);
}

function diskPathFor(u) {
  const url = new URL(u);
  // keep queryless path on disk; we’ll strip ?… for filename
  const cleanPath = url.pathname.replace(/\/+/g, '/');
  const local = path.join(EXT_ROOT, url.host, cleanPath);
  return local;
}

async function ensureFile(u, outPath) {
  if (fs.existsSync(outPath)) return 'exists';
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const res = await fetch(u, { headers: { 'user-agent': UA, 'accept': '*/*', 'referer': 'https://deshazos-fresh-site.webflow.io/' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${u}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return 'fetched';
}

function rewriteHtml(html) {
  // promote data-srcset/src and strip data: placeholders
  html = html
    .replace(/\bdata-srcset=([\'"])(.*?)\1/gi, 'srcset=$1$2$1')
    .replace(/\bsrc=([\'"])data:[^\1]*\1/gi, '') // remove tiny data placeholders
    .replace(/\bdata-src=([\'"])(.*?)\1/gi, 'src=$1$2$1');

  // normalize protocol-relative
  html = html.replace(/\bsrc=(['"])\/\/([^'"]+)\1/gi, 'src="https://$2"');

  // add default sizes if srcset present w/o sizes
  html = html.replace(/(<img\b((?:(?!>).)*?)srcset=(?:\"[^\"]+\"|'[^']+')(?![^>]*\bsizes=))/gi, '$1 sizes="100vw"');

  // rewrite external URLs to /ext/<host>/<path> (drop queries)
  html = html.replace(/\b(src|href|content)=(['"])(https?:\/\/[^'"]+)\2/gi, (_, attr, q, full) => {
    try {
      const u = new URL(full);
      return `${attr}=${q}/ext/${u.host}${u.pathname}${q}`;
    } catch { return `${attr}=${q}${full}${q}`; }
  });

  return html;
}

async function main() {
  const htmlFiles = listHtml(PUBLIC_DIR);
  const allUrls = new Map(); // url -> outPath

  // Collect URLs
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    for (const raw of extractUrls(html)) {
      const abs = toAbsolute(raw);
      if (!isExternal(abs)) continue;
      const outPath = diskPathFor(abs);
      allUrls.set(abs, outPath);
    }
  }

  console.log(`Found ${allUrls.size} external asset URLs to check.`);

  // Fetch with light concurrency
  const queue = [...allUrls.entries()];
  const CONC = 6;
  let ok = 0, skip = 0, fail = 0;

  async function worker(id) {
    while (queue.length) {
      const [u, outPath] = queue.shift();
      try {
        const state = await ensureFile(u, outPath);
        if (state === 'exists') skip++; else ok++;
      } catch (e) {
        fail++;
        console.error(`x ${u} -> ${outPath}\n  ${String(e)}`);
      }
      // be polite
      await delay(50);
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, i) => worker(i)));

  console.log(`Fetched: ${ok}, existing: ${skip}, failed: ${fail}`);

  // Rewrite HTML files to point to local /ext copies + normalize lazy attrs
  for (const file of htmlFiles) {
    const orig = fs.readFileSync(file, 'utf8');
    const updated = rewriteHtml(orig);
    if (updated !== orig) {
      fs.writeFileSync(file, updated);
      console.log('rewrote', path.relative(PUBLIC_DIR, file));
    }
  }

  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
