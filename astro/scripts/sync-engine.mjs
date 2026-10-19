#!/usr/bin/env node
/**
 * Synchronise le moteur Bird (source unique : ../index.html, ../js, ../css, ../icons)
 * vers le projet Astro :
 *   - public/assets/bird/**  → fichiers servis tels quels
 *   - src/generated/editor-shell.html → DOM de l'éditeur (sans les <script>)
 *
 * Ce script est lancé automatiquement avant `dev`, `build` et après `npm install`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const astroRoot = path.resolve(__dirname, '..');
const birdRoot = path.resolve(astroRoot, '..');
const publicRoot = path.join(astroRoot, 'public');
const assetsRoot = path.join(publicRoot, 'assets', 'bird');

function copyDir(src, dst) {
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

function copyIfExists(src, dst) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

function main() {
  for (const dir of ['js', 'css', 'icons', 'plugins']) {
    const src = path.join(birdRoot, dir);
    if (!fs.existsSync(src)) throw new Error(`Dossier source manquant : ${src}`);
    copyDir(src, path.join(assetsRoot, dir));
  }
  copyIfExists(path.join(birdRoot, 'llms.txt'), path.join(publicRoot, 'llms.txt'));
  copyIfExists(path.join(birdRoot, 'manifest.webmanifest'), path.join(publicRoot, 'manifest.webmanifest'));
  copyIfExists(path.join(birdRoot, 'icons', 'favicon.svg'), path.join(publicRoot, 'favicon.svg'));

  const html = fs.readFileSync(path.join(birdRoot, 'index.html'), 'utf8');
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) throw new Error('index.html : <body> introuvable');

  // Les balises <script src> de index.html sont la seule source de vérité
  // pour l'ordre de chargement du moteur. On les recopie ici au lieu de les
  // maintenir à la main dans editor.astro : c'est exactement comme ça qu'un
  // fichier peut être oublié et une fonction manquer à l'appel.
  const scripts = [];
  const scriptRe = /<script\b[^>]*\bsrc\s*=\s*"([^"]+)"[^>]*>\s*<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(bodyMatch[1])) !== null) {
    // On conserve la clé de version : sans elle, le service worker (cache-first
  // sur /assets/**) sert indéfiniment l'ancien fichier au visiteur.
  const src = match[1].replace(/^js\//, '/assets/bird/js/');
    scripts.push('<script src="' + src + '"></script>');
  }
  if (!scripts.length) throw new Error('index.html : aucun <script src> trouvé');

  let body = bodyMatch[1]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/(src|href)="icons\//g, '$1="/assets/bird/icons/')
    .replace(/(src|href)="css\//g, '$1="/assets/bird/css/')
    .replace(/(src|href)="js\//g, '$1="/assets/bird/js/');

  const generated = path.join(astroRoot, 'src', 'generated');
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(generated, 'editor-shell.html'), body, 'utf8');
  fs.writeFileSync(path.join(generated, 'editor-scripts.html'), scripts.join('\n') + '\n', 'utf8');

  // Manifeste PWA adapté aux routes Astro.
  const manifestPath = path.join(publicRoot, 'manifest.webmanifest');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.start_url = '/editor';
      manifest.scope = '/';
      manifest.id = '/editor';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (err) {
      console.warn('[bird-astro] manifeste invalide, ignoré :', err.message);
    }
  }

  const dirSize = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const full = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? dirSize(full) : fs.statSync(full).size);
  }, 0);
  const size = (p) => (dirSize(p) / 1024).toFixed(0) + ' Ko';
  console.log('[bird-astro] moteur synchronisé → public/assets/bird/ (' +
    size(path.join(assetsRoot, 'js')) + ' de JavaScript)');
  console.log('[bird-astro] shell éditeur → src/generated/editor-shell.html (' +
    (body.length / 1024).toFixed(1) + ' Ko)');
  console.log('[bird-astro] scripts → src/generated/editor-scripts.html (' +
    scripts.length + ' fichiers)');
}

main();
