#!/usr/bin/env node
/**
 * Contrôles d'invariants de l'interface — lancés en CI avant toute publication.
 *
 * Trois régressions se sont déjà produites, toutes invisibles à l'œil du
 * développeur mais évidentes pour l'utilisateur :
 *
 *   1. `.btn.is-on svg { stroke: #fff }` : un vestige de l'ancien état actif
 *      sombre. L'état actif étant devenu clair, l'icône blanche a disparu sur
 *      fond clair.
 *   2. `icons/bird-mark-white.svg` contenait #0C0C0F — la couleur exacte du
 *      panneau du splash où il est affiché. Logo invisible.
 *   3. Un paquet de déploiement pouvait omettre `css/fonts/` : les @font-face
 *      pointaient vers des fichiers absents et le site retombait en silence
 *      sur une police système.
 *   4. Une teinte bleue (#1677ff / #eef4ff) s'était glissée dans l'état actif
 *      des bascules, les listes de calques, les pages et les repères. La DA de
 *      Bird est monochrome : un état actif se lit par un enfoncement gris, pas
 *      par une couleur. Ce contrôle rend la dérive impossible.
 *
 * Chaque contrôle encode la cause, pas le symptôme. Une exception légitime
 * s'écrit en commentaire `check-ui:allow <raison>` sur la même ligne que la
 * déclaration concernée.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];

const splitLines = (text) => text.split('\n');

/* ── 1. Aucune couleur d'icône en dur dans le CSS ──────────────
   Une icône doit suivre `currentColor` : c'est ce qui lui permet de rester
   lisible quand l'état du bouton change (survol, actif, désactivé).
   Une valeur littérale fige la couleur et finit toujours par se retrouver
   sur un fond de la même couleur. */
function checkIconColours() {
  const file = path.join(root, 'css', 'style.css');
  const raw = fs.readFileSync(file, 'utf8');
  // Neutralise les commentaires en gardant les retours à la ligne, pour que
  // les numéros de ligne restent exacts.
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
  const lines = splitLines(raw);

  const ALLOWED = new Set(['none', 'currentcolor', 'inherit', 'unset', 'initial', 'transparent']);
  const re = /(?:^|[;{]\s*)(stroke|fill)\s*:\s*([^;{}]+)/gi;
  let match;
  while ((match = re.exec(css)) !== null) {
    const prop = match[1].toLowerCase();
    const value = match[2].trim();
    const line = css.slice(0, match.index).split('\n').length;
    const sourceLine = lines[line - 1] || '';

    if (sourceLine.includes('check-ui:allow')) continue;
    // `url(#degrade)` est une peinture, pas une couleur ; `var(--x)` est une
    // couleur déjà centralisée ailleurs : les deux sont autorisés.
    if (/^(url|var)\(/i.test(value)) continue;
    const first = value.split(/\s+/)[0].toLowerCase();
    if (ALLOWED.has(first)) continue;

    errors.push(
      `css/style.css:${line} — ${prop}: ${value}\n` +
      '    Une icône doit utiliser currentColor (ou none), jamais une couleur fixe.\n' +
      '    Si c’est volontaire : ajouter « check-ui:allow <raison> » en commentaire sur cette ligne.'
    );
  }
}

/* ── 2. Un fichier nommé « white » doit contenir du blanc ──────
   Le nom est un contrat : c'est ce qu'on lit en cherchant l'icône pour un
   fond sombre. S'il ment, l'image est invisible là où on l'utilise. */
function checkWhiteIcons() {
  const dir = path.join(root, 'icons');
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!/white/i.test(name) || !name.endsWith('.svg')) continue;
    const svg = fs.readFileSync(path.join(dir, name), 'utf8');
    const hexes = [...svg.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((x) => x[1]);
    const isLight = (hex) => {
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
      return r >= 0xe0 && g >= 0xe0 && b >= 0xe0;
    };
    const hasWhite = hexes.some(isLight) || /fill\s*[=:]\s*["']?(white|#fff\b)/i.test(svg);
    if (!hasWhite) {
      errors.push(
        `icons/${name} — le nom annonce du blanc, le fichier n’en contient pas (${hexes.join(', ') || 'aucune couleur'}).\n` +
        '    Affiché sur un fond sombre, ce fichier est invisible.'
      );
    } else {
      notes.push(`icons/${name} — contient bien du blanc`);
    }
  }
}

/* ── 3. Tout ce qui est référencé existe ──────────────────────
   Un asset manquant ne casse pas le chargement : il dégrade en silence
   (police de substitution, icône absente, 404 dans la console du visiteur). */
function checkReferences() {
  const isExternal = (ref) => !ref || /^(https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref);

  const check = (ref, label, baseDir) => {
    if (isExternal(ref)) return;
    const clean = ref.split('#')[0].split('?')[0];
    if (!clean) return;
    const target = path.resolve(baseDir, clean);
    if (!fs.existsSync(target)) {
      errors.push(`${label} — référence introuvable : ${ref}`);
      return;
    }
    if (fs.statSync(target).isDirectory()) {
      errors.push(`${label} — référence un dossier, pas un fichier : ${ref}`);
    }
  };

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/gi)) {
    check(m[1], 'index.html', root);
  }

  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    check(m[1], 'css/style.css', path.join(root, 'css'));
  }

  // Le manifeste PWA référence ses icônes en chemin relatif à la racine.
  const manifestPath = path.join(root, 'manifest.webmanifest');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const icon of manifest.icons || []) {
        check(icon.src, 'manifest.webmanifest', root);
      }
    } catch (e) {
      errors.push(`manifest.webmanifest — JSON invalide : ${e.message}`);
    }
  }
}

