/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  async rewrites() {
    return [
      // Root → /index.html
      { source: '/', destination: '/index.html' },

      // Folder paths with trailing slash → /folder/index.html
      { source: '/:path*/', destination: '/:path*/index.html' },

      // Pretty URL without slash → /path.html
      { source: '/:path*', destination: '/:path*.html' },
    ];
  },
};
export default nextConfig;
