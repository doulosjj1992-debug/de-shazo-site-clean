/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  trailingSlash: false,
  async rewrites() {
    return [
      // map root to mirrored index
      { source: '/', destination: '/webflow-export/index.html' },

      // pass through assets and existing .html exactly
      { source: '/webflow-export/:path*', destination: '/webflow-export/:path*' },
      { source: '/:path*.html', destination: '/webflow-export/:path*.html' },

      // generic fallback: if a path has no extension, try the .html under the mirror
      // (we scope this to top-level sections to avoid breaking assets)
      { source: '/projects/:slug', destination: '/webflow-export/projects/:slug.html' },
      { source: '/services/:slug', destination: '/webflow-export/services/:slug.html' },
      { source: '/team/:slug',     destination: '/webflow-export/team/:slug.html' },
      { source: '/news/:slug',     destination: '/webflow-export/news/:slug.html' },

      // section landing pages without .html
      { source: '/projects', destination: '/webflow-export/projects.html' },
      { source: '/services', destination: '/webflow-export/services.html' },
      { source: '/team',     destination: '/webflow-export/team.html' },
      { source: '/news',     destination: '/webflow-export/news.html' },
      { source: '/contact',  destination: '/webflow-export/contact.html' },
      { source: '/about',    destination: '/webflow-export/about.html' },
    ];
  },
  async redirects() {
    return [
      // bad typo
      { source: '/projects/mixed-use-facilties', destination: '/projects/mixed-use-facilities', permanent: true },
      { source: '/projects/mixed-use-facilties.html', destination: '/projects/mixed-use-facilities.html', permanent: true },

      // stray %1 in path
      { source: '/%1', destination: '/', permanent: true },
      { source: '/:path*/%1', destination: '/:path*', permanent: true },
    ];
  },
};
export default config;
