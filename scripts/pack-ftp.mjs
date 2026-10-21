#!/usr/bin/env node
/**
 * Construit l'archive FTP : uniquement ce qui doit être déposé sur un serveur
 * web statique, sans Node, sans build.
 *
 * Liste blanche explicite, jamais un « tout sauf » : une exclusion laisse
 * toujours passer un dossier oublié (.git, node_modules, un brouillon).
 *
 * Pourquoi un écrivain ZIP maison plutôt qu'une dépendance : le dépôt n'en a
 * aucune, et `Compress-Archive` de PowerShell préfixe les entrées avec le nom
 * du dossier de staging (`stage/bird/…`), ce qui produit une arborescence
 * fausse sur le serveur. Ici le nom de chaque entrée est décidé.
 *
 * Usage : node scripts/pack-ftp.mjs [--out bird-ftp-v2.6.0.zip] [--flat]
 *
 * --flat dépose les fichiers à la RACINE de l'archive au lieu de les ranger
 * dans un dossier `bird/` : le zip se décompresse alors directement dans le
 * premier niveau du serveur web (index.html à côté de css/, js/, icons/).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Ce qui part sur le serveur ──
   Les quatre dossiers sont pris en entier : lister fichier par fichier a
   déjà fait oublier `css/fonts/`, et le site est retombé en silence sur une
   police système. */
const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'llms.txt'];
const DIRS = ['css', 'js', 'icons', 'plugins'];

const HTACCESS = `# Bird — réglages serveur (Apache). Sans effet sur nginx :
# ce fichier peut être supprimé sans rien casser.

<IfModule mod_mime.c>
  AddType application/manifest+json .webmanifest
  AddType image/svg+xml .svg
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/plain application/javascript text/javascript image/svg+xml application/manifest+json application/json
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/html "access plus 0 seconds"
  ExpiresByType application/manifest+json "access plus 0 seconds"
  # Les fichiers du moteur portent ?v=… : la version suit le contenu.
  # Mais cinq bibliothèques sont chargées à la demande SANS ?v=
  # (pdf.min.js, pdf.worker.min.js, jspdf, svg2pdf, eps-import) : un cache
  # long les figerait après une mise à jour. On reste donc sur 1 jour.
  ExpiresByType text/css "access plus 1 day"
  ExpiresByType application/javascript "access plus 1 day"
  ExpiresByType text/javascript "access plus 1 day"
  ExpiresByType image/svg+xml "access plus 1 month"
  ExpiresByType image/png "access plus 1 month"
</IfModule>
`;

/* ── Écrivain ZIP minimal (RFC 1951 + 1952), sans dépendance ── */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() / 2) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const crc = crc32(data);
    const { time, day } = dosDateTime(entry.date);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);             // version nécessaire
    local.writeUInt16LE(0x0800, 6);         // noms en UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, payload);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(useDeflate ? 8 : 0, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(day, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(payload.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30);               // extra
    dir.writeUInt16LE(0, 32);               // commentaire
    dir.writeUInt16LE(0, 34);               // disque
    dir.writeUInt16LE(0, 36);               // attributs internes
    dir.writeUInt32LE(0, 38);               // attributs externes
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

/* ── Collecte ── */
function listDir(dir) {
  const out = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const name = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, name);
      else out.push({ name, full });
    }
  };
  walk(path.join(root, dir), dir);
  return out;
}

const argOut = process.argv.indexOf('--out');
const outName = argOut > -1 ? process.argv[argOut + 1] : 'bird-ftp-v2.6.0.zip';
const outPath = path.isAbsolute(outName) ? outName : path.join(root, outName);

const files = [];
for (const name of ROOT_FILES) {
  const full = path.join(root, name);
  if (!fs.existsSync(full)) {
    console.error(`✗ fichier obligatoire absent : ${name}`);
    process.exit(1);
  }
  files.push({ name, full });
}
for (const dir of DIRS) {
  if (!fs.existsSync(path.join(root, dir))) {
    console.error(`✗ dossier obligatoire absent : ${dir}`);
    process.exit(1);
  }
  files.push(...listDir(dir));
}

/* Le zip contient un seul dossier `bird/` : un seul glisser-déposer quelle
   que soit la cible sur le serveur. Avec --flat, aucun préfixe : les fichiers
   se posent au premier niveau du serveur. */
const FLAT = process.argv.includes('--flat');
const PREFIX = FLAT ? '' : 'bird/';

const entries = files.map((f) => ({
  name: PREFIX + f.name.replace(/\\/g, '/'),
  data: fs.readFileSync(f.full),
  date: fs.statSync(f.full).mtime
}));
entries.push({
  name: PREFIX + '.htaccess',
  data: Buffer.from(HTACCESS, 'utf8'),
  date: new Date()
});

const zip = buildZip(entries);
fs.writeFileSync(outPath, zip);

const raw = entries.reduce((sum, e) => sum + e.data.length, 0);
const kb = (n) => (n / 1024).toFixed(0) + ' Ko';
console.log(`✓ ${path.basename(outPath)} — ${entries.length} fichiers`);
console.log(`  compressé ${kb(zip.length)} · décompressé ${kb(raw)}`);
for (const e of entries.slice().sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${String(e.data.length).padStart(9)}  ${e.name}`);
}
