#!/usr/bin/env node
/**
 * Full-site mirror for a single-origin Webflow site:
 * - Crawls HTML pages via Puppeteer
 * - Downloads assets (CSS/JS/images/fonts/json/etc.)
 * - Rewrites all references in HTML & CSS to local paths
 * - Saves pages as .../path.html (or .../index.html for "/")
 * - Saves assets at their original pathname under ./public (e.g. /css/x.css -> public/css/x.css)
 */
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const puppeteer = require("puppeteer");

const ORIGIN = process.env.ORIGIN || "https://deshazos-fresh-site.webflow.io";
const OUTDIR = path.join(process.cwd(), "public");
const MAX_PAGES = 2000;
const PAGE_CONCURRENCY = 4;
const FETCH_CONCURRENCY = 8;

// ---------- utils ----------
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeFileSyncSafe(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, data);
}
function isHtmlPathname(pn) {
  return pn.endsWith(".html") || pn.endsWith(".htm");
}
function pagePathForUrl(u) {
  const { pathname } = new URL(u);
  if (pathname === "/" || pathname === "") return path.join(OUTDIR, "index.html");
  // if it ends with a slash, use /index.html under that folder
  if (pathname.endsWith("/")) return path.join(OUTDIR, pathname, "index.html");
  // if it has an extension, assume it's an asset; if not, treat as a page and append .html
  if (path.extname(pathname)) return path.join(OUTDIR, pathname); // (rare) direct .html path
  return path.join(OUTDIR, pathname + ".html");
}
function localAssetPathForUrl(u) {
  const { pathname } = new URL(u);
  // keep original pathname under OUTDIR so /css/x.css -> public/css/x.css
  return path.join(OUTDIR, pathname);
}
function sameOrigin(u) {
  try { return new URL(u).origin === new URL(ORIGIN).origin; } catch { return false; }
}
function norm(u, base) { try { return new URL(u, base).toString(); } catch { return null; } }
function isAssetPath(pn) {
  return /\.(?:css|js|mjs|cjs|ts|png|jpe?g|gif|webp|svg|ico|avif|bmp|map|json|xml|pdf|txt|csv|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|glb|gltf|wasm)$/i.test(pn);
}
function isMailTelJsHash(h) { return /^(mailto:|tel:|javascript:|#)/i.test(h); }

// ---------- simple fetch pool using global fetch (Node 18+) ----------
class FetchPool {
  constructor(size) { this.size = size; this.active = 0; this.q = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      this.q.push({ fn, resolve, reject });
      this.pump();
    });
  }
  pump() {
    while (this.active < this.size && this.q.length) {
      const { fn, resolve, reject } = this.q.shift();
      this.active++;
      Promise.resolve().then(fn).then((v) => {
        this.active--; resolve(v); this.pump();
      }, (e) => {
        this.active--; reject(e); this.pump();
      });
    }
  }
}
const fetchPool = new FetchPool(FETCH_CONCURRENCY);

// ---------- CSS processing (rewrite url() & @import and enqueue downloads) ----------
const cssSeen = new Set();
async function processCss(absUrl, cssText) {
  const base = new URL(absUrl);
  // rewrite url(...) & @import "..."/'...'
  const out = cssText.replace(/(@import\s+)(?:url\()?["']?([^"')\s]+)["']?\)?/gi, (m, pre, u) => {
    const abs = norm(u, base);
    if (!abs || !sameOrigin(abs)) return m;
    queueAsset(abs);
    const p = new URL(abs).pathname;
    return `${pre}"${p}"`;
  }).replace(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi, (m, u) => {
    const abs = norm(u, base);
    if (!abs || !sameOrigin(abs)) return m;
    queueAsset(abs);
    const p = new URL(abs).pathname;
    return `url("${p}")`;
  });
  return out;
}

// ---------- global queues ----------
const pageSeen = new Set();
const pageQueue = [];
const assetSeen = new Set();
const assetQueue = [];

// Enqueue asset for download and rewrite
function queueAsset(abs) {
  try {
    const u = new URL(abs, ORIGIN).toString();
    if (!sameOrigin(u)) return;
    const pn = new URL(u).pathname;
    if (!isAssetPath(pn)) return;
    if (assetSeen.has(u)) return;
    assetSeen.add(u);
    assetQueue.push(u);
  } catch {}
}

