/* ═══════════════════════════════════════════════════════════════
   BIRD — REGISTRE DE COMMANDES
   ═══════════════════════════════════════════════════════════════
   Une seule liste d'actions, trois appelants :

     1. le clavier du navigateur        → BirdCommands.match(e)
     2. le menu natif macOS/Windows/Linux → BirdCommands.run(id)
     3. le panneau « Raccourcis »       → BirdCommands.groups()

   C'est ce qui évite la panne classique d'une app Electron/Tauri :
   un raccourci documenté dans l'interface mais absent du menu, ou
   l'inverse. Ici les deux sont générés depuis la même définition.

   Convention de touche : `Mod` = ⌘ sur macOS, Ctrl ailleurs. Les
   combinaisons suivent celles d'Illustrator et de Figma.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

const defs = new Map();     // id → { id, label, group, keys: [], run, when }
const byCombo = new Map();  // 'mod+shift+z' → id
let platform = 'other';     // 'mac' | 'windows' | 'linux' | 'other'

/* ── Normalisation des touches ──
   On travaille sur le CARACTÈRE produit (e.key), pas sur la position
   physique : sur un clavier AZERTY, Ctrl+Z doit rester Ctrl+Z. */
const ALIASES = {
  equals: '=', equal: '=', minus: '-', comma: ',', period: '.',
  slash: '/', backslash: '\\', semicolon: ';', quote: "'",
  bracketleft: '[', bracketright: ']', backquote: '`', space: 'Space',
  plus: '=', add: '=', subtract: '-', escape: 'Escape', esc: 'Escape',
  delete: 'Delete', backspace: 'Backspace', enter: 'Enter', return: 'Enter',
  tab: 'Tab', pageup: 'PageUp', pagedown: 'PageDown',
  arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown',
  /* « + » est produit par Maj+= sur un clavier physique : sans cette ligne,
     `Mod+Shift+=` ne correspondait pas à ⌘+ et le zoom avant par le « + » ne
     faisait rien (mesuré). Le caractère et le nom de touche désignent la
     MÊME touche logique. */
  '+': '='
};

/* Les caractères « majuscules » de la rangée de ponctuation US. */
const SHIFTED = { '>': '.', '<': ',', '}': ']', '{': '[', ':': ';', '"': "'", '?': '/' };

function normalizeKey(raw) {
  if (raw == null) return '';
  let key = String(raw).trim();
  if (!key) return '';
  const alias = ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (key.length === 1) {
    if (SHIFTED[key]) return SHIFTED[key];
    if (/[a-z]/i.test(key)) return key.toUpperCase();
    return key;
  }
  if (/^key[a-z]$/i.test(key)) return key.slice(3).toUpperCase();
  if (/^digit[0-9]$/i.test(key)) return key.slice(5);
  if (/^numpad[0-9]$/i.test(key)) return key.slice(6);
  if (/^f[0-9]{1,2}$/i.test(key)) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeCombo(spec) {
  const text = String(spec).trim();
  if (!text) return '';
  const parts = text.split('+');
  const mods = [];
  let key = '';
  parts.forEach((part) => {
    const low = part.trim().toLowerCase();
    if (!low) return;
    if (low === 'mod' || low === 'cmdorctrl' || low === 'ctrl' || low === 'control' ||
        low === 'cmd' || low === 'command' || low === 'meta') mods.push('mod');
    else if (low === 'shift') mods.push('shift');
    else if (low === 'alt' || low === 'option') mods.push('alt');
    else key = normalizeKey(part);
  });
  if (!key) return '';
  return mods.join('+') + (mods.length ? '+' : '') + key;
}

/* Combinaison produite par un KeyboardEvent. */
function comboOf(e) {
  const mods = [];
  if (e.metaKey || e.ctrlKey) mods.push('mod');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey) mods.push('shift');
  let key = normalizeKey(e.key);
  if (!key || key === 'Unidentified') key = normalizeKey(e.code);
  return mods.join('+') + (mods.length ? '+' : '') + key;
}

