/* ═══════════════════════════════════════════════════════════════
   BIRD PLUG-INS — hôte, registre et tiroir de réglages
   ═══════════════════════════════════════════════════════════════
   Un plug-in est un fichier `.plugin.js` qui appelle
   `BirdPlugins.register(manifeste)`. Il ne touche jamais au DOM de
   l'application : il passe par `api` (document, sélection, ajout,
   historique, notifications). C'est ce contrat qui rend les
   plug-ins stables quand Bird évolue.

   ⚠️ Même compromis que SuperPrint, Photoshop ou une extension VS Code :
   un plug-in est un script que l'utilisateur choisit d'installer. Il
   s'exécute avec les droits de la page ; il n'existe pas de bac à sable
   étanche en JavaScript navigateur. L'API n'est donc pas une frontière
   de sécurité, c'est une frontière de CONTRAT.
   ═══════════════════════════════════════════════════════════════ */
(function (global) {
'use strict';

var REGISTRY_KEY = 'bird_plugins_v1';
var ACTIVE_KEY = 'bird_plugins_actifs_v1';
var SETTINGS_KEY = 'bird_plugin_settings_v1';
var VERSION = '1.0.0';

var registry = {};       // id -> manifeste
var active = {};         // id -> bool
var sources = {};        // id -> code source (plug-ins installés)
var settings = {};       // id -> valeurs
var hostContext = null;
var ui = {};

/* ── Stockage ── */
function read(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
function loadState() {
  sources = read(REGISTRY_KEY, {}) || {};
  active = read(ACTIVE_KEY, {}) || {};
  settings = read(SETTINGS_KEY, {}) || {};
}
function saveSources() { write(REGISTRY_KEY, sources); }
function saveActive() { write(ACTIVE_KEY, active); }
function saveSettings() { write(SETTINGS_KEY, settings); }

/* ── Icônes par défaut ── */
var DEFAULT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v4M15 3v4"/><path d="M7 7h10v5a5 5 0 0 1-10 0V7z"/><path d="M12 17v4"/></svg>';

/* ── Contexte hôte ── */
function H() {
  if (hostContext) return hostContext;
  var canvas = (global.Bird && global.Bird.canvas) || global.__birdCanvas;
  hostContext = {
    canvas: canvas,
    state: global.Bird ? global.Bird.state : (canvas && canvas.__plume ? canvas.__plume.state : {}),
    toast: function (msg, err) {
      if (global.Bird && global.__birdToast) global.__birdToast(msg, err);
      else console.log('[plug-in]', msg);
    },
    beginTxn: function () { if (global.__birdBeginTxn) global.__birdBeginTxn(); },
    commit: function (label) { if (global.__birdCommitUndo) global.__birdCommitUndo(label); },
    refresh: function () {
      if (global.__birdRefreshSelection) global.__birdRefreshSelection();
      if (global.__birdRenderLayers) global.__birdRenderLayers();
      canvas && canvas.requestRenderAll();
    }
  };
  return hostContext;
}

/* ── API donnée à chaque plug-in ── */
function createApi(manifest) {
  var id = manifest.id;
  var ctx = H();

  function canvas() {
    var c = ctx.canvas;
    if (!c) throw new Error('Plan de travail indisponible');
    return c;
  }

  var pluginSettings = settings[id] || (settings[id] = {});

  var api = {
    version: VERSION,
    id: id,

    get fabric() { return global.fabric; },
    get canvas() { return canvas(); },

    get document() {
      var c = canvas();
      var st = ctx.state || {};
      return {
        width: st.artboardW || 800,
        height: st.artboardH || 600,
        background: st.artboardColor || '#ffffff',
        objects: c.getObjects().slice()
      };
    },

    get settings() {
      return {
        get: function (key, fallback) {
          return Object.prototype.hasOwnProperty.call(pluginSettings, key) ? pluginSettings[key] : fallback;
        },
        set: function (key, value) {
          pluginSettings[key] = value;
          saveSettings();
        },
        all: function () { return Object.assign({}, pluginSettings); }
      };
    },

    selection: function () {
      var c = canvas();
      var obj = c.getActiveObject();
      if (!obj) return [];
      if (obj.type === 'activeSelection' && obj._objects) return obj._objects.slice();
      return [obj];
    },
    selectionBounds: function () {
      var objs = api.selection();
      if (!objs.length) return null;
      var boxes = objs.map(function (o) { return o.getBoundingRect(true, true); });
      var left = Math.min.apply(null, boxes.map(function (b) { return b.left; }));
      var top = Math.min.apply(null, boxes.map(function (b) { return b.top; }));
      var right = Math.max.apply(null, boxes.map(function (b) { return b.left + b.width; }));
      var bottom = Math.max.apply(null, boxes.map(function (b) { return b.top + b.height; }));
      return { left: left, top: top, width: right - left, height: bottom - top, objects: objs };
    },

    /* Ajoute un objet, avec une entrée d'historique unique. */
    add: function (object, label) {
      if (!object) return null;
      var c = canvas();
      ctx.beginTxn();
      c.add(object);
      ctx.commit(label || manifest.name);
      ctx.refresh();
      scheduleDirty();
      return object;
    },

    /* Remplace la sélection par de nouveaux objets. */
    replaceSelection: function (objects, label) {
      var c = canvas();
      var current = api.selection();
      ctx.beginTxn();
      current.forEach(function (o) { c.remove(o); });
      c.discardActiveObject();
      (objects || []).forEach(function (o) { if (o) c.add(o); });
      ctx.commit(label || manifest.name);
      ctx.refresh();
      scheduleDirty();
    },

    /* Historique : la transaction est ouverte par l'appelant. */
    begin: function () { ctx.beginTxn(); },
    commit: function (label) { ctx.commit(label || manifest.name); ctx.refresh(); scheduleDirty(); },

    toast: function (msg, isError) { ctx.toast(msg, isError); },
    t: function (value) { return value; },

    /* SVG → groupe Fabric (même moteur que l'import). */
    svgToGroup: function (svgText) {
      return new Promise(function (resolve, reject) {
        global.fabric.loadSVGFromString(String(svgText), function (objects, options) {
          try {
            if (!objects || !objects.length) { reject(new Error('SVG vide')); return; }
            resolve(objects.length === 1 ? objects[0] : global.fabric.util.groupSVGElements(objects, options));
          } catch (e) { reject(e); }
        });
      });
    },

    /* Rend un canvas de tuile en motif Fabric prêt à remplir une forme. */
    pattern: function (source, repeat, transform) {
      return new global.fabric.Pattern({
        source: source,
        repeat: repeat || 'repeat',
        patternTransform: transform || null
      });
    }
  };

  return api;
}

function scheduleDirty() {
  if (global.__birdSetDirty) global.__birdSetDirty(true);
}

/* ── Registre ── */
function register(manifest) {
  if (!manifest || !manifest.id) throw new Error('Manifeste sans identifiant');
  var id = String(manifest.id);
  var existing = registry[id] || {};
  registry[id] = Object.assign({}, existing, manifest, {
    id: id,
    name: manifest.name || id,
    version: manifest.version || '1.0.0',
    description: manifest.description || '',
    builtin: manifest.builtin !== undefined ? manifest.builtin : !!existing.builtin,
    icon: manifest.icon || existing.icon || DEFAULT_ICON
  });
  // Activation par défaut : seulement si l'utilisateur n'a jamais tranché.
  if (manifest.actifParDefaut && active[id] === undefined) active[id] = true;
  if (active[id] === undefined) active[id] = false;
  renderList();
  syncToolbar();
  return registry[id];
}

/* ── Chargement des plug-ins intégrés ── */
function loadBuiltin(file) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = file;
    script.async = true;
    script.dataset.birdPlugin = file;
    script.onload = function () { resolve(); };
    script.onerror = function () { reject(new Error('Chargement impossible : ' + file)); };
    document.head.appendChild(script);
  });
}

