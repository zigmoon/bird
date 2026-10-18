/* ═══════════════════════════════════════════════════════════════
   BIRD WIDGETS — panneaux détachables
   Chaque section du panneau de droite peut être détachée : elle
   devient une carte flottante déplaçable, repliable et refermable.
   Le DOM et ses écouteurs sont CONSERVÉS (on déplace l'élément, on
   ne le reconstruit pas), donc tous les réglages continuent de
   fonctionner à l'identique, détachés ou rattachés.
   Position, taille et état sont mémorisés par section.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var STORAGE_KEY = 'bird_widgets_v1';
var layer = null;
var sidebar = null;
var sections = [];
var layout = {};
var zTop = 900;
var onLayoutChange = null;

var DETACH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9"/><path d="m4 4 5 5"/><path d="M15 20l5-5"/><path d="m20 20-5-5"/><path d="M4 15h6v5H4zM14 4h6v6h-6z"/></svg>';
var DOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6"/><path d="m20 4-6 6"/><path d="M10 20H4v-6"/><path d="m4 20 6-6"/><path d="M4 4h6v6H4z"/></svg>';
var COLLAPSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
var CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

function loadLayout() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    layout = raw ? JSON.parse(raw) : {};
  } catch (e) { layout = {}; }
  if (!layout || typeof layout !== 'object') layout = {};
}
function saveLayout() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (e) {}
  if (onLayoutChange) onLayoutChange();
}

function sectionTitle(section) {
  var h = section.querySelector('h3');
  return h ? h.textContent.trim() : section.dataset.section;
}

/* Les sections ont des identifiants historiques (textProps, shapeProps…) :
   on les retrouve donc par data-section, qui est la clé stable. */
function sectionEl(name) {
  return document.getElementById('section-' + name) ||
    document.querySelector('.props-section[data-section="' + name + '"]');
}

function ensureId(section, index) {
  var name = section.dataset.section || ('section' + index);
  if (!section.id) section.id = 'section-' + name;
  return name;
}

/* ── En-tête de section avec bouton « détacher » ── */
function decorateSection(section, name) {
  var h = section.querySelector(':scope > h3');
  if (!h) return;
  if (section.querySelector(':scope > .section-head')) return;
  var head = document.createElement('div');
  head.className = 'section-head';
  head.appendChild(h);
  // Le <h3> doit être dans le document avant de lire son libellé.
  section.insertBefore(head, section.firstChild);
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'section-action section-detach';
  btn.title = 'Détacher ce panneau en widget';
  btn.setAttribute('aria-label', 'Détacher ' + sectionTitle(section));
  btn.innerHTML = DETACH_ICON;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    detach(name);
  });
  head.appendChild(btn);
}

/* ── Carte flottante ── */
function createWidget(name, section) {
  var card = document.createElement('div');
  card.className = 'sp-widget';
  card.dataset.section = name;

  var head = document.createElement('div');
  head.className = 'sp-widget-head';
  head.innerHTML = '<span class="dot"></span><span class="sp-widget-title">' +
    sectionTitle(section) + '</span>';

  var collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'sp-widget-btn';
  collapse.title = 'Replier';
  collapse.innerHTML = COLLAPSE_ICON;
  collapse.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleCollapse(name);
  });

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'sp-widget-btn';
  close.title = 'Rattacher au panneau';
  close.innerHTML = CLOSE_ICON;
  close.addEventListener('click', function (e) {
    e.stopPropagation();
    dock(name);
  });

  head.appendChild(collapse);
  head.appendChild(close);

  var body = document.createElement('div');
  body.className = 'sp-widget-body';
  body.appendChild(section);

  card.appendChild(head);
  card.appendChild(body);
  layer.appendChild(card);

  makeDraggable(card, head, name);
  return card;
}

function makeDraggable(card, handle, name) {
  var startX = 0, startY = 0, origX = 0, origY = 0, dragging = false;

  handle.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    dragging = true;
    card.classList.add('is-dragging');
    card.style.zIndex = String(++zTop);
    startX = e.clientX;
    startY = e.clientY;
    var r = card.getBoundingClientRect();
    origX = r.left;
    origY = r.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var nx = origX + (e.clientX - startX);
    var ny = origY + (e.clientY - startY);
    var maxX = window.innerWidth - card.offsetWidth - 4;
    var maxY = window.innerHeight - 36;
    nx = Math.max(4, Math.min(maxX, nx));
    ny = Math.max(4, Math.min(maxY, ny));
    card.style.left = nx + 'px';
    card.style.top = ny + 'px';
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  });

  handle.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('is-dragging');
    try { handle.releasePointerCapture(e.pointerId); } catch (err) {}
    layout[name] = layout[name] || {};
    layout[name].x = Math.round(card.getBoundingClientRect().left);
    layout[name].y = Math.round(card.getBoundingClientRect().top);
    saveLayout();
  });
}

function place(card, name) {
  var cfg = layout[name] || {};
  var count = layer.querySelectorAll('.sp-widget').length - 1;
  var x = typeof cfg.x === 'number' ? cfg.x : Math.max(12, window.innerWidth - 300 - 268);
  var y = typeof cfg.y === 'number' ? cfg.y : 64 + Math.max(0, count) * 34;
  card.style.left = x + 'px';
  card.style.top = y + 'px';
  card.style.zIndex = String(++zTop);
  if (cfg.width && cfg.width >= 200) card.style.width = cfg.width + 'px';
  if (cfg.collapsed) card.classList.add('is-collapsed');
}

