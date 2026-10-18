/* ═══════════════════════════════════════════════════════════════
   BIRD — ÉCRIVAIN PDF/X-1a (CMJN, dégradés réels, ICC)
   ═══════════════════════════════════════════════════════════════
   jsPDF + svg2pdf ne savent pas faire du PDF d'imprimerie : ils
   écrivent du RGB, remplacent les polices par Helvetica et ne
   connaissent pas les dégradés. On écrit donc le PDF nous-mêmes.

   Ce que ce module produit réellement :
     • PDF 1.3, une page, /MediaBox + /TrimBox + /BleedBox
     • couleurs /DeviceCMYK (jamais de RGB)
     • dégradés en SHADINGS (axiaux type 2, radiaux type 3) avec
       arrêts CMJN — pas de repli « première couleur »
     • /OutputIntent GTS_PDFX + /DestOutputProfile (ICC embarqué)
     • métadonnées XMP déclarant PDF/X-1a:2001
     • texte déjà vectorisé (aucune police, donc rien à embarquer)
     • images CMJN en /DeviceCMYK, compressées en Flate

   Ce qu'il ne fait pas, et qu'on dit au lieu de le simuler :
   la transparence. PDF/X-1a:2001 l'interdit. L'opacité est donc
   fondue dans les composantes CMJN (exact sur un aplat opaque).
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ────────────────────────────────────────────────────────────
   ÉCRITURE BAS NIVEAU
──────────────────────────────────────────────────────────── */
function Bytes() { this.parts = []; this.length = 0; }
Bytes.prototype.push = function (v) {
  var b = v instanceof Uint8Array ? v : toBytes(v);
  this.parts.push(b);
  this.length += b.length;
  return this;
};
Bytes.prototype.bytes = function () {
  var out = new Uint8Array(this.length);
  var at = 0;
  this.parts.forEach(function (p) { out.set(p, at); at += p.length; });
  return out;
};

