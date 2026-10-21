/* ═══════════════════════════════════════════════════════════════
   BIRD — TEXTE DANS UNE FORME, TEXTE AUTOUR D'UNE FORME
   ═══════════════════════════════════════════════════════════════
   Deux modes, deux techniques :

   · DEDANS — le texte épouse la silhouette. On ne masque pas un bloc
     rectangulaire (ce que fait un simple clipPath) : on mesure la largeur
     réellement disponible rangée par rangée, après érosion du contour, puis
     on découpe le texte en conséquence. C'est le « texte curviligne »
     d'InDesign, et c'est la seule façon d'écrire lisiblement dans une
     ellipse ou une étoile.

     La mesure se fait par rastérisation : on dessine la forme en aplat dans
     un canvas hors écran, puis une transformée de distance (chamfer) donne
     la distance au bord vide de chaque pixel. Les rangées dont la largeur
     utile tombe à zéro sont sautées — c'est ainsi que le texte s'arrête net
     au lieu de déborder.

   · AUTOUR — le texte court sur le contour extérieur. On construit un tracé
     fermé décalé vers l'extérieur (intersection des arêtes décalées pour un
     polygone, ellipse agrandie sinon) et on le passe à `fabric.Text`, qui
     sait poser des glyphes le long d'un chemin depuis la 5.1.

   Le module ne touche ni à l'historique ni à l'interface : il construit des
   objets Fabric et les rend. L'appelant décide quoi en faire.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var measureContext = null;

function measureCtx() {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  return measureContext;
}

function boldToWeight(bold) {
  return bold ? '700' : 'normal';
}

/* ── Rastérisation de la forme ────────────────────────────────
   Renvoie la bbox absolue de la forme et un masque binaire de sa
   silhouette, au pixel près. */
function shapeSpans(shape) {
  var br = shape.getBoundingRect(true, true);
  var W = Math.max(1, Math.ceil(br.width));
  var H = Math.max(1, Math.ceil(br.height));
  var off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  var octx = off.getContext('2d', { willReadFrequently: true });
  var mask = new Uint8Array(W * H);

  // On rend la géométrie RÉELLE de la forme, en aplat opaque, le temps de la
  // mesure : une ellipse donne une ellipse, une étoile donne une étoile.
  var saved = {
    fill: shape.fill, opacity: shape.opacity, stroke: shape.stroke,
    strokeWidth: shape.strokeWidth, shadow: shape.shadow, visible: shape.visible
  };
  try {
    shape.set({ fill: '#000', opacity: 1, stroke: null, strokeWidth: 0, shadow: null, visible: true });
    octx.save();
    octx.translate(-br.left, -br.top);
    shape.render(octx);
    octx.restore();
  } catch (err) {
    /* sans objet : on garde le masque vide et le repli rectangulaire ci-dessous */
  } finally {
    try { shape.set(saved); } catch (err2) { /* sans objet */ }
  }

  var filled = false;
  try {
    var data = octx.getImageData(0, 0, W, H).data;
    for (var i = 0; i < W * H; i++) {
      mask[i] = data[i * 4 + 3] > 40 ? 1 : 0;
      if (mask[i]) filled = true;
    }
  } catch (err3) {
    filled = false;   // canvas « tainted »
  }
  // Repli : si rien n'a pu être lu, on considère un rectangle plein. Mieux
  // vaut un texte rectangulaire qu'un texte aux largeurs nulles (donc vide).
  if (!filled) mask.fill(1);

  return { br: br, W: W, H: H, mask: mask };
}

/* ── Largeur intérieure par rangée, après érosion de `pad` ───
   Un pixel n'est retenu que si sa distance au bord vide est ≥ pad : cela
   produit une marge UNIFORME (haut, bas, gauche, droite) au lieu d'un
   simple retrait latéral. */