/* ── API publique ── */
function detach(name) {
  var section = sectionEl(name);
  if (!section || section.classList.contains('is-detached')) return;
  var cfg = layout[name] || (layout[name] = {});
  cfg.detached = true;
  section.classList.add('is-detached');
  var card = createWidget(name, section);
  place(card, name);
  if (cfg.collapsed) card.classList.add('is-collapsed');
  saveLayout();
  renderList();
  if (sidebar) sidebar.classList.remove('collapsed');
}

function dock(name) {
  var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
  var section = sectionEl(name);
  var content = document.querySelector('.props-content');
  if (card && section && content) {
    // Retour à la position d'origine : la section retrouve sa place dans l'ordre.
    var order = sections.map(function (s) { return s.dataset.section; });
    var index = order.indexOf(name);
    var anchor = null;
    for (var i = index + 1; i < order.length; i++) {
      var next = sectionEl(order[i]);
      if (next && !next.classList.contains('is-detached')) { anchor = next; break; }
    }
    if (anchor) content.insertBefore(section, anchor);
    else content.appendChild(section);
    section.classList.remove('is-detached');
    card.remove();
  }
  if (layout[name]) {
    layout[name].detached = false;
    delete layout[name].x;
    delete layout[name].y;
  }
  saveLayout();
  renderList();
}

function toggleCollapse(name) {
  var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
  if (!card) return;
  card.classList.toggle('is-collapsed');
  layout[name] = layout[name] || {};
  layout[name].collapsed = card.classList.contains('is-collapsed');
  saveLayout();
  renderList();
}

function dockAll() {
  Object.keys(layout).forEach(function (name) {
    if (layout[name] && layout[name].detached) dock(name);
  });
}

function reset() {
  dockAll();
  layout = {};
  saveLayout();
  renderList();
}

function renderList() {
  var list = document.getElementById('widgetsList');
  if (!list) return;
  list.innerHTML = '';
  sections.forEach(function (section) {
    var name = section.dataset.section;
    var cfg = layout[name] || {};
    var row = document.createElement('div');
    row.className = 'widget-row';
    var label = document.createElement('span');
    label.className = 'widget-name';
    label.textContent = sectionTitle(section);
    var state = document.createElement('span');
    state.className = 'widget-state' + (cfg.detached ? '' : ' is-docked');
    state.textContent = cfg.detached ? 'Détaché' : 'Ancré';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = cfg.detached ? 'Rattacher' : 'Détacher';
    btn.innerHTML = cfg.detached ? DOCK_ICON : DETACH_ICON;
    btn.addEventListener('click', function () {
      if (cfg.detached) dock(name); else detach(name);
    });
    row.appendChild(label);
    row.appendChild(state);
    row.appendChild(btn);
    list.appendChild(row);
  });
  if (!sections.length) {
    list.innerHTML = '<div class="widgets-empty">Aucun panneau.</div>';
  }
}

/* Une section masquée (texte sans sélection, forme non applicable…)
   masque aussi son widget : le panneau reste cohérent dans les deux états. */
function syncVisibility() {
  sections.forEach(function (section) {
    var name = section.dataset.section;
    var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
    if (!card) return;
    card.style.display = section.hasAttribute('hidden') ? 'none' : '';
  });
}

function init(options) {
  options = options || {};
  sidebar = options.sidebar || document.getElementById('rightSidebar');
  layer = options.layer || document.getElementById('widgetsLayer');
  if (!layer) return null;
  loadLayout();

  sections = Array.prototype.slice.call(
    document.querySelectorAll('.props-content > .props-section')
  );
  sections.forEach(function (section, i) {
    var name = ensureId(section, i);
    decorateSection(section, name);
  });

  // Nettoyage des sections qui n'existent plus.
  Object.keys(layout).forEach(function (name) {
    if (!sectionEl(name)) delete layout[name];
  });

  // Restaure les widgets détachés.
  sections.forEach(function (section) {
    var name = section.dataset.section;
    if (layout[name] && layout[name].detached) detach(name);
  });

  var header = document.getElementById('propsHeader');
  if (header) {
    header.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      sidebar.classList.toggle('collapsed');
      sidebar.dispatchEvent(new CustomEvent('bird:sidebar-toggle'));
    });
  }
  var dockAllBtn = document.getElementById('propsDockAll');
  if (dockAllBtn) dockAllBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    dockAll();
  });
  var resetBtn = document.getElementById('widgetsReset');
  if (resetBtn) resetBtn.addEventListener('click', reset);

  renderList();
  syncVisibility();
  setInterval(syncVisibility, 400);
  window.addEventListener('resize', function () {
    // Garde les widgets dans la fenêtre après un redimensionnement.
    layer.querySelectorAll('.sp-widget').forEach(function (card) {
      var r = card.getBoundingClientRect();
      if (r.left > window.innerWidth - 60) card.style.left = Math.max(4, window.innerWidth - card.offsetWidth - 8) + 'px';
      if (r.top > window.innerHeight - 40) card.style.top = Math.max(4, window.innerHeight - 80) + 'px';
    });
  });

  return {
    detach: detach,
    dock: dock,
    dockAll: dockAll,
    reset: reset,
    toggleCollapse: toggleCollapse,
    list: function () { return sections.map(function (s) { return s.dataset.section; }); },
    layout: function () { return layout; },
    onChange: function (fn) { onLayoutChange = fn; }
  };
}

global.BirdWidgets = { init: init, version: '1.0.0' };
})(window);
