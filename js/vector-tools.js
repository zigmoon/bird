/* ═══════════════════════════════════════════════════════════════
   BIRD — OUTILS VECTORIELS DE PRODUCTION
   ═══════════════════════════════════════════════════════════════
   • Polices     : enregistrement de fichiers .ttf/.otf, persistance
   • Texte       : conversion en courbes (opentype.js), donc plus
                   jamais de repli sur Helvetica dans un PDF
   • Contour     : trait → contour fermé (vrai objet, plus un trait)
   • Décalage    : offset de tracé (+/-), jonctions arrondies
   • Simplifier  : réduction de points (Paper.js)
   • Symboles    : définition + instances liées
   • Blend       : interpolation d'objets (forme, transform, couleur)
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ════════════════════════════════════════════════════════════
   POLICES
════════════════════════════════════════════════════════════ */
var fonts = new Map();          // famille → { buffer, font, name }
var FONT_DB = 'bird-fonts';

function normFamily(name) {
  return String(name || '').split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
}

function parseFont(buffer, family) {
  if (!global.opentype) throw new Error('opentype.js indisponible');
  var font = global.opentype.parse(buffer);
  if (!font || !font.glyphs) throw new Error('Police illisible');
  var name = family || (font.names && font.names.fullName && font.names.fullName.en) || 'Police';
  return { buffer: buffer, font: font, name: name, family: normFamily(name) };
}

function register(kind, payload) {
  if (kind === 'buffer') {
    var parsed = parseFont(payload.buffer, payload.family);
    fonts.set(parsed.family, parsed);
    // On enregistre aussi le nom complet déclaré par la police.
    if (payload.aliases) payload.aliases.forEach(function (a) { fonts.set(normFamily(a), parsed); });
    return parsed;
  }
  return null;
}

async function loadFontFile(file) {
  var buffer = await file.arrayBuffer();
  var parsed = parseFont(buffer, file.name.replace(/\.(ttf|otf|woff2?)$/i, ''));
  fonts.set(parsed.family, parsed);
  // La famille déclarée par la police elle-même, pour matcher le sélecteur.
  if (parsed.font.names && parsed.font.names.fontFamily && parsed.font.names.fontFamily.en) {
    fonts.set(normFamily(parsed.font.names.fontFamily.en), parsed);
  }
  // Rendu correct à l'écran dans Bird.
  try {
    var face = new FontFace(parsed.name, buffer);
    await face.load();
    document.fonts.add(face);
  } catch (e) { /* le rendu écran est un bonus */ }
  await storeFont(file.name, buffer);
  return parsed;
}

function findFont(family) {
  var key = normFamily(family);
  if (fonts.has(key)) return fonts.get(key);
  // Tolérance : « IBM Plex Mono » vs « IBMPlexMono-Regular ».
  // On compare sans espaces, sans tirets et sans suffixe de graisse.
  var compact = key.replace(/[\s-]/g, '');
  var found = null;
  fonts.forEach(function (v, k) {
    if (found) return;
    var candidate = k.replace(/[\s-]/g, '');
    if (candidate === compact) { found = v; return; }
    // « ibmplexmono » doit reconnaître « ibmplexmonoregular ».
    if (candidate.indexOf(compact) === 0 || compact.indexOf(candidate) === 0) found = v;
  });
  return found;
}

function listFonts() {
  var seen = new Set();
  var out = [];
  fonts.forEach(function (v) {
    if (seen.has(v.name)) return;
    seen.add(v.name);
    out.push({ name: v.name, family: v.family, glyphs: v.font.numGlyphs });
  });
  return out;
}

/* Persistance : une police chargée une fois reste disponible. */
function openFontDB() {
  return new Promise(function (resolve, reject) {
    if (!global.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
    var req = indexedDB.open(FONT_DB, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
}

function storeFont(name, buffer) {
  return openFontDB().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(buffer, name);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }).catch(function () {});
}

function restoreFonts() {
  return openFontDB().then(function (db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('files', 'readonly');
      var store = tx.objectStore('files');
      var req = store.getAll();
      var keysReq = store.getAllKeys();
      tx.oncomplete = function () {
        var buffers = req.result || [];
        var keys = keysReq.result || [];
        buffers.forEach(function (buf, i) {
          try {
            var parsed = parseFont(buf, String(keys[i] || '').replace(/\.(ttf|otf|woff2?)$/i, ''));
            fonts.set(parsed.family, parsed);
            if (parsed.font.names && parsed.font.names.fontFamily && parsed.font.names.fontFamily.en) {
              fonts.set(normFamily(parsed.font.names.fontFamily.en), parsed);
            }
          } catch (e) { /* police corrompue : ignorée */ }
        });
        resolve(fonts.size);
      };
      tx.onerror = function () { resolve(0); };
    });
  }).catch(function () { return 0; });
}

