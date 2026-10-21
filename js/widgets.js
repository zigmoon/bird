/* ═══════════════════════════════════════════════════════════════
   BIRD — PANNEAUX DÉTACHABLES
   ═══════════════════════════════════════════════════════════════
   Même principe que SuperPrint : ce ne sont pas des widgets
   séparés, ce sont LES SECTIONS EXISTANTES du panneau de droite
   qui se détachent. Rien à dupliquer, rien à maintenir en double.

   Choix d'implémentation : on DÉPLACE le nœud DOM (au lieu de le
   cloner et de re-router les événements comme SuperPrint). Plus
   court, et surtout impossible à désynchroniser : le widget EST le
   panneau, avec ses écouteurs déjà en place.

   L'état (détaché, replié, position) est mémorisé par section.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var STORAGE_KEY = 'bird_widgets_v2';

var HEAD_DETACH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 4 9"/><path d="m4 4 5 5"/><path d="M15 20l5-5"/><path d="m20 20-5-5"/><path d="M4 15h6v5H4zM14 4h6v6h-6z"/></svg>';
var HEAD_COLLAPSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
var HEAD_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

var layer = null;          // #widgetsLayer
var sidebar = null;        // #rightSidebar
var sections = [];         // les .props-section d'origine
var layout = {};           // nom -> { detached, collapsed, x, y }
var zTop = 900;

/* ── Persistance ── */
function loadLayout() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('bird_widgets_v1');
    layout = raw ? JSON.parse(raw) : {};
  } catch (e) { layout = {}; }
  if (!layout || typeof layout !== 'object') layout = {};
}
function saveLayout() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch (e) {}
}

/* ── Utilitaires ── */
function sectionEl(name) {
  return document.getElementById('section-' + name) ||
    document.querySelector('.props-section[data-section="' + name + '"]');
}

function sectionTitle(section) {
  var h = section.querySelector('h3');
  return h ? h.textContent.trim() : (section.dataset.section || 'Panneau');
}

function railButton(name) {
  return document.querySelector('.rightbar-icon-btn[data-section="' + name + '"]');
}

/* ── En-tête de section : titre + bouton « détacher » ──
   Construit une seule fois au démarrage. Le bouton est toujours
   visible (gris discret), pas seulement au survol : une fonction
   qu'on ne voit pas n'existe pas. */
function decorate(section, name) {
  if (section.querySelector(':scope > .section-head')) return;
  var h = section.querySelector(':scope > h3');
  if (!h) return;

  var head = document.createElement('div');
  head.className = 'section-head';
  section.insertBefore(head, section.firstChild);
  head.appendChild(h);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'section-action section-detach';
  btn.title = 'Détacher « ' + sectionTitle(section) + ' » en panneau flottant';
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = HEAD_DETACH;
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    detach(name);
  });
  head.appendChild(btn);
}

/* ── Carte flottante : on y DÉPLACE la section telle quelle ── */
function buildCard(name, section) {
  var card = document.createElement('div');
  card.className = 'sp-widget';
  card.dataset.section = name;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', sectionTitle(section));

  var head = document.createElement('div');
  head.className = 'sp-widget-head';

  var dot = document.createElement('span');
  dot.className = 'dot';
  var title = document.createElement('span');
  title.className = 'sp-widget-title';
  title.textContent = sectionTitle(section);

  var collapse = document.createElement('button');
  collapse.type = 'button';
  collapse.className = 'sp-widget-btn';
  collapse.title = 'Replier / déplier';
  collapse.innerHTML = HEAD_COLLAPSE;
  collapse.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleCollapse(name);
  });

  var close = document.createElement('button');
  close.type = 'button';
  close.className = 'sp-widget-btn';
  close.title = 'Rattacher au panneau de droite';
  close.innerHTML = HEAD_CLOSE;
  close.addEventListener('click', function (e) {
    e.stopPropagation();
    dock(name);
  });

  head.appendChild(dot);
  head.appendChild(title);
  head.appendChild(collapse);
  head.appendChild(close);

  var body = document.createElement('div');
  body.className = 'sp-widget-body';
  body.appendChild(section);
  section.classList.add('is-floating');

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
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  handle.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var nx = origX + (e.clientX - startX);
    var ny = origY + (e.clientY - startY);
    nx = Math.max(4, Math.min(window.innerWidth - card.offsetWidth - 4, nx));
    ny = Math.max(4, Math.min(window.innerHeight - 36, ny));
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
    var r = card.getBoundingClientRect();
    layout[name].x = Math.round(r.left);
    layout[name].y = Math.round(r.top);
    saveLayout();
  });
}

function place(card, name) {
  var cfg = layout[name] || {};
  var index = Array.prototype.indexOf.call(layer.querySelectorAll('.sp-widget'), card);
  var cascade = Math.max(0, index) * 30;
  var x = typeof cfg.x === 'number' ? cfg.x : Math.max(12, window.innerWidth - 304 - 268);
  var y = typeof cfg.y === 'number' ? cfg.y : 64 + cascade;
  card.style.left = x + 'px';
  card.style.top = y + 'px';
  card.style.zIndex = String(++zTop);
  if (cfg.collapsed) card.classList.add('is-collapsed');
}

/* ── Détacher / rattacher ── */
function detach(name) {
  var section = sectionEl(name);
  if (!section || section.classList.contains('is-detached')) return;

  layout[name] = layout[name] || {};
  layout[name].detached = true;
  section.classList.add('is-detached');

  var card = buildCard(name, section);
  place(card, name);
  if (sidebar) sidebar.classList.remove('collapsed');
  markRail(name, true);
  saveLayout();
  card.classList.add('is-entering');
  setTimeout(function () { card.classList.remove('is-entering'); }, 180);
  return card;
}

