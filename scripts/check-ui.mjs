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
 *   5. Un module écrivait le résultat de `BirdI18n.t()` dans un nœud du DOM.
 *      i18n prenait ensuite cette traduction pour une écriture de
 *      l'application et la figeait comme nouvelle source : « Apparence »
 *      restait « Appearance » après un retour au français.
 *
 * Cinq contrôles, chacun encodant la cause et non le symptôme. Une exception
 * légitime s'écrit en commentaire `check-ui:allow <raison>` (ou `i18n:allow`
 * pour le cinquième) sur la même ligne que la déclaration concernée.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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

/* ── 5. Les modules écrivent la SOURCE, jamais la traduction ──
   Le français est la langue source du balisage et des scripts ; `js/i18n.js`
   applique la langue courante au DOM. Un module qui écrit `BirdI18n.t(...)`
   dans un nœud ou un attribut casse le mécanisme : i18n prend ensuite cette
   traduction pour une écriture de l'application et la fige comme nouvelle
   source. C'est exactement ce qui a produit « Apparence » restant
   « Appearance » après un retour au français.

   Deux sorties légitimes échappent au DOM — la barre de titre native et une
   valeur renvoyée par l'API : elles s'annotent avec `i18n:allow <raison>`. */
function checkTranslationSource() {
  const dir = path.join(root, 'js');
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.js') || /\.min\.js$/i.test(name) || name === 'i18n.js') continue;
    const rel = 'js/' + name;
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    // On neutralise les commentaires en conservant les retours à la ligne,
    // pour que les numéros de ligne restent exacts : un commentaire qui cite
    // le mécanisme n'est pas un appel.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
      .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
    const rawLines = raw.split('\n');
    for (const [index, line] of code.split('\n').entries()) {
      if (!/BirdI18n\.t\(/.test(line)) continue;
      if ((rawLines[index] || '').includes('i18n:allow')) continue;
      errors.push(
        `${rel}:${index + 1} — traduction appliquée par un module :\n` +
        '    ' + (rawLines[index] || '').trim() + '\n' +
        '    Écrire la source française et laisser js/i18n.js traduire.\n' +
        '    Si la valeur sort du DOM (barre native, retour d’API) : ajouter « i18n:allow <raison> ».'
      );
    }
  }
}

/* ── 6. Le numéro de version est le même partout ──────────────
   Une montée de version faite à la main oublie toujours un fichier : un
   manifeste, un lockfile, ou les clés `?v=` de index.html. Un fichier
   oublié ne casse rien visiblement — il fige simplement l'ancienne
   ressource dans le cache du visiteur.

   À ne PAS faire ici : comparer la version d'un crate tiers à la nôtre.
   Un premier jet de ce contrôle le faisait et a bloqué la CI sur
   `icu_provider 2.3.1`, qui porte légitimement le même numéro que
   l'application par pure coïncidence. On vérifie donc l'égalité de NOS
   fichiers entre eux, jamais celle des dépendances. */
function checkVersionConsistency() {
  const appVersion = (() => {
    const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
    const m = app.match(/^\s*version:\s*'([\d.]+)'/m);
    return m ? m[1] : null;
  })();
  if (!appVersion) {
    errors.push('js/app.js — version de l’application introuvable');
    return;
  }

  const expect = (rel, actual, label) => {
    if (actual === null || actual === undefined) { errors.push(`${rel} — ${label} introuvable`); return; }
    if (String(actual) !== appVersion) {
      errors.push(
        `${rel} — version ${actual}, alors que js/app.js annonce ${appVersion} (${label})\n` +
        '    Une montée de version a oublié ce fichier.'
      );
    }
  };

  const readJson = (rel) => {
    try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
    catch (e) { errors.push(`${rel} — JSON invalide : ${e.message}`); return null; }
  };

  for (const rel of ['astro/package.json', 'desktop/package.json']) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const j = readJson(rel);
    if (j) expect(rel, j.version, 'champ version');
  }
  for (const rel of ['astro/package-lock.json', 'desktop/package-lock.json']) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    const j = readJson(rel);
    if (j) expect(rel, j.packages && j.packages[''] && j.packages[''].version, 'version racine');
  }

  const toml = path.join(root, 'desktop', 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(toml)) {
    const m = fs.readFileSync(toml, 'utf8').match(/^version\s*=\s*"([\d.]+)"/m);
    expect('desktop/src-tauri/Cargo.toml', m && m[1], 'champ version');
  }

  const cargoLock = path.join(root, 'desktop', 'src-tauri', 'Cargo.lock');
  if (fs.existsSync(cargoLock)) {
    // CRLF sous Windows : sans ce nettoyage, `^...$` ne matche jamais.
    const lines = fs.readFileSync(cargoLock, 'utf8').split('\n').map((l) => l.replace(/\r$/, ''));
    let name = null;
    let ourVersion = null;
    for (const line of lines) {
      const n = line.match(/^name = "(.+)"$/);
      if (n) { name = n[1]; continue; }
      const v = line.match(/^version = "(.+)"$/);
      if (v && name === 'bird-desktop') ourVersion = v[1];
    }
    expect('desktop/src-tauri/Cargo.lock', ourVersion, 'version de bird-desktop');
  }

  // Clés de cache : la vraie régression passée, c'est un asset référencé SANS
  // `?v=` — le service worker Astro sert alors l'ancien fichier pendant des
  // semaines (c'est ce qui a laissé l'ancien logo à l'écran).
  //
  // On n'exige PAS que la clé vaille la version de l'application : plusieurs
  // modules portent leur propre version (history.js, commands.js, widgets.js),
  // délibérément distincte. L'égalité stricte produisait un faux positif.
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const missing = [];
  for (const m of html.matchAll(/(?:src|href)="((?:css|js|icons)\/[^"]+)"/g)) {
    if (!/[?&]v=/.test(m[1])) missing.push(m[1]);
  }
  if (missing.length) {
    errors.push(
      `index.html — ${missing.length} asset(s) sans clé de cache : ${missing.slice(0, 5).join(', ')}\n` +
      '    Une URL sans `?v=` reste figée dans le cache du visiteur (et dans le\n' +
      '    service worker de la version Astro, qui est cache-first).'
    );
  }
}

