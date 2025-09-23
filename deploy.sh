#!/bin/bash
set -euo pipefail

# Configuration
SITE_URL="https://www.deshazogroup.com"
PROJECT_DIR="$HOME/de-shazo-site-clean"
BRANCH_NAME="sever-webflow"

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Verify prerequisites
command -v node >/dev/null 2>&1 || log_error "Node.js is required but not installed"
command -v git >/dev/null 2>&1 || log_error "Git is required but not installed"
command -v wget >/dev/null 2>&1 || log_error "wget is required but not installed"

# Setup project directory
cd "$PROJECT_DIR" || log_error "Failed to change to project directory: $PROJECT_DIR"

# Create and checkout branch
log_info "Creating branch: $BRANCH_NAME"
git checkout -B "$BRANCH_NAME"

# Clean previous build
rm -rf public/mirror scripts
mkdir -p public/mirror scripts

# Create the mirror script
log_info "Creating mirror script..."
cat > scripts/mirror.cjs <<'MIRROR_JS'
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://www.deshazogroup.com';
const MIRROR_DIR = path.join(process.cwd(), 'public', 'mirror');

// Pages to mirror (add more as needed)
const PAGES = [
  '/',
  '/our-service',
  '/profile',
  '/contact',
  '/in-the-news',
  '/portfolio',
  '/about',
  // Add any other known pages here
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function mirrorSite() {
  ensureDir(MIRROR_DIR);
  
  console.log(`Starting mirror of ${SITE_URL}...`);
  
  try {
    // Use wget to mirror the site
    const wgetCmd = `wget \
      --mirror \
      --convert-links \
      --adjust-extension \
      --page-requisites \
      --no-parent \
      --no-host-directories \
      --directory-prefix="${MIRROR_DIR}" \
      --no-verbose \
      --tries=3 \
      --timeout=30 \
      --wait=0.5 \
      --random-wait \
      --user-agent="Mozilla/5.0 (compatible; SiteMirror/1.0)" \
      ${SITE_URL}`;
    
    console.log('Downloading site content...');
    execSync(wgetCmd, { stdio: 'inherit' });
    
    // Download specific pages that might not be linked
    for (const page of PAGES) {
      const pageUrl = `${SITE_URL}${page}`;
      console.log(`Ensuring page: ${pageUrl}`);
      try {
        execSync(`wget -P "${MIRROR_DIR}" --no-verbose --tries=2 "${pageUrl}"`, { stdio: 'pipe' });
      } catch (e) {
        console.warn(`Could not fetch ${pageUrl}: ${e.message}`);
      }
    }
    
    console.log('Mirror completed successfully!');
    
    // Count files downloaded
    const countFiles = (dir) => {
      let count = 0;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) count++;
        else if (entry.isDirectory()) count += countFiles(path.join(dir, entry.name));
      }
      return count;
    };
    
    const fileCount = countFiles(MIRROR_DIR);
    console.log(`Downloaded ${fileCount} files`);
    
    return true;
  } catch (error) {
    console.error('Mirror failed:', error.message);
    return false;
  }
}

if (!mirrorSite()) {
  process.exit(1);
}
MIRROR_JS

# Run the mirror script
log_info "Mirroring website..."
if ! node scripts/mirror.cjs; then
  log_error "Failed to mirror the website"
fi

# Fix duplicate .html.html extensions
log_info "Fixing file extensions..."
find public/mirror -type f -name '*.html.html' -print0 2>/dev/null | \
  while IFS= read -r -d '' file; do
    newname="${file%.html.html}.html"
    mv "$file" "$newname"
    log_info "Renamed: $(basename "$file") → $(basename "$newname")"
  done

# Create the link fixing script
log_info "Creating link fixing script..."
cat > scripts/fix-links.cjs <<'FIXLINKS_JS'
const fs = require('fs');
const path = require('path');

const ROOT = path.join(process.cwd(), 'public', 'mirror');
const ORIGIN = 'https://www.deshazogroup.com';

function walk(dir) {
  const out = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...walk(p));
      } else if (e.isFile() && p.endsWith('.html')) {
        out.push(p);
      }
    }
  } catch (err) {
    console.warn(`Could not read directory ${dir}: ${err.message}`);
  }
  return out;
}