function erodedRowWidths(spans, pad) {
  var W = spans.W, H = spans.H, mask = spans.mask;
  var rowW = new Float32Array(H);
  var p = Math.max(0, pad || 0);

  if (p < 1) {
    for (var y = 0; y < H; y++) {
      var mn = -1, mx = -1, base = y * W;
      for (var x = 0; x < W; x++) {
        if (mask[base + x]) { if (mn < 0) mn = x; mx = x; }
      }
      rowW[y] = mn < 0 ? 0 : (mx - mn + 1);
    }
    return rowW;
  }

  var INF = 1e6, d1 = 1, d2 = Math.SQRT2;
  var dist = new Float32Array(W * H);
  var i;
  for (i = 0; i < W * H; i++) dist[i] = mask[i] ? INF : 0;

  // Deux passes avant puis deux passes arrière : la distance de chamfer.
  for (var ya = 0; ya < H; ya++) {
    var ba = ya * W;
    for (var xa = 0; xa < W; xa++) {
      i = ba + xa;
      if (dist[i] === 0) continue;
      var da = dist[i];
      if (xa > 0) da = Math.min(da, dist[i - 1] + d1);
      if (ya > 0) da = Math.min(da, dist[i - W] + d1);
      if (xa > 0 && ya > 0) da = Math.min(da, dist[i - W - 1] + d2);
      if (xa < W - 1 && ya > 0) da = Math.min(da, dist[i - W + 1] + d2);
      dist[i] = da;
    }
  }
  for (var yb = H - 1; yb >= 0; yb--) {
    var bb = yb * W;
    for (var xb = W - 1; xb >= 0; xb--) {
      i = bb + xb;
      if (dist[i] === 0) continue;
      var db = dist[i];
      if (xb < W - 1) db = Math.min(db, dist[i + 1] + d1);
      if (yb < H - 1) db = Math.min(db, dist[i + W] + d1);
      if (xb < W - 1 && yb < H - 1) db = Math.min(db, dist[i + W + 1] + d2);
      if (xb > 0 && yb < H - 1) db = Math.min(db, dist[i + W - 1] + d2);
      dist[i] = db;
    }
  }
  for (var yc = 0; yc < H; yc++) {
    var mnc = -1, mxc = -1, bc = yc * W;
    for (var xc = 0; xc < W; xc++) {
      if (dist[bc + xc] >= p) { if (mnc < 0) mnc = xc; mxc = xc; }
    }
    rowW[yc] = mnc < 0 ? 0 : (mxc - mnc + 1);
  }
  return rowW;
}

/* ── Découpe du texte en suivant la silhouette ───────────────
   Greedy, puis on relance avec le nombre de lignes obtenu : la hauteur du
   bloc dépend du nombre de lignes, qui dépend des largeurs disponibles, qui
   dépendent de la hauteur. Trois ou quatre itérations suffisent à converger
   (le cas instable est un texte qui tient ou non sur la dernière ligne). */