function toBytes(value) {
  if (typeof value === 'string') {
    var out = new Uint8Array(value.length);
    for (var i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xFF;
    return out;
  }
  return new Uint8Array(value);
}

function num(v, d) {
  if (!isFinite(v)) v = 0;
  var r = Math.round(v * 1000) / 1000;
  return String(r);
}

function pdfString(s) {
  return '(' + String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
}

function pdfDate(d) {
  d = d || new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  var off = -d.getTimezoneOffset();
  var sign = off >= 0 ? '+' : '-';
  off = Math.abs(off);
  return 'D:' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
    sign + p(Math.floor(off / 60)) + "'" + p(off % 60) + "'";
}

/* ────────────────────────────────────────────────────────────
   FLATE (CompressionStream natif, repli sans filtre)
──────────────────────────────────────────────────────────── */
async function flate(data) {
  if (typeof CompressionStream === 'undefined') return { data: data, filter: null };
  try {
    var stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
    var out = new Uint8Array(await new Response(stream).arrayBuffer());
    return { data: out, filter: '/Filter /FlateDecode' };
  } catch (e) {
    return { data: data, filter: null };
  }
}

/* ────────────────────────────────────────────────────────────
   CONVERSION DE COULEUR
──────────────────────────────────────────────────────────── */
var col = function () { return global.BirdColor; };

function paperColorToRgb(c) {
  if (!c) return null;
  var comps = c.components || [0, 0, 0];
  var a = typeof c.alpha === 'number' ? c.alpha : 1;
  // Les couleurs Paper.js vont de 0 à 1.
  return {
    r: Math.round(Math.max(0, Math.min(1, comps[0])) * 255),
    g: Math.round(Math.max(0, Math.min(1, comps[1])) * 255),
    b: Math.round(Math.max(0, Math.min(1, comps[2])) * 255),
    a: a
  };
}

function makeConverter(options) {
  var gcr = options && typeof options.gcr === 'number' ? options.gcr : 0.6;
  var inkLimit = options && typeof options.inkLimit === 'number' ? options.inkLimit : 3.0;
  return function (rgb, opacity) {
    var cmyk = col().rgbToCmyk(rgb.r, rgb.g, rgb.b, { gcr: gcr, inkLimit: inkLimit });
    var alpha = (typeof rgb.a === 'number' ? rgb.a : 1) * (typeof opacity === 'number' ? opacity : 1);
    return col().flattenOpacity(cmyk, alpha, [0, 0, 0, 0]);
  };
}

function cmykOp(cmyk, stroke) {
  return num(cmyk[0]) + ' ' + num(cmyk[1]) + ' ' + num(cmyk[2]) + ' ' + num(cmyk[3]) +
    ' ' + (stroke ? 'K' : 'k');
}

/* ────────────────────────────────────────────────────────────
   GÉOMÉTRIE → OPÉRATEURS PDF
   Paper.js donne des segments (point + poignées) qui se traduisent
   exactement en opérateurs m / l / c / h.
──────────────────────────────────────────────────────────── */
function mulMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function paperMatrixToArray(m) {
  return [m.a, m.b, m.c, m.d, m.tx, m.ty];
}

function globalMatrix(item) {
  var node = item, m = [1, 0, 0, 1, 0, 0];
  while (node) {
    m = mulMatrix(paperMatrixToArray(node.matrix), m);
    node = node.parent;
  }
  return m;
}

function applyPoint(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function pathToOps(path, m, pageHeight) {
  var segs = path.segments;
  if (!segs || !segs.length) return { ops: '', start: null };

  // Passage en coordonnées PDF : y vers le haut, origine en bas.
  var flip = mulMatrix([1, 0, 0, -1, 0, pageHeight], m);
  var pt = function (p) { var q = applyPoint(flip, p); return num(q.x) + ' ' + num(q.y); };
  var abs = function (seg, handle) {
    return { x: seg.point.x + handle.x, y: seg.point.y + handle.y };
  };
  var hasIn = function (s) { return s.handleIn && s.handleIn.length > 1e-9; };
  var hasOut = function (s) { return s.handleOut && s.handleOut.length > 1e-9; };

  var ops = [];
  var first = segs[0];
  ops.push(pt(first.point) + ' m');
  var startPoint = pt(first.point);

  for (var i = 1; i < segs.length; i++) {
    var prev = segs[i - 1], cur = segs[i];
    if (!hasIn(cur) && !hasOut(prev)) {
      ops.push(pt(cur.point) + ' l');
    } else {
      ops.push(
        pt(abs(prev, prev.handleOut || { x: 0, y: 0 })) + ' ' +
        pt(abs(cur, cur.handleIn || { x: 0, y: 0 })) + ' ' +
        pt(cur.point) + ' c'
      );
    }
  }
  if (path.closed && segs.length > 1) {
    var last = segs[segs.length - 1];
    if (hasIn(first) || hasOut(last)) {
      ops.push(
        pt(abs(last, last.handleOut || { x: 0, y: 0 })) + ' ' +
        pt(abs(first, first.handleIn || { x: 0, y: 0 })) + ' ' +
        startPoint + ' c'
      );
    }
    ops.push('h');
  }
  return { ops: ops.join('\n'), segments: segs };
}

/* Boîte englobante en coordonnées PDF. `flatPaths` = [{path, matrix}]. */
function pathBounds(flatPaths, pageHeight) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  flatPaths.forEach(function (entry) {
    var path = entry.path || entry;
    var m = entry.matrix || [1, 0, 0, 1, 0, 0];
    var flip = mulMatrix([1, 0, 0, -1, 0, pageHeight], m);
    (path.segments || []).forEach(function (s) {
      var p = applyPoint(flip, s.point);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
  });
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) };
}

/* ────────────────────────────────────────────────────────────
   DÉGRADÉS → SHADINGS PDF
   Type 2 (axial) et type 3 (radial).

   La rampe CMJN est décrite par QUATRE fonctions indépendantes (une
   par canal de DeviceCMYK), passées en tableau à /Function — forme
   explicitement prévue par la spec et bien mieux acceptée par les
   RIP d'imprimeurs qu'une fonction échantillonnée.

   • 2 arrêts  → une FunctionType 2 par canal (C0, C1).
   • N arrêts  → une FunctionType 3 « stitching » qui enchaîne les
                 segments ; Bounds = les arrêts intermédiaires.
──────────────────────────────────────────────────────────── */
function shadingObjects(gradient, bounds, convert, store) {
  var stops = (gradient.stops || []).slice();
  if (!stops.length) return null;
  stops.sort(function (a, b) { return a.offset - b.offset; });
  if (stops.length === 1) return null;

  var cmyks = stops.map(function (s) {
    var rgb = paperColorToRgb(s.color);
    return convert(rgb, 1);
  });

  // Une seule couleur après fusion → aplat, pas de shading.
  var flat = cmyks.every(function (c) {
    return Math.abs(c[0] - cmyks[0][0]) < 1e-4 && Math.abs(c[1] - cmyks[0][1]) < 1e-4 &&
      Math.abs(c[2] - cmyks[0][2]) < 1e-4 && Math.abs(c[3] - cmyks[0][3]) < 1e-4;
  });
  if (flat) return null;

  // Normalise les offsets (croissants, dans [0,1]).
  var offsets = stops.map(function (s, i) {
    var o = Number(s.offset);
    if (!isFinite(o)) o = i / Math.max(1, stops.length - 1);
    return Math.max(0, Math.min(1, o));
  });
  for (var i = 1; i < offsets.length; i++) {
    if (offsets[i] < offsets[i - 1]) offsets[i] = offsets[i - 1];
  }

  var channelRefs = [];
  for (var ch = 0; ch < 4; ch++) {
    if (stops.length === 2) {
      channelRefs.push(store.add('<< /FunctionType 2 /Domain [0 1] /C0 [' +
        num(cmyks[0][ch]) + '] /C1 [' + num(cmyks[1][ch]) + '] /N 1 >>', 'fn'));
      continue;
    }
    // Une sous-fonction par segment.
    var subs = [];
    for (var s = 0; s < cmyks.length - 1; s++) {
      subs.push(store.add('<< /FunctionType 2 /Domain [0 1] /C0 [' +
        num(cmyks[s][ch]) + '] /C1 [' + num(cmyks[s + 1][ch]) + '] /N 1 >>', 'fn'));
    }
    var boundsArr = offsets.slice(1, offsets.length - 1);
    // Bounds doit être strictement croissant et de longueur n-2.
    var encodeArr = [];
    for (var e = 0; e < subs.length; e++) encodeArr.push('0 1');
    channelRefs.push(store.add('<< /FunctionType 3 /Domain [0 1] ' +
      '/Functions [' + subs.join(' ') + '] ' +
      '/Bounds [' + boundsArr.map(num).join(' ') + '] ' +
      '/Encode [' + encodeArr.join(' ') + '] >>', 'fn'));
  }

  var fnArray = '[' + channelRefs.join(' ') + ']';
  var isRadial = gradient.gradientType === 'radial';
  var g0 = gradient.origin, g1 = gradient.destination;
  var dict;

  if (isRadial) {
    dict = '<< /ShadingType 3 /ColorSpace /DeviceCMYK /Coords [' +
      num(bounds.cx) + ' ' + num(bounds.cy) + ' 0 ' +
      num(bounds.cx) + ' ' + num(bounds.cy) + ' ' + num(bounds.radius) +
      '] /Function ' + fnArray + ' /Extend [true true] >>';
  } else {
    dict = '<< /ShadingType 2 /ColorSpace /DeviceCMYK /Coords [' +
      num(bounds.x0) + ' ' + num(bounds.y0) + ' ' + num(bounds.x1) + ' ' + num(bounds.y1) +
      '] /Function ' + fnArray + ' /Extend [true true] >>';
  }
  return { dict: dict };
}

/* ────────────────────────────────────────────────────────────
   IMAGES → XOBJECT CMJN
──────────────────────────────────────────────────────────── */
function imageToCmyk(xobj) {
  var width = xobj.width, height = xobj.height;
  var data = new Uint8Array(width * height * 4);
  var at = 0;
  for (var i = 0; i < xobj.data.length; i += 4) {
    var cmyk = col().rgbToCmyk(xobj.data[i], xobj.data[i + 1], xobj.data[i + 2], { gcr: 0.6 });
    // PDF attend les octets de 0 (aucune encre) à 255 (pleine encre).
    data[at++] = Math.round(cmyk[0] * 255);
    data[at++] = Math.round(cmyk[1] * 255);
    data[at++] = Math.round(cmyk[2] * 255);
    data[at++] = Math.round(cmyk[3] * 255);
  }
  return data;
}

/* ────────────────────────────────────────────────────────────
   DOCUMENT
──────────────────────────────────────────────────────────── */
function Store() { this.objects = []; this.next = 1; }
Store.prototype.add = function (body, kind) {
  var id = this.next++;
  this.objects.push({ id: id, body: body, kind: kind || 'raw' });
  return id + ' 0 R';
};
Store.prototype.addStream = function (dictEntries, streamBytes, filter) {
  var id = this.next++;
  this.objects.push({
    id: id,
    kind: 'stream',
    dict: '/Length ' + streamBytes.length + (filter ? ' ' + filter : '') +
      (dictEntries ? ' ' + dictEntries : ''),
    stream: streamBytes
  });
  return id + ' 0 R';
};

async function build(options) {
  options = options || {};
  var pageW = Math.max(1, Number(options.width) || 1);
  var pageH = Math.max(1, Number(options.height) || 1);
  var bleed = Math.max(0, Number(options.bleed) || 0);
  var convert = makeConverter(options.cmyk || {});
  var store = new Store();
  var content = [];
  var usedShadings = [];

  // ── Fond du plan de travail (aplat CMJN, jamais RGB) ──
  var bgHex = options.background;
  if (bgHex && bgHex !== 'transparent') {
    var rgb = col().hexToRgb(bgHex);
    if (rgb) {
      var cmyk = convert({ r: rgb.r, g: rgb.g, b: rgb.b, a: 1 }, 1);
      content.push('q\n' + cmykOp(cmyk) + '\n' +
        num(-bleed) + ' ' + num(-bleed) + ' ' +
        num(pageW + bleed * 2) + ' ' + num(pageH + bleed * 2) + ' re f\nQ');
    }
  }

  // ── Contenu vectoriel ──
  var items = options.items || [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i];
    if (!entry || !entry.paths || !entry.paths.length) continue;
    var chunk = emitEntry(entry, { pageH: pageH, convert: convert, store: store }, usedShadings);
    if (chunk) content.push(chunk);
  }

  // ── Images ──
  var images = options.images || [];
  var imageRefs = [];
  for (var k = 0; k < images.length; k++) {
    var img = images[k];
    try {
      var cmykBytes = imageToCmyk(img);
      var packed = await flate(cmykBytes);
      var ref = store.addStream(
        '/Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height +
        ' /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Interpolate false',
        packed.data, packed.filter);
      imageRefs.push({ ref: ref, item: img });
      content.push('q\n' +
        num(img.matrix[0]) + ' ' + num(img.matrix[1]) + ' ' + num(img.matrix[2]) + ' ' +
        num(img.matrix[3]) + ' ' + num(img.matrix[4]) + ' ' + num(img.matrix[5]) + ' cm\n' +
        '/' + ref.replace(' 0 R', '') + ' Do\nQ');
    } catch (e) {
      console.warn('[Bird PDF/X] image ignorée', e);
    }
  }

  var contentStream = toBytes(content.join('\n'));

  // ── Ressources ──
  var shadingRes = usedShadings.map(function (s, idx) { return '/Sh' + idx + ' ' + s; }).join(' ');
  var xobjRes = imageRefs.map(function (r, idx) { return '/Im' + idx + ' ' + r.ref; }).join(' ');
  var resources = '<< /ProcSet [/PDF]' +
    (shadingRes ? ' /Shading << ' + shadingRes + ' >>' : '') +
    (xobjRes ? ' /XObject << ' + xobjRes + ' >>' : '') + ' >>';

  // ── ICC de sortie ──
  var iccBytes = options.icc && options.icc.bytes
    ? options.icc.bytes
    : col().buildProfile({ name: 'Bird CMYK', colorspace: 'CMYK' });
  var iccName = (options.icc && options.icc.name) || 'Bird CMYK (générique)';
  var iccPacked = await flate(iccBytes);
  var iccRef = store.addStream('/N 4', iccPacked.data, iccPacked.filter);

  // ── XMP : la déclaration PDF/X ──
  var now = pdfDate();
  var xmp = '<?xpacket begin="ï»¿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
    '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + escapeXml(options.title || 'Bird') + '</rdf:li></rdf:Alt></dc:title>\n' +
    '<dc:creator><rdf:Seq><rdf:li>' + escapeXml(options.author || 'Bird') + '</rdf:li></rdf:Seq></dc:creator>\n' +
    '</rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n' +
    '<xmp:CreatorTool>Bird — éditeur vectoriel</xmp:CreatorTool>\n' +
    '<xmp:CreateDate>' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</xmp:CreateDate>\n' +
    '<xmp:ModifyDate>' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</xmp:ModifyDate>\n' +
    '</rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">\n' +
    '<pdf:Producer>Bird PDF/X writer</pdf:Producer>\n' +
    '</rdf:Description>\n' +
    '<rdf:Description rdf:about="" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/">\n' +
    '<pdfx:GTS_PDFXVersion>PDF/X-1a:2001</pdfx:GTS_PDFXVersion>\n' +
    '<pdfx:GTS_PDFXConformance>PDF/X-1a:2001</pdfx:GTS_PDFXConformance>\n' +
    '<pdfx:Trapped>False</pdfx:Trapped>\n' +
    '</rdf:Description>\n' +
    '</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';
  var xmpBytes = toBytes(xmp);
  // XMP non compressé : certains valideurs PDF/X lisent le paquet en clair.
  var xmpRef = store.addStream('/Type /Metadata /Subtype /XML', xmpBytes, null);

  // ── Objets fixes ──
  var contentRef = store.addStream(null, contentStream, null);

  var trimBox = '[0 0 ' + num(pageW) + ' ' + num(pageH) + ']';
  var bleedBox = '[' + num(-bleed) + ' ' + num(-bleed) + ' ' +
    num(pageW + bleed) + ' ' + num(pageH + bleed) + ']';

  var pageDict = '<< /Type /Page /Parent PAGES_REF 0 R ' +
    '/MediaBox ' + bleedBox + ' ' +
    '/CropBox ' + bleedBox + ' ' +
    '/BleedBox ' + bleedBox + ' ' +
    '/TrimBox ' + trimBox + ' ' +
    '/ArtBox ' + trimBox + ' ' +
    '/Resources ' + resources + ' ' +
    '/Contents ' + contentRef + ' >>';

  var outputIntent = '<< /Type /OutputIntent /S /GTS_PDFX ' +
    '/OutputConditionIdentifier ' + pdfString(iccName) + ' ' +
    '/OutputCondition ' + pdfString(iccName) + ' ' +
    '/RegistryName ' + pdfString('http://www.color.org') + ' ' +
    '/Info ' + pdfString(iccName) + ' ' +
    '/DestOutputProfile ' + iccRef + ' >>';

  var pagesRef = store.add('placeholder');
  var pageRef = store.add(pageDict.replace('PAGES_REF', pagesRef.replace(' 0 R', '')));

  var infoRef = store.add(
    '<< /Title ' + pdfString(options.title || 'Bird') + ' ' +
    '/Creator ' + pdfString('Bird — éditeur vectoriel') + ' ' +
    '/Producer ' + pdfString('Bird PDF/X writer') + ' ' +
    '/CreationDate ' + pdfString(now) + ' ' +
    '/ModDate ' + pdfString(now) + ' ' +
    '/Trapped /False >>');

  var catalogRef = store.add(
    '<< /Type /Catalog /Pages ' + pagesRef + ' ' +
    '/OutputIntents [' + outputIntent + '] ' +
    '/Metadata ' + xmpRef + ' ' +
    '/Version /1.3 >>');

  // Le placeholder devient la vraie arborescence de pages.
  var pagesObj = store.objects.find(function (o) { return o.id === Number(pagesRef.replace(' 0 R', '')); });
  pagesObj.body = '<< /Type /Pages /Kids [' + pageRef + '] /Count 1 >>';

  return serialize(store, catalogRef, infoRef);
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* Émet une entrée (un objet converti) : remplissage, contour, dégradé.
   `entry.paths` = [{ path, matrix }] où matrix est la matrice GLOBALE du
   chemin (racine → chemin) : sans elle, les transformations imbriquées
   (groupe tourné contenant une forme décalée) seraient perdues. */
function emitEntry(entry, ctx, usedShadings) {
  var out = [];
  var opacity = typeof entry.opacity === 'number' ? entry.opacity : 1;
  if (opacity <= 0.001) return '';

  var pathOps = [];
  var flatPaths = [];
  entry.paths.forEach(function (p) {
    var m = mulMatrix(entry.matrix || [1, 0, 0, 1, 0, 0], p.matrix || [1, 0, 0, 1, 0, 0]);
    var r = pathToOps(p.path, m, ctx.pageH);
    if (r.ops) {
      pathOps.push(r.ops);
      flatPaths.push({ path: p.path, matrix: m });
    }
  });
  if (!pathOps.length) return '';
  var geometry = pathOps.join('\n');

  var fill = entry.fill;
  var stroke = entry.stroke;
  var evenOdd = entry.fillRule === 'evenodd';

  // ── Dégradé : on écrête la forme, puis on peint le shading ──
  if (fill && fill.gradient) {
    var bounds = shadingBounds(fill.gradient, flatPaths, ctx.pageH);
    var shading = bounds ? shadingObjects(fill.gradient, bounds, ctx.convert, ctx.store) : null;
    if (shading) {
      var shRef = ctx.store.add(shading.dict, 'shading');
      usedShadings.push(shRef);
      // Le nom de ressource est /Sh<index>, celui du dictionnaire /Shading.
      var shName = '/Sh' + (usedShadings.length - 1);
      out.push('q\n' + geometry + '\n' + (evenOdd ? 'W*' : 'W') + ' n\n' + shName + ' sh\nQ');
      fill = null;
    } else {
      // Dégradé fusionné en une seule couleur : on prend l'arrêt du milieu.
      var mid = (fill.gradient.stops && fill.gradient.stops.length)
        ? fill.gradient.stops[Math.floor(fill.gradient.stops.length / 2)].color
        : fill.color;
      fill = { color: mid };
    }
  }

  var ops = [];
  if (fill && fill.color) {
    var f = ctx.convert(paperColorToRgb(fill.color), opacity);
    ops.push(cmykOp(f, false));
  }
  if (stroke && stroke.color) {
    var s = ctx.convert(paperColorToRgb(stroke.color), opacity);
    ops.push(cmykOp(s, true));
    ops.push(num(stroke.width || 1) + ' w');
    if (stroke.cap) ops.push({ butt: '0 J', round: '1 J', square: '2 J' }[stroke.cap] || '0 J');
    if (stroke.join) ops.push({ miter: '0 j', round: '1 j', bevel: '2 j' }[stroke.join] || '0 j');
    if (stroke.miterLimit) ops.push(num(stroke.miterLimit) + ' M');
    if (stroke.dash && stroke.dash.length) {
      ops.push('[' + stroke.dash.map(function (d) { return num(d); }).join(' ') + '] 0 d');
    }
  }

  var paint = '';
  if (fill && fill.color && stroke && stroke.color) paint = evenOdd ? 'B*' : 'B';
  else if (fill && fill.color) paint = evenOdd ? 'f*' : 'f';
  else if (stroke && stroke.color) paint = 'S';
  else return out.join('\n');

  ops.push(geometry);
  ops.push(paint);
  out.push('q\n' + ops.join('\n') + '\nQ');
  return out.join('\n');
}

/* Géométrie du shading : l'axe du dégradé est exprimé dans le repère du
   chemin, on le reprojette donc avec la même matrice que la géométrie. */
function shadingBounds(gradient, flatPaths, pageH) {
  var box = pathBounds(flatPaths, pageH);
  if (!box) return null;
  var base = flatPaths[0] ? flatPaths[0].matrix : [1, 0, 0, 1, 0, 0];
  var flip = mulMatrix([1, 0, 0, -1, 0, pageH], base);
  var g0 = gradient.origin, g1 = gradient.destination;

  if (gradient.gradientType === 'radial') {
    var centre = g0 ? applyPoint(flip, g0) : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    var radius = 0;
    if (g0 && g1) {
      var p1 = applyPoint(flip, g1);
      radius = Math.sqrt(Math.pow(p1.x - centre.x, 2) + Math.pow(p1.y - centre.y, 2));
    }
    // Paper.js ne conserve pas toujours le rayon d'un <radialGradient> :
    // un rayon dérisoire par rapport à la forme est un signe d'absence.
    var minUseful = Math.max(box.width, box.height) / 10;
    if (!(radius > minUseful)) radius = Math.max(box.width, box.height) / 2;
    return { cx: centre.x, cy: centre.y, radius: radius, x0: centre.x, y0: centre.y, x1: centre.x, y1: centre.y };
  }

  var a = g0 ? applyPoint(flip, g0) : { x: box.x, y: box.y };
  var b = g1 ? applyPoint(flip, g1) : { x: box.x + box.width, y: box.y };
  if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) {
    b = { x: a.x + box.width, y: a.y };
  }
  return {
    x0: a.x, y0: a.y, x1: b.x, y1: b.y,
    cx: box.x + box.width / 2, cy: box.y + box.height / 2,
    radius: Math.max(box.width, box.height) / 2,
    x: box.x, y: box.y, width: box.width, height: box.height
  };
}