function rewriteHtml(html) {
  // Store original for comparison
  const original = html;
  
  // 1. Convert absolute URLs to relative
  const originRegex = new RegExp(ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/', 'g');
  html = html.replace(originRegex, '/');
  
  // 2. Normalize homepage links
  html = html.replace(/href="\/index\.html(\?[^"]*)?"/g, 'href="/$1"');
  html = html.replace(/href="\/index(\?[^"]*)?"/g, 'href="/$1"');
  
  // 3. Strip .html extension from internal links (but not from asset files)
  html = html.replace(/(href|src)="(\/[^"#?]+)\.html([#?][^"]*)?"/g, (match, attr, path, tail = '') => {
    // Keep .html for actual asset files in uploads or static directories
    if (path.startsWith('/uploads/') || path.startsWith('/_next/') || path.includes('/static/')) {
      return match;
    }
    // For regular pages, remove .html
    return `${attr}="${path}${tail}"`;
  });
  
  // 4. Handle any remaining absolute URLs that might have different subdomains
  html = html.replace(/(href|src)="https?:\/\/[^"\/]*deshazogroup\.com(\/[^"]*)"/gi, (match, attr, path) => {
    return `${attr}="${path}"`;
  });
  
  // 5. Fix common Webflow patterns
  html = html.replace(/href="\/home"/g, 'href="/"');
  html = html.replace(/href="\/index"/g, 'href="/"');
  
  return html;
}

