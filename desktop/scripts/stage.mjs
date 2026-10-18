#!/usr/bin/env node
/**
 * Assemble l'application web dans `webapp/`, la seule chose que Tauri embarque.
 *
 * On ne pointe PAS `frontendDist` sur la racine du projet : elle contient
 * `astro/`, `rust/` et `desktop/`, qui n'ont rien à faire dans le binaire.
 * Le résultat doit rester petit et strictement identique au web.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'desktop', 'webapp');

const COPY_DIRS = ['js', 'css', 'icons', 'plugins'];
const COPY_FILES = ['index.html', 'manifest.webmanifest', 'llms.txt', 'README.md'];

// Fichiers inutiles dans un binaire : cartes de source, archives, brouillons.
const SKIP = /\.(map|md|zip|tgz)$/i;
const SKIP_KEEP = /^(README\.md|llms\.txt)$/i;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
      continue;
    }
    if (SKIP.test(entry.name) && !SKIP_KEEP.test(entry.name)) continue;
    fs.copyFileSync(from, to);
  }
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const dir of COPY_DIRS) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) throw new Error(`Dossier manquant : ${src}`);
  copyDir(src, path.join(out, dir));
}
for (const file of COPY_FILES) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, file));
}

// Version lisible par la coquille native (écran « À propos »).
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const version = (appJs.match(/version:\s*'([\d.]+)'/) || [])[1] || '0.0.0';
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ version }, null, 2));

const size = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
    const full = path.join(dir, e.name);
    return sum + (e.isDirectory() ? size(full) : fs.statSync(full).size);
  }, 0);

console.log(`[bird-desktop] webapp/ prêt — v${version}, ${(size(out) / 1024 / 1024).toFixed(1)} Mo`);
