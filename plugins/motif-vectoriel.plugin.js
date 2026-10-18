/* ═══════════════════════════════════════════════════════════════
   PLUG-IN BIRD — MOTIF VECTORIEL
   Générateur de textures répétées, sans raccord visible.
   Tous les motifs sont construits sur une tuile de période entière :
   le raccord est donc mathématiquement exact, pas approximé.

   Deux sorties :
   • Texture  → un seul objet (fabric.Pattern). Léger, idéal pour un fond.
   • Vecteur  → de vrais objets Fabric, exportables en PDF/EPS.

   Le motif est défini par des PRIMITIVES (rect, circle, line, poly)
   rendues par deux moteurs : Canvas2D (aperçu + texture) et Fabric
   (vectorisation). Une seule description, deux rendus, zéro divergence.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z"/></svg>';

var MOTIFS = [
  { value: 'rayures', label: 'Rayures' },
  { value: 'damier', label: 'Damier' },
  { value: 'pois', label: 'Pois' },
  { value: 'vagues', label: 'Vagues' },
  { value: 'chevrons', label: 'Chevrons' },
  { value: 'triangles', label: 'Triangles' },
  { value: 'croix', label: 'Croix' },
  { value: 'grille', label: 'Grille' },
  { value: 'echelle', label: 'Écailles' }
];

/* ─────────────────────────────────────────────────────────────
   GÉOMÉTRIE — tuile de côté S, période entière sur les deux axes
   ───────────────────────────────────────────────────────────── */
function primes(v) {
  var S = Math.max(8, Math.round(Number(v.pas) || 40));
  // Damier, triangles et écailles demandent une tuile paire.
  if (v.motif === 'damier' || v.motif === 'triangles' || v.motif === 'echelle') {
    S = Math.round(S / 2) * 2;
  }
  var e = Math.max(0.5, Math.min(S / 2, Number(v.epaisseur) || 10));
  var list = [];
  var i, x, pts;

  switch (v.motif) {
    case 'damier':
      list.push({ t: 'rect', x: 0, y: 0, w: S / 2, h: S / 2 });
      list.push({ t: 'rect', x: S / 2, y: S / 2, w: S / 2, h: S / 2 });
      break;

    case 'pois':
      list.push({ t: 'circle', x: S / 2, y: S / 2, r: e / 2 });
      list.push({ t: 'circle', x: 0, y: 0, r: e / 2 });
      list.push({ t: 'circle', x: S, y: 0, r: e / 2 });
      list.push({ t: 'circle', x: 0, y: S, r: e / 2 });
      list.push({ t: 'circle', x: S, y: S, r: e / 2 });
      break;

    case 'vagues': {
      var amp = Math.min(e, S / 6);
      pts = [];
      for (i = 0; i <= 48; i++) {
        x = (i / 48) * S;
        pts.push([x, S / 2 + amp * Math.sin((x / S) * Math.PI * 2)]);
      }
      list.push({ t: 'poly', pts: pts, closed: false, fill: false, width: Math.max(1, e / 2) });
      break;
    }

    case 'chevrons': {
      var a2 = Math.min(e, S / 6);
      list.push({
        t: 'poly',
        pts: [[0, S / 2 + a2], [S / 2, S / 2 - a2], [S, S / 2 + a2]],
        closed: false, fill: false, width: Math.max(1, e / 2)
      });
      break;
    }

    case 'triangles': {
      var h = S / 2;
      list.push({ t: 'poly', pts: [[0, h], [S / 2, 0], [S, h]], closed: true, fill: true });
      list.push({ t: 'poly', pts: [[0, S], [S / 2, S - h], [S, S]], closed: true, fill: true });
      break;
    }

    case 'croix': {
      var t2 = Math.max(1, e / 3);
      var c = e / 2;
      var plus = function (cx, cy) {
        list.push({ t: 'rect', x: cx - c, y: cy - t2 / 2, w: e, h: t2 });
        list.push({ t: 'rect', x: cx - t2 / 2, y: cy - c, w: t2, h: e });
      };
      plus(S / 2, S / 2);
      plus(0, 0); plus(S, 0); plus(0, S); plus(S, S);
      break;
    }

    case 'grille':
      list.push({ t: 'line', x1: 0, y1: 0, x2: S, y2: 0, width: e / 2 });
      list.push({ t: 'line', x1: 0, y1: 0, x2: 0, y2: S, width: e / 2 });
      break;

    case 'echelle': {
      var r = S / 2;
      list.push({ t: 'circleOutline', x: r, y: 0, r: r });
      list.push({ t: 'circleOutline', x: 0, y: r, r: r });
      list.push({ t: 'circleOutline', x: S, y: r, r: r });
      list.push({ t: 'circleOutline', x: r, y: S, r: r });
      break;
    }

    case 'rayures':
    default:
      list.push({ t: 'rect', x: 0, y: 0, w: e, h: S });
      break;
  }
  return { S: S, list: list, epaisseur: e };
}

