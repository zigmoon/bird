/* ═══════════════════════════════════════════════════════════════
   BIRD — HISTORIQUE INCRÉMENTAL
   ═══════════════════════════════════════════════════════════════
   Problème : `canvas.toJSON()` produit un instantané COMPLET à
   chaque pas d'historique. Avec une image de 2 Mo, 60 pas d'undo
   = 120 Mo de mémoire pour un seul objet inchangé.

   Solution : un instantané n'est plus un document, c'est une CARTE
   « identifiant d'objet → JSON de cet objet ». Deux instantanés
   successifs partagent la MÊME chaîne pour tout objet inchangé
   (interning). Modifier un objet ne coûte donc que cet objet.

   Conséquences mesurables :
     • déplacer un calque dans un document de 300 objets + 3 images
       coûte ~1 Ko au lieu de plusieurs Mo ;
     • une image importée une fois n'est stockée qu'une fois, quel
       que soit le nombre d'états qui la contiennent ;
     • la limite devient un BUDGET D'OCTETS, pas un nombre d'états.

   Les instantanés sont immuables : les piles undo/redo, et l'historique
   par plan de travail, peuvent partager les mêmes objets sans copie.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/**
 * @param {object} options
 *   options.readObjects()  → tableau d'objets Fabric vivants
 *   options.properties     → propriétés à sérialiser (SERIALIZED_PROPS)
 *   options.header()       → propriétés de canvas (version, background…)
 *   options.ensureId(obj)  → (optionnel) fournit/assigne un id stable
 */
function create(options) {
  var opts = options || {};
  var readObjects = opts.readObjects || function () { return []; };
  var properties = opts.properties || [];
  var headerOf = opts.header || function () { return {}; };
  var pool = new Map();      // id → dernier enregistrement connu
  var seq = 0;
  var session = Math.random().toString(36).slice(2, 6);

  function ensureId(obj) {
    if (opts.ensureId) return opts.ensureId(obj);
    if (!obj.birdId) obj.birdId = 'o' + session + '-' + (++seq);
    return obj.birdId;
  }

  /**
   * Capture l'état courant.
   * @returns {{ order: string[], map: Map<string, {json:string, bytes:number}>,
   *             header: object, bytes: number }}
   *   `bytes` = octets NOUVELLEMENT retenus par cet instantané.
   */
  function capture() {
    var objects = readObjects() || [];
    var map = new Map();
    var order = [];
    var fresh = 0;

    for (var i = 0; i < objects.length; i++) {
      var obj = objects[i];
      if (!obj) continue;
      var id = ensureId(obj);
      var json;
      try {
        json = JSON.stringify(obj.toObject(properties));
      } catch (e) {
        // Un objet non sérialisable ne doit pas casser tout l'historique.
        console.warn('[Bird history] objet ignoré', e);
        continue;
      }
      var rec = pool.get(id);
      if (!rec || rec.json !== json) {
        rec = { json: json, bytes: (json.length + id.length) * 2 };
        pool.set(id, rec);
        fresh += rec.bytes;
      }
      map.set(id, rec);
      order.push(id);
    }

    // Purge : un id qui n'existe plus n'a aucune raison de rester en mémoire.
    if (pool.size > Math.max(512, objects.length * 4)) {
      var live = map;
      var dead = [];
      pool.forEach(function (_rec, key) { if (!live.has(key)) dead.push(key); });
      dead.forEach(function (key) { pool.delete(key); });
    }

    return { order: order, map: map, header: headerOf(), bytes: fresh };
  }

  /** Reconstruit un document Fabric complet à partir d'un instantané. */
  function materialize(snapshot) {
    if (!snapshot) return null;
    var objects = [];
    for (var i = 0; i < snapshot.order.length; i++) {
      var rec = snapshot.map.get(snapshot.order[i]);
      if (!rec) continue;
      try { objects.push(JSON.parse(rec.json)); }
      catch (e) { console.warn('[Bird history] état illisible', e); }
    }
    var head = {};
    var src = snapshot.header || {};
    for (var key in src) {
      if (Object.prototype.hasOwnProperty.call(src, key)) head[key] = src[key];
    }
    head.objects = objects;
    return head;
  }

  /**
   * Octets réellement occupés par une ou plusieurs piles.
   * On compte chaque enregistrement UNE fois, par identité : c'est
   * exactement le gain de l'interning.
   */
  function bytesOf() {
    var seen = new Set();
    var total = 0;
    for (var s = 0; s < arguments.length; s++) {
      var stack = arguments[s];
      if (!stack) continue;
      for (var i = 0; i < stack.length; i++) {
        var snap = stack[i];
        if (!snap || !snap.map) continue;
        snap.map.forEach(function (rec) {
          if (seen.has(rec)) return;
          seen.add(rec);
          total += rec.bytes;
        });
      }
    }
    return total;
  }

  return {
    capture: capture,
    materialize: materialize,
    bytesOf: bytesOf,
    /** Vide le cache : à appeler quand on repart d'un document neuf. */
    reset: function () { pool.clear(); seq = 0; },
    stats: function () { return { cachedObjects: pool.size }; }
  };
}

/**
 * Réduit une pile en respectant un nombre d'états ET un budget d'octets.
 * @returns {number} nombre d'états retirés
 */
function trim(stack, limit, budget, measure) {
  var removed = 0;
  while (stack.length > limit) { stack.shift(); removed++; }
  // On garde toujours au moins un état : sans lui, plus d'annulation.
  while (stack.length > 1 && measure() > budget) { stack.shift(); removed++; }
  return removed;
}

function formatBytes(bytes) {
  if (!bytes) return '0 Ko';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
  return (bytes / 1024 / 1024).toFixed(1) + ' Mo';
}

global.BirdHistory = {
  create: create,
  trim: trim,
  formatBytes: formatBytes,
  version: '1.0.0'
};

})(window);
