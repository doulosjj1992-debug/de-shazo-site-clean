/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      // Root → public/index.html
      { source: '/', destination: '/index.html' },

      // Directory-style URLs (with trailing slash) → public/<path>/index.html
      // e.g. /projects/ → /projects/index.html
      { source: '/:path*/', destination: '/:path*/index.html' },

      // Pretty URLs without extension (and without a dot) → public/<path>.html
      // e.g. /projects/k-12-facilities → /projects/k-12-facilities.html
      // Skip Next internals and any URL containing a dot (assets).
      { source: '/:path((?!_next/|api/).*[^.])', destination: '/:path.html' },
    ];
  },
};
export default nextConfig;
