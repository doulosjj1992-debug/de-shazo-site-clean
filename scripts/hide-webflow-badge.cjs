const fs = require('fs'); const path = require('path');
const ROOT = path.join(process.cwd(), 'public');
function walk(d, out=[]) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith('.html')) out.push(p);
  } return out;
}
const STYLE = '<style>.w-webflow-badge{display:none!important}</style>';
for (const f of walk(ROOT)) {
  let html = fs.readFileSync(f, 'utf8');
  if (!/\.w-webflow-badge/.test(html)) {
    // still inject the style so the runtime won't show it later
  }
  html = html.replace(/<\/head>/i, m => `${STYLE}\n${m}`);
  // also remove any already-inserted badge node if present
  html = html.replace(/<a[^>]*class=["'][^"']*w-webflow-badge[^"']*["'][\s\S]*?<\/a>/gi, '');
  fs.writeFileSync(f, html);
  console.log('patched', path.relative(ROOT, f));
}
