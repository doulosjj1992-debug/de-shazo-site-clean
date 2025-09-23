#!/usr/bin/env bash
set -euo pipefail

REPO="$HOME/de-shazo-site-clean"
BRANCH="sever-webflow"
ORIGIN="https://deshazos-fresh-site.webflow.io"   # Webflow staging URL

cd "$REPO"
git checkout -B "$BRANCH"

# --- package.json (minimal; just to satisfy Vercel's install step) ---
cat > package.json <<'JSON'
{
  "name": "deshazo-static-site",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "echo 'Static files ready'"
  },
  "dependencies": {
    "puppeteer": "^24.2.0",
    "jsdom": "^24.1.0"
  }
}
JSON

npm install

mkdir -p scripts public

# --- scripts/crawl.cjs: crawl staging and write HTML into ./public ---
cat > scripts/crawl.cjs <<'CJS'
#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const puppeteer = require("puppeteer");

const ORIGIN = process.env.ORIGIN || "https://deshazos-fresh-site.webflow.io";
const OUTDIR = path.join(process.cwd(), "public");
const MAX_PAGES = 1200;
const CONCURRENCY = 4;

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function urlToMirrorPath(u) {
  const { pathname } = new URL(u);
  let rel = pathname.replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  else if (rel.endsWith("/")) rel = rel + "index.html";
  else if (!rel.endsWith(".html")) rel = rel + ".html";
  return path.join(OUTDIR, rel);
}
function isInternal(u) {
  try { return new URL(u, ORIGIN).origin === ORIGIN; } catch { return false; }
}
function normalize(u, base) {
  try { return new URL(u, base).toString(); } catch { return null; }
}

(async () => {
  ensureDir(OUTDIR);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const seen = new Set();
  const queue = [ORIGIN + "/"];

  // Seed primary sections
  [
    "/main/our-service","/main/about-us","/main/profile","/main/in-the-news","/main/media","/main/career-page",
    "/projects/community-plans","/projects/corporate-facilities","/projects/cultural-facilities","/projects/healthcare-facilities",
    "/projects/higher-education","/projects/k-12-facilities","/projects/master-plans","/projects/mixed-use-facilities",
    "/projects/multifamily-developments","/projects/religous-institutions","/projects/retail-developments",
    "/projects/parking-design","/projects/traffic-signal-design","/projects/transportation-projects-1"
  ].forEach(s => queue.push(ORIGIN + s));

  const workers = Array.from({ length: CONCURRENCY }).map(() => (async function worker() {
    const page = await browser.newPage();
    while (queue.length && seen.size < MAX_PAGES) {
      const next = queue.shift();
      if (!next || seen.has(next)) continue;
      seen.add(next);
      try {
        await page.goto(next, { waitUntil: "networkidle2", timeout: 60000 });
        const html = await page.content();
        const dest = urlToMirrorPath(next);
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, html);

        // Discover more internal, document-like links
        const hrefs = await page.$$eval("a[href]", as =>
          as.map(a => a.getAttribute("href")).filter(Boolean)
        );
        for (const h of hrefs) {
          if (/^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
          const abs = normalize(h, next);
          if (!abs || !isInternal(abs)) continue;
          const p = new URL(abs).pathname;
          if (/\.(png|jpe?g|gif|webp|svg|ico|css|js|json|pdf|woff2?|ttf|eot)$/i.test(p)) continue;
          if (!seen.has(abs)) queue.push(abs);
        }
        console.log("✓", next, "→", path.relative(OUTDIR, dest));
      } catch (e) {
        console.warn("✗", next, e.message);
      }
    }
    await page.close();
  })());
  await Promise.all(workers);
  await browser.close();
  console.log(`Done. Mirrored ${seen.size} pages to ${OUTDIR}`);
})();
CJS
chmod +x scripts/crawl.cjs

# --- scripts/fix-links.cjs: make URLs root-relative for static hosting ---
cat > scripts/fix-links.cjs <<'CJS'
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(process.cwd(), 'public');
const ORIGIN = process.env.ORIGIN || 'https://deshazos-fresh-site.webflow.io';

function walk(dir, out=[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
let fixed = 0;

for (const file of files) {
  try {
    let html = fs.readFileSync(file, 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const fixUrl = u => (u.startsWith(ORIGIN) ? u.replace(ORIGIN, '') : u);

    doc.querySelectorAll('a[href]').forEach(el => { el.href = fixUrl(el.href); fixed++; });
    doc.querySelectorAll('link[href]').forEach(el => { el.href = fixUrl(el.href); fixed++; });
    doc.querySelectorAll('script[src]').forEach(el => { el.src = fixUrl(el.src); fixed++; });
    doc.querySelectorAll('img[src], video[src], source[src]').forEach(el => { el.src = fixUrl(el.src); fixed++; });
    doc.querySelectorAll('[srcset]').forEach(el => {
      el.srcset = el.srcset.split(',').map(s => {
        const [u, d] = s.trim().split(/\s+/);
        const nu = fixUrl(u);
        return d ? `${nu} ${d}` : nu;
      }).join(', ');
      fixed++;
    });

    fs.writeFileSync(file, dom.serialize());
  } catch (e) {
    console.warn('Skip', file, e.message);
  }
}
console.log(`Fixed ${fixed} link refs`);
CJS
chmod +x scripts/fix-links.cjs

# --- vercel.json: tell Vercel the output folder is ./public ---
cat > vercel.json <<'JSON'
{
  "outputDirectory": "public",
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)\\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|woff|woff2|ttf|eot)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ],
  "redirects": [
    { "source": "/index.html", "destination": "/", "permanent": true },
    { "source": "/projects/mixed-use-facilties", "destination": "/projects/mixed-use-facilities", "permanent": true },
    { "source": "/projects/mixed-use-facilties.html", "destination": "/projects/mixed-use-facilities.html", "permanent": true }
  ]
}
JSON

# --- 404 page (optional) ---
mkdir -p public/404
cat > public/404.html <<'HTML'
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Page Not Found - DeShazo Group</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui;margin:0;display:grid;place-items:center;min-height:100vh;background:#f5f5f5}
.card{background:#fff;border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:32px;text-align:center}
a{color:#0b65c2;text-decoration:none}</style>
<div class="card"><h1>404</h1><p>Sorry, we couldn't find that page.</p><p><a href="/">Return to Homepage</a></p></div>
HTML

# --- Crawl & normalize into ./public ---
rm -rf public/* || true
ORIGIN="$ORIGIN" node scripts/crawl.cjs
ORIGIN="$ORIGIN" node scripts/fix-links.cjs || true

# --- Commit & push ---
git add -A
git commit -m "Mirror Webflow staging (${ORIGIN}) into ./public for Vercel static deploy" || true
git push -u origin "$BRANCH"

echo
echo "✓ Done. Verify locally:"
echo "  - ls public | head"
echo "  - ls public/projects | head"
echo "Then in Vercel (Project Settings → Build & Output):"
echo "  - Framework Preset: Other"
echo "  - Build Command: (empty) or npm run build"
echo "  - Output Directory: public (vercel.json also sets this)"