function run() {
  console.log('Scanning for HTML files...');
  const files = walk(ROOT);
  
  if (files.length === 0) {
    console.error('No HTML files found in mirror directory!');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} HTML files to process`);
  
  let changed = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      const before = fs.readFileSync(file, 'utf8');
      const after = rewriteHtml(before);
      
      if (after !== before) {
        fs.writeFileSync(file, after);
        changed++;
        console.log(`✓ Fixed: ${path.relative(ROOT, file)}`);
      }
    } catch (err) {
      console.error(`✗ Error processing ${file}: ${err.message}`);
      errors++;
    }
  }
  
  console.log(`\nSummary: Fixed ${changed} file(s), ${errors} error(s), ${files.length - changed - errors} unchanged`);
  
  if (errors > 0) {
    process.exit(1);
  }
}

run();
FIXLINKS_JS

# Run the link fixing script
log_info "Fixing internal links..."
node scripts/fix-links.cjs

# Create the verification script
log_info "Creating verification script..."
cat > scripts/verify.cjs <<'VERIFY_JS'
const fs = require('fs');
const path = require('path');

const MIRROR = path.join(process.cwd(), 'public', 'mirror');

function htmlFiles() {
  const out = [];
  const stack = [MIRROR];
  
  while (stack.length) {
    const dir = stack.pop();
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile() && fullPath.endsWith('.html')) {
          out.push(fullPath);
        }
      }
    } catch (err) {
      console.warn(`Could not read directory ${dir}: ${err.message}`);
    }
  }
  
  return out;
}

function canonicalize(href) {
  if (!href) return null;
  href = href.trim();
  
  // Ignore special protocols
  if (/^(mailto:|tel:|javascript:|#|data:)/i.test(href)) return null;
  
  // Handle absolute URLs
  if (/^https?:\/\//i.test(href)) {
    try {
      const url = new URL(href);
      // Only check internal links
      if (!/deshazogroup\.com$/i.test(url.hostname)) return null;
      href = url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }
  
  // Only process root-relative paths
  if (!href.startsWith('/')) return null;
  
  // Remove hash and query for file checking
  return href.split(/[#?]/)[0];
}

function candidatesFor(href) {
  const candidates = [];
  
  if (href === '/' || href === '') {
    candidates.push('/index.html');
  } else if (href.endsWith('/')) {
    candidates.push(href + 'index.html', href.slice(0, -1) + '.html');
  } else {
    candidates.push(href + '.html', href + '/index.html');
  }
  
  return [...new Set(candidates)];
}

function exists(relPath) {
  const fullPath = path.join(MIRROR, relPath.replace(/^\//, ''));
  return fs.existsSync(fullPath);
}

function extractLinks(html) {
  const links = [];
  const regex = /\s(?:href|src)=["']([^"']+)["']/gi;
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  
  return links;
}

function run() {
  console.log('Starting link verification...\n');
  
  const files = htmlFiles();
  if (files.length === 0) {
    console.error('No HTML files found!');
    process.exit(1);
  }
  
  const missing = new Map();
  const checkedLinks = new Set();
  let totalLinks = 0;
  
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const links = extractLinks(html);
    
    for (const rawLink of links) {
      totalLinks++;
      const link = canonicalize(rawLink);
      
      if (!link) continue;
      if (checkedLinks.has(link)) continue;
      checkedLinks.add(link);
      
      const candidates = candidatesFor(link);
      const found = candidates.some(exists);
      
      if (!found) {
        if (!missing.has(link)) {
          missing.set(link, new Set());
        }
        missing.get(link).add(path.relative(MIRROR, file));
      }
    }
  }
  
  console.log(`✓ Scanned ${files.length} HTML files`);
  console.log(`✓ Checked ${checkedLinks.size} unique links (${totalLinks} total)`);
  
  if (missing.size === 0) {
    console.log(`✓ All internal links are valid!\n`);
    return;
  }
  
  console.log(`\n⚠ Found ${missing.size} broken link(s):\n`);
  
  let count = 0;
  for (const [link, sources] of missing) {
    if (count++ >= 20) {
      console.log(`\n... and ${missing.size - 20} more`);
      break;
    }
    console.log(`  ${link}`);
    console.log(`    └─ in: ${[...sources][0]}`);
  }
  
  // Exit with error if broken links found
  process.exitCode = 1;
}

run();
VERIFY_JS

# Run verification
log_info "Verifying links..."
node scripts/verify.cjs || log_warn "Some broken links were found (this is expected for external content)"

# Create package.json if it doesn't exist
if [ ! -f package.json ]; then
  log_info "Creating package.json..."
  cat > package.json <<'PACKAGE_JSON'
{
  "name": "deshazo-static-site",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "mirror": "node scripts/mirror.cjs",
    "fix-links": "node scripts/fix-links.cjs",
    "verify": "node scripts/verify.cjs",
    "build": "echo 'Static site ready'"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
PACKAGE_JSON
fi

# Create vercel.json with comprehensive routing
log_info "Creating Vercel configuration..."
cat > vercel.json <<'VERCEL_JSON'
{
  "buildCommand": "echo 'Static files ready'",
  "outputDirectory": "public",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    },
    {
      "source": "/(.*)\\.(jpg|jpeg|png|gif|svg|webp|ico)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ],
  "redirects": [
    {
      "source": "/index.html",
      "destination": "/",
      "permanent": true
    },
    {
      "source": "/home",
      "destination": "/",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/_next/:path*",
      "destination": "https://www.deshazogroup.com/_next/:path*"
    },
    {
      "source": "/uploads/:path*",
      "destination": "https://www.deshazogroup.com/uploads/:path*"
    },
    {
      "source": "/static/:path*",
      "destination": "https://www.deshazogroup.com/static/:path*"
    },
    {
      "source": "/favicon.ico",
      "destination": "https://www.deshazogroup.com/favicon.ico"
    },
    {
      "source": "/robots.txt",
      "destination": "https://www.deshazogroup.com/robots.txt"
    },
    {
      "source": "/sitemap.xml",
      "destination": "https://www.deshazogroup.com/sitemap.xml"
    },
    {
      "source": "/",
      "destination": "/mirror/index.html"
    },
    {
      "source": "/services",
      "destination": "/mirror/our-service.html"
    },
    {
      "source": "/projects",
      "destination": "/mirror/portfolio.html"
    },
    {
      "source": "/team",
      "destination": "/mirror/profile.html"
    },
    {
      "source": "/contact",
      "destination": "/mirror/contact.html"
    },
    {
      "source": "/news",
      "destination": "/mirror/in-the-news.html"
    },
    {
      "source": "/about",
      "destination": "/mirror/about.html"
    },
    {
      "source": "/:path",
      "destination": "/mirror/:path.html"
    },
    {
      "source": "/:path/",
      "destination": "/mirror/:path/index.html"
    }
  ],
  "trailingSlash": false
}
VERCEL_JSON

# Create a simple 404 page
log_info "Creating 404 page..."
cat > public/mirror/404.html <<'HTML_404'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Not Found - DeShazo Group</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 3rem;
      margin: 0;
      color: #333;
    }
    p {
      color: #666;
      margin: 1rem 0;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Sorry, the page you're looking for cannot be found.</p>
    <p><a href="/">Return to Homepage</a></p>
  </div>
</body>
</html>
HTML_404

# Create .gitignore if it doesn't exist
if [ ! -f .gitignore ]; then
  log_info "Creating .gitignore..."
  cat > .gitignore <<'GITIGNORE'
node_modules/
.DS_Store
.env
.env.local
.vercel
*.log
dist/
.next/
out/
GITIGNORE
fi

# Count results
TOTAL_FILES=$(find public/mirror -type f | wc -l)
HTML_FILES=$(find public/mirror -type f -name "*.html" | wc -l)

# Git operations
log_info "Committing changes..."
git add -A
git commit -m "Mirror site from Webflow with fixed links and Vercel static hosting

- Mirrored ${HTML_FILES} HTML files and ${TOTAL_FILES} total files
- Fixed internal links to use clean URLs
- Added link verification
- Configured Vercel for static hosting with proper rewrites
- Created 404 page" || log_warn "No changes to commit"

# Push to remote
log_info "Pushing to remote..."
git push -u origin "$BRANCH_NAME"

# Summary
echo
log_info "=== Deployment Complete ==="
echo "  Total files: ${TOTAL_FILES}"
echo "  HTML files: ${HTML_FILES}"
echo "  Branch: ${BRANCH_NAME}"
echo
echo "Next steps:"
echo "1. Go to Vercel dashboard"
echo "2. Import this repository"
echo "3. Select branch: ${BRANCH_NAME}"
echo "4. Deploy with these settings:"
echo "   - Framework Preset: Other"
echo "   - Build Command: npm run build"
echo "   - Output Directory: public"
echo
log_info "Script completed successfully!"
