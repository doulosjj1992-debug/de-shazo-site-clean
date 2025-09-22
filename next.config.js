/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { typedRoutes: true },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'x-dns-prefetch-control', value: 'on' }],
      },
    ];
  },

  async redirects() {
    return [
      // fix the typo’d route
      {
        source: '/projects/mixed-use-facilties',
        destination: '/projects/mixed-use-facilities',
        permanent: true,
      },
      // drop legacy .html suffixes → clean URLs
      {
        source: '/:path*.html',
        destination: '/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