/* ── Moteur 1 : Canvas2D ── */
function drawPrimitives(g, res, style) {
  var S = res.S;
  var e = res.epaisseur;
  g.clearRect(0, 0, S, S);
  if (style.fond) {
    g.fillStyle = style.bg;
    g.fillRect(0, 0, S, S);
  }
  g.fillStyle = style.fg;
  g.strokeStyle = style.fg;
  g.lineJoin = 'round';
  g.lineCap = 'round';

  res.list.forEach(function (p) {
    switch (p.t) {
      case 'rect':
        g.fillRect(p.x, p.y, p.w, p.h);
        break;
      case 'circle':
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
        break;
      case 'circleOutline':
        g.lineWidth = Math.max(0.5, e / 2);
        g.beginPath();
        g.arc(p.x, p.y, Math.max(0.5, p.r - e / 4), 0, Math.PI * 2);
        g.stroke();
        break;
      case 'line':
        g.lineWidth = p.width || e;
        g.beginPath();
        g.moveTo(p.x1, p.y1);
        g.lineTo(p.x2, p.y2);
        g.stroke();
        break;
      case 'poly':
        g.lineWidth = p.width || e / 2;
        g.beginPath();
        p.pts.forEach(function (pt, i) {
          if (i === 0) g.moveTo(pt[0], pt[1]);
          else g.lineTo(pt[0], pt[1]);
        });
        if (p.closed) {
          g.closePath();
          if (p.fill) g.fill();
        }
        g.stroke();
        break;
    }
  });
}

function makeTile(v, dpr) {
  var res = primes(v);
  var S = res.S;
  dpr = dpr || 3;
  var cv = document.createElement('canvas');
  cv.width = Math.round(S * dpr);
  cv.height = Math.round(S * dpr);
  var g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawPrimitives(g, res, { fg: v.fg, bg: v.bg, fond: v.fond });
  return { canvas: cv, S: S, res: res, dpr: dpr };
}

/* ── Moteur 2 : Fabric ── */
function primitivesToFabric(res, v, dx, dy) {
  var e = res.epaisseur;
  dx = dx || 0;
  dy = dy || 0;
  var out = [];

  res.list.forEach(function (p) {
    switch (p.t) {
      case 'rect':
        out.push(new fabric.Rect({
          left: p.x + dx, top: p.y + dy, width: p.w, height: p.h,
          fill: v.fg, stroke: null, selectable: false, evented: false
        }));
        break;
      case 'circle':
        out.push(new fabric.Circle({
          left: p.x - p.r + dx, top: p.y - p.r + dy, radius: p.r,
          fill: v.fg, stroke: null, selectable: false, evented: false
        }));
        break;
      case 'circleOutline':
        out.push(new fabric.Circle({
          left: p.x - p.r + dx, top: p.y - p.r + dy, radius: Math.max(0.5, p.r - e / 4),
          fill: null, stroke: v.fg, strokeWidth: Math.max(0.5, e / 2),
          selectable: false, evented: false
        }));
        break;
      case 'line':
        out.push(new fabric.Line([p.x1 + dx, p.y1 + dy, p.x2 + dx, p.y2 + dy], {
          stroke: v.fg, strokeWidth: p.width || e, strokeLineCap: 'round',
          selectable: false, evented: false
        }));
        break;
      case 'poly': {
        var points = p.pts.map(function (q) { return { x: q[0], y: q[1] }; });
        var left = Math.min.apply(null, p.pts.map(function (q) { return q[0]; }));
        var top = Math.min.apply(null, p.pts.map(function (q) { return q[1]; }));
        if (p.closed && p.fill) {
          out.push(new fabric.Polygon(points, {
            left: left + dx, top: top + dy, fill: v.fg, stroke: null,
            selectable: false, evented: false
          }));
        } else {
          out.push(new fabric.Polyline(points, {
            left: left + dx, top: top + dy, fill: null, stroke: v.fg,
            strokeWidth: p.width || e / 2, strokeLineJoin: 'round', strokeLineCap: 'round',
            selectable: false, evented: false
          }));
        }
        break;
      }
    }
  });
  return out;
}