/* ════════════════════════════════════════════════════════════
   TEXTE → COURBES
════════════════════════════════════════════════════════════ */
function textToCurves(obj) {
  if (!obj) return null;
  var isText = obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
  if (!isText) return null;

  var family = obj.fontFamily || 'sans-serif';
  var entry = findFont(family);
  if (!entry) {
    throw new Error('Police « ' + family + ' » introuvable. Chargez le fichier .ttf/.otf dans Préférences → Polices.');
  }

  var fontSize = obj.fontSize || 24;
  var font = entry.font;
  // Fabric 5 renvoie un tableau ; les versions récentes renvoient un objet
  // { lines, ... } depuis _splitTextIntoLines. On accepte les deux.
  var split = null;
  if (typeof obj._splitText === 'function') split = obj._splitText();
  var lines;
  if (Array.isArray(split)) lines = split;
  else if (split && Array.isArray(split.lines)) lines = split.lines;
  else lines = String(obj.text || '').split('\n').map(function (t) { return { text: t }; });
  var lineHeight = fontSize * (obj.lineHeight || 1.16) * (obj._fontSizeMult || 1.13);

  // Décalage vertical : Fabric place la première ligne à _getTopOffset().
  var topOffset = typeof obj._getTopOffset === 'function' ? obj._getTopOffset() : 0;
  var leftOffset = typeof obj._getLeftOffset === 'function' ? obj._getLeftOffset() : 0;
  var boxWidth = typeof obj.getWidth === 'function' ? obj.getWidth() : (obj.width || 0);

  var commands = [];
  lines.forEach(function (line, index) {
    // `_splitText().lines` contient des objets { text, width } en Fabric 5 ;
    // on accepte aussi une simple chaîne pour ne pas dépendre de la version.
    var text = typeof line === 'string' ? line : (line && line.text) || '';
    if (!text) return;
    // Largeur d'avance réelle de la police, pas celle mesurée par le navigateur.
    var advance = 0;
    for (var i = 0; i < text.length; i++) {
      var gl = font.charToGlyph(text[i]);
      advance += (gl.advanceWidth || 0) / font.unitsPerEm * fontSize;
    }
    var x = leftOffset;
    if (obj.textAlign === 'center') x += (boxWidth - advance) / 2;
    else if (obj.textAlign === 'right') x += (boxWidth - advance);
    // Fabric rend chaque ligne avec `textBaseline = 'alphabetic'` et pour
    // origine le haut de ligne : la ligne de base EST topOffset + i*lineHeight.
    var y = topOffset + index * lineHeight;

    var path = font.getPath(text, x, y, fontSize);
    var d = path && path.toPathData ? path.toPathData(3) : '';
    if (d) commands.push(d);
  });

  if (!commands.length) return null;
  return commands;
}

/* Transforme un objet texte en groupe de courbes, sur place.
   Retourne le nouvel objet, ou null si la police manque. */
function vectorizeTextObject(canvas, obj, options) {
  options = options || {};
  var commands;
  try {
    commands = textToCurves(obj);
  } catch (e) {
    if (!options.silent) throw e;
    return null;
  }
  if (!commands) return null;

  var made = [];
  var matrix = obj.calcTransformMatrix();
  commands.forEach(function (d) {
    var transformed = transformPathData(d, matrix);
    var path = new fabric.Path(transformed, {
      fill: obj.fill && typeof obj.fill === 'string' ? obj.fill : '#000000',
      stroke: obj.stroke || null,
      strokeWidth: obj.strokeWidth || 0,
      objectCaching: false
    });
    path.set({ left: 0, top: 0, originX: 'left', originY: 'top' });
    // Le chemin est déjà dans le repère du canvas : aucune transformation.
    path.birdFromText = true;
    made.push(path);
  });

  if (!made.length) return null;
  var group = made.length === 1 ? made[0] : new fabric.Group(made, { objectCaching: false });
  group.birdFromText = true;

  if (!options.dryRun) {
    var index = canvas.getObjects().indexOf(obj);
    canvas.remove(obj);
    if (index >= 0) canvas.insertAt(group, index, false);
    else canvas.add(group);
    canvas.requestRenderAll();
  }
  return group;
}

