/* ═══════════════════════════════════════════════════════════════
   BIRD — PONT NATIF (Tauri 2)
   ═══════════════════════════════════════════════════════════════
   Dans le navigateur, ce module ne fait rien : `available` reste
   faux et tous les appels retombent sur le comportement web.

   Dans l'application de bureau il apporte ce que le web ne peut
   pas faire :
     • ouvrir et enregistrer un vrai fichier, sans passer par le
       dossier « Téléchargements » ;
     • recevoir les commandes du MENU NATIF (Fichier, Édition,
       Objet, Affichage) qui porte les raccourcis Adobe/Figma ;
     • connaître la plateforme pour afficher ⌘ au lieu de Ctrl.

   On appelle les commandes de plug-in directement (`plugin:dialog|open`)
   au lieu d'embarquer les paquets npm : le front-end reste une suite
   de fichiers statiques, sans étape de build.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

const state = {
  available: false,
  ready: false,
  info: null,
  platform: 'other',
  /** Commandes dont le menu natif possède déjà le raccourci. */
  menuCommands: new Set(),
  handlers: []
};

function tauri() { return global.__TAURI__ || null; }

function invoke(cmd, args) {
  const api = tauri();
  if (!api || !api.core || typeof api.core.invoke !== 'function') {
    return Promise.reject(new Error('Pont natif indisponible'));
  }
  return api.core.invoke(cmd, args);
}

/* ── Base64 ──
   L'IPC de Tauri transporte du JSON : on encode les octets plutôt que
   d'envoyer un tableau de millions de nombres. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes) {
  let out = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < len ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < len ? B64[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64.indexOf(clean[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/* ── Détection ── */
function detectPlatform() {
  const info = state.info || {};
  const raw = String(info.platform || '');
  if (raw === 'macos' || raw === 'darwin') return 'mac';
  if (raw === 'windows') return 'windows';
  if (raw === 'linux') return 'linux';
  const probe = navigator.userAgentData && navigator.userAgentData.platform ||
    navigator.platform || '';
  if (/mac/i.test(probe)) return 'mac';
  if (/win/i.test(probe)) return 'windows';
  if (/linux/i.test(probe)) return 'linux';
  return 'other';
}

async function init() {
  const api = tauri();
  if (!api || !api.core || typeof api.core.invoke !== 'function') {
    state.available = false;
    return state;
  }
  state.available = true;
  try {
    state.info = await invoke('app_info');
  } catch (err) {
    console.warn('[Bird natif] app_info indisponible', err);
    state.info = {};
  }
  state.platform = detectPlatform();
  state.menuCommands = new Set((state.info && state.info.menu) || []);

  global.__TAURI__.event.listen('bird://command', (event) => {
    const id = event && event.payload;
    if (!id) return;
    state.handlers.forEach((fn) => {
      try { fn(id); } catch (err) { console.error('[Bird natif]', err); }
    });
  });

  state.ready = true;
  return state;
}

/** Abonnement aux commandes émises par le menu natif. */
function onCommand(fn) {
  if (typeof fn === 'function') state.handlers.push(fn);
}

/** Abonnement à « Ouvrir avec » (macOS) : un fichier arrive après le lancement. */
function onOpenFile(fn) {
  const api = tauri();
  if (!api || !api.event || typeof fn !== 'function') return;
  api.event.listen('bird://open-file', (event) => {
    if (event && event.payload) fn(String(event.payload));
  });
}

/** Fichier passé au lancement (double-clic sur un .plume), ou null. */
function pendingFile() {
  return invoke('pending_file').catch(() => null);
}

/** Le menu natif gère-t-il déjà le raccourci de cette commande ? */
function ownsCommand(id) { return state.menuCommands.has(id); }

/* ── Dialogues ── */
const FILTERS = {
  project: [{ name: 'Projet Bird', extensions: ['plume', 'bird', 'json'] }],
  vector: [{ name: 'Vectoriel', extensions: ['svg', 'svgz', 'pdf', 'ai', 'eps'] }],
  image: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  svg: [{ name: 'SVG', extensions: ['svg'] }]
};

async function pickOpen(kind) {
  const filters = Array.isArray(kind) ? kind : (FILTERS[kind] || FILTERS.project);
  return invoke('plugin:dialog|open', {
    options: { multiple: false, directory: false, filters }
  });
}

async function pickSave(defaultPath, kind) {
  const filters = Array.isArray(kind) ? kind : (FILTERS[kind] || FILTERS.project);
  return invoke('plugin:dialog|save', {
    options: { defaultPath, filters }
  });
}

/* ── Fichiers ── */
function readText(path) { return invoke('read_text_file', { path }); }function writeText(path, contents) { return invoke('write_text_file', { path, contents }); }
function readBinary(path) { return invoke('read_binary_file', { path }).then(base64ToBytes); }
function writeBinary(path, bytes) {
  return invoke('write_binary_file', { path, base64: bytesToBase64(bytes) });
}
function readTextPath(path) { return readText(path); }

async function readAny(path) {
  const bytes = await readBinary(path);
  return bytes;
}

function isBinaryName(name) {
  return /\.(png|jpe?g|webp|gif|bmp|avif|pdf|ai|eps|svgz)$/i.test(name || '');
}

/** Ouvre un fichier choisi par l'utilisateur. Retourne
 *  { path, name, text } ou { path, name, bytes }. */
async function openFile(kind) {
  const path = await pickOpen(kind);
  if (!path) return null;
  const name = String(path).split(/[\\/]/).pop();
  if (isBinaryName(name)) {
    return { path, name, bytes: await readAny(path) };
  }
  return { path, name, text: await readText(path) };
}

/** Enregistre un contenu (texte, Blob ou octets) via le dialogue natif.
 *  Retourne le chemin écrit, ou null si l'utilisateur annule. */
async function saveFile(defaultName, data, kind) {
  const path = await pickSave(defaultName, kind);
  if (!path) return null;
  if (typeof data === 'string') {
    await writeText(path, data);
  } else if (data instanceof Blob) {
    await writeBinary(path, new Uint8Array(await data.arrayBuffer()));
  } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    await writeBinary(path, data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  } else {
    throw new Error('Contenu non pris en charge');
  }
  return path;
}

/** Écrit directement, sans dialogue (Enregistrer sur un chemin connu). */
async function writeTo(path, data) {
  if (typeof data === 'string') return writeText(path, data);
  if (data instanceof Blob) return writeBinary(path, new Uint8Array(await data.arrayBuffer()));
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return writeBinary(path, bytes);
}

function basename(path) { return String(path || '').split(/[\\/]/).pop() || ''; }

/** Titre de la fenêtre native : Tauri ne suit pas `document.title`. */
function setTitle(title) {
  return invoke('set_window_title', { title: String(title || 'Bird') }).catch(() => {});
}

global.BirdNative = {
  init,
  onCommand,
  onOpenFile,
  pendingFile,
  ownsCommand,
  openFile,
  saveFile,
  writeTo,
  readText,
  writeText,
  readBinary,
  writeBinary,
  pickOpen,
  pickSave,
  basename,
  setTitle,
  bytesToBase64,
  base64ToBytes,
  get available() { return state.available; },
  get ready() { return state.ready; },
  get info() { return state.info; },
  get platform() { return state.platform; },
  get state() { return state; }
};

})(window);
