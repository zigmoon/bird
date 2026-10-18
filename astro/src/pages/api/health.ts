import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({
    ok: true,
    app: 'Bird',
    version: '1.5.0',
    engine: 'fabric 5.1 + pdf.js 3.11 + svg2pdf',
    runtime: `node ${process.version}`,
    time: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
};
