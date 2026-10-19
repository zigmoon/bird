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
     dont l'icône montre la destination.

     On écrit la chaîne FRANÇAISE, jamais sa traduction : le français est la
     langue source du DOM et c'est `js/i18n.js` qui rend la langue courante.
     Écrire ici le résultat de `BirdI18n.t()` faisait passer de l'anglais pour
     une écriture applicative, et le libellé ne revenait plus en français. */
  function syncButton(theme) {
    var btn = document.getElementById('btnTheme');
    if (!btn) return;
    var label = theme !== 'dark' ? 'Mode nuit' : 'Mode jour';
    btn.setAttribute('title', label);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    // Application immédiate de la langue courante : sinon le libellé reste
    // une micro-tâche en français avant que l'observateur ne le traduise.
    if (global.BirdI18n && global.BirdI18n.applyElement) global.BirdI18n.applyElement(btn);
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
    // Pour les appelants de l'API : la langue courante, pas la source. C'est
    // une valeur qui sort du DOM, d'où la traduction explicite.
    label: function () {
      var raw = current() === 'dark' ? 'Mode jour' : 'Mode nuit';
      return global.BirdI18n ? global.BirdI18n.t(raw) : raw; // i18n:allow valeur d'API, hors DOM
    }
  };

  // La langue peut changer : le libellé du bouton doit suivre. `syncButton`
  // écrit la source française, l'observateur d'i18n applique la langue.
  if (global.BirdI18n && global.BirdI18n.onChange) {
    global.BirdI18n.onChange(function () { syncButton(current()); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})(typeof window !== 'undefined' ? window : this);