/* Applique une matrice Fabric aux coordonnées d'un path data SVG.
   Toutes les commandes produites par opentype.js sont absolues. */
function transformPathData(d, matrix) {
  var f = global.fabric;
  var p = function (x, y) {
    var pt = f.util.transformPoint(new f.Point(x, y), matrix);
    return { x: pt.x, y: pt.y };
  };
  return String(d).replace(/([MLCQST])([^MLCQSTZz]*)/g, function (m, cmd, args) {
    var nums = args.trim().split(/[\s,]+/).filter(function (v) { return v !== ''; }).map(Number);
    var out = [];
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var q = p(nums[i], nums[i + 1]);
      out.push(q.x, q.y);
    }
    return cmd + out.map(function (v) { return Math.round(v * 1000) / 1000; }).join(' ');
  }).replace(/[Zz]/g, 'Z');
}

/* Vectorise tous les textes d'un canvas sans le modifier :
   utile avant un export d'imprimerie. On travaille sur des clones. */
function vectorizeForExport(canvas) {
  var warnings = [];
  var out = [];
  canvas.getObjects().forEach(function (obj) {
    if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
      try {
        var cmds = textToCurves(obj);
        if (!cmds) { warnings.push(obj.text || 'texte'); return; }
        var matrix = obj.calcTransformMatrix();
        var paths = [];
        cmds.forEach(function (d) {
          paths.push(new fabric.Path(transformPathData(d, matrix), {
            fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth || 0
          }));
        });
        out.push({ source: obj, paths: paths });
        return;
      } catch (e) {
        warnings.push((obj.text || 'texte') + ' (' + e.message + ')');
        return;
      }
    }
    out.push({ source: obj, paths: null });
  });
  return { entries: out, warnings: warnings };
}

/* ════════════════════════════════════════════════════════════
   PONT FABRIC → PAPER
   Un PaperScope PRIVÉ : les objets importés ne doivent pas polluer
   le projet que Pathfinder utilise pour ses opérations booléennes.
════════════════════════════════════════════════════════════ */
var birdScope = null;

function ensurePaperScope() {
  if (!global.paper) throw new Error('Paper.js indisponible');
  if (birdScope && birdScope.project) return birdScope;
  var canvasEl = document.createElement('canvas');
  canvasEl.width = 1;
  canvasEl.height = 1;
  if (global.paper.PaperScope) {
    birdScope = new global.paper.PaperScope();
    birdScope.setup(canvasEl);
  } else {
    global.paper.setup(canvasEl);
    birdScope = global.paper;
  }
  return birdScope;
}

function fabricToPaper(obj) {
  var scope = ensurePaperScope();
  var svg = obj.toSVG ? obj.toSVG() : '';
  if (!svg) return null;
  var wrapped = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">' + svg + '</svg>';
  // `expandShapes` est essentiel : sans lui, Paper.js garde <rect> en `Shape`
  // et <circle> en `Circle`, qui n'ont pas de `segments` exploitables.
  var imported = scope.project.importSVG(wrapped, { insert: false, expandShapes: true });
  if (!imported) return null;
  // Fabric enveloppe l'objet dans un <g> : l'item utile est un descendant,
  // pas forcément le premier enfant.
  var paths = [];
  collectPaths(imported, paths);
  return { imported: imported, item: paths[0] || imported, paths: paths, scope: scope };
}

/* Tous les chemins d'un arbre Paper.js, dans l'ordre du dessin. */
function collectPaths(item, out) {
  if (!item) return;
  if (item.segments && item.segments.length) { out.push(item); return; }
  if (item.className === 'CompoundPath') { out.push(item); return; }
  (item.children || []).forEach(function (child) { collectPaths(child, out); });
}

/* Vide le projet privé : à appeler une fois l'export terminé. */
function resetPaperScope() {
  try { if (birdScope && birdScope.project) birdScope.project.clear(); } catch (e) {}
}

