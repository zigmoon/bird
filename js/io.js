/* ═══════════════════════════════════════════════════════════════
   BIRD IO — moteurs d'échange vectoriel
   • SVG        : nettoyage / sécurisation, dimensions
   • PDF / AI   : import vectoriel via pdf.js (chemins, clips, texte,
                  images, couleurs, opacité) → SVG éditable
   • PDF        : export vectoriel via svg2pdf + jsPDF
   • EPS / AI8  : import PostScript via le moteur SPEps
   Les bibliothèques lourdes (pdf.js, jsPDF, svg2pdf) sont chargées
   à la demande : le démarrage de l'éditeur reste instantané.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var BirdIO = {};
BirdIO.version = '2.0.0';
BirdIO.libBase = global.BIRD_ASSET_BASE || 'js/';

/* ────────────────────────────────────────────────────────────
   OUTILS GÉNÉRAUX
──────────────────────────────────────────────────────────── */
function round(n) {
  if (!isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function escapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeAttr(s) { return escapeXml(s); }

function clampNum(v, a, b) { return Math.min(b, Math.max(a, v)); }

function asUint8(data) {
  if (!data) return null;
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data && data.buffer) return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength);
  return null;
}

function asciiAt(bytes, pos, len) {
  var s = '';
  for (var i = 0; i < len && pos + i < bytes.length; i++) s += String.fromCharCode(bytes[pos + i]);
  return s;
}

function base64FromBytes(bytes) {
  var chunk = 0x8000, out = '';
  for (var i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(out);
}

/* ────────────────────────────────────────────────────────────
   CHARGEMENT PARESSEUX DES BIBLIOTHÈQUES
──────────────────────────────────────────────────────────── */
var _libPromises = {};
function loadScript(url) {
  if (_libPromises[url]) return _libPromises[url];
  _libPromises[url] = new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[data-bird-lib="' + url + '"]');
    if (existing && existing.dataset.loaded === '1') { resolve(); return; }
    var s = existing || document.createElement('script');
    if (!existing) {
      s.src = url;
      s.async = true;
      s.dataset.birdLib = url;
    }
    s.addEventListener('load', function () { s.dataset.loaded = '1'; resolve(); });
    s.addEventListener('error', function () { reject(new Error('Chargement impossible : ' + url)); });
    if (!existing) document.head.appendChild(s);
  });
  return _libPromises[url];
}

function absoluteLib(name) {
  try { return new URL(BirdIO.libBase + name, document.baseURI).toString(); }
  catch (e) { return BirdIO.libBase + name; }
}

function ensureLib(key) {
  if (key === 'pdf') {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    return loadScript(absoluteLib('pdf.min.js')).then(function () {
      var lib = global.pdfjsLib;
      if (!lib) throw new Error('pdf.js indisponible');
      lib.GlobalWorkerOptions.workerSrc = absoluteLib('pdf.worker.min.js');
      return lib;
    });
  }
  if (key === 'svg2pdf') {
    // Le build UMD de svg2pdf cible l'API jsPDF (window.jspdf).
    return ensureLib('jspdf').then(function () {
      if (global.svg2pdf && global.svg2pdf.svg2pdf) return global.svg2pdf;
      return loadScript(absoluteLib('svg2pdf.umd.min.js')).then(function () {
        if (!global.svg2pdf || !global.svg2pdf.svg2pdf) throw new Error('svg2pdf indisponible');
        return global.svg2pdf;
      });
    });
  }
  if (key === 'jspdf') {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf);
    return loadScript(absoluteLib('jspdf.umd.min.js')).then(function () {
      if (!global.jspdf || !global.jspdf.jsPDF) throw new Error('jsPDF indisponible');
      return global.jspdf;
    });
  }
  if (key === 'eps') {
    if (global.SPEps) return Promise.resolve(global.SPEps);
    return loadScript(absoluteLib('eps-import.js')).then(function () {
      if (!global.SPEps) throw new Error('moteur EPS indisponible');
      return global.SPEps;
    });
  }
  return Promise.reject(new Error('Bibliothèque inconnue : ' + key));
}