var BUILTINS = [
  'plugins/motif-vectoriel.plugin.js'
];

/* Le dossier des plug-ins livrés est résolu depuis l'emplacement du script :
   la version autonome les sert depuis la racine, la version Astro depuis
   /assets/bird/. Sans cela, /editor chercherait /plugins/… */
function pluginBaseUrl() {
  var script = document.querySelector('script[src*="js/plugins.js"], script[src*="js\\plugins.js"]');
  if (script && script.src) return script.src.replace(/js\/plugins\.js.*$/, '');
  return '';
}

function builtinUrl(file) {
  var base = pluginBaseUrl();
  return base ? base + file : file;
}

/* ── Exécution d'un plug-in installé ── */
function evaluateSource(id, source) {
  var manifest = registry[id];
  if (!manifest) throw new Error('Plug-in inconnu : ' + id);
  var api = createApi(manifest);
  var fn = new Function('api', 'BirdPlugins', '"use strict";\n' + source);
  fn(api, module.exports);
}

/* ── Tiroir de réglages généré depuis `ui.fields` ── */
function currentValues(manifest) {
  var saved = settings[manifest.id] || {};
  var values = {};
  (manifest.ui && manifest.ui.fields || []).forEach(function (field) {
    if (field.type === 'group') return;
    values[field.key] = Object.prototype.hasOwnProperty.call(saved, field.key)
      ? saved[field.key]
      : field.value;
  });
  return values;
}

