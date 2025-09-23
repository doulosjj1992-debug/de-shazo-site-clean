#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(process.cwd(), 'public', '');
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
    const html = fs.readFileSync(file, 'utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Only fix internal PAGE navigation links
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href) return;
      // normalize absolute → origin-relative so your pages link internally,
      // but DO NOT touch assets (css/js/img/etc.)
      try {
        const url = new URL(href, ORIGIN);
        if (url.origin === new URL(ORIGIN).origin) {
          a.setAttribute('href', url.pathname + url.search + url.hash);
          fixed++;
        }
      } catch {}
    });

    fs.writeFileSync(file, dom.serialize());
  } catch (e) {
    console.warn('Skip', file, e.message);
  }
}

console.log(`Fixed ${fixed} page links`);