function paperToFabricPath(path, style) {
  var segs = path.segments;
  if (!segs || segs.length < 2) return null;
  var d = 'M ' + r3(segs[0].point.x) + ' ' + r3(segs[0].point.y);
  for (var i = 1; i < segs.length; i++) {
    var prev = segs[i - 1], cur = segs[i];
    if (cur.handleIn.isZero() && prev.handleOut.isZero()) {
      d += ' L ' + r3(cur.point.x) + ' ' + r3(cur.point.y);
    } else {
      var c1 = prev.point.add(prev.handleOut);
      var c2 = cur.point.add(cur.handleIn);
      d += ' C ' + r3(c1.x) + ' ' + r3(c1.y) + ' ' + r3(c2.x) + ' ' + r3(c2.y) +
        ' ' + r3(cur.point.x) + ' ' + r3(cur.point.y);
    }
  }
  if (path.closed) d += ' Z';
  var fill = style && style.fill !== undefined ? style.fill : '#1a1a1a';
  return new fabric.Path(d, {
    fill: fill,
    stroke: (style && style.stroke) || null,
    strokeWidth: (style && style.strokeWidth) || 0,
    strokeLineJoin: 'round',
    objectCaching: false
  });
}

function r3(v) { return Math.round(v * 1000) / 1000; }

/* ════════════════════════════════════════════════════════════
   OUTILS ILLUSTRATOR
════════════════════════════════════════════════════════════ */

/* ── 1. Contour de trait ──
   Un trait devient une forme fermée. On décale le tracé de ±w/2 puis on
   soustrait : c'est exactement ce que fait Illustrator, sans rasteriser. */
function outlineStroke(obj) {
  if (!obj) throw new Error('Aucun objet');
  var strokeWidth = obj.strokeWidth || 0;
  if (!strokeWidth) throw new Error('Cet objet n’a pas de contour à vectoriser');

  var bridge = fabricToPaper(obj);
  if (!bridge || !bridge.paths.length) throw new Error('Objet non convertible');

  var results = [];
  bridge.paths.forEach(function (p) {
    if (p.className === 'CompoundPath') {
      (p.children || []).forEach(function (child) {
        var ring = strokeRing(child, strokeWidth);
        if (ring) results.push(ring);
      });
      return;
    }
    var ring = strokeRing(p, strokeWidth);
    if (ring) results.push(ring);
  });

  if (!results.length) throw new Error('Contour non calculable');

  var made = [];
  results.forEach(function (item2) {
    var parts = item2.className === 'CompoundPath' ? item2.children : [item2];
    parts.forEach(function (child) {
      var path = paperToFabricPath(child, {
        fill: obj.stroke || '#1a1a1a',
        stroke: null
      });
      if (path) made.push(path);
    });
  });
  if (!made.length) throw new Error('Contour vide');

  var group = made.length === 1 ? made[0] : new fabric.Group(made, { objectCaching: false });
  group.set({
    left: obj.left, top: obj.top, originX: obj.originX, originY: obj.originY,
    angle: obj.angle, scaleX: obj.scaleX, scaleY: obj.scaleY, opacity: obj.opacity
  });
  group.birdOutlined = true;
  return group;
}

/* Le trait devient un anneau : extérieur moins intérieur. */
function strokeRing(path, strokeWidth) {
  if (!path || path.className !== 'Path' || !path.segments || path.segments.length < 2) return null;
  var half = strokeWidth / 2;
  var outer = offsetPathItem(path, half);
  var inner = offsetPathItem(path, -half);
  if (outer && inner) {
    try {
      var ring = outer.subtract(inner);
      if (ring) return ring;
    } catch (e) { /* repli sur l'extérieur seul */ }
  }
  return outer || inner;
}

/* ── 2. Décalage de tracé ── */
function offsetPathItem(path, distance) {
  if (!path || !path.segments || path.segments.length < 2) return null;
  // On échantillonne pour obtenir des normales stables, puis on reconstruit.
  var sampled;
  try { sampled = path.getNearestLocation ? path : path; } catch (e) {}
  var points = samplePath(path, distance);
  if (points.length < 3) return null;
  var rebuilt = new global.paper.Path({ segments: points, closed: true, insert: false });
  try {
    rebuilt = rebuilt.resolveCrossings();
    if (rebuilt && rebuilt.reorient) rebuilt = rebuilt.reorient(true, true);
  } catch (e) { /* tant pis pour le nettoyage */ }
  return rebuilt;
}