/* ── 7. Aucun outil d'affichage actif au premier lancement ────
   Un document neuf doit montrer le plan de travail nu : ni règles, ni
   magnétisme, ni grille. Deux endroits décident de l'état initial, et il
   faut qu'ils soient d'accord — sinon le bouton de la barre haute affirme
   « actif » tandis que la scène est nue, ou l'inverse. */
function checkDefaultToolsOff() {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const defaults = {};
  for (const key of ['showRulers', 'snapEnabled', 'showGrid']) {
    const m = app.match(new RegExp('^\\s*' + key + ':\\s*(true|false)', 'm'));
    if (!m) { errors.push(`js/app.js — valeur par défaut de ${key} introuvable`); continue; }
    defaults[key] = m[1] === 'true';
    if (m[1] === 'true') {
      errors.push(
        `js/app.js — ${key} vaut true par défaut.\n` +
        '    Un document neuf doit s’ouvrir sans outil d’affichage actif (règles, magnétisme, grille).'
      );
    }
  }

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const [id, key] of [['btnRulers', 'showRulers'], ['btnSnap', 'snapEnabled'], ['btnGrid', 'showGrid']]) {
    const m = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>'));
    if (!m) continue;
    const tag = m[0];
    const on = /class="[^"]*\bis-on\b/.test(tag);
    const pressed = /aria-pressed="true"/.test(tag);
    if (on || pressed) {
      errors.push(
        `index.html — #${id} est marqué actif (${on ? 'classe is-on' : ''}${on && pressed ? ' + ' : ''}${pressed ? 'aria-pressed=true' : ''})\n` +
        `    alors que l’état initial de ${key} doit être false : le bouton mentirait au chargement.`
      );
    }
  }
}

/* ── 8. Aucune plaque blanche sous une icône ─────────────────
   Les icônes de Bird portaient un carré blanc arrondi : 91 % de blanc,
   2 % de transparence (les coins), marges nulles. Sur un onglet clair la
   marque disparaissait, et le système ne pouvait pas appliquer sa propre
   forme. SuperPrint (8 % de marge), SuperPhoto et PDF-YZ (2–10 %) posent
   la marque sur du transparent.

   Le critère est le pixel du BORD SUPÉRIEUR AU CENTRE : avec une plaque,
   il est opaque (même arrondie, cette zone est à l'intérieur) ; sans
   plaque, il est transparent. Un simple contrôle du coin ne suffisait
   pas — un carré à coins arrondis a justement un coin transparent. */
