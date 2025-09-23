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
