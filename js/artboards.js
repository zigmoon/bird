/* ═══════════════════════════════════════════════════════════════
   BIRD — ANNOTATION DES PLANS DE TRAVAIL
   ═══════════════════════════════════════════════════════════════
   Un plan de travail porte un NUMÉRO, dessiné juste à côté du cadre en
   pointillé. Ce numéro n'existe pas dans le document : il est peint sur le
   contexte du canvas après les objets, donc il ne part ni dans le SVG ni
   dans le PDF, et l'export raster le désactive explicitement.

   Le module ne connaît ni Fabric ni l'état de l'application : il reçoit un
   rectangle en pixels CSS et dessine. Toute la géométrie de hit-test est
   ici aussi, pour que la zone cliquable soit exactement la zone peinte —
   deux calculs séparés finissent toujours par diverger.

   La DA est strictement monochrome : le plan sélectionné est noir, l'autre
   est blanc bordé de gris. Aucune teinte, y compris pour l'état actif.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* Taille du badge, en pixels CSS : fixe. Un badge qui suit le zoom devient
   illisible à 12 % et envahissant à 800 %. */
var BADGE_W = 24;
var BADGE_H = 18;
var BADGE_GAP = 5;      // écart entre le badge et le coin du cadre
var BADGE_HIT_PAD = 5;  // marge de clic autour du badge : la cible est petite
var FRAME_HIT = 7;      // tolérance de clic sur le cadre, en px CSS

var INK = '#1a1a1a';
var PAPER = '#ffffff';

/* Le badge suit le thème : sur un canevas sombre, un cartouche noir serait
   invisible. Les deux jetons s'échangent, exactement comme le reste de
   l'interface — aucune teinte n'entre ici. */
function palette(geo) {
  var ink = geo && geo.ink ? geo.ink : INK;
  var paper = geo && geo.paper ? geo.paper : PAPER;
  return { ink: ink, paper: paper };
}

/* Le nombre de plans peut dépasser 9 : « 12 » doit tenir dans la même
   boîte, sinon les badges changent de largeur d'un plan à l'autre et le
   repère visuel saute. On élargit donc la boîte, jamais le texte. */
function badgeWidthFor(label) {
  var digits = String(label || '').length;
  return digits <= 2 ? BADGE_W : BADGE_W + (digits - 2) * 7;
}

function badgeRectFor(rect, label) {
  var w = badgeWidthFor(label);
  return {
    x: rect.left - w - BADGE_GAP,
    y: rect.top - BADGE_H - BADGE_GAP,
    width: w,
    height: BADGE_H
  };
}

/**
 * Peint le cadre de sélection et le numéro du plan.
 *
 * @param {CanvasRenderingContext2D} ctx  contexte du canvas bas, en pixels
 *        PHYSIQUES : la fonction remet le repère à zéro puis applique le
 *        facteur d'écran, donc elle dessine en pixels CSS quoi qu'il arrive.
 * @param {object} geo  { left, top, width, height, index, count, selected, dpr, font }
 */
function paint(ctx, geo) {
  if (!ctx || !geo || !geo.width || !geo.height) return;
  var dpr = geo.dpr > 0 ? geo.dpr : 1;
  var label = String((geo.index | 0) + 1);
  var pal = palette(geo);

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  /* Le cadre sélectionné est tracé PLEIN et doublé d'équerres : le
     pointillé reste le signe du format, le plein celui de la sélection.
     On ne réutilise pas le cadre de _renderBackground — il est déjà peint,
     sous les objets, et le trait de sélection doit passer devant. */
  if (geo.selected) {
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.strokeRect(geo.left, geo.top, geo.width, geo.height);
    drawCorners(ctx, geo, pal);
  }

  var box = badgeRectFor(geo, label);
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.fillStyle = geo.selected ? pal.ink : pal.paper;
  ctx.fill();
  ctx.lineWidth = 1;
  if (geo.selected) {
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
  } else {
    // Bord à 45 % : assez pour détacher le cartouche du fond, assez discret
    // pour ne pas devenir un cadre de sélection.
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = pal.ink;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = geo.selected ? pal.paper : pal.ink;
  ctx.font = '600 11px ' + (geo.font || '"IBM Plex Mono", monospace');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  /* +0,5 : le milieu optique d'une capitale monospace est légèrement
     au-dessus du milieu géométrique de la boîte. */
  ctx.fillText(label, box.x + box.width / 2, box.y + box.height / 2 + 0.5);

  ctx.restore();
}

function drawCorners(ctx, geo, pal) {
  var s = 6;
  var pts = [
    [geo.left, geo.top],
    [geo.left + geo.width, geo.top],
    [geo.left, geo.top + geo.height],
    [geo.left + geo.width, geo.top + geo.height]
  ];
  ctx.fillStyle = pal.paper;
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1;
  for (var i = 0; i < pts.length; i++) {
    ctx.beginPath();
    ctx.rect(pts[i][0] - s / 2, pts[i][1] - s / 2, s, s);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Que trouve-t-on sous ce point ? 'badge' | 'frame' | null.
 * Les coordonnées sont celles du canvas en px CSS (voir canvasPointFromEvent).
 */
function hitTest(geo, x, y) {
  if (!geo || !geo.width || !geo.height) return null;
  var box = badgeRectFor(geo, String((geo.index | 0) + 1));
  if (x >= box.x - BADGE_HIT_PAD && x <= box.x + box.width + BADGE_HIT_PAD &&
      y >= box.y - BADGE_HIT_PAD && y <= box.y + box.height + BADGE_HIT_PAD) return 'badge';

  var left = geo.left, top = geo.top;
  var right = geo.left + geo.width, bottom = geo.top + geo.height;
  var nearX = (x >= left - FRAME_HIT && x <= right + FRAME_HIT);
  var nearY = (y >= top - FRAME_HIT && y <= bottom + FRAME_HIT);
  var onLeft = Math.abs(x - left) <= FRAME_HIT;
  var onRight = Math.abs(x - right) <= FRAME_HIT;
  var onTop = Math.abs(y - top) <= FRAME_HIT;
  var onBottom = Math.abs(y - bottom) <= FRAME_HIT;
  if (nearX && nearY && (onLeft || onRight || onTop || onBottom)) return 'frame';
  return null;
}

global.BirdArtboards = {
  paint: paint,
  hitTest: hitTest,
  badgeRectFor: badgeRectFor,
  FRAME_HIT: FRAME_HIT
};

})(window);
