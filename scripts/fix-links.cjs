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