/* ────────────────────────────────────────────────────────────
   SÉRIALISATION
──────────────────────────────────────────────────────────── */
function serialize(store, catalogRef, infoRef) {
  var parts = new Bytes();
  parts.push('%PDF-1.3\n%\xE2\xE3\xCF\xD3\n');

  var offsets = {};
  store.objects.sort(function (a, b) { return a.id - b.id; });
  store.objects.forEach(function (obj) {
    offsets[obj.id] = parts.length;
    if (obj.kind === 'stream') {
      parts.push(obj.id + ' 0 obj\n<< ' + obj.dict + ' >>\nstream\n');
      parts.push(obj.stream);
      parts.push('\nendstream\nendobj\n');
    } else {
      parts.push(obj.id + ' 0 obj\n' + obj.body + '\nendobj\n');
    }
  });

  var xrefAt = parts.length;
  var maxId = store.objects.length ? store.objects[store.objects.length - 1].id : 0;
  var xref = 'xref\n0 ' + (maxId + 1) + '\n0000000000 65535 f \n';
  for (var i = 1; i <= maxId; i++) {
    var off = offsets[i];
    if (off === undefined) xref += '0000000000 65535 f \n';
    else xref += String(off).padStart(10, '0') + ' 00000 n \n';
  }
  parts.push(xref);
  parts.push('trailer\n<< /Size ' + (maxId + 1) + ' /Root ' + catalogRef +
    ' /Info ' + infoRef + ' /ID [<' + randomId() + '> <' + randomId() + '>] >>\n');
  parts.push('startxref\n' + xrefAt + '\n%%EOF\n');
  return parts.bytes();
}

