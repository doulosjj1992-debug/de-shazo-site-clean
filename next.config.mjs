// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      // Serve mirrored HTML files from /public
      { source: '/',            destination: '/index.html' },
      { source: '/:path*/',     destination: '/:path*/index.html' },
      { source: '/:path*',      destination: '/:path*.html' },

      // Allow external assets without the /ext prefix
      { source: '/ext/cdn.prod.website-files.com/:path*', destination: 'https://cdn.prod.website-files.com/:path*' },
      { source: '/ext/ajax.googleapis.com/:path*',        destination: 'https://ajax.googleapis.com/:path*' },
      { source: '/ext/challenges.cloudflare.com/:path*',  destination: 'https://challenges.cloudflare.com/:path*' },
      { source: '/ext/cdn.jsdelivr.net/:path*',           destination: 'https://cdn.jsdelivr.net/:path*' },
      { source: '/ext/fonts.googleapis.com/:path*',       destination: 'https://fonts.googleapis.com/:path*' },
      { source: '/ext/fonts.gstatic.com/:path*',          destination: 'https://fonts.gstatic.com/:path*' },
    ];
  },
};
export default nextConfig;
