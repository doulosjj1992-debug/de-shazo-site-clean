#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const puppeteer = require("puppeteer");

const ORIGIN = process.env.ORIGIN || "https://deshazos-fresh-site.webflow.io";
const OUTDIR = path.join(process.cwd(), "public");
const MAX_PAGES = 3000;
const PAGE_CONCURRENCY = 4;
const FETCH_CONCURRENCY = 8;

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function writeFileSafe(p, data){ ensureDir(path.dirname(p)); fs.writeFileSync(p, data); }
function isAssetPath(pn){
  return /\.(?:css|js|mjs|cjs|map|json|xml|png|jpe?g|gif|webp|avif|svg|ico|pdf|txt|csv|woff2?|ttf|otf|eot|mp4|webm|mov|mp3|wav|ogg|glb|gltf|wasm)$/i.test(pn);
}
function isSkipProto(u){ return /^(mailto:|tel:|javascript:|#|data:)/i.test(u); }
function norm(u, base){ try{ return new URL(u, base).toString(); }catch{ return null; } }
function pagePathForUrl(u){
  const { pathname } = new URL(u);
  if (pathname === "/" || pathname === "") return path.join(OUTDIR, "index.html");
  if (pathname.endsWith("/")) return path.join(OUTDIR, pathname, "index.html");
  if (path.extname(pathname)) return path.join(OUTDIR, pathname);
  return path.join(OUTDIR, pathname + ".html");
}
// Local path for ANY URL: same-origin → /path; other origins → /ext/<host>/path
function localPathForUrl(u){
  const url = new URL(u);
  const originHost = new URL(ORIGIN).host;
  const pn = url.pathname;
  if (url.host === originHost) return path.join(OUTDIR, pn);
  return path.join(OUTDIR, "ext", url.host, pn);
}
// HREF/SRC value to place into HTML/CSS
function localHrefForUrl(u){
  const url = new URL(u);
  const originHost = new URL(ORIGIN).host;
  const pn = url.pathname + (url.search || "") + (url.hash || "");
  if (url.host === originHost) return pn;
  return path.posix.join("/ext", url.host, pn).replace(/\\/g, "/");
}

class Pool{
  constructor(n){ this.n=n; this.a=0; this.q=[]; }
  run(fn){ return new Promise((res,rej)=>{ this.q.push({fn,res,rej}); this.pump(); }); }
  pump(){ while(this.a<this.n && this.q.length){ const j=this.q.shift(); this.a++; Promise.resolve().then(j.fn).then(
    v=>{this.a--; j.res(v); this.pump();},
    e=>{this.a--; j.rej(e); this.pump();}
  ); } }
}
const fetchPool = new Pool(FETCH_CONCURRENCY);

const pageSeen = new Set(), pageQ = [];
const assetSeen = new Set(), assetQ = [];

// Only track uniqueness; queue drives downloads
function queueAsset(abs){
  if (!abs) return;
  try{
    const u = new URL(abs);
    if (!/^https?:$/i.test(u.protocol)) return;
    const key = u.toString();
    if (assetSeen.has(key)) return;
    assetSeen.add(key);
    assetQ.push(key);
  }catch{}
}

async function processCss(absUrl, cssText){
  const base = new URL(absUrl);
  return cssText
    .replace(/(@import\s+)(?:url\()?["']?([^"')\s]+)["']?\)?/gi,(m,pre,u)=>{
      const abs = norm(u, base);
      if (!abs) return m;
      queueAsset(abs);
      return `${pre}"${localHrefForUrl(abs)}"`;
    })
    .replace(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gi,(m,u)=>{
      if (isSkipProto(u)) return m;
      const abs = norm(u, base);
      if (!abs) return m;
      queueAsset(abs);
      return `url("${localHrefForUrl(abs)}")`;
    });
}

(async()=>{
  ensureDir(OUTDIR);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const start = new URL("/", ORIGIN).toString();
  pageQ.push(start);
  [
    "/main/our-service","/main/about-us","/main/profile","/main/in-the-news","/main/media","/main/career-page",
    "/projects/community-plans","/projects/corporate-facilities","/projects/cultural-facilities","/projects/healthcare-facilities",
    "/projects/higher-education","/projects/k-12-facilities","/projects/master-plans","/projects/mixed-use-facilities",
    "/projects/multifamily-developments","/projects/religous-institutions","/projects/retail-developments","/projects/parking-design",
    "/projects/traffic-signal-design","/projects/transportation-projects-1"
  ].forEach(s=>pageQ.push(new URL(s, ORIGIN).toString()));

  async function pageWorker(){
    const page = await browser.newPage();
    while(pageQ.length && pageSeen.size < MAX_PAGES){
      const next = pageQ.shift();
      if (!next || pageSeen.has(next)) continue;
      pageSeen.add(next);
      try{
        await page.goto(next, { waitUntil: "networkidle2", timeout: 60000 });

        // Collect assets (any origin)
        const assets = await page.evaluate(()=>{
          const S = new Set();
          const add = u => { if (u) S.add(u); };
          document.querySelectorAll('link[href]').forEach(l=>add(l.href));
          document.querySelectorAll('script[src]').forEach(s=>add(s.src));
          document.querySelectorAll('img[src],source[src],video[src]').forEach(m=>add(m.src));
          document.querySelectorAll('[srcset]').forEach(el=>{
            el.srcset.split(',').forEach(part=>{
              const u = part.trim().split(/\s+/)[0];
              if (u) add(u);
            });
          });
          return Array.from(S);
        });
        for(const a of assets){
          if (isSkipProto(a)) continue;
          const abs = norm(a, next);
          if (!abs) continue;
          const pn = new URL(abs).pathname;
          if (isAssetPath(pn)) queueAsset(abs);
        }

        // Discover internal page links (same site pages only)
        const links = await page.$$eval("a[href]", as=>as.map(a=>a.getAttribute("href")).filter(Boolean));
        for(const h of links){
          if (isSkipProto(h)) continue;
          const abs = norm(h, next);
          if (!abs) continue;
          const url = new URL(abs);
          if (url.origin === new URL(ORIGIN).origin && !isAssetPath(url.pathname)){
            if (!pageSeen.has(url.toString())) pageQ.push(url.toString());
          }
        }

        // Serialize HTML and rewrite references to local paths
        let html = await page.content();
        const rewrite = (u, base) => {
          const abs = norm(u, base);
          if (!abs) return u;
          return localHrefForUrl(abs);
        };
        html = html
          .replace(/(<a[^>]*\shref=["'])([^"']+)(["'])/gi,(m,pre,u,post)=>{
            if (isSkipProto(u)) return m;
            return `${pre}${rewrite(u,next)}${post}`;
          })
          .replace(/(<link[^>]*\shref=["'])([^"']+)(["'])/gi,(m,pre,u,post)=>`${pre}${rewrite(u,next)}${post}`)
          .replace(/(<script[^>]*\ssrc=["'])([^"']+)(["'])/gi,(m,pre,u,post)=>`${pre}${rewrite(u,next)}${post}`)
          .replace(/(<(?:img|video)[^>]*\ssrc=["'])([^"']+)(["'])/gi,(m,pre,u,post)=>`${pre}${rewrite(u,next)}${post}`)
          .replace(/(\ssrcset=["'])([^"']+)(["'])/gi,(m,pre,v,post)=>{
            const out = v.split(',').map(part=>{
              const [u,d] = part.trim().split(/\s+/);
              const nu = rewrite(u,next);
              return d ? `${nu} ${d}` : nu;
            }).join(', ');
            return `${pre}${out}${post}`;
          });

        const dest = pagePathForUrl(next);
        writeFileSafe(dest, html);
        console.log("✓", next, "→", path.relative(OUTDIR, dest));
      }catch(e){
        console.warn("✗", next, e.message);
      }
    }
    await page.close();
  }

  await Promise.all(Array.from({length: PAGE_CONCURRENCY}, ()=>pageWorker()));

  // Download all queued assets
  async function downloadAsset(u){
    try{
      const to = localPathForUrl(u);
      if (fs.existsSync(to)) return;
      const res = await fetch(u, { redirect: "follow" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const ctype = (res.headers.get("content-type")||"").toLowerCase();
      const buf = Buffer.from(await res.arrayBuffer());
      if (/text\/css/.test(ctype) || /\.css(\?|$)/i.test(new URL(u).pathname)){
        const rewritten = await processCss(u, buf.toString("utf8"));
        writeFileSafe(to, rewritten);
      } else {
        writeFileSafe(to, buf);
      }
      console.log("⬇︎", new URL(u).host + new URL(u).pathname, "→", path.relative(OUTDIR, to));
    }catch(e){
      console.warn("• asset fail", u, e.message);
    }
  }
  async function drain(){
    const jobs=[];
    while(assetQ.length){ const u=assetQ.shift(); jobs.push(fetchPool.run(()=>downloadAsset(u))); }
    await Promise.allSettled(jobs);
  }
  await drain();

  await browser.close();
  console.log(`Done. Mirrored ${pageSeen.size} pages and ${assetSeen.size} assets into ${OUTDIR}`);
})();
