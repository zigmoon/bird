/* Bird — jour / nuit.
 *
 * Le thème ne change QU'UNE chose : `data-theme` sur <html>. Toute la palette
 * vit dans css/style.css ; ce module ne fait que choisir le jeu de variables et
 * tenir le bouton à jour.
 *
 * Deux détails qui comptent :
 *  - le thème est appliqué par un script en ligne dans <head> (voir
 *    index.html) pour éviter le flash blanc au chargement d'un thème sombre ;
 *    ce module ne fait que reprendre la main ensuite ;
 *  - le rendu des règles est fait au canvas, donc hors de portée des variables
 *    CSS : il prévient par un évènement `bird:theme` et app.js repeint.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'bird.theme';
  var DEFAULT = 'light';
  var THEMES = ['light', 'dark'];
  var root = document.documentElement;
  var listeners = [];

  function stored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (THEMES.indexOf(v) >= 0) return v;
    } catch (e) { /* navigation privée */ }
    return DEFAULT;
  }

  function current() {
    var v = root.getAttribute('data-theme');
    return THEMES.indexOf(v) >= 0 ? v : DEFAULT;
  }

  /* Le libellé annonce l'action, pas l'état : « Mode nuit » quand on est le
     jour. C'est ce que fait un bouton, et c'est ce qu'on attend d'une bascule
     dont l'icône montre la destination. */
  function syncButton(theme) {
    var btn = document.getElementById('btnTheme');
    if (!btn) return;
    var toDark = theme !== 'dark';
    var label = toDark ? 'Mode nuit' : 'Mode jour';
    if (global.BirdI18n) label = global.BirdI18n.t(label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }

  function apply(theme, silent) {
    if (THEMES.indexOf(theme) < 0) theme = DEFAULT;
    if (theme === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    syncButton(theme);
    if (!silent) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](theme); } catch (e) { /* un abonné ne casse pas les autres */ }
      }
      try {
        global.dispatchEvent(new CustomEvent('bird:theme', { detail: { theme: theme } }));
      } catch (e) { /* CustomEvent absent : les abonnés directs suffisent */ }
    }
  }

  function set(theme) {
    apply(theme, false);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* navigation privée */ }
  }

  function toggle() {
    set(current() === 'dark' ? 'light' : 'dark');
  }

  function bind() {
    var btn = document.getElementById('btnTheme');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', toggle);
    }
    apply(current(), true);
  }

  global.BirdTheme = {
    get: current,
    set: set,
    toggle: toggle,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    label: function () { return current() === 'dark' ? 'Mode jour' : 'Mode nuit'; }
  };

  // La langue peut changer : le libellé du bouton doit suivre.
  if (global.BirdI18n && global.BirdI18n.onChange) {
    global.BirdI18n.onChange(function () { syncButton(current()); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