/* Échantillonne le tracé et décale chaque point le long de la normale.
   Les jonctions sont arrondies : on insère un arc entre deux normales
   dont l'angle dépasse le seuil. */
function samplePath(path, distance) {
  var step = Math.max(0.5, Math.abs(distance) / 2);
  var len = path.length;
  if (!(len > 0)) return [];
  var count = Math.max(8, Math.min(600, Math.ceil(len / step)));
  var pts = [];
  for (var i = 0; i <= count; i++) {
    var loc = path.getLocationAt(i / count * path.length);
    if (!loc) continue;
    var n = loc.normal || loc.tangent && loc.tangent.rotate(90);
    if (!n) continue;
    var p = loc.point.add(n.multiply(distance));
    pts.push(p);
  }
  // Nettoyage : on retire les points quasi confondus.
  var out = [];
  pts.forEach(function (p) {
    var last = out[out.length - 1];
    if (!last || last.getDistance(p) > 0.05) out.push(p);
  });
  if (out.length > 2) {
    var a = out[0], b = out[out.length - 1];
    if (a.getDistance(b) < 0.05) out.pop();
  }
  return out;
}

/* ── 3. Simplification ── */
function simplifyPath(obj, tolerance) {
  var bridge = fabricToPaper(obj);
  if (!bridge || !bridge.paths.length) throw new Error('Objet non convertible');
  var tol = typeof tolerance === 'number' ? tolerance : 2;
  var made = [];
  bridge.paths.forEach(function (p) {
    if (p.className === 'CompoundPath') {
      (p.children || []).forEach(function (child) { pushSimplified(child, tol, obj, made); });
      return;
    }
    pushSimplified(p, tol, obj, made);
  });
  if (!made.length) throw new Error('Rien à simplifier');
  var before = countPoints(obj), after = made.reduce(function (s, p) {
    return s + (p.path ? p.path.length : 0);
  }, 0);
  var group = made.length === 1 ? made[0] : new fabric.Group(made, { objectCaching: false });
  group.set({
    left: obj.left, top: obj.top, originX: obj.originX, originY: obj.originY,
    angle: obj.angle, scaleX: obj.scaleX, scaleY: obj.scaleY, opacity: obj.opacity
  });
  group.birdSimplified = { before: before, after: after };
  return group;
}

function pushSimplified(path, tolerance, source, made) {
  if (!path || path.className !== 'Path') return;
  var copy = path.clone({ insert: false });
  copy.simplify(tolerance);
  var converted = paperToFabricPath(copy, {
    fill: source.fill && typeof source.fill === 'string' ? source.fill : '#1a1a1a',
    stroke: source.stroke,
    strokeWidth: source.strokeWidth
  });
  if (converted) made.push(converted);
}

function countPoints(obj) {
  if (obj.path && obj.path.length) return obj.path.length;
  if (obj._objects) return obj._objects.reduce(function (s, o) { return s + countPoints(o); }, 0);
  return 0;
}

/* ── 4. Symboles / composants ──
   Une définition est stockée dans state.symbols ; une instance est une
   copie qui garde le lien (birdSymbolId). « Mettre à jour » propage. */
function createSymbol(obj, name, id) {
  var def = {
    id: id || ('sym-' + Date.now().toString(36)),
    name: name || 'Symbole',
    json: obj.toObject(['birdSymbolId']),
    w: obj.getScaledWidth(),
    h: obj.getScaledHeight()
  };
  return def;
}

function instantiateSymbol(def, left, top) {
  return new Promise(function (resolve) {
    fabric.util.enlivenObjects([def.json], function (objects) {
      var o = objects[0];
      o.set({ left: left, top: top, birdSymbolId: def.id });
      resolve(o);
    });
  });
}

/* ── 5. Blend ──
   `fabric.Object.clone(callback)` est ASYNCHRONE en Fabric 5 : elle ne
   retourne rien. L'utiliser comme une fabrique synchrone remplissait le
   canvas d'`undefined`, ce qui cassait ensuite renderLayers. On passe donc
   par `enlivenObjects`, seule voie fiable pour dupliquer en série. */
