import type { APIRoute } from 'astro';

export const prerender = false;

const routes = ['/', '/editor', '/docs'];

export const GET: APIRoute = ({ site }) => {
  const base = (site || new URL('https://app.zigmoon.com')).toString().replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = routes.map((route) =>
    `  <url><loc>${base}${route}</loc><lastmod>${today}</lastmod>` +
    `<changefreq>${route === '/editor' ? 'weekly' : 'monthly'}</changefreq>` +
    `<priority>${route === '/' ? '1.0' : '0.8'}</priority></url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' }
  });
};