function wrapToShape(cfg, spans) {
  var words = String(cfg.text == null ? '' : cfg.text).split(/\s+/).filter(Boolean);
  var fs = cfg.fontSize || 16;
  var lineH = fs * (cfg.lineHeight || 1.2);
  var pad = Math.max(0, cfg.padding || 0);
  var cy = spans.br.top + spans.br.height / 2;

  var mctx = measureCtx();
  mctx.font = (cfg.italic ? 'italic ' : '') + (cfg.bold ? '700 ' : '400 ') +
    fs + 'px ' + (cfg.fontFamily || 'sans-serif');
  var csPerChar = (cfg.charSpacing || 0) / 1000 * fs;
  var measure = function (s) {
    return mctx.measureText(s).width + (s.length > 1 ? (s.length - 1) * csPerChar : 0);
  };

  var rowW = erodedRowWidths(spans, pad);
  var widthAtY = function (y) {
    var r = Math.round(y - spans.br.top);
    if (r < 0 || r >= spans.H) return 0;
    return Math.max(0, rowW[r] - 4);
  };

  var maxInnerW = 0;
  for (var r = 0; r < spans.H; r++) {
    var w = rowW[r] - 4;
    if (w > maxInnerW) maxInnerW = w;
  }
  maxInnerW = Math.max(10, maxInnerW);

  var empty = { text: String(cfg.text == null ? ' ' : cfg.text) || ' ', maxInnerW: maxInnerW, lines: 1, leftover: 0 };
  if (!words.length) return empty;

  var greedy = function (N) {
    var top0 = cy - N * lineH / 2;
    var lines = [];
    var i = 0, k = 0;
    while (i < words.length) {
      if (k > 400) break;                       // garde-fou : forme dégénérée
      var yc = top0 + (k + 0.5) * lineH;
      if (yc > spans.br.top + spans.br.height + lineH) break;
      var avail = widthAtY(yc);
      // Une rangée plus étroite qu'un demi-caractère ne peut rien porter :
      // on saute la ligne au lieu d'y écrire deux lettres illisibles.
      if (avail < fs * 0.55) { lines.push(''); k++; continue; }
      var line = '';
      while (i < words.length) {
        var test = line ? line + ' ' + words[i] : words[i];
        if (measure(test) <= avail) { line = test; i++; } else break;
      }
      if (line === '') { line = words[i]; i++; }   // mot plus large que la forme
      lines.push(line);
      k++;
    }
    while (lines.length && lines[0] === '') lines.shift();
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    return { lines: lines, placed: i };
  };

  var N = 1, result = greedy(1);
  for (var it = 0; it < 6; it++) {
    var nn = result.lines.length || 1;
    if (nn === N) break;
    N = nn;
    result = greedy(N);
  }
  return {
    text: result.lines.join('\n') || ' ',
    maxInnerW: maxInnerW,
    lines: result.lines.length || 1,
    // Mots que la silhouette n'a pas pu contenir : l'appelant doit réduire le
    // corps plutôt que de laisser la fin du texte s'évaporer en silence.
    leftover: words.length - result.placed
  };
}

/* ── Polygones : sommets absolus, décalage vers l'extérieur ─── */
function polygonPoints(obj) {
  if (!obj) return null;
  var t = obj.type;
  try {
    if (t === 'rect') {
      var c = obj.getCoords ? obj.getCoords(true, true) : null;
      return (c && c.length === 4) ? c.map(function (p) { return { x: p.x, y: p.y }; }) : null;
    }
    if (t === 'triangle') {
      var w = obj.width, h = obj.height;
      var local = [{ x: 0, y: -h / 2 }, { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }];
      var m = obj.calcTransformMatrix();
      return local.map(function (p) { return fabric.util.transformPoint(p, m); });
    }
    if ((t === 'polygon' || t === 'polyline') && Array.isArray(obj.points) && obj.points.length >= 3) {
      var offset = obj.pathOffset || { x: 0, y: 0 };
      var mm = fabric.util.multiplyTransformMatrices(obj.calcTransformMatrix(), [1, 0, 0, 1, -offset.x, -offset.y]);
      return obj.points.map(function (p) { return fabric.util.transformPoint({ x: p.x, y: p.y }, mm); });
    }
  } catch (err) { /* forme non polygonale */ }
  return null;
}