// ---------- crawl ----------
(async () => {
  ensureDir(OUTDIR);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const start = new URL("/", ORIGIN).toString();

  // seed
  pageQueue.push(start);
  [
    "/main/our-service",
    "/main/about-us",
    "/main/profile",
    "/main/in-the-news",
    "/main/media",
    "/main/career-page",
    "/projects/community-plans",
    "/projects/corporate-facilities",
    "/projects/cultural-facilities",
    "/projects/healthcare-facilities",
    "/projects/higher-education",
    "/projects/k-12-facilities",
    "/projects/master-plans",
    "/projects/mixed-use-facilities",
    "/projects/multifamily-developments",
    "/projects/religous-institutions",
    "/projects/retail-developments",
    "/projects/parking-design",
    "/projects/traffic-signal-design",
    "/projects/transportation-projects-1"
  ].forEach(s => pageQueue.push(new URL(s, ORIGIN).toString()));

  // page workers
  async function pageWorker() {
    const page = await browser.newPage();
    while (pageQueue.length && pageSeen.size < MAX_PAGES) {
      const next = pageQueue.shift();
      if (!next || pageSeen.has(next)) continue;
      pageSeen.add(next);

      try {
        await page.goto(next, { waitUntil: "networkidle2", timeout: 60000 });

        // collect assets before we mutate
        const assets = await page.evaluate(() => {
          const uniq = new Set();
          const push = (u) => { if (u) uniq.add(u); };

          // stylesheets & preloads
          document.querySelectorAll('link[href]').forEach(l => push(l.href));
          // scripts
          document.querySelectorAll('script[src]').forEach(s => push(s.src));
          // images/video/source
          document.querySelectorAll('img[src], source[src], video[src]').forEach(m => push(m.src));
          // srcset items
          document.querySelectorAll('[srcset]').forEach(el => {
            el.srcset.split(',').map(s => s.trim().split(/\s+/)[0]).forEach(u => push(u));
          });
          return Array.from(uniq);
        });

        // enqueue assets (same-origin only)
        for (const a of assets) {
          const abs = norm(a, next);
          if (!abs) continue;
          if (!sameOrigin(abs)) continue;
          const pn = new URL(abs).pathname;
          if (isAssetPath(pn)) queueAsset(abs);
        }

        // discover internal page links
        const links = await page.$$eval("a[href]", as => as.map(a => a.getAttribute("href")).filter(Boolean));
        for (const h of links) {
          if (isMailTelJsHash(h)) continue;
          const abs = norm(h, next);
          if (!abs || !sameOrigin(abs)) continue;
          const url = new URL(abs);
          // if link looks like an asset (has extension), skip as a page but asset is already queued above
          if (!isAssetPath(url.pathname)) {
            // it's a page
            if (!pageSeen.has(url.toString())) pageQueue.push(url.toString());
          }
        }

        // Now serialize HTML and rewrite references
        let html = await page.content();

        // Rewrite anchor hrefs → local page paths
        html = html.replace(/(<a[^>]*?\shref=["'])([^"']+)(["'])/gi, (m, pre, u, post) => {
          const abs = norm(u, next);
          if (!abs || !sameOrigin(abs)) return m;
          const url = new URL(abs);
          if (isAssetPath(url.pathname)) {
            // asset link: point to local pathname
            return `${pre}${url.pathname}${url.search || ""}${url.hash || ""}${post}`;
          } else {
            // page link: rewrite to .html mapping
            let out;
            if (url.pathname === "/" || url.pathname === "") out = "/index.html";
            else if (url.pathname.endsWith("/")) out = url.pathname + "index.html";
            else if (isHtmlPathname(url.pathname)) out = url.pathname;
            else out = url.pathname + ".html";
            return `${pre}${out}${url.search || ""}${url.hash || ""}${post}`;
          }
        });

        // Rewrite <link href>, <script src>, <img/src|srcset>, <video/src|source/src>
        const rewriteUrl = (u) => {
          const abs = norm(u, next);
          if (!abs || !sameOrigin(abs)) return u;
          return new URL(abs).pathname; // local asset path
        };
        html = html
          .replace(/(<link[^>]*?\shref=["'])([^"']+)(["'])/gi, (m, pre, u, post) => `${pre}${rewriteUrl(u)}${post}`)
          .replace(/(<script[^>]*?\ssrc=["'])([^"']+)(["'])/gi, (m, pre, u, post) => `${pre}${rewriteUrl(u)}${post}`)
          .replace(/(<(?:img|video)[^>]*?\ssrc=["'])([^"']+)(["'])/gi, (m, pre, u, post) => `${pre}${rewriteUrl(u)}${post}`)
          .replace(/(\ssrcset=["'])([^"']+)(["'])/gi, (m, pre, v, post) => {
            const out = v.split(",").map(part => {
              const [u, d] = part.trim().split(/\s+/);
              const nu = rewriteUrl(u);
              return d ? `${nu} ${d}` : nu;
            }).join(", ");
            return `${pre}${out}${post}`;
          });

        // Save page
        const dest = pagePathForUrl(next);
        writeFileSyncSafe(dest, html);
        console.log("✓", next, "→", path.relative(OUTDIR, dest));
      } catch (e) {
        console.warn("✗", next, e.message);
      }
    }
    await page.close();
  }

  // spawn page workers
  await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, () => pageWorker()));

  // Download assets with fetch pool, process CSS recursively
  const originObj = new URL(ORIGIN);
  async function downloadAsset(u) {
    const url = new URL(u);
    if (url.origin !== originObj.origin) return;
    const to = localAssetPathForUrl(u);
    if (fs.existsSync(to)) return;

    try {
      const res = await fetch(u, { redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());

      // CSS rewrite & sub-asset queue
      const isCss = /\.css(\?|$)/i.test(url.pathname) || (res.headers.get("content-type") || "").includes("text/css");
      if (isCss) {
        const cssText = buf.toString("utf8");
        if (!cssSeen.has(u)) {
          cssSeen.add(u);
          const rewritten = await processCss(u, cssText);
          writeFileSyncSafe(to, rewritten);
        } else {
          writeFileSyncSafe(to, cssText); // already processed elsewhere
        }
      } else {
        writeFileSyncSafe(to, buf);
      }
      console.log("⬇︎", url.pathname, "→", path.relative(OUTDIR, to));
    } catch (e) {
      console.warn("• asset fail", u, e.message);
    }
  }

  // drain asset queue with concurrency
  async function drainAssets() {
    const jobs = [];
    while (assetQueue.length) {
      const u = assetQueue.shift();
      jobs.push(fetchPool.run(() => downloadAsset(u)));
    }
    await Promise.allSettled(jobs);
  }
  await drainAssets();

  await browser.close();
  console.log(`Done. Mirrored ${pageSeen.size} pages and ${assetSeen.size} assets into ${OUTDIR}`);
})();