function dock(name) {
  var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
  var section = sectionEl(name);
  var content = document.querySelector('.props-content');
  if (card && section && content) {
    // Retour à la place d'origine, dans l'ordre du panneau.
    var order = sections.map(function (s) { return s.dataset.section; });
    var anchor = null;
    for (var i = order.indexOf(name) + 1; i < order.length; i++) {
      var next = sectionEl(order[i]);
      if (next && !next.classList.contains('is-detached')) { anchor = next; break; }
    }
    if (anchor) content.insertBefore(section, anchor);
    else content.appendChild(section);
    section.classList.remove('is-detached');
    section.classList.remove('is-floating');
    card.remove();
  }
  if (layout[name]) {
    layout[name].detached = false;
    delete layout[name].x;
    delete layout[name].y;
  }
  markRail(name, false);
  saveLayout();
}

function toggleCollapse(name) {
  var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
  if (!card) return;
  card.classList.toggle('is-collapsed');
  layout[name] = layout[name] || {};
  layout[name].collapsed = card.classList.contains('is-collapsed');
  saveLayout();
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
}

/* ── Rail d'icônes : reflète l'état détaché ──
   Une section détachée n'est plus dans le panneau : cliquer son icône
   doit faire remonter le widget, pas faire défiler une section
   devenue invisible. */
function markRail(name, detached) {
  var btn = railButton(name);
  if (!btn) return;
  btn.classList.toggle('has-widget', !!detached);
  btn.dataset.detached = detached ? '1' : '';
  btn.title = btn.title.replace(/\s*·\s*détaché$/, '') + (detached ? ' · détaché' : '');
}

function raise(name) {
  var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
  if (!card) return false;
  card.style.zIndex = String(++zTop);
  card.classList.remove('is-pulse');
  void card.offsetWidth;
  card.classList.add('is-pulse');
  setTimeout(function () { card.classList.remove('is-pulse'); }, 520);
  return true;
}

/* ── Une section masquée par l'application (texte sans sélection…)
      masque aussi son widget : les deux restent cohérents. ── */
function syncVisibility() {
  sections.forEach(function (section) {
    var name = section.dataset.section;
    var card = layer.querySelector('.sp-widget[data-section="' + name + '"]');
    if (!card) return;
    var hidden = section.hasAttribute('hidden');
    var shown = card.style.display !== 'none';
    if (hidden === shown) card.style.display = hidden ? 'none' : '';
  });
}

/* La largeur du panneau est publiée sur :root : le widget de zoom s'écarte
   d'autant. Une seule source de vérité, aucun style en ligne. */
function publish() {
  if (!sidebar) return;
  var w = Math.round(sidebar.getBoundingClientRect().width) || 56;
  document.documentElement.style.setProperty('--bird-sidebar-r', w + 'px');
}

/* ── Initialisation ── */
function init(options) {
  options = options || {};
  sidebar = options.sidebar || document.getElementById('rightSidebar');
  layer = options.layer || document.getElementById('widgetsLayer');
  if (!layer || !sidebar) return null;

  loadLayout();

  sections = Array.prototype.slice.call(
    document.querySelectorAll('.props-content > .props-section')
  );
  sections.forEach(function (section, i) {
    var name = section.dataset.section || 'section' + i;
    section.dataset.section = name;
    if (!section.id) section.id = 'section-' + name;
    decorate(section, name);
  });

  // Reprise de la session précédente.
  sections.forEach(function (section) {
    var name = section.dataset.section;
    if (layout[name] && layout[name].detached) detach(name);
  });

  // En-tête du panneau : replier / déplier. Bouton ↧ : tout rattacher.
  var header = document.getElementById('propsHeader');
  if (header) header.addEventListener('click', function (e) {
    if (e.target.closest('button')) return;
    sidebar.classList.toggle('collapsed');
    // Le canvas et les règles portent des tailles en pixels : ils doivent
    // suivre la scène. `publish()` met le widget de zoom à jour, l'appel
    // ci-dessous réajuste la surface — sans recadrer la vue, donc sans
    // déplacer le dessin de l'utilisateur.
    if (window.Bird && Bird.view && Bird.view.resize) Bird.view.resize();
    publish();
  });
  var dockAllBtn = document.getElementById('propsDockAll');
  if (dockAllBtn) dockAllBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    dockAll();
  });

  // Icônes du rail : si la section est détachée, on remonte le widget.
  document.querySelectorAll('.rightbar-icon-btn[data-section]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var name = btn.dataset.section;
      if (layout[name] && layout[name].detached) {
        e.stopImmediatePropagation();
        e.preventDefault();
        raise(name);
      }
    }, true);
  });

  sections.forEach(function (section) {
    var cfg = layout[section.dataset.section];
    if (cfg && cfg.detached) markRail(section.dataset.section, true);
  });

  syncVisibility();
  setInterval(syncVisibility, 400);
  publish();

  window.addEventListener('resize', function () {
    layer.querySelectorAll('.sp-widget').forEach(function (card) {
      var r = card.getBoundingClientRect();
      if (r.left > window.innerWidth - 80) {
        card.style.left = Math.max(4, window.innerWidth - card.offsetWidth - 8) + 'px';
      }
      if (r.top > window.innerHeight - 60) {
        card.style.top = Math.max(4, window.innerHeight - 80) + 'px';
      }
    });
  });

  return {
    detach: detach,
    dock: dock,
    dockAll: dockAll,
    reset: reset,
    raise: raise,
    toggleCollapse: toggleCollapse,
    isDetached: function (name) { return !!(layout[name] && layout[name].detached); },
    list: function () { return sections.map(function (s) { return s.dataset.section; }); },
    layout: function () { return layout; }
  };
}

global.BirdWidgets = { init: init, publish: publish, version: '2.7.0' };

})(window);