function toFabricObjects(v) {
  var res = primes(v);
  return { S: res.S, res: res, objects: primitivesToFabric(res, v, 0, 0) };
}

/* ─────────────────────────────────────────────────────────────
   APPLICATION
   ───────────────────────────────────────────────────────────── */
function patternMatrix(angle, dpr) {
  var r = (angle * Math.PI) / 180;
  var c = Math.cos(r), s = Math.sin(r);
  var k = 1 / dpr;
  return [c * k, s * k, -s * k, c * k, 0, 0];
}

function labelOf(value) {
  for (var i = 0; i < MOTIFS.length; i++) {
    if (MOTIFS[i].value === value) return MOTIFS[i].label;
  }
  return value;
}

function applyValues(api, v) {
  var c = api.canvas;
  var doc = api.document;
  var sel = api.selection();
  var bounds = v.cible === 'selection' ? api.selectionBounds() : null;

  if (v.cible === 'selection' && !sel.length) {
    throw new Error('Aucune sélection : choisissez « Plan de travail » ou sélectionnez une forme.');
  }

  var area = bounds
    ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
    : { left: 0, top: 0, width: doc.width, height: doc.height };

  api.begin();

  if (v.sortie === 'texture') {
    var tile = makeTile(v, 3);

    if (v.cible === 'selection') {
      var touched = 0;
      sel.forEach(function (o) {
        if (!('fill' in o)) return;
        o.set('fill', new fabric.Pattern({
          source: tile.canvas,
          repeat: 'repeat',
          patternTransform: patternMatrix(v.angle, tile.dpr)
        }));
        if (v.opacite < 100) o.set('opacity', v.opacite / 100);
        o.setCoords();
        touched++;
      });
      if (!touched) {
        api.toast('La sélection n’accepte pas de remplissage', true);
        return;
      }
      api.commit('Motif sur la sélection');
      api.toast('Motif appliqué à ' + touched + ' objet' + (touched > 1 ? 's' : ''));
      return;
    }

    var rect = new fabric.Rect({
      left: area.left,
      top: area.top,
      width: area.width,
      height: area.height,
      fill: new fabric.Pattern({
        source: tile.canvas,
        repeat: 'repeat',
        patternTransform: patternMatrix(v.angle, tile.dpr)
      }),
      stroke: null,
      opacity: v.opacite / 100
    });
    rect.birdMotif = true;
    c.add(rect);
    c.sendToBack(rect);
    c.setActiveObject(rect);
    api.commit('Motif vectoriel');
    api.toast('Motif « ' + labelOf(v.motif) + ' » posé sur le plan de travail');
    return;
  }

  /* Sortie vectorielle */
  var built = toFabricObjects(v);
  var step = built.S;
  var cols = Math.ceil(area.width / step) + 1;
  var rows = Math.ceil(area.height / step) + 1;
  var total = built.objects.length * cols * rows;
  if (total > 4000) {
    throw new Error('Motif trop dense (' + total + ' formes). Augmentez le pas ou passez en « Texture ».');
  }

  // Chaque cellule est construite à sa position finale : pas de clone(),
  // qui renvoie une promesse pour certains types Fabric.
  var placed = [];
  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      placed = placed.concat(primitivesToFabric(built.res, v, col * step, row * step));
    }
  }

  if (!placed.length) {
    api.toast('Motif vide', true);
    return;
  }

  var group = new fabric.Group(placed, {
    objectCaching: false,
    opacity: v.opacite / 100
  });
  // Rotation autour du centre de la zone cible : le motif tourne, la zone reste.
  var cx = area.left + area.width / 2;
  var cy = area.top + area.height / 2;
  group.set({ originX: 'center', originY: 'center' });
  group.set({ angle: v.angle });
  group.setPositionByOrigin(new fabric.Point(cx, cy), 'center', 'center');
  group.birdMotif = true;
  group.birdMotifLabel = labelOf(v.motif);

  if (v.cible === 'selection') {
    api.replaceSelection([group], 'Motif vectoriel');
  } else {
    c.add(group);
    c.setActiveObject(group);
    api.commit('Motif vectoriel');
  }
  api.toast('Motif vectorisé : ' + placed.length + ' formes');
}

