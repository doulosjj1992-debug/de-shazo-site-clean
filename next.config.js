/** @type {import('next').NextConfig} */
const LIVE = 'https://www.deshazogroup.com';

const config = {
  reactStrictMode: false,
  trailingSlash: false,

  async redirects() {
    return [
      // fix typo
      { source: '/projects/mixed-use-facilties', destination: '/projects/mixed-use-facilities', permanent: true },
      { source: '/projects/mixed-use-facilties.html', destination: '/projects/mixed-use-facilities.html', permanent: true },

      // strip accidental "%1"
      { source: '/%1', destination: '/', permanent: true },
      { source: '/:path*/%1', destination: '/:path*', permanent: true },
    ];
  },

  async rewrites() {
    // Let Next handle its internals & your static assets locally
    const passThrough = [
      { source: '/_next/:path*', destination: '/_next/:path*' },
      { source: '/favicon.ico', destination: '/favicon.ico' },
      { source: '/robots.txt', destination: '/robots.txt' },
      { source: '/sitemap.xml', destination: '/sitemap.xml' },
      { source: '/assets/:path*', destination: '/assets/:path*' },
      { source: '/images/:path*', destination: '/images/:path*' },
      { source: '/img/:path*', destination: '/img/:path*' },
      { source: '/css/:path*', destination: '/css/:path*' },
      { source: '/js/:path*', destination: '/js/:path*' },
      { source: '/fonts/:path*', destination: '/fonts/:path*' },
      { source: '/static/:path*', destination: '/static/:path*' },
    ];

    // Proxy page routes to the live site so Preview looks identical now
    const proxyToLive = [
      // exact .html
      { source: '/:path*.html', destination: `${LIVE}/:path*.html` },

      // section roots
      { source: '/',         destination: `${LIVE}/index.html` },
      { source: '/projects', destination: `${LIVE}/projects.html` },
      { source: '/services', destination: `${LIVE}/services.html` },
      { source: '/team',     destination: `${LIVE}/team.html` },
      { source: '/news',     destination: `${LIVE}/news.html` },
      { source: '/contact',  destination: `${LIVE}/contact.html` },
      { source: '/about',    destination: `${LIVE}/about.html` },

      // detail pages without .html → try .html on live
      { source: '/projects/:slug', destination: `${LIVE}/projects/:slug.html` },
      { source: '/services/:slug', destination: `${LIVE}/services/:slug.html` },
      { source: '/team/:slug',     destination: `${LIVE}/team/:slug.html` },
      { source: '/news/:slug',     destination: `${LIVE}/news/:slug.html` },
    ];

    return [...passThrough, ...proxyToLive];
  },
};

export default config;