/* ────────────────────────────────────────────────────────────
   DÉTECTION PAR SIGNATURE
──────────────────────────────────────────────────────────── */
function detectKind(bytes, name) {
  var b = asUint8(bytes);
  var n = String(name || '').toLowerCase();
  if (b && b.length >= 5) {
    if (asciiAt(b, 0, 5) === '%PDF-') return 'pdf';
    if (asciiAt(b, 0, 4) === '%!PS') return 'eps';
    // BOM / préfixe binaire éventuel
    for (var i = 0; i < Math.min(b.length - 4, 4096); i++) {
      if (asciiAt(b, i, 5) === '%PDF-') return 'pdf';
      if (asciiAt(b, i, 4) === '%!PS') return 'eps';
    }
    if (b[0] === 0x1f && b[1] === 0x8b) return 'svgz';
  }
  if (/\.pdf$/.test(n)) return 'pdf';
  if (/\.ai$/.test(n)) return 'pdf';       // .ai moderne = PDF ; repli EPS tenté plus loin
  if (/\.eps$/.test(n)) return 'eps';
  if (/\.svgz$/.test(n)) return 'svgz';
  if (/\.svg$/.test(n)) return 'svg';
  return null;
}

/* ────────────────────────────────────────────────────────────
   SVG — nettoyage et normalisation
──────────────────────────────────────────────────────────── */
var FORBIDDEN_TAGS = {
  script: 1, foreignobject: 1, iframe: 1, object: 1, embed: 1, audio: 1, video: 1,
  canvas: 1, link: 1, meta: 1, base: 1, animate: 1, set: 1, handler: 1
};

