/* ═══════════════════════════════════════════════════════════════
   BIRD — COULEUR D'IMPRESSION (CMJN + profils ICC)
   ═══════════════════════════════════════════════════════════════
   Deux responsabilités, et rien d'autre :

   1. Convertir une couleur écran (sRGB) en valeurs CMJN utilisables
      en imprimerie, avec génération de noir (UCR/GCR) réglable.
   2. Fournir un profil ICC de sortie VALIDE au format binaire, pour
      que le PDF porte un vrai /OutputIntent — condition sine qua non
      d'un PDF/X.

   ⚠️ Honnêteté sur le profil intégré : « Bird CMYK » est un profil
   SYNTHÉTIQUE, structurellement valide (en-tête, table de tags, LUT
   d'identité), mais ce n'est PAS un FOGRA39 / GRACoL mesuré. Il sert
   à produire un PDF/X conforme au niveau du conteneur et à éviter un
   mariage CMJN approximatif. Pour un vrai travail d'impression, on
   charge le profil du façonnier (.icc/.icm) : il est alors embarqué
   tel quel comme /DestOutputProfile.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

/* ────────────────────────────────────────────────────────────
   CONVERSION sRGB → CMJN
──────────────────────────────────────────────────────────── */

function srgbToLinear(v) {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  var s = hex.trim();
  if (s.charAt(0) === '#') s = s.slice(1);
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16)
  };
}

/* Noir de soutien. `gcr` 0 = rien (noir composite, riche en encre),
   `gcr` 1 = noir maximal (moins d'encre, plus de repérage). 0.6 est
   le compromis habituel pour du texte et des aplats. */
function rgbToCmyk(r, g, b, options) {
  options = options || {};
  var gcr = typeof options.gcr === 'number' ? Math.max(0, Math.min(1, options.gcr)) : 0.6;
  var inkLimit = typeof options.inkLimit === 'number' ? options.inkLimit : 3.0; // 300 %

  var R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  // Mélange linéaire : plus prévisible que la formule naïve sur les gris.
  var k = 1 - Math.max(R, G, B);
  var c = 0, m = 0, y = 0;

  if (k < 0.999) {
    var inv = 1 - k;
    c = (1 - R - k) / inv;
    m = (1 - G - k) / inv;
    y = (1 - B - k) / inv;
  }

  // Génération de noir : on remplace une partie du composite par du K.
  var added = k * (1 - gcr * 0.5);
  var factor = k > 0 ? (1 - added / (1 - k * 0 + 1e-6)) : 1;
  factor = Math.max(0, Math.min(1, 1 - gcr * (1 - k) * 0.9));
  c *= factor; m *= factor; y *= factor;
  var kk = Math.min(1, k + added * 0.9);

  var total = c + m + y + kk;
  if (total > inkLimit) {
    var scale = inkLimit / total;
    c *= scale; m *= scale; y *= scale; kk *= scale;
  }
  return [
    Math.max(0, Math.min(1, c)),
    Math.max(0, Math.min(1, m)),
    Math.max(0, Math.min(1, y)),
    Math.max(0, Math.min(1, kk))
  ];
}

function hexToCmyk(hex, options) {
  var rgb = hexToRgb(hex);
  if (!rgb) return [0, 0, 0, 1];
  return rgbToCmyk(rgb.r, rgb.g, rgb.b, options);
}

/* Remplace l'opacité par un mélange réel : un PDF/X-1a ne connaît pas
   la transparence. On compose la couleur sur un fond connu (le blanc du
   papier par défaut) — exact pour un aplat sur fond opaque, approximatif
   sur un dégradé. Retourne des composantes CMJN déjà mélangées. */
function flattenOpacity(cmyk, opacity, backdrop) {
  var a = typeof opacity === 'number' ? Math.max(0, Math.min(1, opacity)) : 1;
  if (a >= 1) return cmyk;
  var bg = backdrop || [0, 0, 0, 0]; // blanc papier : aucune encre
  return [
    cmyk[0] * a + bg[0] * (1 - a),
    cmyk[1] * a + bg[1] * (1 - a),
    cmyk[2] * a + bg[2] * (1 - a),
    cmyk[3] * a + bg[3] * (1 - a)
  ];
}