function buildField(field, values, onChange) {
  var wrap = document.createElement('label');
  wrap.className = 'plugin-field';

  var head = document.createElement('span');
  head.textContent = field.label || field.key;
  var output = null;
  if (field.type === 'range') {
    output = document.createElement('output');
    head.appendChild(output);
  }
  wrap.appendChild(head);

  var input;
  if (field.type === 'select') {
    input = document.createElement('select');
    (field.options || []).forEach(function (opt) {
      var o = document.createElement('option');
      o.value = String(opt.value);
      o.textContent = opt.label;
      input.appendChild(o);
    });
    input.value = String(values[field.key]);
    input.addEventListener('change', function () {
      values[field.key] = input.value;
      onChange();
    });
  } else if (field.type === 'color') {
    input = document.createElement('input');
    input.type = 'color';
    input.value = values[field.key] || '#000000';
    input.addEventListener('input', function () {
      values[field.key] = input.value;
      onChange();
    });
  } else if (field.type === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    if (field.step !== undefined) input.step = field.step;
    input.value = values[field.key];
    input.addEventListener('input', function () {
      values[field.key] = Number(input.value);
      onChange();
    });
  } else if (field.type === 'checkbox') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!values[field.key];
    input.addEventListener('change', function () {
      values[field.key] = input.checked;
      onChange();
    });
    wrap.classList.add('plugin-check');
    wrap.insertBefore(input, head);
  } else if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.value = values[field.key] || '';
    input.addEventListener('input', function () {
      values[field.key] = input.value;
      onChange();
    });
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = values[field.key] == null ? '' : values[field.key];
    input.addEventListener('input', function () {
      values[field.key] = input.value;
      onChange();
    });
  }

  if (field.type === 'range') {
    input.type = 'range';
    input.min = field.min !== undefined ? field.min : 0;
    input.max = field.max !== undefined ? field.max : 100;
    input.step = field.step !== undefined ? field.step : 1;
    input.value = values[field.key];
    input.addEventListener('input', function () {
      values[field.key] = Number(input.value);
      if (output) output.textContent = input.value + (field.unit || '');
      onChange();
    });
    if (output) output.textContent = input.value + (field.unit || '');
  }

  if (field.type !== 'checkbox') wrap.appendChild(input);
  return wrap;
}

function openDrawer(manifest) {
  var drawer = ui.drawer;
  var body = ui.body;
  if (!drawer || !body) return;
  var values = currentValues(manifest);

  ui.title.textContent = manifest.name + (manifest.version ? ' — v' + manifest.version : '');
  ui.hint.textContent = manifest.description || '';
  body.innerHTML = '';

  var preview = null;
  var api = createApi(manifest);

  if (manifest.ui && manifest.ui.preview !== false) {
    preview = document.createElement('canvas');
    preview.className = 'plugin-preview';
    preview.width = 640;
    preview.height = 380;
    body.appendChild(preview);
  }

  var render = function () {
    if (!preview) return;
    try {
      var ctx2d = preview.getContext('2d');
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, preview.width, preview.height);
      if (typeof manifest.preview === 'function') {
        ctx2d.save();
        manifest.preview(api, values, preview, ctx2d);
        ctx2d.restore();
      }
    } catch (e) {
      console.warn('[plugin preview]', e);
    }
  };

  var scheduleRender = function () {
    if (preview && preview._raf) return;
    if (preview) preview._raf = requestAnimationFrame(function () {
      preview._raf = 0;
      render();
    });
    else render();
  };

  var pending = [];
  (manifest.ui && manifest.ui.fields || []).forEach(function (field) {
    if (field.type === 'group') {
      var grid = document.createElement('div');
      grid.className = 'plugin-row';
      (field.fields || []).forEach(function (sub) {
        grid.appendChild(buildField(sub, values, scheduleRender));
      });
      body.appendChild(grid);
      return;
    }
    if (field.row) {
      pending.push(field);
      if (pending.length === 2) {
        var row = document.createElement('div');
        row.className = 'plugin-row';
        pending.forEach(function (f) { row.appendChild(buildField(f, values, scheduleRender)); });
        body.appendChild(row);
        pending = [];
      }
      return;
    }
    body.appendChild(buildField(field, values, scheduleRender));
  });
  if (pending.length) {
    var lastRow = document.createElement('div');
    lastRow.className = 'plugin-row';
    pending.forEach(function (f) { lastRow.appendChild(buildField(f, values, scheduleRender)); });
    body.appendChild(lastRow);
  }

  // Actions secondaires éventuelles
  if (manifest.ui && Array.isArray(manifest.ui.actions)) {
    var actions = document.createElement('div');
    actions.className = 'btn-row';
    manifest.ui.actions.forEach(function (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = action.label;
      btn.addEventListener('click', function () {
        try {
          action.run(api, values);
          scheduleRender();
        } catch (e) {
          console.error('[plugin action]', e);
          api.toast(action.label + ' : ' + (e.message || 'échec'), true);
        }
      });
      actions.appendChild(btn);
    });
    body.appendChild(actions);
  }

  render();

  ui.run.onclick = function () {
    try {
      settings[manifest.id] = Object.assign({}, values);
      saveSettings();
      var result = manifest.run(api, values);
      if (result && typeof result.then === 'function') {
        result.then(function () { closeDrawer(); }).catch(function (e) {
          console.error('[plugin run]', e);
          api.toast('Plug-in : ' + (e.message || 'échec'), true);
        });
      } else {
        closeDrawer();
      }
    } catch (e) {
      console.error('[plugin run]', e);
      ui.hint.textContent = 'Erreur : ' + (e.message || e);
    }
  };

  drawer.hidden = false;
  drawer.dataset.plugin = manifest.id;
}