function sanitizeSVG(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('SVG vide');
  var text = raw.replace(/^\uFEFF/, '');
  var doc;
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  } catch (e) {
    throw new Error('SVG illisible');
  }
  var root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === 'parsererror' || doc.querySelector('parsererror')) {
    throw new Error('SVG invalide');
  }
  if (root.nodeName.toLowerCase() !== 'svg') {
    var svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.appendChild(root.cloneNode(true));
    doc.appendChild(svg);
    root = svg;
  }

  // Suppression des balises actives
  var all = root.querySelectorAll('*');
  for (var i = all.length - 1; i >= 0; i--) {
    var el = all[i];
    var tag = el.nodeName.toLowerCase();
    if (FORBIDDEN_TAGS[tag]) { el.parentNode.removeChild(el); continue; }
    var attrs = Array.prototype.slice.call(el.attributes || []);
    for (var a = 0; a < attrs.length; a++) {
      var attr = attrs[a];
      var an = attr.name.toLowerCase();
      var av = String(attr.value || '');
      if (an.indexOf('on') === 0) { el.removeAttribute(attr.name); continue; }
      if (an === 'href' || an === 'xlink:href' || an === 'src') {
        var v = av.trim();
        if (v && !/^(#|data:|blob:)/i.test(v)) el.removeAttribute(attr.name);
      }
      if (an === 'style' && /url\s*\(\s*['"]?(https?:|\/\/|file:)/i.test(av)) {
        el.setAttribute(attr.name, av.replace(/url\s*\(\s*['"]?(?:https?:|\/\/|file:)[^)]*\)/gi, 'none'));
      }
    }
    if (tag === 'style') {
      el.textContent = String(el.textContent || '')
        .replace(/@import[^;]*;?/gi, '')
        .replace(/url\s*\(\s*['"]?(?:https?:|\/\/|file:)[^)]*\)/gi, 'none');
    }
  }

  // Attributs de la racine (onload, href externe…).
  Array.prototype.slice.call(root.attributes || []).forEach(function (attr) {
    var an = attr.name.toLowerCase();
    var av = String(attr.value || '').trim();
    if (an.indexOf('on') === 0) root.removeAttribute(attr.name);
    if ((an === 'href' || an === 'xlink:href') && av && !/^(#|data:|blob:)/i.test(av)) {
      root.removeAttribute(attr.name);
    }
  });

  // Dimensions : width/height manquants → viewBox
  var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  var hasVB = vb.length === 4 && vb.every(function (n) { return isFinite(n); }) && vb[2] > 0 && vb[3] > 0;
  var w = parseFloat(root.getAttribute('width'));
  var h = parseFloat(root.getAttribute('height'));
  if (!isFinite(w) || w <= 0) w = hasVB ? vb[2] : 0;
  if (!isFinite(h) || h <= 0) h = hasVB ? vb[3] : 0;
  if (!hasVB && w > 0 && h > 0) root.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!root.getAttribute('xmlns:xlink')) root.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  if (w > 0) root.setAttribute('width', String(w));
  if (h > 0) root.setAttribute('height', String(h));

  return {
    svg: new XMLSerializer().serializeToString(root),
    width: w || 0,
    height: h || 0
  };
}

function svgDimensions(svgText) {
  try {
    var r = sanitizeSVG(svgText);
    return { width: r.width, height: r.height };
  } catch (e) { return { width: 0, height: 0 }; }
}

/* ────────────────────────────────────────────────────────────
   IMPORT PDF / ILLUSTRATOR (pdf.js → SVG)
   Reproduit le vectoriel le plus fidèlement possible :
   chemins, courbes, clips, couleurs, opacités, images, texte.
──────────────────────────────────────────────────────────── */
function multiply(m1, m2) {
  // m1 après m2 (application : point → m2 → m1)
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

function applyPoint(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function matrixScale(m) {
  var det = m[0] * m[3] - m[1] * m[2];
  return Math.sqrt(Math.abs(det)) || 1;
}

function colorFromRGB(r, g, b) {
  var to = function (n) {
    n = Number(n);
    if (!isFinite(n)) n = 0;
    if (n <= 1) n = n * 255;
    n = clampNum(Math.round(n), 0, 255);
    return ('0' + n.toString(16)).slice(-2);
  };
  return '#' + to(r) + to(g) + to(b);
}

function colorFromGray(g) {
  var n = Number(g);
  if (!isFinite(n)) n = 0;
  if (n <= 1) n = n * 255;
  return colorFromRGB(n, n, n);
}

function colorFromCMYK(c, m, y, k) {
  function n(v) { v = Number(v); if (!isFinite(v)) v = 0; if (v > 1) v = v / 255; return clampNum(v, 0, 1); }
  c = n(c); m = n(m); y = n(y); k = n(k);
  return colorFromRGB(255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k));
}

function normalizeColorArgs(args) {
  var arr = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (Array.isArray(a) || (a && typeof a.length === 'number' && typeof a !== 'string')) {
      for (var j = 0; j < a.length; j++) arr.push(a[j]);
    } else arr.push(a);
  }
  return arr;
}

function colorFromOpArgs(args) {
  var c = normalizeColorArgs(args).filter(function (v) { return typeof v === 'number'; });
  if (c.length >= 4) return colorFromCMYK(c[0], c[1], c[2], c[3]);
  if (c.length === 3) return colorFromRGB(c[0], c[1], c[2]);
  if (c.length === 2) return colorFromRGB(c[0], c[1], 0);
  if (c.length === 1) return colorFromGray(c[0]);
  return null;
}

function pdfFontFamily(family, name) {
  var s = String(family || '') + ' ' + String(name || '');
  if (/courier|mono/i.test(s)) return "'Courier New', monospace";
  if (/times|serif|georgia|roman/i.test(s)) return "Georgia, 'Times New Roman', serif";
  return "Helvetica, Arial, sans-serif";
}

function pdfFontWeight(name) {
  return /bold|black|heavy|semibold|demi/i.test(String(name || '')) ? '700' : '400';
}

function pdfFontStyle(name) {
  return /italic|oblique/i.test(String(name || '')) ? 'italic' : 'normal';
}

function imageObjectToDataURL(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (img.data && typeof img.data === 'string') return img.data;
  if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
    try { return img instanceof HTMLCanvasElement ? img.toDataURL('image/png') : null; } catch (e) { return null; }
  }
  var w = img.width | 0, h = img.height | 0;
  if (!w || !h) return null;

  // pdf.js ≥ 3.11 décode parfois les images en ImageBitmap (pas de data brute).
  if (img.bitmap) {
    try {
      var bitmapCanvas = document.createElement('canvas');
      bitmapCanvas.width = w; bitmapCanvas.height = h;
      var bctx = bitmapCanvas.getContext('2d');
      bctx.drawImage(img.bitmap, 0, 0, w, h);
      return bitmapCanvas.toDataURL('image/png');
    } catch (e) { return null; }
  }

  if (!img.data) return null;
  var data = img.data;
  if (typeof data.length !== 'number') return null;

  // Flux JPEG/PNG déjà encodé (paintJpegXObject, images DCTDecode).
  var bytes = (data instanceof Uint8Array) ? data : new Uint8Array(data);
  if (bytes.length > 8 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    return 'data:image/jpeg;base64,' + base64FromBytes(bytes);
  }
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'data:image/png;base64,' + base64FromBytes(bytes);
  }

  var canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  var ctx = canvas.getContext('2d');
  var imageData = null;
  var kind = img.kind;
  try {
    if (kind === 1 || data.length === Math.ceil(w / 8) * h) { // GRAYSCALE_1BPP
      imageData = ctx.createImageData(w, h);
      var bytesPerRow = Math.ceil(w / 8);
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var byte = data[y * bytesPerRow + (x >> 3)] || 0;
          var bit = (byte >> (7 - (x & 7))) & 1;
          var v = bit ? 255 : 0;
          var o = (y * w + x) * 4;
          imageData.data[o] = v; imageData.data[o + 1] = v; imageData.data[o + 2] = v; imageData.data[o + 3] = 255;
        }
      }
    } else if (kind === 2 || bytes.length === w * h * 3) { // RGB_24BPP
      imageData = ctx.createImageData(w, h);
      for (var i = 0, j = 0; i < bytes.length; i += 3, j += 4) {
        imageData.data[j] = bytes[i]; imageData.data[j + 1] = bytes[i + 1]; imageData.data[j + 2] = bytes[i + 2]; imageData.data[j + 3] = 255;
      }
    } else if (kind === 3 || bytes.length >= w * h * 4) { // RGBA_32BPP
      imageData = ctx.createImageData(w, h);
      imageData.data.set(bytes.subarray(0, w * h * 4));
    }
  } catch (e) { return null; }
  if (!imageData) return null;
  ctx.putImageData(imageData, 0, 0);
  try { return canvas.toDataURL('image/png'); } catch (e) { return null; }
}

function pathToD(commands, H) {
  var d = [];
  for (var i = 0; i < commands.length; i++) {
    var c = commands[i];
    if (c.t === 'M') d.push('M' + round(c.p[0]) + ' ' + round(H - c.p[1]));
    else if (c.t === 'L') d.push('L' + round(c.p[0]) + ' ' + round(H - c.p[1]));
    else if (c.t === 'C') {
      d.push('C' + round(c.p[0]) + ' ' + round(H - c.p[1]) + ' ' +
        round(c.p[2]) + ' ' + round(H - c.p[3]) + ' ' +
        round(c.p[4]) + ' ' + round(H - c.p[5]));
    } else if (c.t === 'Z') d.push('Z');
  }
  return d.join(' ');
}

function wrapClips(content, clips) {
  for (var i = clips.length - 1; i >= 0; i--) {
    content = '<g clip-path="url(#' + clips[i] + ')">' + content + '</g>';
  }
  return content;
}

function buildPdfSvg(ops, page, textContent, W, H, x0, y0, y1) {
  var OPS = global.pdfjsLib.OPS;
  var defs = [];
  var body = [];
  var clipSeq = 0;
  var path = [];
  var ctm = [1, 0, 0, 1, 0, 0];
  var ctmStack = [];
  var textRuns = [];
  var stateStack = [];
  var state = newState();

  function newState() {
    return {
      fill: '#000000', fillOpacity: 1,
      stroke: null, strokeOpacity: 1,
      lineWidth: 1, dash: [], lineCap: 'butt', lineJoin: 'miter',
      clips: []
    };
  }
  function cloneState(s) {
    return {
      fill: s.fill, fillOpacity: s.fillOpacity,
      stroke: s.stroke, strokeOpacity: s.strokeOpacity,
      lineWidth: s.lineWidth,
      dash: s.dash.slice(), lineCap: s.lineCap, lineJoin: s.lineJoin,
      clips: s.clips.slice()
    };
  }
  function addPoint(cmd, x, y) {
    var p = applyPoint(ctm, x, y);
    cmd.p.push(p[0], p[1]);
  }
  function startPath(type, x, y) {
    var p = applyPoint(ctm, x, y);
    path.push({ t: type, p: [p[0], p[1]] });
  }
  function appendPath(type, x, y) {
    var p = applyPoint(ctm, x, y);
    var last = path[path.length - 1];
    if (!last || last.t === 'Z') path.push({ t: 'M', p: [p[0], p[1]] });
    else path.push({ t: 'L', p: [p[0], p[1]] });
  }
  function closePath() { path.push({ t: 'Z' }); }

  function emitPath(mode) {
    if (!path.length) return;
    var d = pathToD(path, H);
    var fill = mode === 'fill' || mode === 'both';
    var stroke = mode === 'stroke' || mode === 'both';
    var attrs = [];
    if (fill) {
      attrs.push('fill="' + state.fill + '"');
      if (state.fillOpacity < 1) attrs.push('fill-opacity="' + round(state.fillOpacity) + '"');
      if (mode === 'evenodd') attrs.push('fill-rule="evenodd"');
    } else attrs.push('fill="none"');
    if (stroke && state.stroke) {
      attrs.push('stroke="' + state.stroke + '"');
      var scale = matrixScale(ctm);
      attrs.push('stroke-width="' + round(Math.max(0.01, state.lineWidth * scale)) + '"');
      if (state.strokeOpacity < 1) attrs.push('stroke-opacity="' + round(state.strokeOpacity) + '"');
      attrs.push('stroke-linecap="' + state.lineCap + '"');
      attrs.push('stroke-linejoin="' + state.lineJoin + '"');
      if (state.dash && state.dash.length) {
        attrs.push('stroke-dasharray="' + state.dash.map(function (v) { return round(v * scale); }).join(' ') + '"');
      }
    }
    body.push(wrapClips('<path d="' + d + '" ' + attrs.join(' ') + '/>', state.clips));
    path = [];
  }

  function addClip(evenodd) {
    if (!path.length) return;
    var id = 'bc' + (++clipSeq);
    defs.push('<clipPath id="' + id + '" clipPathUnits="userSpaceOnUse"><path d="' +
      pathToD(path, H) + '"' + (evenodd ? ' clip-rule="evenodd"' : '') + '/></clipPath>');
    state.clips.push(id);
  }

  function emitTextItem(item, run) {
    var tr = item.transform;
    if (!tr || !item.str) return;
    var angle = Math.atan2(-tr[1], tr[0]) * 180 / Math.PI;
    var size = Math.hypot(tr[2], tr[3]) || Math.hypot(tr[0], tr[1]) || 12;
    var x = tr[4] - x0;
    var y = y1 - tr[5];
    if (!isFinite(x) || !isFinite(y)) return;
    var style = (textContent.styles && textContent.styles[item.fontName]) || {};
    var fam = pdfFontFamily(style.fontFamily, item.fontName);
    var fill = (run && run.fill) || '#000000';
    var attrs = 'x="' + round(x) + '" y="' + round(y) + '" font-family="' + escapeAttr(fam) +
      '" font-size="' + round(Math.max(1, size)) + '" fill="' + fill + '"' +
      ' font-weight="' + pdfFontWeight(item.fontName) + '" font-style="' + pdfFontStyle(item.fontName) + '"' +
      ' xml:space="preserve"';
    if (Math.abs(angle) > 0.01) attrs += ' transform="rotate(' + round(angle) + ' ' + round(x) + ' ' + round(y) + ')"';
    var content = '<text ' + attrs + '>' + escapeXml(item.str) + '</text>';
    body.push(wrapClips(content, (run && run.clips) || []));
  }

  function paintImage(args) {
    var objId = args[0];
    var img = null;
    try { img = page.objs.get(objId); } catch (e) { img = null; }
    if (!img) return;
    var url = imageObjectToDataURL(img);
    if (!url) return;
    var a = ctm[0], b = ctm[1], c = ctm[2], d = ctm[3], e = ctm[4], f = ctm[5];
    var transform = 'matrix(' + round(a) + ' ' + round(-b) + ' ' + round(-c) + ' ' + round(d) + ' ' +
      round(c + e) + ' ' + round(H - d - f) + ')';
    body.push(wrapClips('<image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="' +
      url + '" transform="' + transform + '"/>', state.clips));
  }

  for (var i = 0; i < ops.fnArray.length; i++) {
    var fn = ops.fnArray[i];
    var args = ops.argsArray[i] || [];

    if (fn === OPS.save) {
      stateStack.push(cloneState(state));
      ctmStack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      if (stateStack.length) state = stateStack.pop();
      if (ctmStack.length) ctm = ctmStack.pop();
    } else if (fn === OPS.transform) {
      ctm = multiply(ctm, args);
    } else if (fn === OPS.paintFormXObjectBegin) {
      ctmStack.push(ctm.slice());
      stateStack.push(cloneState(state));
      if (args[0]) ctm = multiply(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) {
      if (stateStack.length) state = stateStack.pop();
      if (ctmStack.length) ctm = ctmStack.pop();
    } else if (fn === OPS.constructPath) {
      var pop = args[0] || [];
      var coords = args[1] || [];
      var ci = 0;
      for (var k = 0; k < pop.length; k++) {
        var op = pop[k];
        if (op === OPS.moveTo) { startPath('M', coords[ci++], coords[ci++]); }
        else if (op === OPS.lineTo) { appendPath('L', coords[ci++], coords[ci++]); }
        else if (op === OPS.curveTo) {
          var p1 = applyPoint(ctm, coords[ci++], coords[ci++]);
          var p2 = applyPoint(ctm, coords[ci++], coords[ci++]);
          var p3 = applyPoint(ctm, coords[ci++], coords[ci++]);
          var lastC = path[path.length - 1];
          if (!lastC || lastC.t === 'Z') path.push({ t: 'M', p: [p1[0], p1[1]] });
          path.push({ t: 'C', p: [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]] });
        } else if (op === OPS.closePath) { closePath(); }
        else if (op === OPS.rectangle) {
          var rx = coords[ci++], ry = coords[ci++], rw = coords[ci++], rh = coords[ci++];
          startPath('M', rx, ry);
          appendPath('L', rx + rw, ry);
          appendPath('L', rx + rw, ry + rh);
          appendPath('L', rx, ry + rh);
          closePath();
        }
      }
    } else if (fn === OPS.moveTo) {
      startPath('M', args[0], args[1]);
    } else if (fn === OPS.lineTo) {
      appendPath('L', args[0], args[1]);
    } else if (fn === OPS.curveTo) {
      var cp1 = applyPoint(ctm, args[0], args[1]);
      var cp2 = applyPoint(ctm, args[2], args[3]);
      var cp3 = applyPoint(ctm, args[4], args[5]);
      path.push({ t: 'C', p: [cp1[0], cp1[1], cp2[0], cp2[1], cp3[0], cp3[1]] });
    } else if (fn === OPS.closePath) {
      closePath();
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
      emitPath('stroke');
    } else if (fn === OPS.fill) {
      emitPath('fill');
    } else if (fn === OPS.eoFill) {
      emitPath('evenodd');
    } else if (fn === OPS.fillStroke || fn === OPS.closeFillStroke) {
      emitPath('both');
    } else if (fn === OPS.eoFillStroke || fn === OPS.closeEOFillStroke) {
      emitPath('both');
    } else if (fn === OPS.endPath) {
      path = [];
    } else if (fn === OPS.clip || fn === OPS.eoClip) {
      addClip(fn === OPS.eoClip);
    } else if (fn === OPS.setLineWidth) {
      state.lineWidth = Number(args[0]) || 0;
    } else if (fn === OPS.setDash) {
      var arr = Array.isArray(args[0]) ? args[0] : (args[0] && args[0].length ? args[0] : []);
      state.dash = Array.prototype.slice.call(arr).map(Number).filter(function (v) { return isFinite(v); });
    } else if (fn === OPS.setLineCap) {
      state.lineCap = ['butt', 'round', 'square'][Number(args[0])] || 'butt';
    } else if (fn === OPS.setLineJoin) {
      state.lineJoin = ['miter', 'round', 'bevel'][Number(args[0])] || 'miter';
    } else if (fn === OPS.setFillRGBColor) {
      state.fill = colorFromRGB(args[0], args[1], args[2]);
    } else if (fn === OPS.setStrokeRGBColor) {
      state.stroke = colorFromRGB(args[0], args[1], args[2]);
    } else if (fn === OPS.setFillGray) {
      state.fill = colorFromGray(args[0]);
    } else if (fn === OPS.setStrokeGray) {
      state.stroke = colorFromGray(args[0]);
    } else if (fn === OPS.setFillCMYKColor) {
      state.fill = colorFromCMYK(args[0], args[1], args[2], args[3]);
    } else if (fn === OPS.setStrokeCMYKColor) {
      state.stroke = colorFromCMYK(args[0], args[1], args[2], args[3]);
    } else if (fn === OPS.setFillColorN) {
      var fc = colorFromOpArgs(args); if (fc) state.fill = fc;
    } else if (fn === OPS.setStrokeColorN) {
      var sc = colorFromOpArgs(args); if (sc) state.stroke = sc;
    } else if (fn === OPS.setGState) {
      var gs = args[0];
      if (gs && typeof gs === 'object') {
        if (typeof gs.ca === 'number') state.fillOpacity = gs.ca;
        if (typeof gs.CA === 'number') state.strokeOpacity = gs.CA;
        if (typeof gs.LW === 'number') state.lineWidth = gs.LW;
      }
    } else if (fn === OPS.beginText) {
      // Le texte est reconstruit via getTextContent (meilleure fidélité Unicode).
    } else if (fn === OPS.showText || fn === OPS.showSpacedText ||
               fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      textRuns.push({ fill: state.fill, clips: state.clips.slice() });
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      paintImage(args);
    }
  }

  // Fusionne les deux sources : le texte est replacé dans l'ordre du contenu.
  var items = (textContent.items || []).filter(function (it) { return it && typeof it.str === 'string' && it.str.length; });
  var runIndex = 0;
  for (var t = 0; t < items.length; t++) {
    var run = textRuns.length ? textRuns[Math.min(runIndex, textRuns.length - 1)] : null;
    emitTextItem(items[t], run);
    if (textRuns.length) runIndex++;
  }

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'width="' + round(W) + '" height="' + round(H) + '" viewBox="0 0 ' + round(W) + ' ' + round(H) + '">';
  if (defs.length) svg += '<defs>' + defs.join('') + '</defs>';
  svg += body.join('');
  svg += '</svg>';
  return svg;
}

async function pdfToSVG(data, options) {
  options = options || {};
  var pdfjsLib = await ensureLib('pdf');
  var bytes = asUint8(data);
  if (!bytes) throw new Error('PDF vide');
  var doc = await pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    disableFontFace: false
  }).promise;
  if (!doc || !doc.numPages) throw new Error('PDF sans page');
  var pageNumber = clampNum(parseInt(options.page, 10) || 1, 1, doc.numPages);
  var page = await doc.getPage(pageNumber);
  var view = page.view.slice();
  var x0 = view[0], y0 = view[1], x1 = view[2], y1 = view[3];
  var W = Math.abs(x1 - x0) || page.getViewport({ scale: 1 }).width;
  var H = Math.abs(y1 - y0) || page.getViewport({ scale: 1 }).height;
  var opList = await page.getOperatorList();
  var textContent = { items: [], styles: {} };
  try { textContent = await page.getTextContent({ normalizeWhitespace: false, includeMarkedContent: false }); }
  catch (e) { /* PDF sans texte */ }

  var svg = buildPdfSvg(opList, page, textContent, W, H, x0, y0, y1);
  var result = sanitizeSVG(svg);
  return {
    svg: result.svg,
    width: result.width || W,
    height: result.height || H,
    pages: doc.numPages,
    page: pageNumber
  };
}

/* ────────────────────────────────────────────────────────────
   IMPORT EPS / AI8 (PostScript) → groupe Fabric
──────────────────────────────────────────────────────────── */
async function epsToFabricGroup(data, fabricRef, options) {
  var SPEps = await ensureLib('eps');
  var bytes = asUint8(data);
  var text = SPEps.extractPsText(bytes);
  if (!text) throw new Error('PostScript introuvable');
  var parsed = SPEps.parse(text);
  if (!parsed || !parsed.paths || !parsed.paths.length) throw new Error('Aucun tracé exploitable');
  var result = SPEps.toFabricGroup(parsed, fabricRef || global.fabric);
  if (!result || !result.group) throw new Error('Aucun objet Fabric produit');
  return { group: result.group, parsed: parsed, bbox: parsed.bbox, paths: result.nbPaths };
}

/* ────────────────────────────────────────────────────────────
   EXPORT PDF VECTORIEL (SVG → PDF)
   svg2pdf + jsPDF : chemins, textes, images. Les polices non
   standard sont ramenées à Helvetica / Times / Courier.
──────────────────────────────────────────────────────────── */
function prepareSvgForPdf(svgText) {
  var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  var root = doc.documentElement;
  // Retirer les éléments que svg2pdf ne sait pas dessiner
  root.querySelectorAll('filter, mask, foreignObject, script').forEach(function (el) {
    el.parentNode.removeChild(el);
  });
  // Polices : familles standard PDF
  root.querySelectorAll('text, tspan').forEach(function (el) {
    var fam = (el.getAttribute('font-family') || '').toLowerCase();
    var std = /courier|mono/.test(fam) ? 'Courier' : (/times|serif|georgia/.test(fam) ? 'Times-Roman' : 'Helvetica');
    el.setAttribute('font-family', std);
  });
  // Les dégradés ne sont pas toujours supportés : couleur moyenne de repli
  root.querySelectorAll('[fill^="url("]').forEach(function (el) {
    var m = /url\(#([^)]+)\)/.exec(el.getAttribute('fill'));
    if (!m) return;
    var grad = root.querySelector('#' + CSS.escape(m[1]));
    if (!grad) { el.setAttribute('fill', '#000000'); return; }
    var stops = grad.querySelectorAll('stop');
    var color = stops.length ? (stops[0].getAttribute('stop-color') || '#000000') : '#000000';
    if (stops.length > 1) {
      var c2 = stops[stops.length - 1].getAttribute('stop-color');
      if (c2 === color) color = '#000000';
    }
    el.setAttribute('fill', color);
  });
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}

async function svgToPDF(svgText, width, height, options) {
  options = options || {};
  var jsPDFModule = await ensureLib('jspdf');
  var svg2pdfModule = await ensureLib('svg2pdf');
  var svg2pdfFn = svg2pdfModule.svg2pdf;
  if (typeof svg2pdfFn !== 'function') throw new Error('svg2pdf indisponible');

  var w = Math.max(1, Number(width) || 1);
  var h = Math.max(1, Number(height) || 1);
  var cleaned = prepareSvgForPdf(svgText);
  var jsPDF = jsPDFModule.jsPDF;
  var pdf = new jsPDF({
    orientation: w >= h ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [w, h],
    compress: true,
    hotfixes: ['px_scaling']
  });
  try {
    pdf.setProperties({
      title: options.title || 'Bird',
      subject: 'Illustration vectorielle',
      creator: 'Bird — éditeur vectoriel',
      author: 'Bird'
    });
  } catch (e) { /* métadonnées optionnelles */ }

  // svg2pdf lit les styles calculés : il faut un élément réellement rendu.
  var host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:' + w + 'px;height:' + h +
    'px;overflow:hidden;pointer-events:none;';
  document.body.appendChild(host);
  try {
    host.innerHTML = cleaned;
    var svgEl = host.querySelector('svg');
    if (!svgEl) throw new Error('SVG introuvable');
    svgEl.setAttribute('width', w);
    svgEl.setAttribute('height', h);
    await svg2pdfFn(svgEl, pdf, { x: 0, y: 0, width: w, height: h });
  } finally {
    document.body.removeChild(host);
  }
  var bytes = new Uint8Array(pdf.output('arraybuffer'));
  return {
    bytes: bytes,
    blob: new Blob([bytes], { type: 'application/pdf' })
  };
}

/* ────────────────────────────────────────────────────────────
   STOCKAGE LOCAL (IndexedDB, avec repli localStorage géré par l'app)
   Permet de dépasser la limite de 5 Mo des images embarquées.
──────────────────────────────────────────────────────────── */
var DB_NAME = 'bird-db';
var DB_STORE = 'documents';
var _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise(function (resolve, reject) {
    if (!global.indexedDB) { reject(new Error('IndexedDB indisponible')); return; }
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('IndexedDB indisponible')); };
  });
  return _dbPromise;
}

function storeSet(key, value) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  });
}

function storeGet(key) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readonly');
      var req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = function () { resolve(req.result == null ? null : req.result); };
      req.onerror = function () { reject(req.error); };
    });
  });
}

function storeDelete(key) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}

/* ────────────────────────────────────────────────────────────
   API PUBLIQUE
──────────────────────────────────────────────────────────── */
BirdIO.ensureLib = ensureLib;
BirdIO.detectKind = detectKind;
BirdIO.sanitizeSVG = sanitizeSVG;
BirdIO.svgDimensions = svgDimensions;
BirdIO.pdfToSVG = pdfToSVG;
BirdIO.epsToFabricGroup = epsToFabricGroup;
BirdIO.svgToPDF = svgToPDF;
BirdIO.escapeXml = escapeXml;
BirdIO.base64FromBytes = base64FromBytes;
BirdIO.store = { get: storeGet, set: storeSet, delete: storeDelete };

global.BirdIO = BirdIO;
})(window);