/* ── Définition ── */
function define(spec) {
  if (!spec || !spec.id) throw new Error('Commande sans identifiant');
  const keys = spec.keys == null ? [] : (Array.isArray(spec.keys) ? spec.keys : [spec.keys]);
  const entry = {
    id: spec.id,
    label: spec.label || spec.id,
    group: spec.group || 'Divers',
    keys,
    run: spec.run,
    when: spec.when || null
  };
  defs.set(entry.id, entry);
  keys.forEach((k) => {
    const combo = normalizeCombo(k);
    if (combo) byCombo.set(combo, entry.id);
  });
  return entry;
}

function defineAll(list) { list.forEach(define); }

/** Identifiant de commande correspondant à un événement clavier, ou null. */
function match(e) {
  return byCombo.get(comboOf(e)) || null;
}

/** Identifiant pour une combinaison écrite (« Mod+S »), ou null. */
function idFor(spec) {
  return byCombo.get(normalizeCombo(spec)) || null;
}

function get(id) { return defs.get(id) || null; }

function run(id, arg) {
  const entry = defs.get(id);
  if (!entry) {
    console.warn('[Bird] commande inconnue :', id);
    return false;
  }
  try {
    entry.run(arg);
    return true;
  } catch (err) {
    console.error('[Bird] commande « ' + id + ' » :', err);
    return false;
  }
}

/* ── Libellés lisibles ──
   `Mod+Shift+]` devient « ⇧⌘] » sur macOS, « Ctrl+Shift+] » ailleurs.
   C'est ce que l'utilisateur a réellement sous les doigts. */
const MAC_SYMBOLS = { mod: '⌘', shift: '⇧', alt: '⌥', ctrl: '⌃' };

function labelFor(spec, forPlatform) {
  const combo = normalizeCombo(spec);
  if (!combo) return '';
  const parts = combo.split('+');
  const key = parts.pop();
  const plat = forPlatform || platform;
  if (plat === 'mac') {
    return parts.map((p) => MAC_SYMBOLS[p] || p).join('') + printKey(key);
  }
  return parts.map((p) => (p === 'mod' ? 'Ctrl' : p === 'alt' ? 'Alt' : 'Shift')).join('+') +
    (parts.length ? '+' : '') + printKey(key);
}

const KEY_LABEL = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Backspace: '⌫', Delete: 'Suppr', Escape: 'Échap', Enter: 'Entrée',
  PageUp: 'Page↑', PageDown: 'Page↓', Space: 'Espace'
};

function printKey(key) {
  return KEY_LABEL[key] || key;
}

/** Toutes les commandes, groupées et triées — source du panneau Raccourcis. */
function groups(forPlatform) {
  const order = [];
  const map = new Map();
  defs.forEach((entry) => {
    if (!map.has(entry.group)) {
      map.set(entry.group, []);
      order.push(entry.group);
    }
    /* Une même touche peut être déclarée deux fois (Maj+= et « + » désignent
       la même commande) : on n'affiche le libellé qu'une fois, sinon le
       panneau « Raccourcis » liste deux fois Ctrl+= pour un seul raccourci. */
    const seen = new Set();
    const keys = entry.keys
      .map((k) => labelFor(k, forPlatform))
      .filter((label) => {
        if (!label || seen.has(label)) return false;
        seen.add(label);
        return true;
      });
    map.get(entry.group).push({ id: entry.id, label: entry.label, keys: keys });
  });
  return order.map((name) => ({ name, items: map.get(name) }));
}

function setPlatform(p) {
  platform = p || 'other';
  document.documentElement.dataset.keymap = platform === 'mac' ? 'mac' : 'other';
}

function list() { return Array.from(defs.keys()); }

global.BirdCommands = {
  define,
  defineAll,
  match,
  idFor,
  get,
  run,
  comboOf,
  normalizeCombo,
  labelFor,
  groups,
  list,
  setPlatform,
  get platform() { return platform; }
};

})(window);