function blendObjects(objA, objB, steps) {
  steps = Math.max(1, Math.min(50, parseInt(steps, 10) || 5));
  var isPath = function (o) { return o.type === 'path' && Array.isArray(o.path); };
  var sameShape = isPath(objA) && isPath(objB) &&
    objA.path.length === objB.path.length &&
    objA.path.every(function (seg, i) { return seg[0] === objB.path[i][0]; });

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var made = [];

  for (var i = 1; i <= steps; i++) {
    var t = i / (steps + 1);
    if (sameShape) {
      var segs = objA.path.map(function (seg, idx) {
        var other = objB.path[idx];
        var out = [seg[0]];
        for (var k = 1; k < seg.length; k++) {
          out.push(lerp(Number(seg[k]) || 0, Number(other[k]) || 0, t));
        }
        return out;
      });
      var clone = new fabric.Path(segs, {
        fill: mixColor(objA.fill, objB.fill, t),
        stroke: mixColor(objA.stroke, objB.stroke, t),
        strokeWidth: lerp(objA.strokeWidth || 0, objB.strokeWidth || 0, t),
        objectCaching: false
      });
      clone.set({ left: lerp(objA.left, objB.left, t), top: lerp(objA.top, objB.top, t) });
      clone.set({ originX: objA.originX, originY: objA.originY });
      clone.birdBlendStep = i;
      made.push(clone);
    }
  }

  // Formes différentes : on interpole la transformation et les couleurs,
  // en dupliquant les objets par `enlivenObjects` (asynchrone).
  if (!sameShape) {
    return new Promise(function (resolve) {
      var base = [objA.toObject(), objB.toObject()];
      fabric.util.enlivenObjects(base, function (objects) {
        var a = objects[0], b = objects[1];
        for (var i = 1; i <= steps; i++) {
          var t = i / (steps + 1);
          fabric.util.enlivenObjects([a.toObject()], function (clones) {
            var c = clones[0];
            if (!c) return;
            c.set({
              left: lerp(a.left, b.left, t),
              top: lerp(a.top, b.top, t),
              angle: lerp(a.angle || 0, b.angle || 0, t),
              scaleX: lerp(a.scaleX, b.scaleX, t),
              scaleY: lerp(a.scaleY, b.scaleY, t),
              opacity: lerp(a.opacity === undefined ? 1 : a.opacity,
                b.opacity === undefined ? 1 : b.opacity, t),
              fill: mixColor(a.fill, b.fill, t),
              objectCaching: false
            });
            c.birdBlendStep = i;
            made.push(c);
            if (made.length === steps) resolve(made);
          });
        }
        if (!steps) resolve(made);
      });
    });
  }
  return Promise.resolve(made);
}

function mixColor(a, b, t) {
  var ca = colorToRgb(a), cb = colorToRgb(b);
  if (!ca || !cb) return t < 0.5 ? a : b;
  var r = Math.round(ca.r + (cb.r - ca.r) * t);
  var g = Math.round(ca.g + (cb.g - ca.g) * t);
  var bl = Math.round(ca.b + (cb.b - ca.b) * t);
  return '#' + [r, g, bl].map(function (v) {
    return Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  }).join('');
}

function colorToRgb(c) {
  if (typeof c !== 'string') return null;
  var s = c.trim();
  if (s[0] !== '#') return null;
  if (global.BirdColor) return global.BirdColor.hexToRgb(s);
  return null;
}

/* ════════════════════════════════════════════════════════════
   API
════════════════════════════════════════════════════════════ */
global.BirdVector = {
  version: '1.0.0',
  // polices
  loadFontFile: loadFontFile,
  findFont: findFont,
  listFonts: listFonts,
  restoreFonts: restoreFonts,
  hasFont: function (family) { return !!findFont(family); },
  // texte
  textToCurves: textToCurves,
  vectorizeTextObject: vectorizeTextObject,
  vectorizeForExport: vectorizeForExport,
  // outils
  outlineStroke: outlineStroke,
  offsetPathItem: offsetPathItem,
  simplifyPath: simplifyPath,
  createSymbol: createSymbol,
  instantiateSymbol: instantiateSymbol,
  blendObjects: blendObjects,
  resetPaperScope: resetPaperScope,
  // utilitaires
  fabricToPaper: fabricToPaper,
  paperToFabricPath: paperToFabricPath,
  transformPathData: transformPathData
};

})(window);