/* ── 4. Direction artistique monochrome ──────────────────────
   Bird est noir, blanc et gris. Aucune teinte ne doit apparaître dans
   l'interface : ni état actif, ni liste de calques, ni repère, ni focus.
   Une couleur chromatique se repère à l'écart entre ses canaux : sur un
   gris, max(R,G,B) - min(R,G,B) vaut 0. Au-delà de 8, c'est une teinte.

   Seule exception structurelle : le nuancier de l'utilisateur (les couleurs
   avec lesquelles il peint son œuvre, pas celles de l'interface), déclaré
   avec `check-ui:allow`. */
const MONO_TOLERANCE = 8;
const MONO_FILES = [
  ['css/style.css', true],
  ['js/app.js', false],
  ['index.html', false],
];

function chromaticChannels(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function checkMonochrome() {
  for (const [rel, stripCssComments] of MONO_FILES) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const text = stripCssComments
      ? raw.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      : raw;
    const lines = raw.split('\n');

    for (const [index, line] of text.split('\n').entries()) {
      if (line.includes('check-ui:allow')) continue;
      const found = [];
      for (const m of line.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) {
        const rgb = chromaticChannels(m[0]);
        if (rgb && Math.max(...rgb) - Math.min(...rgb) > MONO_TOLERANCE) found.push(m[0]);
      }
      for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
        const rgb = [m[1], m[2], m[3]].map(Number);
        if (Math.max(...rgb) - Math.min(...rgb) > MONO_TOLERANCE) found.push(m[0] + ')');
      }
      if (found.length) {
        errors.push(
          `${rel}:${index + 1} — couleur non monochrome : ${found.join(', ')}\n` +
          '    ' + (lines[index] || '').trim() + '\n' +
          '    La DA est strictement noir / blanc / gris. Exprimer un état par un fond gris,\n' +
          '    un bord plus sombre ou une inversion noir↔blanc — jamais par une teinte.\n' +
          '    Si c’est volontaire : ajouter « check-ui:allow <raison> » en commentaire sur cette ligne.'
        );
      }
    }
  }
}

checkIconColours();
checkWhiteIcons();
checkReferences();
checkMonochrome();

if (errors.length) {
  console.error('\n✗ Contrôles d’interface : ' + errors.length + ' problème(s)\n');
  for (const e of errors) console.error('  • ' + e + '\n');
  process.exit(1);
}

console.log('✓ Contrôles d’interface OK : couleurs d’icônes, DA monochrome, icônes « white », références d’assets');
for (const n of notes) console.log('  · ' + n);
