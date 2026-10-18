import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Version serveur : les routes /api (proxy IA, santé) restent dynamiques.
// Pour un hébergement purement statique : passer output à 'static'
// et supprimer l'adaptateur + les routes API.
export default defineConfig({
  site: 'https://app.zigmoon.com',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: true, port: 4321 },
  trailingSlash: 'ignore',
  compressHTML: true,
  vite: {
    build: {
      // Les moteurs vectoriels (pdf.js, jsPDF, svg2pdf) sont servis tels quels.
      assetsInlineLimit: 0
    }
  }
});