function randomId() {
  var s = '';
  for (var i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/* ────────────────────────────────────────────────────────────
   API
──────────────────────────────────────────────────────────── */
global.BirdPDFX = {
  version: '1.0.0',
  build: build,
  /**
   * Convertit des items Paper.js en entrées normalisées pour `build`.
   * Les matrices sont calculées ici, une fois, pour que l'écrivain PDF
   * n'ait jamais à remonter l'arbre.
   */
  itemsFromPaper: function (paperItems) {
    var out = [];
    (paperItems || []).forEach(function (item) {
      collectItem(item, out);
    });
    return out;
  }
};

/* Ramène n'importe quel item Paper.js à un Path exploitable.
   Paper importe <rect> en `Shape`, <circle> en `Circle`, <ellipse> en
   `Ellipse`… : se fier à `className === 'Path'` laissait passer toutes
   les formes de base. On teste donc la présence de `segments`, puis on
   convertit les Shape en Path. */
function asPath(item) {
  if (!item) return null;
  if (item.segments && item.segments.length) return item;
  if (typeof item.toPath === 'function') {
    try {
      var p = item.toPath(false);
      if (p && p.segments && p.segments.length) return p;
    } catch (e) { /* forme non convertible */ }
  }
  return null;
}

function collectItem(item, out) {
  if (!item) return;
  var cls = item.className;

  if (cls === 'Group' || cls === 'Layer') {
    (item.children || []).forEach(function (child) { collectItem(child, out); });
    return;
  }

  if (cls === 'CompoundPath') {
    var paths = [];
    (item.children || []).forEach(function (child) {
      var p = asPath(child);
      if (p) paths.push({ path: p, matrix: globalMatrix(p) });
    });
    if (!paths.length) return;
    out.push({
      paths: paths,
      matrix: [1, 0, 0, 1, 0, 0],
      fill: item.fillColor
        ? (item.fillColor.gradient
          ? { gradient: item.fillColor.gradient, rule: item.fillRule }
          : { color: item.fillColor, rule: item.fillRule })
        : null,
      stroke: item.strokeColor ? strokeOf(item) : null,
      opacity: item.opacity === undefined ? 1 : item.opacity
    });
    return;
  }

  var path = asPath(item);
  if (!path) return;   // TextItem, Raster, PointText : rien à écrire ici

  var fill = null;
  if (item.fillColor) {
    fill = item.fillColor.gradient
      ? { gradient: item.fillColor.gradient, rule: item.fillRule }
      : { color: item.fillColor, rule: item.fillRule };
  }
  out.push({
    paths: [{ path: path, matrix: globalMatrix(path) }],
    matrix: [1, 0, 0, 1, 0, 0],
    fill: fill,
    stroke: item.strokeColor ? strokeOf(item) : null,
    opacity: item.opacity === undefined ? 1 : item.opacity
  });
}

function strokeOf(item) {
  return {
    color: item.strokeColor,
    width: item.strokeWidth,
    cap: item.strokeCap,
    join: item.strokeJoin,
    miterLimit: item.miterLimit,
    dash: item.dashArray
  };
}

})(window);
