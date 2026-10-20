#!/usr/bin/env node
/**
 * Pré-vol de la compilation de bureau (Windows · macOS · Linux).
 *
 * Pourquoi ce fichier existe : un numéro de version remplacé à l'aveugle dans
 * `Cargo.lock` a mis six crates tiers (`icu_properties`, `icu_collections`…)
 * à une version qui n'existe pas. Résultat : les QUATRE builds de bureau ont
 * échoué en même temps, après plusieurs minutes de compilation chacun, avec un
 * message noyé dans la sortie de Tauri :
 *
 *   failed to select a version for the requirement `icu_properties = "^2"`
 *   (locked to 2.4.1) — candidate versions found which didn't match…
 *
 * La résolution de dépendances détecte cette faute en quelques secondes, sans
 * compiler une seule ligne. Ce script la déclenche donc AVANT les runners
 * coûteux, et échoue avec un message qui nomme le fichier et la cause.
 *
 * Ce qu'il vérifie :
 *   1. une seule version d'application partout (app, Rust, Tauri) ;
 *   2. les fichiers d'icônes que `tauri build` et `tauri icon` exigent ;
 *   3. la résolution `cargo metadata --locked` des deux espaces de travail,
 *      si `cargo` est disponible (sur CI il l'est ; en local aussi).
 *
 * Usage : node scripts/check-desktop.mjs [--no-cargo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const notes = [];
const skipCargo = process.argv.includes('--no-cargo');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

/* ── 1. Une seule version, partout ────────────────────────────
   Quatre fichiers décident du numéro que portera l'installeur. Un oubli ne
   casse pas la compilation : il produit un binaire qui s'annonce autrement
   que la release qui le contient. */
const appVersion = (() => {
  const m = read('js/app.js').match(/^ {2}version: '([\d.]+)',$/m);
  return m ? m[1] : null;
})();

if (!appVersion) {
  errors.push("js/app.js — version de l'application introuvable (motif `  version: 'x.y.z',`)");
} else {
  const expect = (rel, actual, label) => {
    if (actual == null) errors.push(`${rel} — ${label} introuvable`);
    else if (String(actual) !== appVersion) {
      errors.push(`${rel} — ${label} vaut ${actual}, js/app.js annonce ${appVersion}`);
    }
  };

  const workspaceRust = read('rust/Cargo.toml').match(/^\[workspace\.package\][\s\S]*?^version = "([\d.]+)"$/m);
  expect('rust/Cargo.toml', workspaceRust && workspaceRust[1], '[workspace.package] version');

  const tauriToml = read('desktop/src-tauri/Cargo.toml').match(/^version = "([\d.]+)"$/m);
  expect('desktop/src-tauri/Cargo.toml', tauriToml && tauriToml[1], 'version');

  try {
    const conf = JSON.parse(read('desktop/src-tauri/tauri.conf.json'));
    expect('desktop/src-tauri/tauri.conf.json', conf.version, 'version');
  } catch (e) {
    errors.push(`desktop/src-tauri/tauri.conf.json — JSON invalide : ${e.message}`);
  }

  /* Le tag doit dire la même chose que l'application : sinon la release
     s'appelle v2.5.0 et contient des installeurs 2.4.0. */
  const ref = process.env.GITHUB_REF || '';
  if (ref.startsWith('refs/tags/')) {
    const tag = (process.env.GITHUB_REF_NAME || ref.replace('refs/tags/', '')).replace(/^v/, '');
    if (tag !== appVersion) {
      errors.push(
        `tag ${process.env.GITHUB_REF_NAME || tag} — la version de l'application est ${appVersion}\n` +
        '    La release porterait un numéro que ses installeurs ne portent pas.'
      );
    } else {
      notes.push(`tag ${process.env.GITHUB_REF_NAME || tag} = version ${appVersion}`);
    }
  }
}

/* ── 2. Les icônes que la compilation exige ───────────────────
   `bundle.icon` et `npx tauri icon` sont deux étapes distinctes : si la source
   du générateur manque, les quatre builds tombent, chacun après plusieurs
   minutes. */
const CONF_ICONS = [
  'icons/32x32.png',
  'icons/128x128.png',
  'icons/128x128@2x.png',
  'icons/icon.icns',
  'icons/icon.ico'
];

for (const rel of CONF_ICONS) {
  const full = path.join(root, 'desktop', 'src-tauri', rel);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
    errors.push(`desktop/src-tauri/${rel} — icône absente ou vide (référencée par bundle.icon)`);
  }
}

if (!exists('icons/icon-512.png')) {
  errors.push('icons/icon-512.png — source de `npx tauri icon` absente');
} else {
  notes.push('icons/icon-512.png présent (source de tauri icon)');
}

/* ── 3. La résolution de dépendances, sans compiler ───────────
   `--locked` interdit à cargo de réécrire le fichier : une version inventée
   échoue ici en quelques secondes, au lieu de faire tomber quatre runners. */
function cargoMetadata(rel, label) {
  try {
    execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
      cwd: path.join(root, rel),
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 180000
    });
    notes.push(`${label} — résolution « --locked » OK`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      notes.push(`${label} — cargo absent, résolution ignorée`);
      return;
    }
    const stderr = e.stderr ? e.stderr.toString() : '';
    const lines = stderr
      .split('\n')
      .filter((l) => /error|failed|locked to|required by|which satisfies/.test(l))
      .slice(0, 8)
      .join('\n    ');
    errors.push(
      `${rel}/Cargo.lock — la résolution des dépendances échoue\n    ${lines || (e.message || '').split('\n')[0]}\n` +
      '    Le fichier de verrouillage a probablement été modifié à la main.\n' +
      '    Régénérer avec `cargo update --workspace` plutôt que par remplacement de texte.'
    );
  }
}

if (skipCargo) {
  notes.push('résolution cargo ignorée (--no-cargo)');
} else {
  cargoMetadata('desktop/src-tauri', 'desktop/src-tauri');
  cargoMetadata('rust', 'rust');
}

/* ── Verdict ── */
if (errors.length) {
  console.error(`\n✗ Pré-vol bureau : ${errors.length} problème(s)\n`);
  for (const e of errors) console.error('  • ' + e + '\n');
  process.exit(1);
}

console.log(`✓ Pré-vol bureau OK pour la version ${appVersion}`);
for (const n of notes) console.log('  · ' + n);
