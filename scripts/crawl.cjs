#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const puppeteer = require("puppeteer");

const ORIGIN = process.env.ORIGIN || "https://deshazos-fresh-site.webflow.io";
const OUTDIR = path.join(process.cwd(), "public", "mirror");
const MAX_PAGES = 800;
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
function isInternal(u) { try { return new URL(u, ORIGIN).origin === ORIGIN; } catch { return false; } }
function normalize(u, base) { try { return new URL(u, base).toString(); } catch { return null; } }

(async () => {
  ensureDir(OUTDIR);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const start = ORIGIN + "/";
  const seen = new Set();
  const queue = [start];

  // Seed key sections
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
  ].forEach(s => queue.push(ORIGIN + s));

  const workers = Array.from({ length: CONCURRENCY }).map(() =>
    (async function worker() {
      const page = await browser.newPage();
      while (queue.length && seen.size < MAX_PAGES) {
        const next = queue.shift();
        if (!next || seen.has(next)) continue;
        seen.add(next);
        try {
          await page.goto(next, { waitUntil: "networkidle2", timeout: 45000 });
          const html = await page.content();

          const dest = urlToMirrorPath(next);
          ensureDir(path.dirname(dest));
          fs.writeFileSync(dest, html);

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
    })()
  );

  await Promise.all(workers);
  await browser.close();
  console.log(`Done. Mirrored ${seen.size} pages to ${OUTDIR}`);
})();