function signedArea(pts) {
  var s = 0;
  for (var i = 0; i < pts.length; i++) {
    var a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/* Chaque arête est translatée le long de sa normale extérieure, puis deux
   arêtes consécutives sont intersectées pour retrouver le sommet décalé.
   Correct pour tout polygone convexe (rect, triangle, polygone régulier). */
function offsetPolygon(pts, offset) {
  var n = pts.length;
  if (n < 3) return null;
  var cw = signedArea(pts) > 0;
  var edges = [];
  for (var i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    var ux = dx / len, uy = dy / len;
    var nx = cw ? uy : -uy;
    var ny = cw ? -ux : ux;
    edges.push({ ax: a.x + nx * offset, ay: a.y + ny * offset, ux: ux, uy: uy });
  }
  var out = [];
  for (var k = 0; k < n; k++) {
    var e1 = edges[(k + n - 1) % n];
    var e2 = edges[k];
    var a11 = e1.ux, a12 = -e2.ux, a21 = e1.uy, a22 = -e2.uy;
    var det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-9) { out.push({ x: e2.ax, y: e2.ay }); continue; }
    var rhsX = e2.ax - e1.ax, rhsY = e2.ay - e1.ay;
    var tt = (rhsX * a22 - rhsY * a12) / det;
    out.push({ x: e1.ax + tt * e1.ux, y: e1.ay + tt * e1.uy });
  }
  return out;
}

function ellipseCommands(cx, cy, rx, ry) {
  return [
    ['M', cx - rx, cy],
    ['A', rx, ry, 0, 0, 1, cx + rx, cy],
    ['A', rx, ry, 0, 0, 1, cx - rx, cy],
    ['Z']
  ];
}

function polygonCommands(pts) {
  if (!pts || pts.length < 3) return null;
  var cmds = [['M', pts[0].x, pts[0].y]];
  for (var i = 1; i < pts.length; i++) cmds.push(['L', pts[i].x, pts[i].y]);
  // Le L de fermeture explicite évite que Fabric saute le dernier côté : sans
  // lui, les derniers glyphes s'arrêtent au dernier sommet au lieu de courir
  // jusqu'au point de départ.
  cmds.push(['L', pts[0].x, pts[0].y]);
  cmds.push(['Z']);
  return cmds;
}

/* Tracé périmétrique extérieur, invisible et hors export. */
function aroundPath(shape, cfg) {
  var br = shape.getBoundingRect(true, true);
  var cx = br.left + br.width / 2, cy = br.top + br.height / 2;
  var fs = cfg.fontSize || 12;
  var strokeHalf = (shape.stroke && shape.strokeWidth)
    ? (shape.strokeWidth * Math.max(shape.scaleX || 1, shape.scaleY || 1)) / 2
    : 0;
  var offset = (cfg.padding || 0) + strokeHalf + fs * 0.12 + 1;

  var poly = polygonPoints(shape);
  var cmds, firstEdgeLen = 0, isPoly = false;
  if (poly && poly.length >= 3) {
    var shifted = offsetPolygon(poly, offset) || poly;
    var rel = shifted.map(function (p) { return { x: p.x - cx, y: p.y - cy }; });
    cmds = polygonCommands(rel);
    isPoly = true;
    if (rel.length >= 2) firstEdgeLen = Math.hypot(rel[1].x - rel[0].x, rel[1].y - rel[0].y);
  } else {
    cmds = ellipseCommands(0, 0, Math.max(1, br.width / 2 + offset), Math.max(1, br.height / 2 + offset));
  }

  var path = new fabric.Path(cmds, {
    left: cx, top: cy, originX: 'center', originY: 'center',
    fill: 'transparent', stroke: 'transparent', strokeWidth: 0,
    visible: false, evented: false, selectable: false,
    excludeFromExport: true, objectCaching: false
  });
  path.opacity = 0;
  path.__birdFirstEdgeLen = firstEdgeLen;
  path.__birdIsPoly = isPoly;
  return path;
}

/* Centre le texte sur la première arête : sans cela, Fabric démarre au
   sommet d'origine et un texte court reste collé dans le coin. */
function centerTextOnPath(text, path) {
  try {
    if (!path || !path.__birdIsPoly || !path.__birdFirstEdgeLen) { text.pathStartOffset = 0; return; }
    text.initDimensions();
    var textW = typeof text.calcTextWidth === 'function' ? text.calcTextWidth() : (text.width || 0);
    text.pathStartOffset = Math.max(0, (path.__birdFirstEdgeLen - textW) / 2);
  } catch (err) { text.pathStartOffset = 0; }
}

function normalizeCfg(cfg) {
  cfg = cfg || {};
  return {
    mode: cfg.mode === 'around' ? 'around' : 'inside',
    text: cfg.text == null ? '' : String(cfg.text),
    fontSize: Math.max(4, Math.min(400, Number(cfg.fontSize) || 24)),
    fontFamily: cfg.fontFamily || "'IBM Plex Mono', monospace",
    fill: cfg.fill || '#1a1a1a',
    padding: Math.max(0, Math.min(200, Number(cfg.padding) || 0)),
    lineHeight: Math.max(0.8, Math.min(3, Number(cfg.lineHeight) || 1.25)),
    charSpacing: Number(cfg.charSpacing) || 0,
    bold: !!cfg.bold,
    italic: !!cfg.italic,
    align: cfg.align === 'left' || cfg.align === 'right' ? cfg.align : 'center'
  };
}

/* ── Construction ───────────────────────────────────────────── */
function makeInside(shape, cfg) {
  var spans = shapeSpans(shape);
  /* Réduction automatique : si la silhouette ne peut pas contenir tout le
     texte au corps demandé, on baisse le corps jusqu'à ce que tout tienne.
     Laisser filer la fin du texte serait un piège — l'utilisateur tape une
     phrase et n'en voit qu'une partie, sans aucun signe. Le plancher évite
     un corps illisible dans une forme minuscule. */
  var fitted = cfg;
  var wrapped = wrapToShape(fitted, spans);
  var guard = 0;
  while (wrapped.leftover > 0 && fitted.fontSize > 6 && guard < 30) {
    guard += 1;
    fitted = Object.assign({}, fitted, { fontSize: Math.max(6, Math.round(fitted.fontSize * 0.9)) });
    wrapped = wrapToShape(fitted, spans);
  }

  var targetW = Math.max(20, wrapped.maxInnerW + 4);
  var br = spans.br;
  var blockH = fitted.fontSize * fitted.lineHeight * wrapped.lines;

  var box = new fabric.Textbox(wrapped.text || ' ', {
    left: br.left + (br.width - targetW) / 2,
    top: br.top + (br.height - blockH) / 2,
    originX: 'left', originY: 'top',
    width: targetW,
    fontSize: fitted.fontSize,
    fontFamily: fitted.fontFamily,
    fontWeight: boldToWeight(fitted.bold),
    fontStyle: fitted.italic ? 'italic' : 'normal',
    lineHeight: fitted.lineHeight,
    fill: fitted.fill,
    textAlign: fitted.align,
    charSpacing: fitted.charSpacing,
    editable: false,
    splitByGrapheme: false,
    breakWords: true,
    objectCaching: false,
    padding: 6
  });
  // Fabric recalcule la largeur au constructeur ; on la repose.
  box.set('width', targetW);
  box.setCoords();
  // Le corps réellement retenu est utile à l'appelant (et au prochain
  // ré-édition, qui doit repartir de la bonne valeur).
  box.__birdFittedFontSize = fitted.fontSize;
  return box;
}

function makeAround(shape, cfg) {
  var path = aroundPath(shape, cfg);
  var text = new fabric.Text(cfg.text || ' ', {
    left: path.left,
    top: path.top,
    originX: 'center',
    originY: 'center',
    path: path,
    fontSize: cfg.fontSize,
    fontFamily: cfg.fontFamily,
    fontWeight: boldToWeight(cfg.bold),
    fontStyle: cfg.italic ? 'italic' : 'normal',
    fill: cfg.fill,
    editable: false,
    objectCaching: false,
    charSpacing: cfg.charSpacing
  });
  centerTextOnPath(text, path);
  text.setCoords();
  return text;
}

/**
 * Construit l'objet texte pour une forme.
 * @returns {fabric.Object|null}
 */
function create(shape, rawCfg) {
  if (!shape || shape.type === 'activeSelection') return null;
  var cfg = normalizeCfg(rawCfg);
  if (!cfg.text.trim()) return null;
  var obj;
  try {
    obj = cfg.mode === 'around' ? makeAround(shape, cfg) : makeInside(shape, cfg);
  } catch (err) {
    console.warn('[Bird] texte dans la forme :', err);
    return null;
  }
  obj._birdTextShape = { id: null, mode: cfg.mode, cfg: cfg };
  return obj;
}

/* Une forme peut recevoir du texte : tout sauf du texte et une sélection. */
function canApply(shape) {
  if (!shape) return false;
  return ['rect', 'ellipse', 'circle', 'triangle', 'polygon', 'path', 'line', 'group'].indexOf(shape.type) >= 0;
}

global.BirdTextShape = {
  create: create,
  canApply: canApply,
  shapeSpans: shapeSpans,
  erodedRowWidths: erodedRowWidths,
  wrapToShape: wrapToShape,
  polygonPoints: polygonPoints,
  offsetPolygon: offsetPolygon,
  normalizeCfg: normalizeCfg
};

})(window);