function closeDrawer() {
  if (ui.drawer) {
    ui.drawer.hidden = true;
    delete ui.drawer.dataset.plugin;
  }
}

/* ── Activation / désactivation ── */
function toggle(id) {
  var manifest = registry[id];
  if (!manifest) return;
  if (active[id]) {
    active[id] = false;
    saveActive();
    renderList();
    syncToolbar();
    H().toast(manifest.name + ' désactivé');
    return;
  }
  // Un plug-in installé doit être évalué avant utilisation.
  if (sources[id] && !manifest.__loaded) {
    try {
      evaluateSource(id, sources[id]);
      manifest.__loaded = true;
    } catch (e) {
      console.error('[plugin activate]', e);
      H().toast('Activation impossible : ' + (e.message || e), true);
      return;
    }
  }
  active[id] = true;
  saveActive();
  renderList();
  syncToolbar();
  H().toast(manifest.name + ' activé ✓');
}

/* ── Rendu du panneau ── */
function renderList() {
  var list = document.getElementById('pluginsList');
  if (!list) return;
  list.innerHTML = '';
  var ids = Object.keys(registry);
  if (!ids.length) {
    list.innerHTML = '<div class="plugins-empty">Chargement des plug-ins…</div>';
    return;
  }
  ids.sort(function (a, b) {
    var A = registry[a], B = registry[b];
    if (!!A.builtin !== !!B.builtin) return A.builtin ? -1 : 1;
    return String(A.name).localeCompare(String(B.name), 'fr');
  });
  ids.forEach(function (id) {
    var m = registry[id];
    var card = document.createElement('div');
    card.className = 'plugin-card';

    var top = document.createElement('div');
    top.className = 'plugin-card-top';

    var name = document.createElement('span');
    name.className = 'plugin-name';
    name.textContent = m.name;

    var version = document.createElement('span');
    version.className = 'plugin-version';
    version.textContent = 'v' + m.version;

    var sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'plugin-switch' + (active[id] ? ' on' : '');
    sw.title = active[id] ? 'Désactiver' : 'Activer';
    sw.setAttribute('aria-pressed', String(!!active[id]));
    sw.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle(id);
    });

    top.appendChild(name);
    top.appendChild(version);
    top.appendChild(sw);
    card.appendChild(top);

    if (m.description) {
      var desc = document.createElement('p');
      desc.className = 'plugin-desc';
      desc.textContent = m.description;
      card.appendChild(desc);
    }

    var actions = document.createElement('div');
    actions.className = 'plugin-actions';

    var use = document.createElement('button');
    use.type = 'button';
    use.className = 'btn btn-primary';
    use.textContent = active[id] ? 'Utiliser' : 'Configurer';
    use.addEventListener('click', function () {
      if (!active[id]) toggle(id);
      if (!active[id]) return;
      openDrawer(registry[id]);
    });
    actions.appendChild(use);

    if (!m.builtin) {
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn';
      del.textContent = 'Retirer';
      del.addEventListener('click', function () {
        delete sources[id];
        delete registry[id];
        delete active[id];
        saveSources(); saveActive();
        renderList(); syncToolbar();
        H().toast('Plug-in retiré');
      });
      actions.appendChild(del);
    }

    card.appendChild(actions);
    list.appendChild(card);
  });
}

