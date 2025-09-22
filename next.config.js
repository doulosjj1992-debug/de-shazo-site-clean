/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: { appDir: true },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'x-dns-prefetch-control', value: 'on' }],
      },
    ];
  },
};
export default nextConfig;
