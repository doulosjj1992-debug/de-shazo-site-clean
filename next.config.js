/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ],
    formats: ['image/avif', 'image/webp']
  },
  experimental: { appDir: true },
  async redirects() { return []; },
  async headers() {
    return [{
      source: '/:path*',
      headers: [{ key: 'X-DNS-Prefetch-Control', value: 'on' }]
    }];
  }
};
export default nextConfig;