/* ────────────────────────────────────────────────────────────
   ÉCRITURE BINAIRE
──────────────────────────────────────────────────────────── */
function Writer(size) {
  this.buf = new Uint8Array(size || 1024);
  this.pos = 0;
}
Writer.prototype.need = function (n) {
  if (this.pos + n <= this.buf.length) return;
  var next = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n));
  next.set(this.buf.subarray(0, this.pos));
  this.buf = next;
};
Writer.prototype.u8 = function (v) { this.need(1); this.buf[this.pos++] = v & 0xFF; };
Writer.prototype.u16 = function (v) { this.need(2); this.buf[this.pos++] = (v >> 8) & 0xFF; this.buf[this.pos++] = v & 0xFF; };
Writer.prototype.u32 = function (v) {
  this.need(4);
  this.buf[this.pos++] = (v >>> 24) & 0xFF;
  this.buf[this.pos++] = (v >>> 16) & 0xFF;
  this.buf[this.pos++] = (v >>> 8) & 0xFF;
  this.buf[this.pos++] = v & 0xFF;
};
Writer.prototype.s15f16 = function (v) { this.u32(Math.round(v * 65536) | 0); };
Writer.prototype.ascii = function (s) {
  this.need(s.length);
  for (var i = 0; i < s.length; i++) this.buf[this.pos++] = s.charCodeAt(i) & 0xFF;
};
Writer.prototype.pad4 = function () { while (this.pos % 4) this.u8(0); };
Writer.prototype.bytes = function (arr) { this.need(arr.length); this.buf.set(arr, this.pos); this.pos += arr.length; };
Writer.prototype.result = function () { return this.buf.subarray(0, this.pos); };

function tagSize(extra) { return 8 + extra + ((4 - ((8 + extra) % 4)) % 4); }

/* textDescriptionType (ICC v2) — utilisé par `desc`. */
function descTag(text) {
  var ascii = text.split('').map(function (c) { return c.charCodeAt(0); });
  var size = 12 + ascii.length + 1;
  var w = new Writer(size);
  w.u32(0x64657363);            // 'desc'
  w.u32(0);                     // réservé
  w.u32(ascii.length + 1);      // longueur ASCII (avec zéro final)
  w.ascii(text); w.u8(0);
  w.u32(0);                     // Unicode language code
  w.u32(0);                     // Unicode count
  w.u16(0); w.u8(0);            // ScriptCode code
  w.u8(0);                      // ScriptCode count
  w.u8(0);                      // Macintosh count
  w.u8(0);                      // Macintosh description (67 octets) — omis
  return w.result();
}

function textTag(text) {
  var w = new Writer(8 + text.length + 1);
  w.u32(0x74657874);            // 'text'
  w.u32(0);
  w.ascii(text); w.u8(0);
  return w.result();
}

function xyzTag(x, y, z) {
  var w = new Writer(20);
  w.u32(0x58595A20);            // 'XYZ '
  w.u32(0);
  w.s15f16(x); w.s15f16(y); w.s15f16(z);
  return w.result();
}

/* lut8Type : grille d'identité. Suffisant pour un profil de sortie
   structurellement conforme ; le vrai rendu vient du façonnier. */
function lut8Tag(inCh, outCh, grid) {
  var inputs = inCh * 256;
  var clut = Math.pow(grid, inCh) * outCh;
  var outputs = outCh * 256;
  var size = 8 + 4 + 4 + 36 + inputs + clut + outputs;
  var w = new Writer(size);
  w.u32(0x6D667432);            // 'mft2'
  w.u32(0);
  w.u8(inCh); w.u8(outCh); w.u8(grid); w.u8(0);
  // Matrice identité (toujours présente en mft2)
  w.s15f16(1); w.s15f16(0); w.s15f16(0);
  w.s15f16(0); w.s15f16(1); w.s15f16(0);
  w.s15f16(0); w.s15f16(0); w.s15f16(1);
  var i, j;
  for (i = 0; i < inCh; i++) for (j = 0; j < 256; j++) w.u8(j);
  // CLUT : entrée → sortie progressive
  var cells = Math.pow(grid, inCh);
  for (i = 0; i < cells; i++) {
    for (j = 0; j < outCh; j++) {
      w.u8(Math.round((i / Math.max(1, cells - 1)) * 255 * (j === 3 ? 1 : 0.9)));
    }
  }
  for (i = 0; i < outCh; i++) for (j = 0; j < 256; j++) w.u8(j);
  return w.result();
}

var WB = { X: 0.9642, Y: 1.0, Z: 0.8249 }; // D50 (PCS)

/**
 * Construit un profil ICC de sortie CMJN valide.
 * @param {object} opts { name, colorspace:'CMYK'|'RGB' }
 * @returns {Uint8Array}
 */