/* ── Icônes des plug-ins actifs dans la barre haute ──
   Volontairement vide : l'accès aux plug-ins actifs se fait par le panneau
   « Plug-ins » du rail de droite. La barre haute ne doit pas se remplir
   d'un bouton par extension installée — c'est le rôle du panneau. */
function syncToolbar() {
  document.querySelectorAll('.topbar-center .plugin-tool-btn').forEach(function (b) { b.remove(); });
}

/* ── Installation depuis un fichier ── */
function installFromFile(file) {
  return file.text().then(function (source) {
    var match = source.match(/id\s*:\s*['"]([^'"]+)['"]/);
    if (!match) throw new Error('Manifeste introuvable : la propriété `id` est obligatoire.');
    var id = match[1];
    sources[id] = source;
    saveSources();
    // Évaluation immédiate pour connaître le manifeste complet.
    var existing = registry[id];
    if (existing) existing.__loaded = false;
    // Un plug-in installé déclare lui-même son manifeste via register().
    var sandbox = {
      register: register
    };
    var fn = new Function('BirdPlugins', '"use strict";\n' + source);
    fn(sandbox);
    if (!registry[id]) throw new Error('Le plug-in n’a pas appelé BirdPlugins.register().');
    registry[id].builtin = false;
    registry[id].__loaded = true;
    active[id] = false;
    saveActive();
    renderList();
    H().toast('Plug-in « ' + registry[id].name + ' » installé');
  });
}

/* ── Initialisation ── */
function init() {
  loadState();
  ui.drawer = document.getElementById('pluginDrawer');
  ui.body = document.getElementById('pluginDrawerBody');
  ui.title = document.getElementById('pluginDrawerTitle');
  ui.hint = document.getElementById('pluginDrawerHint');
  ui.run = document.getElementById('pluginDrawerRun');
  var closeBtns = [
    document.getElementById('pluginDrawerClose'),
    document.getElementById('pluginDrawerCancel')
  ];
  closeBtns.forEach(function (btn) { if (btn) btn.addEventListener('click', closeDrawer); });
  if (ui.drawer) {
    ui.drawer.addEventListener('click', function (e) { if (e.target === ui.drawer) closeDrawer(); });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && ui.drawer && !ui.drawer.hidden) closeDrawer();
  });

  var installBtn = document.getElementById('pluginsInstall');
  var fileInput = document.getElementById('pluginFile');
  if (installBtn && fileInput) {
    installBtn.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      installFromFile(file).catch(function (e) {
        console.error('[plugin install]', e);
        H().toast('Installation impossible : ' + (e.message || e), true);
      });
    });
  }
  var folderBtn = document.getElementById('pluginsFolder');
  var pluginsBtn = document.getElementById('btnPlugins');
  if (pluginsBtn) {
    pluginsBtn.addEventListener('click', function () {
      var sidebar = document.getElementById('rightSidebar');
      if (sidebar) sidebar.classList.remove('collapsed');
      requestAnimationFrame(function () {
        var target = document.getElementById('section-plugins');
        if (target) {
          if (target.classList.contains('is-detached')) {
            var card = document.querySelector('.sp-widget[data-section="plugins"]');
            if (card) card.scrollIntoView({ block: 'nearest' });
          } else {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
      });
    });
  }
  if (folderBtn) {
    folderBtn.addEventListener('click', function () {
      openDrawer({
        id: '__builtins',
        name: 'Plug-ins intégrés',
        version: '',
        description: 'Aucun fichier à télécharger : ils sont fournis avec Bird. Activez-les par l’interrupteur.',
        ui: { preview: false, fields: [] },
        run: function () {},
        icon: DEFAULT_ICON
      });
    });
  }

  renderList();
  // Chargement des plug-ins livrés avec l'application.
  BUILTINS.forEach(function (file) {
    loadBuiltin(builtinUrl(file)).catch(function (e) { console.warn('[bird plugins]', e.message); });
  });
  syncToolbar();
}

function listManifests() {
  return Object.keys(registry).map(function (id) { return registry[id]; });
}

global.BirdPlugins = {
  version: VERSION,
  init: init,
  register: register,
  open: function (id) {
    if (!registry[id]) return;
    if (!active[id]) toggle(id);
    if (active[id]) openDrawer(registry[id]);
  },
  close: closeDrawer,
  toggle: toggle,
  list: listManifests,
  isActive: function (id) { return !!active[id]; },
  render: renderList
};

})(window);