function checkIconPlates() {
  /* Lecture PNG minimale : zlib est le seul outil nécessaire, et il est
     intégré à Node. On n'inflate qu'une fois et on ne dé-filtre que les
     premières lignes, ce qui suffit pour lire le bord haut. */
  const topRow = (file) => {
    const b = fs.readFileSync(file);
    if (b.length < 26 || b.readUInt32BE(0) !== 0x89504e47) return null;
    const w = b.readUInt32BE(16);
    const colorType = b[25];
    const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
    const rowsNeeded = 2;
    let off = 8;
    const idat = [];
    while (off + 8 <= b.length) {
      const len = b.readUInt32BE(off);
      const type = b.toString('ascii', off + 4, off + 8);
      if (type === 'IDAT') idat.push(b.subarray(off + 8, off + 8 + len));
      if (type === 'IEND') break;
      off += 12 + len;
    }
    if (!idat.length) return null;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const stride = w * ch;
    const out = Buffer.alloc(rowsNeeded * stride);
    let pos = 0;
    for (let y = 0; y < rowsNeeded; y++) {
      const filter = raw[pos++];
      const line = raw.subarray(pos, pos + stride);
      pos += stride;
      const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
      const cur = out.subarray(y * stride, (y + 1) * stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0;
        const bb = prev[x];
        const c = x >= ch ? prev[x - ch] : 0;
        let v = line[x];
        if (filter === 1) v += a;
        else if (filter === 2) v += bb;
        else if (filter === 3) v += (a + bb) >> 1;
        else if (filter === 4) {
          const p = a + bb - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? bb : c);
        }
        cur[x] = v & 0xff;
      }
    }
    const at = (x, y) => {
      const i = (y * w + x) * ch;
      return { r: out[i], g: out[i + 1], b: out[i + 2], a: ch === 4 ? out[i + 3] : 255 };
    };
    return { w, ch, at };
  };

  const iconDirs = ['icons', path.join('desktop', 'src-tauri', 'icons')];
  for (const dir of iconDirs) {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (!name.endsWith('.png')) continue;
      const rel = path.join(dir, name).replace(/\\/g, '/');
      let info;
      try { info = topRow(path.join(full, name)); }
      catch (e) { errors.push(`${rel} — PNG illisible : ${e.message}`); continue; }
      if (!info) { errors.push(`${rel} — ce n’est pas un PNG`); continue; }
      if (info.ch !== 4) {
        errors.push(
          `${rel} — PNG sans canal alpha (canaux : ${info.ch})\n` +
          '    Une icône doit pouvoir être posée sur n’importe quel fond.'
        );
        continue;
      }
      const edge = info.at(Math.round(info.w / 2), 1);
      if (edge.a > 16) {
        errors.push(
          `${rel} — le bord supérieur est opaque (rgba ${edge.r},${edge.g},${edge.b},${edge.a})\n` +
          '    C’est une plaque de fond. La marque doit être posée sur du transparent,\n' +
          '    avec une marge, comme dans SuperPrint, SuperPhoto et PDF-YZ.'
        );
      }
    }
  }

  // Le favicon SVG ne doit pas porter de rectangle couvrant tout le cadre.
  const favicon = path.join(root, 'icons', 'favicon.svg');
  if (fs.existsSync(favicon)) {
    const svg = fs.readFileSync(favicon, 'utf8');
    const viewBox = svg.match(/viewBox="([^"]+)"/);
    const box = viewBox ? viewBox[1].trim().split(/[\s,]+/).map(Number) : null;
    for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
      const tag = m[0];
      const num = (attr) => {
        // Limite de mot obligatoire : sans elle `x` matchait le `x` de
        // `rx="16"`, la marge des coins arrondis, et le rectangle passait
        // pour décalé alors qu'il couvrait tout le cadre.
        const a = tag.match(new RegExp('(?:^|\\s)' + attr + '="([\\d.]+)"'));
        return a ? Number(a[1]) : null;
      };
      // groupe 2 : la couleur seule (le groupe 1 englobe tout l'attribut).
      const fillMatch = tag.match(/fill="(#[0-9a-fA-F]{3,8}|white)"/);
      if (!fillMatch) continue;
      const fill = fillMatch[1];
      const isWhite = /^#f{3,8}$/i.test(fill) || fill.toLowerCase() === 'white';
      if (!isWhite) continue;
      // pleine page : couvre le viewBox (ou n'a ni x/y ni width/height, donc 100 %)
      const x = num('x') || 0, y = num('y') || 0;
      const w = num('width'), h = num('height');
      const full = box && w !== null && h !== null &&
        x <= box[0] && y <= box[1] && x + w >= box[0] + box[2] && y + h >= box[1] + box[3];
      if (full) {
        errors.push(
          'icons/favicon.svg — un rectangle blanc couvre tout le cadre\n' +
          '    C’est une plaque de fond : la marque doit être posée sur du transparent.'
        );
      }
    }
  }
}

checkIconColours();
checkWhiteIcons();
checkReferences();
checkMonochrome();
checkTranslationSource();
checkVersionConsistency();
checkDefaultToolsOff();
checkIconPlates();

if (errors.length) {
  console.error('\n✗ Contrôles d’interface : ' + errors.length + ' problème(s)\n');
  for (const e of errors) console.error('  • ' + e + '\n');
  process.exit(1);
}

console.log('✓ Contrôles d’interface OK : couleurs d’icônes, DA monochrome, icônes « white », références d’assets, source des traductions, cohérence des versions, outils inactifs par défaut, aucune plaque sous les icônes');
for (const n of notes) console.log('  · ' + n);