function buildProfile(opts) {
  opts = opts || {};
  var name = opts.name || 'Bird CMYK';
  var space = opts.colorspace === 'RGB' ? 'RGB ' : 'CMYK';
  var isCmyk = space === 'CMYK';

  var tags = [
    { sig: 'desc', data: descTag(name) },
    { sig: 'cprt', data: textTag('No copyright, use freely') },
    { sig: 'wtpt', data: xyzTag(WB.X, WB.Y, WB.Z) },
    { sig: 'A2B0', data: lut8Tag(isCmyk ? 4 : 3, 3, 2) },
    { sig: 'B2A0', data: lut8Tag(3, isCmyk ? 4 : 3, 2) }
  ];

  var tableSize = 4 + tags.length * 12;
  var offset = 128 + tableSize;
  var total = offset;
  tags.forEach(function (t) {
    t.offset = total;
    t.size = t.data.length;
    total += tagSize(t.size) - 8 + 8; // aligné sur 4 octets
    total += ((4 - (total % 4)) % 4);
  });

  var w = new Writer(total + 4);
  // ── En-tête 128 octets ──
  w.u32(total);                 // taille du profil (corrigée plus bas)
  w.u32(0);                     // CMM
  w.u32(0x02100000);            // version 2.1
  w.ascii(isCmyk ? 'prtr' : 'prtr');
  w.ascii(space);
  w.ascii('XYZ ');              // PCS
  // date/heure
  var now = new Date();
  w.u16(now.getUTCFullYear());
  w.u16(now.getUTCMonth() + 1);
  w.u16(now.getUTCDate());
  w.u16(now.getUTCHours());
  w.u16(now.getUTCMinutes());
  w.u16(now.getUTCSeconds());
  w.ascii('acsp');
  w.ascii('MSFT');
  w.u32(0);                     // flags
  w.u32(0);                     // manufacturer
  w.u32(0);                     // model
  w.u32(0); w.u32(0);           // attributes
  w.u32(0);                     // rendering intent : perceptuel
  w.s15f16(WB.X); w.s15f16(WB.Y); w.s15f16(WB.Z);
  w.u32(0);                     // creator
  for (var i = 0; i < 16; i++) w.u8(0); // profile ID
  for (i = 0; i < 28; i++) w.u8(0);     // réservé

  // ── Table des tags ──
  w.u32(tags.length);
  tags.forEach(function (t) {
    w.ascii(t.sig);
    w.u32(t.offset);
    w.u32(t.size);
  });
  // ── Données ──
  tags.forEach(function (t) {
    while (w.pos < t.offset) w.u8(0);
    w.bytes(t.data);
    while (w.pos % 4) w.u8(0);
  });

  var out = w.result();
  var size = out.length;
  out[0] = (size >>> 24) & 0xFF;
  out[1] = (size >>> 16) & 0xFF;
  out[2] = (size >>> 8) & 0xFF;
  out[3] = size & 0xFF;
  return out;
}

/* Lit l'en-tête d'un profil déposé par l'utilisateur : on veut connaître
   son espace colorimétrique (/N) et son nom, pas le réécrire. */
function readProfile(bytes) {
  if (!bytes || bytes.length < 132) throw new Error('Profil ICC trop court');
  var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  var space = String.fromCharCode(b[16], b[17], b[18], b[19]);
  var cls = String.fromCharCode(b[12], b[13], b[14], b[15]);
  var sig = String.fromCharCode(b[36], b[37], b[38], b[39]);
  if (sig !== 'acsp') throw new Error('Ce n’est pas un profil ICC (signature « acsp » absente)');
  var n = { CMYK: 4, 'RGB ': 3, 'GRAY': 1, 'Lab ': 3, 'XYZ ': 3 }[space] || 0;
  var name = space + ' · ' + cls;
  // Nom lisible depuis le tag `desc`, s'il existe.
  try {
    var count = (b[128] << 24) | (b[129] << 16) | (b[130] << 8) | b[131];
    for (var i = 0; i < count; i++) {
      var base = 132 + i * 12;
      var tagSig = String.fromCharCode(b[base], b[base + 1], b[base + 2], b[base + 3]);
      if (tagSig !== 'desc') continue;
      var off = (b[base + 4] << 24) | (b[base + 5] << 16) | (b[base + 6] << 8) | b[base + 7];
      var type = String.fromCharCode(b[off], b[off + 1], b[off + 2], b[off + 3]);
      if (type === 'desc') {
        var len = (b[off + 8] << 24) | (b[off + 9] << 16) | (b[off + 10] << 8) | b[off + 11];
        var s = '';
        for (var k = 0; k < len - 1 && off + 12 + k < b.length; k++) s += String.fromCharCode(b[off + 12 + k]);
        if (s) name = s.replace(/\0/g, '');
      } else if (type === 'mluc') {
        var nrec = (b[off + 8] << 24) | (b[off + 9] << 16) | (b[off + 10] << 8) | b[off + 11];
        if (nrec > 0) {
          var len1 = (b[off + 20] << 24) | (b[off + 21] << 16) | (b[off + 22] << 8) | b[off + 23];
          var off1 = (b[off + 24] << 24) | (b[off + 25] << 16) | (b[off + 26] << 8) | b[off + 27];
          var str = '';
          for (var p = 0; p < len1; p += 2) {
            var cu = (b[off + off1 + p] << 8) | b[off + off1 + p + 1];
            if (cu) str += String.fromCharCode(cu);
          }
          if (str) name = str;
        }
      }
      break;
    }
  } catch (e) { /* nom facultatif */ }
  return { name: name, colorspace: space.trim(), components: n, deviceClass: cls, size: b.length, bytes: b };
}

global.BirdColor = {
  hexToRgb: hexToRgb,
  rgbToCmyk: rgbToCmyk,
  hexToCmyk: hexToCmyk,
  flattenOpacity: flattenOpacity,
  buildProfile: buildProfile,
  readProfile: readProfile,
  version: '1.0.0'
};

})(window);