/* ─────────────────────────────────────────────────────────────
   APERÇU DANS LE TIROIR
   ───────────────────────────────────────────────────────────── */
function preview(api, v, canvas, ctx) {
  var W = canvas.width;
  var Hh = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, Hh);

  var tile = makeTile(v, 4);
  var pat = ctx.createPattern(tile.canvas, 'repeat');
  var rad = (v.angle * Math.PI) / 180;

  ctx.save();
  ctx.translate(W / 2, Hh / 2);
  ctx.rotate(rad);
  ctx.scale(1 / tile.dpr, 1 / tile.dpr);
  ctx.fillStyle = pat;
  var span = Math.max(W, Hh) * 1.8;
  ctx.fillRect(-span, -span, span * 2, span * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, Hh - 1);

  ctx.fillStyle = 'rgba(26,26,26,.48)';
  ctx.font = '500 11px Inter, system-ui, sans-serif';
  ctx.fillText('Période ' + tile.S + ' px · raccord exact', 12, Hh - 12);
}

/* ─────────────────────────────────────────────────────────────
   MANIFESTE
   ───────────────────────────────────────────────────────────── */
BirdPlugins.register({
  id: 'motif-vectoriel',
  name: 'Motif vectoriel',
  version: '1.2.0',
  author: 'Bird',
  builtin: true,
  actifParDefaut: false,
  description: 'Textures répétées sans raccord : en un objet léger ou en vraies formes vectorielles.',
  icon: ICON,

  ui: {
    preview: true,
    fields: [
      {
        key: 'motif', label: 'Motif', type: 'select', value: 'rayures',
        options: MOTIFS
      },
      { key: 'pas', label: 'Pas du motif', type: 'range', min: 8, max: 160, step: 1, value: 40, unit: ' px', row: 1 },
      { key: 'epaisseur', label: 'Épaisseur', type: 'range', min: 1, max: 40, step: 1, value: 10, unit: ' px', row: 1 },
      { key: 'angle', label: 'Angle', type: 'range', min: 0, max: 180, step: 1, value: 0, unit: '°', row: 2 },
      { key: 'opacite', label: 'Opacité', type: 'range', min: 5, max: 100, step: 1, value: 100, unit: ' %', row: 2 },
      { key: 'fg', label: 'Motif', type: 'color', value: '#1a1a1a', row: 3 },
      { key: 'bg', label: 'Fond', type: 'color', value: '#ffffff', row: 3 },
      { key: 'fond', label: 'Fond opaque', type: 'checkbox', value: false },
      {
        key: 'sortie', label: 'Rendu', type: 'select', value: 'texture',
        options: [
          { value: 'texture', label: 'Texture · 1 objet (léger)' },
          { value: 'vecteur', label: 'Vecteur · formes empilées' }
        ]
      },
      {
        key: 'cible', label: 'Appliquer à', type: 'select', value: 'document',
        options: [
          { value: 'document', label: 'Plan de travail' },
          { value: 'selection', label: 'Sélection' }
        ]
      }
    ]
  },

  preview: preview,

  run: function (api, values) {
    var v = Object.assign({
      motif: 'rayures', pas: 40, epaisseur: 10, angle: 0, opacite: 100,
      fg: '#1a1a1a', bg: '#ffffff', fond: false, sortie: 'texture', cible: 'document'
    }, values);
    v.pas = Math.max(8, Math.min(200, Number(v.pas) || 40));
    v.epaisseur = Math.max(0.5, Number(v.epaisseur) || 10);
    v.angle = Number(v.angle) || 0;
    v.opacite = Math.max(5, Math.min(100, Number(v.opacite) || 100));
    applyValues(api, v);
  }
});

})();
