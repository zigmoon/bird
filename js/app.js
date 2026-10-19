/* ═══════════════════════════════════════════════════════════════
  BIRD — Éditeur de dessin vectoriel
   Simple, moderne, rapide. Canvas infini, Bézier, export SVG natif.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ────────────────────────────────────────────────────────────
   CONSTANTES
──────────────────────────────────────────────────────────── */
const LS_KEY = 'bird_doc_v2';
const LS_META_KEY = 'bird_meta_v3';
const IDB_KEY = 'current';
const LEGACY_LS_KEY = 'plume_doc_v1';
const PROJECT_VERSION = 3;
const SERIALIZED_PROPS = ['_plumeData', 'name', 'birdId', 'birdLocked', 'birdHidden', '_birdShape'];
const AI_SESSION_KEY = 'bird_openrouter_key';
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 64;
const CLOSE_THRESHOLD = 12;
const HANDLE_R = 3;
const ANCHOR_R = 4;
const HIT_R = 9;
const CURVE_T = 4;
const PREVIEW = '#4f8cff';

/* ────────────────────────────────────────────────────────────
   ÉTAT GLOBAL
──────────────────────────────────────────────────────────── */
const state = {
  tool: 'select',
  zoom: 1,
  artboardW: 800,
  artboardH: 600,
  artboardColor: '#ffffff',
  dirty: false,

  // outil plume
  penActive: false,
  penMode: 'draw',           // 'draw' | 'edit'
  penPoints: [],             // [{x,y,hInX,hInY,hOutX,hOutY}]
  penUndo: [],
  penClosed: false,
  penDragging: false,
  penDown: null,
  penCur: null,              // point en cours de création
  penDragType: null,         // 'anchor'|'hIn'|'hOut'|'closing'|null
  penDragIndex: -1,
  penSelected: -1,
  penTapTarget: null,
  penTapAt: 0,
  penEditTarget: false,      // ré-édition d'un tracé existant
  penOrigData: null,
  penAlt: false,
  penShift: false,
  penLastClickTime: 0,
  penLastClickIndex: -1,

  // crayon
  pencilOn: false,

  // pinceau vectoriel
  brushPreset: 'line',
  brushSize: 8,
  brushSmoothing: 55,
  brushOpacity: 1,
  brushPressure: true,
  brushPressureValue: 0.5,

  // main / déplacement
  panning: false,
  panLastX: 0,
  panLastY: 0,
  spaceDown: false,

  // dessin de formes
  shapeStart: null,
  shapeObj: null,

  // texte
  textCreating: false,

  // image
  imgObj: null,

  // dégradé
  gradType: null, // 'linear' | 'radial' | null

  // grille, repères, magnétisme
  gridSize: 20,
  showGrid: false,
  showRulers: true,
  snapEnabled: true,
  guides: [],                 // [{ axis:'x'|'y', pos:<unités document> }]

  // plans de travail (pages)
  pages: [],                  // [{ id, name, w, h, color, json }]
  activePage: 0,

  // export
  exportFormat: 'svg',
  exportScope: 'document',

  // impression (PDF/X)
  cmykGcr: 0.6,               // génération de noir
  cmykInkLimit: 3.0,          // taux d'encre max (300 %)
  iccProfile: null,           // { bytes, name, components } chargé par l'utilisateur
  pdfxBleed: 0,               // fond perdu en px

  // nuancier (persistant)
  swatches: ['#000000','#ffffff','#1a1a1a','#4f8cff','#ff6b6b','#4ade80','#facc15','#c084fc','#f97316','#22d3ee','#94a3b8','#ef4444'],

  // historique
  undo: [],
  redo: [],

  // symboles (composants)
  symbols: []
};

let canvas = null;
let penPreview = [];   // objets temporaires plume
let penPreviewPath = null;
let clipboardObject = null;

/* ────────────────────────────────────────────────────────────
   RÉFÉRENCES DOM
──────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'), canvasEl: $('canvas'),
  hint: $('emptyHint'), toast: $('toast'),
  zoomReadout: $('zoomReadout'),
  btnUndo: $('btnUndo'), btnRedo: $('btnRedo'),
  btnGroup: $('btnGroup'), btnUngroup: $('btnUngroup'),
  canvasContextMenu: $('canvasContextMenu'),
  fillColor: $('fillColor'), strokeColor: $('strokeColor'),
  strokeWidth: $('strokeWidth'), strokeWidthVal: $('strokeWidthVal'),
  fillNone: $('fillNone'), strokeNone: $('strokeNone'),
  fontFamily: $('fontFamily'), fontSize: $('fontSize'), fontSizeVal: $('fontSizeVal'),
  textProps: $('textProps'),
  opacity: $('opacity'), opacityVal: $('opacityVal'),
  artboardColor: $('artboardColor'), artboardSize: $('artboardSize'),
  dirtyDot: $('dirtyDot'),
  imgInput: $('imgInput'), fileOpen: $('fileOpen'),
  leftSidebar: $('leftSidebar'), rightSidebar: $('rightSidebar')
};

/* ════════════════════════════════════════════════════════════
   INITIALISATION
════════════════════════════════════════════════════════════ */
function init() {
  fabric.Object.prototype.set({
    borderColor: '#1677ff',
    cornerColor: '#ffffff',
    cornerStrokeColor: '#1677ff',
    cornerSize: 7,
    touchCornerSize: 18,
    transparentCorners: false,
    borderScaleFactor: 1,
    padding: 1
  });

  canvas = new fabric.Canvas('canvas', {
    backgroundColor: '',   // le fond est géré par _renderBackground (pas de double rect à l'export)
    preserveObjectStacking: true,
    selection: true,
    enableRetinaScaling: true,
    fireRightClick: true,
    stopContextMenu: true
  });
  window.__plumeCanvas = canvas; // hook debug / intégration
  window.__birdCanvas = canvas;

  canvas.__plume = { state };

  // Fond : zone de travail 100% BLANCHE infinie + un léger filé gris clair
  // qui définit le format (comme Illustrator : pas de limite visible).
  // Au moment de l'appel, le contexte est déjà mis à l'échelle DPR (retina),
  // on dessine donc en coordonnées CSS.
  canvas._renderBackground = function (ctx) {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.getWidth(), this.getHeight());
    const vpt = this.viewportTransform || [1, 0, 0, 1, 0, 0];
    const x = vpt[4], y = vpt[5];
    const w = this.__plume.artW * vpt[0];
    const h = this.__plume.artH * vpt[3];
    // Fond du plan de travail (si fond transparent choisi, on ne peint rien)
    if (this.__plume.artColor && this.__plume.artColor !== 'transparent') {
      ctx.fillStyle = this.__plume.artColor;
      ctx.fillRect(x, y, w, h);
    }
    // Grille optionnelle (dans le plan de travail)
    const st = this.__plume.state;
    if (st && st.showGrid && st.gridSize > 0) {
      const step = st.gridSize * vpt[0];
      if (step >= 4) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = 'rgba(26,26,26,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = 0; gx <= this.__plume.artW; gx += st.gridSize) {
          const px = Math.round(x + gx * vpt[0]) + 0.5;
          ctx.moveTo(px, y); ctx.lineTo(px, y + h);
        }
        for (let gy = 0; gy <= this.__plume.artH; gy += st.gridSize) {
          const py = Math.round(y + gy * vpt[3]) + 0.5;
          ctx.moveTo(x, py); ctx.lineTo(x + w, py);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    // Léger filé en pointillé définissant le format (discret mais visible)
    ctx.strokeStyle = 'rgba(26,26,26,0.16)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
    ctx.restore();
  };
  canvas.__plume.artW = state.artboardW;
  canvas.__plume.artH = state.artboardH;
  canvas.__plume.artColor = state.artboardColor;

  // Le canvas occupe toute la scène (plan de travail infini).
  resizeCanvas();

  bindToolbar();
  bindGroupingControls();
  /* Le registre de commandes doit exister AVANT le clavier et avant le
     menu natif : c'est lui qui décide ce qu'une touche déclenche. */
  if (window.BirdCommands) {
    BirdCommands.setPlatform(/mac/i.test(navigator.platform || '') ? 'mac' : 'other');
    defineCommands();
    renderShortcuts();
  }
  bindProps();
  bindAlignment();
  bindLayerPanel();
  bindShapeControls();
  bindStrokeControls();
  bindDocumentToggles();
  bindExportModal();
  bindShortcutsModal();
  bindCanvas();
  bindKeyboard();
  bindSidebars();
  bindDragDrop();
  bindClipboardPaste();
  bindGuides();
  bindViewToggles();
  bindPages();
  bindVectorTools();
  observeSidebar();
  mountShellExtras();
  canvas.on('after:render', scheduleOverlayUpdate);
  scheduleOverlayUpdate();

  // Splash screen : se referme après le chargement
  hideSplashSoon();
  // Pop-in de démarrage (Reprendre / Ouvrir / Nouveau) après le splash
  showStartupGate();

  loadDoc().then(() => {
    updateUI();
    updateZoomUI();
    fitView(); // vue d'ensemble comme SuperPrint à l'ouverture
    // Re-calibrer après le premier paint (layout stabilisé) pour garantir le centrage
    requestAnimationFrame(() => {
      resizeCanvas();
      fitView();
    });
  });
}

/* ════════════════════════════════════════════════════════════
   SPLASH SCREEN + POP-IN DÉMARRAGE (Reprendre / Ouvrir / Nouveau)
════════════════════════════════════════════════════════════ */
function hideSplashSoon() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  const hide = () => splash.classList.add('hidden');
  // Au clic, on peut fermer le splash immédiatement
  splash.addEventListener('click', hide, { once: true });
  setTimeout(hide, 1400);
  setTimeout(hide, 7000);
}

function hasSavedDoc() {
  return !!getSavedProjectRaw();
}

function getSavedProjectRaw() {
  try { return localStorage.getItem(LS_KEY) || localStorage.getItem(LEGACY_LS_KEY) || null; }
  catch (e) { return null; }
}

function getSavedMetaRaw() {
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function formatAge(ts) {
  if (!ts) return '—';
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'À l\'instant';
  if (min < 60) return 'Il y a ' + min + ' min';
  if (min < 1440) return 'Il y a ' + Math.round(min / 60) + ' h';
  return 'Il y a ' + Math.round(min / 1440) + ' jour(s)';
}

function getSavedMeta() {
  const meta = getSavedMetaRaw();
  if (meta) return meta;
  const raw = getSavedProjectRaw();
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    const count = (payload.json && payload.json.objects) ? payload.json.objects.length : 0;
    return { savedAt: payload.savedAt || null, count: count };
  } catch (e) { return null; }
}

function showStartupGate() {
  const overlay = $('startupOverlay');
  const actions = $('startupActions');
  const loading = $('startupLoading');
  const resumeB = $('startupResume');
  const openB = $('startupOpen');
  const newB = $('startupNew');
  const metaDate = $('startupMetaDate');
  const metaCount = $('startupMetaCount');
  const desc = $('startupDesc');
  const title = $('startupTitle');
  const meta = $('startupMeta');
  if (!overlay || !openB || !newB) return;

  const metaInfo = getSavedMeta();
  const hasSave = !!(metaInfo && metaInfo.count > 0);

  if (hasSave) {
    title.textContent = 'Bon retour';
    desc.textContent = 'Une session précédente a été trouvée.';
    metaDate.textContent = formatAge(metaInfo.savedAt);
    metaCount.textContent = metaInfo.count + (metaInfo.count > 1 ? ' objets' : ' objet');
    meta.style.display = '';
    resumeB.style.display = '';
  } else {
    title.textContent = 'BIRD';
    desc.textContent = 'Créez un nouveau document ou ouvrez un fichier enregistré.';
    meta.style.display = 'none';
    resumeB.style.display = 'none';
  }

  // Attend que le splash soit fermé pour montrer le pop-in
  const splash = document.getElementById('splashScreen');
  const whenReady = () => {
    if (!splash || splash.classList.contains('hidden')) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      const poll = setInterval(() => {
        if (splash.classList.contains('hidden')) { clearInterval(poll); finish(); }
      }, 150);
      setTimeout(() => { clearInterval(poll); finish(); }, 10000);
    });
  };

  whenReady().then(() => {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const finish = (choice) => {
      actions.classList.add('is-hidden');
      loading.classList.add('is-visible');
      if (resumeB) resumeB.disabled = true;
      openB.disabled = true; newB.disabled = true;
      setTimeout(() => {
        overlay.classList.remove('is-open');
        setTimeout(() => {
          overlay.hidden = true;
          actions.classList.remove('is-hidden');
          loading.classList.remove('is-visible');
          if (resumeB) resumeB.disabled = false;
          openB.disabled = false; newB.disabled = false;
        }, 240);
        if (choice === 'new') resetDocument();
      }, 60);
    };

    if (resumeB && hasSave) {
      resumeB.addEventListener('click', () => finish('resume'), { once: true });
    }
    openB.addEventListener('click', () => {
      // Ouvre le sélecteur de fichier directement (geste utilisateur conservé)
      els.fileOpen.click();
      finish('open');
    }, { once: true });
    newB.addEventListener('click', () => finish('new'), { once: true });
  });
}

function resetDocument() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_META_KEY);
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch (e) {}
  if (window.BirdIO && BirdIO.store) BirdIO.store.delete(IDB_KEY).catch(() => {});
  canvas.clear();
  canvas.discardActiveObject();
  state.undo = [];
  state.redo = [];
  if (history) history.reset();
  state.guides = [];
  // Un nouveau document repart d'un seul plan, au format courant.
  state.pages = [{ id: newPageId(), name: 'Plan 1', w: state.artboardW, h: state.artboardH, color: state.artboardColor, json: null }];
  state.activePage = 0;
  pageHistory.clear();
  state.dirty = false;
  setDirty(false);
  projectPath = null;
  setDocumentTitle(null);
  renderGuides(true);
  renderLayers();
  renderPages();
  updateUI();
  toast('Nouveau document');
}

/* ════════════════════════════════════════════════════════════
   SIDEBARS RÉTRACTABLES (style SuperPrint)
════════════════════════════════════════════════════════════ */
function bindSidebars() {
  const left = els.leftSidebar;
  const right = els.rightSidebar;
  if (!left || !right) return;

  const syncIcons = () => {
    const r = right.classList.contains('collapsed');
    const er = document.getElementById('expandRight');
    if (er) er.textContent = r ? '«' : '»';
  };

  const setCollapsed = (side, collapsed) => {
    const el = side === 'left' ? left : right;
    el.classList.toggle('collapsed', collapsed);
    syncIcons();
    // recentre et réajuste la vue après le changement de taille
    requestAnimationFrame(() => {
      resizeCanvas();
      fitView();
    });
  };

  // Bouton bas de la sidebar droite
  const elRight = document.getElementById('expandRight');
  if (elRight) elRight.addEventListener('click', () => {
    setCollapsed('right', !right.classList.contains('collapsed'));
  });

  // Ouverture automatique de la sidebar droite quand on sélectionne un objet
  canvas.on('selection:created', autoOpenRight);
  canvas.on('selection:updated', autoOpenRight);

  function autoOpenRight() {
    if (window.innerWidth > 600 && right.classList.contains('collapsed') && canvas.getActiveObject()) {
      setCollapsed('right', false);
    }
  }

  // Fermer la sidebar droite quand on désélectionne (clic vide) — SAUF si
  // l'utilisateur l'a ouverte manuellement. Comportement : on la laisse comme elle est.

  // ── Icônes de section (affichées quand la sidebar est rétractée) ──
  // Clic sur une icône → ouvre la sidebar et met en avant la section ciblée.
  document.querySelectorAll('#rightSidebar .rightbar-icon-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      // ouvre la sidebar si fermée
      if (right.classList.contains('collapsed')) setCollapsed('right', false);
      // scroll vers la section ciblée
      requestAnimationFrame(() => {
        const target = document.querySelector('.props-section[data-section="' + section + '"]');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // flash visuel
          target.style.transition = 'background .5s';
          target.style.background = '#f0f5ff';
          setTimeout(() => { target.style.background = 'transparent'; }, 600);
        }
        // rend la section texte visible si sélection d'un texte
        if (section === 'textProps') {
          const tp = document.getElementById('textProps');
          if (tp) tp.hidden = false;
        }
      });
    });
  });
}

/* ════════════════════════════════════════════════════════════
   TOOLBAR
════════════════════════════════════════════════════════════ */
function bindToolbar() {
  // boutons outils (dans la sidebar gauche)
  document.querySelectorAll('#leftSidebar .tool[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // ── Dropdown Formes (Rectangle / Ellipse / Ligne / Étoile / Polygone) ──
  const shapeBtn = document.getElementById('shapeTool');
  const shapeMenu = document.getElementById('shapeMenu');
  const shapeIndicator = shapeBtn ? shapeBtn.querySelector('.dropdown-indicator') : null;

  if (!shapeBtn || !shapeMenu) return;

  function closeShapeMenu() { shapeMenu.classList.remove('open'); }

  document.addEventListener('click', (e) => {
    if (!shapeMenu.classList.contains('open')) return;
    if (!shapeMenu.contains(e.target) && !shapeBtn.contains(e.target)) closeShapeMenu();
  });

  // Clic sur le bouton = ouvre/ferme le sous-menu des formes
  shapeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    shapeMenu.classList.toggle('open');
  });

  // Clic sur un item : sélectionne l'outil + met à jour l'état actif
  shapeMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      const tool = item.dataset.tool;
      if (!tool) return;
      shapeGroupMode = tool;
      syncShapeMenuActive(tool);
      setTool(tool);
      closeShapeMenu();
    });
  });

  // Aucune forme sélectionnée au chargement : bouton Formes inactif
  syncShapeMenuActive(null);
}

let shapeGroupMode = 'rect'; // forme courante du dropdown

function syncShapeMenuActive(tool) {
  document.querySelectorAll('#shapeMenu .dropdown-item').forEach(it => {
    it.classList.toggle('active', it.dataset.tool === tool);
  });
  const shapeBtn = document.getElementById('shapeTool');
  if (shapeBtn) shapeBtn.classList.toggle('active', !!tool);
}

function setTool(tool) {
  if (state.tool === 'pen') endPen(true);
  if (state.tool === 'pencil' || state.tool === 'brush') stopPencil();
  if (state.tool === 'hand') stopPan();
  if (state.shapeObj) { cancelTxn(); state.shapeObj = null; state.shapeStart = null; }
  cancelTxn(); // sécurité : aucune transaction orpheline entre deux outils

  state.tool = tool;
  canvas.isDrawingMode = false;
  canvas.selection = (tool === 'select');
  canvas.skipTargetFind = false;
  canvas.defaultCursor = tool === 'hand' ? 'grab'
    : (tool === 'pen' || tool === 'eyedropper' ||
       ['rect', 'ellipse', 'line', 'star', 'polygon', 'text'].includes(tool) ? 'crosshair' : 'default');

  if (tool === 'pen') startPen();
  if (tool === 'pencil' || tool === 'brush') startPencil();

  const brushProps = $('brushProps');
  if (brushProps) {
    brushProps.hidden = tool !== 'brush';
    els.rightSidebar.classList.toggle('brush-mode', tool === 'brush');
    if (tool === 'brush') {
      els.rightSidebar.classList.remove('collapsed');
      requestAnimationFrame(() => {
        brushProps.scrollIntoView({ behavior: 'smooth', block: 'start' });
        resizeCanvas();
      });
    }
  }

  document.querySelectorAll('#leftSidebar .tool[data-tool]').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });

  // le bouton du dropdown Formes n'a pas de data-tool → gestion manuelle
  const isShape = ['rect', 'ellipse', 'line', 'star', 'polygon'].includes(tool);
  if (isShape) {
    shapeGroupMode = tool;
    syncShapeMenuActive(tool);
  } else {
    syncShapeMenuActive(null);
  }
}


/* ════════════════════════════════════════════════════════════
   CANVAS EVENTS
════════════════════════════════════════════════════════════ */
function bindCanvas() {
  canvas.upperCanvasEl.addEventListener('contextmenu', openCanvasContextMenu);

  // ── Zoom molette (zoom vers le curseur) ──
  canvas.on('mouse:wheel', (opt) => {
    const e = opt.e;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY;
    let factor = Math.pow(1.0015, -delta);
    const newZoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const realFactor = newZoom / state.zoom;
    zoomAtPoint(canvas.getPointer(e), realFactor);
    updateZoomUI();
  });

  // ── Espace / main ──
  canvas.on('mouse:down', (opt) => {
    if (opt.button === 3 || (opt.e && opt.e.button === 2)) {
      openCanvasContextMenu(opt.e, opt.target);
      return;
    }
    closeCanvasContextMenu();
    if (state.spaceDown || state.tool === 'hand') {
      if (state.tool === 'pen') endPen(true);
      startPan(opt);
      return;
    }
    if (beginPenEditFromDoubleTap(opt)) return;
    // Mémorise l'état avant tout déplacement / rotation / mise à l'échelle.
    if (opt.target && state.tool === 'select') beginTxn();
    dispatchMouseDown(opt);
  });

  canvas.on('mouse:move', (opt) => {
    if (state.panning) { movePan(opt); return; }
    dispatchMouseMove(opt);
  });

  canvas.on('mouse:up', (opt) => {
    if (state.panning) { endPan(opt); return; }
    dispatchMouseUp(opt);
  });

  canvas.on('selection:created', onSelection);
  canvas.on('selection:updated', onSelection);
  canvas.on('selection:cleared', onSelection);
  // Capture l'état AVANT la transformation : sans cela, « Annuler » rechargeait
  // l'état déjà modifié (déplacement, rotation, redimensionnement).
  canvas.on('object:modified', () => { commitUndo('Modification'); setDirty(true); renderLayers(); });
  canvas.on('object:moving', (opt) => snapMovingObject(opt.target));
  canvas.on('object:added', () => { updateHint(); renderLayers(); });
  canvas.on('object:removed', () => { updateHint(); renderLayers(); });
  canvas.on('text:changed', onSelection);

  // Double-clic sur un tracé plume → ré-éditer
  canvas.on('mouse:dblclick', editPenFromDoubleClick);

  // Clic sur canvas : quitter le mode texte en cours (sauf si on reclique dans le texte en édition)
  canvas.on('mouse:down:before', (opt) => {
    if (state.textCreating && opt.target !== canvas.getActiveObject()) finalizeText();
  });

  // Double-clic sur texte → édition
  canvas.on('mouse:dblclick', (opt) => {
    const t = opt.target;
    if (t && t.type === 'i-text') {
      opt.e.preventDefault();
      t.enterEditing();
      t.selectAll();
    }
  });
}

function editPenFromDoubleClick(opt) {
  const directTarget = opt.target;
  const activeTarget = canvas.getActiveObject();
  const path = editablePenPath(directTarget) || editablePenPath(activeTarget);
  if (!path) return;

  opt.e.preventDefault();
  if (opt.e.stopPropagation) opt.e.stopPropagation();
  beginPenEdit(path);
}

function openCanvasContextMenu(event, directTarget) {
  event.preventDefault();
  if (event.stopPropagation) event.stopPropagation();
  if (state.penActive || state.tool !== 'select') return;
  const target = directTarget || canvas.findTarget(event, false);
  if (target && target !== canvas.getActiveObject()) canvas.setActiveObject(target);
  const active = canvas.getActiveObject();
  if (!active) { closeCanvasContextMenu(); return; }

  const editItem = els.canvasContextMenu.querySelector('[data-context-action="edit-path"]');
  const groupItem = els.canvasContextMenu.querySelector('[data-context-action="group"]');
  const ungroupItem = els.canvasContextMenu.querySelector('[data-context-action="ungroup"]');
  const sepItem = els.canvasContextMenu.querySelector('.canvas-context-menu-sep');
  const frontItem = els.canvasContextMenu.querySelector('[data-context-action="bring-front"]');
  const backItem = els.canvasContextMenu.querySelector('[data-context-action="send-back"]');
  editItem.hidden = active.type !== 'path';
  groupItem.hidden = !canGroupSelection(active);
  ungroupItem.hidden = !canUngroupSelection(active);
  frontItem.hidden = false;
  backItem.hidden = false;
  sepItem.hidden = editItem.hidden && groupItem.hidden && ungroupItem.hidden;

  els.canvasContextMenu.hidden = false;
  const rect = els.canvasContextMenu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  els.canvasContextMenu.style.left = Math.max(8, left) + 'px';
  els.canvasContextMenu.style.top = Math.max(8, top) + 'px';
  const firstItem = els.canvasContextMenu.querySelector('button:not([hidden])');
  if (firstItem) firstItem.focus({ preventScroll: true });
  onSelection();
}

function beginPenEditFromDoubleTap(opt) {
  const path = editablePenPath(opt.target);
  if (state.penActive || state.tool !== 'select' || !path) return false;
  const now = Date.now();
  const isDoubleTap = state.penTapTarget === path && now - state.penTapAt < 450;
  state.penTapTarget = path;
  state.penTapAt = now;
  if (!isDoubleTap) return false;

  opt.e.preventDefault();
  if (opt.e.stopPropagation) opt.e.stopPropagation();
  beginPenEdit(path);
  return true;
}

function editablePenPath(target) {
  if (!target) return null;
  if (target._plumeData) return target;
  if (target.type !== 'path') return null;
  const data = penDataFromFabricPath(target);
  if (!data) return null;
  target._plumeData = data;
  attachPenSerializer(target);
  return target;
}

function penDataFromFabricPath(path) {
  if (!Array.isArray(path.path)) return null;
  const points = [];
  let current = null;
  let lastControl = null;
  let closed = false;

  const addPoint = (x, y) => {
    current = { x, y, hInX: 0, hInY: 0, hOutX: 0, hOutY: 0 };
    points.push(current);
    lastControl = null;
  };
  for (const command of path.path) {
    const kind = String(command[0] || '');
    const relative = kind === kind.toLowerCase();
    const type = kind.toUpperCase();
    const x = value => Number(value) + (relative && current ? current.x : 0);
    const y = value => Number(value) + (relative && current ? current.y : 0);
    if (type === 'M') {
      if (points.length) return null;
      addPoint(x(command[1]), y(command[2]));
    } else if (type === 'L' && current) {
      addPoint(x(command[1]), y(command[2]));
    } else if (type === 'H' && current) {
      addPoint(x(command[1]), current.y);
    } else if (type === 'V' && current) {
      addPoint(current.x, y(command[1]));
    } else if (type === 'C' && current) {
      const start = current;
      const c1 = { x: x(command[1]), y: y(command[2]) };
      const c2 = { x: x(command[3]), y: y(command[4]) };
      const end = { x: x(command[5]), y: y(command[6]) };
      start.hOutX = c1.x - start.x; start.hOutY = c1.y - start.y;
      addPoint(end.x, end.y);
      current.hInX = c2.x - end.x; current.hInY = c2.y - end.y;
      lastControl = c2;
    } else if (type === 'Q' && current) {
      const start = current;
      const control = { x: x(command[1]), y: y(command[2]) };
      const end = { x: x(command[3]), y: y(command[4]) };
      start.hOutX = (control.x - start.x) * 2 / 3; start.hOutY = (control.y - start.y) * 2 / 3;
      addPoint(end.x, end.y);
      current.hInX = (control.x - end.x) * 2 / 3; current.hInY = (control.y - end.y) * 2 / 3;
      lastControl = control;
    } else if (type === 'Z' && points.length > 2) {
      closed = true;
    } else {
      return null;
    }
  }
  return points.length >= 2 ? { points, closed } : null;
}

function beginPenEdit(path) {
  state.penTapTarget = null;
  state.penTapAt = 0;
  setTool('pen');
  endPen(false);
  startPenEdit(path);
}

function onSelection() {
  const obj = canvas.getActiveObject();
  updateGroupingUI();
  if (!obj) {
    els.textProps.hidden = true;
    $('shapeProps').hidden = true;
    updateUndoUI();
    renderLayers();
    return;
  }
  // synchroniser les champs (sélection multiple : premier objet comme référence)
  const styleObj = (obj.type === 'activeSelection' && obj._objects && obj._objects.length) ? obj._objects[0] : obj;
  els.fillColor.value = colorInputValue(styleObj.fill, '#4f8cff');
  els.strokeColor.value = colorInputValue(styleObj.stroke, '#141821');
  els.strokeWidth.value = styleObj.strokeWidth || 2;
  els.strokeWidthVal.textContent = styleObj.strokeWidth || 2;
  els.opacity.value = Math.round((obj.opacity ?? 1) * 100);
  els.opacityVal.textContent = Math.round((obj.opacity ?? 1) * 100) + '%';
  updateFillChips(styleObj);
  els.textProps.hidden = !(obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox');
  if (!els.textProps.hidden) {
    els.fontSize.value = obj.fontSize || 48;
    els.fontSizeVal.textContent = obj.fontSize || 48;
    els.fontFamily.value = obj.fontFamily || "'IBM Plex Mono', monospace";
    $('textBold').classList.toggle('on', String(obj.fontWeight || '').includes('bold'));
    $('textItalic').classList.toggle('on', obj.fontStyle === 'italic');
    $('textUnderline').classList.toggle('on', !!obj.underline);
    $('textStrike').classList.toggle('on', !!obj.linethrough);
  }
  syncStrokeFields(styleObj);
  syncShapeFields(obj);
  $('blendMode').value = obj.globalCompositeOperation || styleObj.globalCompositeOperation || 'source-over';
  updateLockVisibleUI(obj);
  obj.setCoords();
  canvas.requestRenderAll();
  updateUndoUI();
  renderLayers();
}

function syncStrokeFields(obj) {
  const dash = Array.isArray(obj.strokeDashArray) ? obj.strokeDashArray.join(' ') : '';
  const select = $('strokeDash');
  const preset = ['', '8 6', '2 5', '10 5 2 5'];
  if (preset.includes(dash)) {
    select.value = dash;
    $('strokeDashCustomRow').hidden = true;
  } else if (dash) {
    select.value = 'custom';
    $('strokeDashCustomRow').hidden = false;
    $('strokeDashCustom').value = dash;
  } else {
    select.value = '';
    $('strokeDashCustomRow').hidden = true;
  }
  $('strokeCap').value = obj.strokeLineCap || 'butt';
  $('strokeJoin').value = obj.strokeLineJoin || 'miter';
}

function shapeInfo(obj) {
  if (!obj) return null;
  if (obj._birdShape) return obj._birdShape;
  if (obj.type === 'rect') return { kind: 'rect' };
  if (obj.type === 'polygon' && Array.isArray(obj.points)) {
    return { kind: 'polygon', points: obj.points.length, radius: Math.max(obj.width || 0, obj.height || 0) / 2 };
  }
  return null;
}

function syncShapeFields(obj) {
  const info = shapeInfo(obj);
  const section = $('shapeProps');
  if (!info) { section.hidden = true; return; }
  section.hidden = false;
  const isRect = info.kind === 'rect';
  const isPoly = info.kind === 'polygon' || info.kind === 'star';
  const isStar = info.kind === 'star';
  $('shapeRadiusRow').hidden = !isRect;
  $('shapePointsRow').hidden = !isPoly;
  $('shapeInnerRow').hidden = !isStar;
  if (isRect) {
    const rx = Math.round(obj.rx || 0);
    $('shapeRadius').value = rx;
    $('shapeRadiusVal').textContent = rx;
    $('shapeRadius').max = Math.max(10, Math.round(Math.min(obj.width || 100, obj.height || 100) / 2));
  }
  if (isPoly) {
    const n = info.points || (obj.points ? obj.points.length : 5);
    $('shapePoints').value = n;
    $('shapePointsVal').textContent = n;
  }
  if (isStar) {
    const ratio = Math.round((info.innerRatio || 0.5) * 100);
    $('shapeInner').value = ratio;
    $('shapeInnerVal').textContent = ratio + '%';
  }
}

function updateLockVisibleUI(obj) {
  const locked = !!(obj.birdLocked || obj.selectable === false && obj.evented === false);
  const hidden = obj.visible === false;
  $('toggleLock').textContent = locked ? 'Déverrouiller' : 'Verrouiller';
  $('toggleVisible').textContent = hidden ? 'Afficher' : 'Masquer';
  $('toggleLock').classList.toggle('on', locked);
  $('toggleVisible').classList.toggle('on', hidden);
}

function colorInputValue(value, fallback) {
  if (typeof value !== 'string' || !value || value === 'none' || value === 'transparent') return fallback;
  try { return '#' + new fabric.Color(value).toHex(); } catch (error) { return fallback; }
}

/* ════════════════════════════════════════════════════════════
   OUTILS — PLUME (Bézier)
════════════════════════════════════════════════════════════ */
function startPen() {
  state.penActive = true;
  state.penMode = 'draw';
  resetPenState();
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = 'crosshair';
  canvas.discardActiveObject();
  canvas.forEachObject(o => {
    o.__plSelectable = o.selectable;
    o.__plEvented = o.evented;
    o.selectable = false;
    o.evented = false;
  });
}

function startPenEdit(path) {
  state.penActive = true;
  state.penMode = 'edit';
  resetPenState();
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = 'default';
  canvas.discardActiveObject();
  canvas.forEachObject(o => {
    o.__plSelectable = o.selectable;
    o.__plEvented = o.evented;
    o.selectable = false;
    o.evented = false;
  });

  const data = path._plumeData;
  // cuire la transformation courante dans les points
  let pts = JSON.parse(JSON.stringify(data.points));
  let strokeW = path.strokeWidth || 2;
  try {
    const m = path.calcTransformMatrix();
    const ox = path.pathOffset ? path.pathOffset.x : 0;
    const oy = path.pathOffset ? path.pathOffset.y : 0;
    const tx = (lx, ly) => ({ x: m[0]*lx + m[2]*ly + m[4], y: m[1]*lx + m[3]*ly + m[5] });
    const td = (dx, dy) => ({ x: m[0]*dx + m[2]*dy, y: m[1]*dx + m[3]*dy });
    pts = pts.map(p => {
      const w = tx(p.x - ox, p.y - oy);
      const ho = td(p.hOutX || 0, p.hOutY || 0);
      const hi = td(p.hInX || 0, p.hInY || 0);
      return { x: w.x, y: w.y, hInX: hi.x, hInY: hi.y, hOutX: ho.x, hOutY: ho.y };
    });
  } catch (e) {}

  state.penOrigData = {
    points: JSON.parse(JSON.stringify(pts)),
    closed: !!data.closed,
    stroke: path.stroke || '#000000',
    strokeWidth: strokeW,
    fill: path.fill,
    opacity: path.opacity == null ? 1 : path.opacity,
    left: path.left, top: path.top
  };
  state.penEditTarget = true;
  state.penPoints = pts;
  state.penClosed = !!data.closed;
  canvas.remove(path);
  canvas.requestRenderAll();
  drawPenPreview();
}

function resetPenState() {
  state.penPoints = [];
  state.penUndo = [];
  state.penClosed = false;
  state.penDragging = false;
  state.penDown = null;
  state.penCur = null;
  state.penDragType = null;
  state.penDragIndex = -1;
  state.penSelected = -1;
  state.penTapTarget = null;
  state.penTapAt = 0;
  state.penEditTarget = false;
  state.penOrigData = null;
}

function endPen(keepActive) {
  clearPenPreview();
  if (!state.penActive) return;
  state.penActive = false;
  state.penMode = 'draw';
  canvas.forEachObject(o => {
    if (o.__plSelectable !== undefined) { o.selectable = o.__plSelectable; delete o.__plSelectable; }
    if (o.__plEvented !== undefined) { o.evented = o.__plEvented; delete o.__plEvented; }
  });
  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.defaultCursor = 'default';
  resetPenState();
  refreshActiveSelection();
}

function refreshActiveSelection() {
  const active = canvas.getActiveObject();
  if (active) active.setCoords();
  canvas.calcOffset();
  canvas.requestRenderAll();
}

function dispatchMouseDown(opt) {
  if (state.tool === 'pen') { penMouseDown(opt); return; }
  if (state.tool === 'pencil' || state.tool === 'brush') return; // Fabric gère le dessin libre
  if (state.tool === 'rect' || state.tool === 'ellipse' || state.tool === 'line' || state.tool === 'star' || state.tool === 'polygon') {
    startShape(opt); return;
  }
  if (state.tool === 'text') { startText(opt); return; }
  if (state.tool === 'eyedropper') { pickColorAt(opt); return; }
  if (state.tool === 'image') { pickImage(); return; }
}

function dispatchMouseMove(opt) {
  if (state.tool === 'pen') { penMouseMove(opt); return; }
  if (state.shapeObj) moveShape(opt);
}

function dispatchMouseUp(opt) {
  if (state.tool === 'pen') { penMouseUp(opt); return; }
  if (state.shapeObj) endShape();
}

/* ── Plume : événements souris ── */
function penMouseDown(opt) {
  const e = opt.e;
  e.preventDefault(); e.stopPropagation();
  canvas._groupSelector = null;
  canvas.discardActiveObject();

  const ptrRaw = canvas.getPointer(e);
  state.penAlt = !!e.altKey;
  state.penShift = !!e.shiftKey;
  let ptr = ptrRaw;
  if (state.penShift && state.penMode === 'draw' && state.penPoints.length > 0) {
    ptr = snap45(state.penPoints[state.penPoints.length - 1], ptrRaw);
  }
  state.penDown = { x: ptr.x, y: ptr.y };

  // ── MODE ÉDITION ──
  if (state.penMode === 'edit') {
    const hit = penHitTest(ptr);
    if (hit) {
      if (hit.type === 'anchor') {
        const now = Date.now();
        if (state.penLastClickIndex === hit.index && (now - state.penLastClickTime) < 350) {
          toggleHandles(hit.index);
          state.penLastClickTime = 0;
          state.penLastClickIndex = -1;
          state.penSelected = hit.index;
          drawPenPreview();
          return;
        }
        state.penLastClickTime = now;
        state.penLastClickIndex = hit.index;
      }
      state.penDragType = hit.type;
      state.penDragIndex = hit.index;
      state.penDragging = true;
      if (hit.type === 'anchor') { state.penSelected = hit.index; drawPenPreview(); }
      return;
    }
    // insertion sur un segment
    const seg = findSegmentNear(ptr, 6);
    if (seg) {
      const np = { x: seg.point.x, y: seg.point.y, hInX: 0, hInY: 0, hOutX: 0, hOutY: 0 };
      state.penPoints.splice(seg.insertIndex, 0, np);
      state.penSelected = seg.insertIndex;
      state.penDragType = 'anchor';
      state.penDragIndex = seg.insertIndex;
      state.penDragging = true;
      drawPenPreview();
      return;
    }
    if (state.penSelected !== -1) { state.penSelected = -1; drawPenPreview(); return; }
    if (state.penPoints.length >= 2) { finalizePen(state.penClosed); }
    else { endPen(false); }
    return;
  }

  // ── MODE DESSIN ──
  if (state.penPoints.length > 2 && dist(ptr, state.penPoints[0]) < CLOSE_THRESHOLD) {
    state.penDragType = 'closing';
    state.penDragging = true;
    return;
  }
  state.penUndo = [];
  state.penCur = { x: ptr.x, y: ptr.y, hInX: 0, hInY: 0, hOutX: 0, hOutY: 0 };
  state.penDragging = true;
}

function penMouseMove(opt) {
  if (!state.penActive) return;
  const e = opt.e;
  const ptrRaw = canvas.getPointer(e);
  state.penAlt = !!e.altKey;
  state.penShift = !!e.shiftKey;
  let ptr = ptrRaw;
  if (state.penShift && state.penMode === 'draw' && !state.penDragging && state.penPoints.length > 0) {
    ptr = snap45(state.penPoints[state.penPoints.length - 1], ptrRaw);
  }

  if (!state.penDragging) {
    if (state.penMode === 'edit') {
      const hit = penHitTest(ptr);
      canvas.defaultCursor = hit ? 'move' : 'default';
    } else if (state.penPoints.length > 0) {
      drawPenPreview(null, ptr);
    }
    return;
  }

  const dx = ptr.x - state.penDown.x;
  const dy = ptr.y - state.penDown.y;

  if (state.penMode === 'edit' && state.penDragIndex >= 0) {
    const pt = state.penPoints[state.penDragIndex];
    if (state.penDragType === 'anchor') { pt.x = ptr.x; pt.y = ptr.y; drawPenPreview(); return; }
    if (state.penDragType === 'hOut') {
      pt.hOutX = ptr.x - pt.x; pt.hOutY = ptr.y - pt.y;
      if (!state.penAlt) { pt.hInX = -pt.hOutX; pt.hInY = -pt.hOutY; }
      drawPenPreview(); return;
    }
    if (state.penDragType === 'hIn') {
      pt.hInX = ptr.x - pt.x; pt.hInY = ptr.y - pt.y;
      if (!state.penAlt) { pt.hOutX = -pt.hInX; pt.hOutY = -pt.hInY; }
      drawPenPreview(); return;
    }
  }

  if (state.penDragType === 'closing') {
    const first = state.penPoints[0];
    first.hInX = -dx; first.hInY = -dy;
    drawPenPreview();
    return;
  }

  if (state.penCur) {
    if (dist(ptr, state.penDown) > CURVE_T) {
      if (state.penAlt) {
        state.penCur.hOutX = dx; state.penCur.hOutY = dy;
      } else {
        state.penCur.hOutX = dx; state.penCur.hOutY = dy;
        state.penCur.hInX = -dx; state.penCur.hInY = -dy;
      }
    }
    drawPenPreview(state.penCur);
  }
}

function penMouseUp(opt) {
  if (!state.penActive) return;

  if (state.penDragType === 'closing') {
    state.penDragging = false;
    state.penDragType = null;
    finalizePen(true);
    return;
  }

  if (state.penMode === 'edit' && (state.penDragType === 'anchor' || state.penDragType === 'hIn' || state.penDragType === 'hOut')) {
    state.penDragging = false;
    state.penDragType = null;
    state.penDragIndex = -1;
    drawPenPreview();
    return;
  }

  if (state.penCur) {
    const ptr = canvas.getPointer(opt.e);
    if (dist(ptr, state.penDown) <= CURVE_T) {
      state.penCur.hInX = state.penCur.hInY = state.penCur.hOutX = state.penCur.hOutY = 0;
    }
    state.penPoints.push(state.penCur);
    state.penCur = null;
    drawPenPreview();
  }

  state.penDragging = false;
  state.penDown = null;
  state.penDragType = null;
  state.penDragIndex = -1;
}

/* ── Plume : hit-testing ── */
function penHitTest(ptr) {
  let best = null, bestDist = HIT_R / Math.max(state.zoom, MIN_ZOOM);
  for (let i = 0; i < state.penPoints.length; i++) {
    const p = state.penPoints[i];
    if (p.hInX || p.hInY) { const d = dist(ptr, { x: p.x + p.hInX, y: p.y + p.hInY }); if (d < bestDist) { bestDist = d; best = { type: 'hIn', index: i }; } }
    if (p.hOutX || p.hOutY) { const d = dist(ptr, { x: p.x + p.hOutX, y: p.y + p.hOutY }); if (d < bestDist) { bestDist = d; best = { type: 'hOut', index: i }; } }
  }
  for (let i = 0; i < state.penPoints.length; i++) {
    const d = dist(ptr, state.penPoints[i]);
    if (d < bestDist) { bestDist = d; best = { type: 'anchor', index: i }; }
  }
  return best;
}

function bezierAt(p1, p2, t) {
  const c1x = p1.x + (p1.hOutX || 0), c1y = p1.y + (p1.hOutY || 0);
  const c2x = p2.x + (p2.hInX || 0), c2y = p2.y + (p2.hInY || 0);
  const u = 1 - t;
  const b0 = u*u*u, b1 = 3*u*u*t, b2 = 3*u*t*t, b3 = t*t*t;
  return { x: b0*p1.x + b1*c1x + b2*c2x + b3*p2.x, y: b0*p1.y + b1*c1y + b2*c2y + b3*p2.y };
}

function findSegmentNear(ptr, maxDist) {
  if (state.penPoints.length < 2) return null;
  let best = null, bestDist = maxDist;
  const segCount = state.penClosed ? state.penPoints.length : state.penPoints.length - 1;
  for (let i = 0; i < segCount; i++) {
    const p1 = state.penPoints[i];
    const p2 = state.penPoints[(i + 1) % state.penPoints.length];
    for (let s = 1; s < 16; s++) {
      const pt = bezierAt(p1, p2, s / 16);
      const d = dist(ptr, pt);
      if (d < bestDist) { bestDist = d; best = { insertIndex: i + 1, point: pt }; }
    }
  }
  return best;
}

function toggleHandles(index) {
  const pt = state.penPoints[index];
  if (!pt) return;
  const has = (pt.hInX || pt.hInY || pt.hOutX || pt.hOutY);
  if (has) { pt.hInX = pt.hInY = pt.hOutX = pt.hOutY = 0; return; }
  let dx = 1, dy = 0;
  const n = state.penPoints.length;
  const hasPrev = state.penClosed || index > 0;
  const hasNext = state.penClosed || index < n - 1;
  if (hasPrev && hasNext) {
    const prev = state.penPoints[(index - 1 + n) % n];
    const next = state.penPoints[(index + 1) % n];
    dx = next.x - prev.x; dy = next.y - prev.y;
  } else if (hasNext) {
    const next = state.penPoints[(index + 1) % n];
    dx = next.x - pt.x; dy = next.y - pt.y;
  } else if (hasPrev) {
    const prev = state.penPoints[(index - 1 + n) % n];
    dx = pt.x - prev.x; dy = pt.y - prev.y;
  }
  const len = Math.hypot(dx, dy) || 1;
  pt.hOutX = dx / len * 30; pt.hOutY = dy / len * 30;
  pt.hInX = -pt.hOutX; pt.hInY = -pt.hOutY;
}

/* ── Plume : construction SVG + preview ── */
function buildPenSVG(pts, close) {
  if (!pts || !pts.length) return '';
  let d = 'M ' + pts[0].x + ' ' + pts[0].y;
  for (let i = 0; i < pts.length - 1; i++) d += penSegment(pts[i], pts[i + 1]);
  if (close && pts.length > 2) { d += penSegment(pts[pts.length - 1], pts[0]); d += ' Z'; }
  return d;
}

function penSegment(p1, p2) {
  const h1 = (p1.hOutX !== 0 || p1.hOutY !== 0);
  const h2 = (p2.hInX !== 0 || p2.hInY !== 0);
  if (h1 && h2) return ' C ' + (p1.x+p1.hOutX) + ' ' + (p1.y+p1.hOutY) + ', ' + (p2.x+p2.hInX) + ' ' + (p2.y+p2.hInY) + ', ' + p2.x + ' ' + p2.y;
  if (h1) return ' Q ' + (p1.x+p1.hOutX) + ' ' + (p1.y+p1.hOutY) + ', ' + p2.x + ' ' + p2.y;
  if (h2) return ' Q ' + (p2.x+p2.hInX) + ' ' + (p2.y+p2.hInY) + ', ' + p2.x + ' ' + p2.y;
  return ' L ' + p2.x + ' ' + p2.y;
}

function clearPenPreview() {
  if (!canvas) return;
  penPreview.forEach(o => { try { canvas.remove(o); } catch (e) {} });
  penPreview = [];
  if (penPreviewPath) { try { canvas.remove(penPreviewPath); } catch (e) {} penPreviewPath = null; }
}

function addPenTemp(obj) { canvas.add(obj); penPreview.push(obj); }

function drawPenPreview(pending, cursor) {
  clearPenPreview();
  const all = pending ? [...state.penPoints, pending] : [...state.penPoints];
  if (!all.length) { canvas.requestRenderAll(); return; }

  const strokeC = currentStroke(), strokeW = currentStrokeW();
  const isClosed = state.penClosed || state.penDragType === 'closing';
  const uiScale = 1 / Math.max(state.zoom, MIN_ZOOM);

  const dStr = buildPenSVG(all, isClosed);
  if (dStr) {
    try {
      penPreviewPath = new fabric.Path(dStr, {
        fill: null, stroke: strokeC, strokeWidth: strokeW,
        strokeLineCap: 'round', strokeLineJoin: 'round',
        selectable: false, evented: false, objectCaching: false, opacity: 0.6
      });
      canvas.add(penPreviewPath);
    } catch (e) {}
  }

  // guide
  if (cursor && !pending && all.length && state.penMode === 'draw' && !isClosed) {
    const last = all[all.length - 1];
    const g = new fabric.Line([last.x, last.y, cursor.x, cursor.y], {
      stroke: PREVIEW, strokeWidth: uiScale, strokeDashArray: [6 * uiScale, 4 * uiScale], opacity: 0.5,
      selectable: false, evented: false
    });
    addPenTemp(g);
    if (state.penPoints.length > 2 && dist(cursor, state.penPoints[0]) < CLOSE_THRESHOLD * 1.5) {
      const fp = state.penPoints[0];
      addPenTemp(new fabric.Circle({ left: fp.x - 8 * uiScale, top: fp.y - 8 * uiScale, radius: 8 * uiScale, fill: 'rgba(79,140,255,0.12)', stroke: PREVIEW, strokeWidth: uiScale, selectable: false, evented: false }));
    }
  }

  // ancres + poignées
  all.forEach((pt, i) => {
    drawHandle(pt, 'hIn', uiScale);
    drawHandle(pt, 'hOut', uiScale);
    const isFirst = i === 0;
    const isSel = i === state.penSelected;
    const fill = isSel ? '#ff4d4d' : (isFirst ? PREVIEW : '#ffffff');
    addPenTemp(new fabric.Circle({
      left: pt.x - ANCHOR_R * uiScale, top: pt.y - ANCHOR_R * uiScale, radius: ANCHOR_R * uiScale,
      fill: fill, stroke: isSel ? '#ff4d4d' : PREVIEW, strokeWidth: (isSel ? 1.5 : 1) * uiScale,
      selectable: false, evented: false
    }));
  });

  if (all.length) {
    const lastPt = all[all.length - 1];
    const label = all.length + ' pt ' + (state.penMode === 'edit' ? '✎' : '✏') + (isClosed ? ' ○' : ' —');
    try {
      addPenTemp(new fabric.Text(label, {
        left: lastPt.x + 14, top: lastPt.y - 10, fontSize: 10, fill: PREVIEW,
        fontFamily: 'system-ui, sans-serif', selectable: false, evented: false, opacity: 0.7
      }));
    } catch (e) {}
  }
  canvas.requestRenderAll();
}

function drawHandle(pt, type, uiScale) {
  const hx = type === 'hIn' ? pt.hInX : pt.hOutX;
  const hy = type === 'hIn' ? pt.hInY : pt.hOutY;
  if (!hx && !hy) return;
  const ex = pt.x + hx, ey = pt.y + hy;
  addPenTemp(new fabric.Line([pt.x, pt.y, ex, ey], { stroke: PREVIEW, strokeWidth: uiScale, opacity: 0.7, selectable: false, evented: false }));
  addPenTemp(new fabric.Circle({ left: ex - HANDLE_R * uiScale, top: ey - HANDLE_R * uiScale, radius: HANDLE_R * uiScale, fill: '#ffffff', stroke: PREVIEW, strokeWidth: uiScale, selectable: false, evented: false }));
}

function finalizePen(closed) {
  if (state.penPoints.length < 2) { clearPenPreview(); endPen(false); return; }
  beginTxn(); // capture l'état avant l'ajout du tracé
  clearPenPreview();

  const editingExistingPath = state.penMode === 'edit' && state.penEditTarget && state.penOrigData;
  const strokeC = editingExistingPath ? state.penOrigData.stroke : currentStroke();
  const strokeW = editingExistingPath ? state.penOrigData.strokeWidth : currentStrokeW();
  const fillC = closed ? (editingExistingPath ? state.penOrigData.fill : currentFill()) : null;
  const dStr = buildPenSVG(state.penPoints, closed);
  if (!dStr) { endPen(false); return; }

  let path = null;
  try {
    path = new fabric.Path(dStr, {
      fill: fillC, stroke: strokeC, strokeWidth: strokeW,
      strokeLineCap: 'round', strokeLineJoin: 'round',
      selectable: true, evented: true, objectCaching: true,
      opacity: editingExistingPath ? state.penOrigData.opacity : 1
    });
    if (!closed) path.fill = null;
    path._plumeData = { points: JSON.parse(JSON.stringify(state.penPoints)), closed: closed };
    // sérialisation
    const orig = path.toObject.bind(path);
    path.toObject = function (p) {
      return fabric.util.object.extend(orig(p), { _plumeData: this._plumeData });
    };
    canvas.add(path);
    canvas.setActiveObject(path);
    canvas.requestRenderAll();
    commitUndo(closed ? 'Forme fermée' : 'Tracé plume');
    setDirty(true);
  } catch (err) {
    console.error('[Plume]', err);
  }
  endPen(false);
  if (path) {
    canvas.setActiveObject(path);
    refreshActiveSelection();
  }
}

/* ════════════════════════════════════════════════════════════
   OUTILS — CRAYON
════════════════════════════════════════════════════════════ */
function startPencil() {
  state.pencilOn = true;
  canvas.isDrawingMode = true;
  canvas.selection = false;
  canvas.defaultCursor = 'crosshair';
  configureDrawingBrush();
  // capture l'état AVANT le tracé (le path est ajouté par Fabric avant path:created)
  canvas.on('mouse:down', _pencilTxnStart);
  canvas.on('mouse:move', captureBrushPressure);
  canvas.on('path:created', onPencilCreated);
}

function configureDrawingBrush() {
  const preset = state.tool === 'brush' ? state.brushPreset : 'pencil';
  const wantsSpray = preset === 'spray' && fabric.SprayBrush;
  const BrushClass = wantsSpray ? fabric.SprayBrush : fabric.PencilBrush;
  if (!canvas.freeDrawingBrush || !(canvas.freeDrawingBrush instanceof BrushClass)) {
    canvas.freeDrawingBrush = new BrushClass(canvas);
  }
  const brush = canvas.freeDrawingBrush;
  let width = state.tool === 'brush' ? state.brushSize : currentStrokeW();
  if (preset === 'marker') width *= 2.4;
  if (preset === 'spray') width *= 2.8;
  brush.color = currentStroke();
  brush.width = width;
  brush.decimate = Math.max(0.1, (100 - state.brushSmoothing) / 18);
  brush.shadow = preset === 'neon'
    ? new fabric.Shadow({ color: currentStroke(), blur: Math.max(4, width * 1.4), offsetX: 0, offsetY: 0 })
    : null;
  if (wantsSpray) {
    brush.density = 18;
    brush.dotWidth = Math.max(1, width * 0.08);
    brush.dotWidthVariance = Math.max(1, width * 0.06);
    brush.randomOpacity = true;
    brush.optimizeOverlapping = true;
  }
}

function captureBrushPressure(opt) {
  if (state.tool !== 'brush' || !state.brushPressure || !opt || !opt.e) return;
  const pressure = Number(opt.e.pressure);
  if (pressure > 0) state.brushPressureValue = pressure;
}

let _pencilTxnStarted = false;
function _pencilTxnStart() {
  if (state.pencilOn && !_pencilTxnStarted) {
    _pencilTxnStarted = true;
    beginTxn();
  }
}
function _pencilTxnReset() { _pencilTxnStarted = false; }

function onPencilCreated(e) {
  const p = e.path;
  _pencilTxnReset();
  if (!p) return;
  const isBrush = state.tool === 'brush';
  const preset = isBrush ? state.brushPreset : 'pencil';
  const pressureFactor = isBrush && state.brushPressure ? 0.45 + state.brushPressureValue * 1.1 : 1;
  const baseWidth = isBrush ? state.brushSize : currentStrokeW();
  const markerFactor = preset === 'marker' ? 2.4 : 1;
  p.set({
    fill: preset === 'spray' ? p.fill : null,
    stroke: currentStroke(),
    strokeWidth: baseWidth * markerFactor * pressureFactor,
    strokeLineCap: preset === 'marker' ? 'square' : 'round',
    strokeLineJoin: 'round',
    opacity: isBrush ? state.brushOpacity * (preset === 'marker' ? 0.55 : 1) : 1,
    shadow: preset === 'neon' ? new fabric.Shadow({ color: currentStroke(), blur: Math.max(4, baseWidth * 1.4), offsetX: 0, offsetY: 0 }) : null
  });
  state.brushPressureValue = 0.5;
  commitUndo(isBrush ? 'Tracé pinceau' : 'Tracé crayon');
  setDirty(true);
  setTool('select'); // usage unique : retour à la sélection après le tracé
}

function stopPencil() {
  if (!state.pencilOn) return;
  state.pencilOn = false;
  canvas.off('path:created', onPencilCreated);
  canvas.off('mouse:down', _pencilTxnStart);
  canvas.off('mouse:move', captureBrushPressure);
  _pencilTxnReset();
  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.defaultCursor = 'default';
  refreshActiveSelection();
}

/* ════════════════════════════════════════════════════════════
   OUTILS — FORMES
════════════════════════════════════════════════════════════ */
function startShape(opt) {
  beginTxn(); // capture l'état avant l'ajout de la forme
  const p = canvas.getPointer(opt.e);
  state.shapeStart = { x: p.x, y: p.y };
  const common = {
    left: p.x, top: p.y, width: 0, height: 0,
    fill: currentFill(), stroke: currentStroke(), strokeWidth: currentStrokeW(),
    strokeLineCap: 'round', strokeLineJoin: 'round',
    originX: 'left', originY: 'top'
  };
  if (state.tool === 'rect') state.shapeObj = new fabric.Rect(common);
  else if (state.tool === 'ellipse') state.shapeObj = new fabric.Ellipse({ ...common, rx: 0, ry: 0, width: undefined, height: undefined, left: p.x, top: p.y });
  else if (state.tool === 'line') state.shapeObj = new fabric.Line([p.x, p.y, p.x, p.y], { fill: null, stroke: currentStroke(), strokeWidth: currentStrokeW(), strokeLineCap: 'round' });
  else if (state.tool === 'star') state.shapeObj = makeStar(p.x, p.y, 0, 0, 5, currentFill(), currentStroke(), currentStrokeW());
  else if (state.tool === 'polygon') state.shapeObj = makePolygon(p.x, p.y, 0, 6, currentFill(), currentStroke(), currentStrokeW());

  if (state.shapeObj) {
    if (state.tool === 'rect') state.shapeObj._birdShape = { kind: 'rect' };
    else if (state.tool === 'ellipse') state.shapeObj._birdShape = { kind: 'ellipse' };
    else if (state.tool === 'line') state.shapeObj._birdShape = { kind: 'line' };
    else if (state.tool === 'star') state.shapeObj._birdShape = { kind: 'star', points: 5, innerRatio: 0.5, radius: 0 };
    else if (state.tool === 'polygon') state.shapeObj._birdShape = { kind: 'polygon', points: 6, radius: 0 };
    state.shapeObj.selectable = false;
    state.shapeObj.evented = false;
    canvas.add(state.shapeObj);
  }
}

function moveShape(opt) {
  if (!state.shapeObj || !state.shapeStart) return;
  const p = canvas.getPointer(opt.e);
  const sx = state.shapeStart.x, sy = state.shapeStart.y;
  const w = p.x - sx, h = p.y - sy;
  const constrainedSize = opt.e.shiftKey ? Math.max(Math.abs(w), Math.abs(h)) : null;
  const endX = constrainedSize === null ? p.x : sx + (w < 0 ? -constrainedSize : constrainedSize);
  const endY = constrainedSize === null ? p.y : sy + (h < 0 ? -constrainedSize : constrainedSize);
  const o = state.shapeObj;
  const fill = currentFill(), stroke = currentStroke(), sw = currentStrokeW();

  if (state.tool === 'rect') {
    o.set({ left: Math.min(sx, endX), top: Math.min(sy, endY), width: Math.abs(endX - sx), height: Math.abs(endY - sy) });
  } else if (state.tool === 'ellipse') {
    const cx = (sx + endX) / 2, cy = (sy + endY) / 2;
    o.set({ left: cx, top: cy, originX: 'center', originY: 'center', rx: Math.abs(endX - sx) / 2, ry: Math.abs(endY - sy) / 2 });
  } else if (state.tool === 'line') {
    o.set({ x2: p.x, y2: p.y });
  } else if (state.tool === 'star') {
    const dx = p.x - sx, dy = p.y - sy;
    const outer = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    replaceStar(o, sx, sy, outer, Math.min(outer * 0.5, Math.max(4, Math.hypot(dx, dy) * 0.4)), 5, fill, stroke, sw);
    o._birdShape = { kind: 'star', points: 5, innerRatio: 0.5, radius: outer };
    state.shapeObj = o;
  } else if (state.tool === 'polygon') {
    const radius = Math.hypot(p.x - sx, p.y - sy);
    replacePolygon(o, sx, sy, radius, 6, fill, stroke, sw);
    o._birdShape = { kind: 'polygon', points: 6, radius: radius };
    state.shapeObj = o;
  }
  canvas.requestRenderAll();
}

function endShape() {
  if (!state.shapeObj) return;
  const o = state.shapeObj;
  // ignore les formes vides
  const tiny = (o.type === 'line')
    ? (Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 2)
    : ((o.width || 0) < 2 && (o.height || 0) < 2 && !o.rx);
  if (tiny) { canvas.remove(o); state.shapeObj = null; state.shapeStart = null; cancelTxn(); canvas.requestRenderAll(); return; }
  o.set({ selectable: true, evented: true });
  o.setCoords();
  canvas.setActiveObject(o);
  state.shapeObj = null;
  state.shapeStart = null;
  commitUndo('Forme');
  setDirty(true);
  canvas.requestRenderAll();
  setTool('select'); // usage unique : retour à la sélection après le tracé
}

function makeStar(cx, cy, outer, inner, points, fill, stroke, sw) {
  return new fabric.Polygon(starPoints(Math.max(outer, 1), Math.max(inner, 1), points), {
    left: cx, top: cy, originX: 'center', originY: 'center',
    fill, stroke, strokeWidth: sw, strokeLineJoin: 'round', objectCaching: false
  });
}
function replaceStar(obj, cx, cy, outer, inner, points, fill, stroke, sw) {
  const pts = starPoints(Math.max(outer, 1), Math.max(inner, 1), points);
  obj.set({
    points: pts,
    width: outer * 2,
    height: outer * 2,
    pathOffset: new fabric.Point(0, 0),
    left: cx,
    top: cy,
    originX: 'center',
    originY: 'center',
    fill,
    stroke,
    strokeWidth: sw
  });
  obj.dirty = true;
  return obj;
}
function starPoints(outer, inner, n) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / n) * i - Math.PI / 2;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

function makePolygon(cx, cy, radius, n, fill, stroke, sw) {
  return new fabric.Polygon(polyPoints(Math.max(radius, 1), n), {
    left: cx, top: cy, originX: 'center', originY: 'center',
    fill, stroke, strokeWidth: sw, strokeLineJoin: 'round', objectCaching: false
  });
}
function replacePolygon(obj, cx, cy, radius, n, fill, stroke, sw) {
  const pts = polyPoints(Math.max(radius, 1), n);
  obj.set({
    points: pts,
    width: radius * 2,
    height: radius * 2,
    pathOffset: new fabric.Point(0, 0),
    left: cx,
    top: cy,
    originX: 'center',
    originY: 'center',
    fill,
    stroke,
    strokeWidth: sw
  });
  obj.dirty = true;
  return obj;
}
function polyPoints(radius, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 / n) * i - Math.PI / 2;
    pts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return pts;
}

/* ════════════════════════════════════════════════════════════
   OUTIL — TEXTE
════════════════════════════════════════════════════════════ */
// Un clic sur un texte existant l'édite au lieu d'en empiler un nouveau par-dessus.
function startText(opt) {
  const existing = opt.target;
  if (existing && existing.type === 'i-text') {
    canvas.setActiveObject(existing);
    state.textCreating = true;
    existing.enterEditing();
    existing.selectAll();
    return;
  }
  addText(opt);
}

function addText(opt) {
  beginTxn(); // capture l'état avant l'ajout du texte
  const p = canvas.getPointer(opt.e);
  const t = new fabric.IText('Texte', {
    left: p.x, top: p.y, fontSize: parseInt(els.fontSize.value, 10) || 48,
    fontFamily: els.fontFamily.value, fill: currentFill(),
    originX: 'center', originY: 'center', editable: true
  });
  canvas.add(t);
  canvas.setActiveObject(t);
  state.textCreating = true;
  commitUndo('Texte');
  setDirty(true);
  // entrer en édition
  setTimeout(() => { t.enterEditing(); t.selectAll(); }, 10);
}

function finalizeText() {
  state.textCreating = false;
  const o = canvas.getActiveObject();
  if (o && o.type === 'i-text') {
    if (o.isEditing) o.exitEditing();
    if (!(o.text || '').trim()) canvas.remove(o);
  }
  // Comme Figma : un seul texte par activation de l'outil, puis retour à la sélection.
  if (state.tool === 'text') setTool('select');
}

/* ════════════════════════════════════════════════════════════
   OUTIL — IMAGE
════════════════════════════════════════════════════════════ */
function pickImage() {
  els.imgInput.click();
}
els.imgInput.addEventListener('change', function (e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
});

/* Importe n'importe quel fichier déposé/choisi (image, SVG, PDF/AI, EPS, vidéo, .plume) */
async function importFile(file, dropPoint) {
  if (!file) return;
  const name = file.name || '';
  const type = file.type || '';

  // Fichier projet .plume / JSON
  if (/\.(plume|bird)$/i.test(name) || /\.json$/i.test(name)) {
    readAsText(file, (text) => openFileContent(text, name));
    return;
  }

  // Détection par signature : .ai peut être un PDF ou du PostScript.
  let kind = null;
  try {
    const head = await file.slice(0, 4096).arrayBuffer();
    kind = window.BirdIO ? BirdIO.detectKind(head, name) : null;
  } catch (e) { /* fichier local non lisible en tranche */ }

  if (kind === 'pdf') {
    await importPDF(file, dropPoint, name);
    return;
  }
  if (kind === 'eps') {
    await importEPS(file, dropPoint, name);
    return;
  }
  if (kind === 'svgz') {
    await importSVGZ(file, dropPoint, name);
    return;
  }

  // SVG (importé comme groupe vectoriel)
  if (/\.svg$/i.test(name) || type === 'image/svg+xml') {
    readAsText(file, (text) => importSVGText(text, dropPoint));
    return;
  }
  // EPS / AI legacy : interpréteur PostScript
  if (/\.eps$/i.test(name) || type === 'application/postscript' || type === 'image/x-eps') {
    await importEPS(file, dropPoint, name);
    return;
  }
  // PDF explicite
  if (/\.pdf$/i.test(name) || type === 'application/pdf') {
    await importPDF(file, dropPoint, name);
    return;
  }
  // .ai non reconnu : tentative PDF puis EPS
  if (/\.ai$/i.test(name)) {
    try { await importPDF(file, dropPoint, name); }
    catch (err) { await importEPS(file, dropPoint, name); }
    return;
  }
  // Vidéos (WebM/MP4) → vignette + lien source pour ré-ouverture
  if (/\.(webm|mp4|ogv|mov)$/i.test(name) || type.indexOf('video/') === 0) {
    importVideo(file, dropPoint);
    return;
  }
  // Images bitmap (PNG, JPG, WEBP, GIF, BMP, AVIF…)
  if (type.indexOf('image/') === 0 || /\.(png|jpe?g|webp|gif|bmp|avif|ico)$/i.test(name)) {
    importBitmap(file, dropPoint);
    return;
  }
  toast('Format non pris en charge', true);
}

/* ── PDF / Illustrator : vectoriel via pdf.js ── */
async function importPDF(file, dropPoint, name) {
  if (!window.BirdIO) { toast('Moteur PDF indisponible', true); return; }
  const toastMsg = toast('Analyse du PDF…');
  try {
    const buffer = await file.arrayBuffer();
    let info = { pages: 1, sizes: [] };
    try { info = await BirdIO.pdfPageCount(buffer); }
    catch (e) { info = { pages: 1, sizes: [] }; }

    if (info.pages > 1) {
      const choice = await askPdfPages(info, name);
      if (!choice) return;                       // l'utilisateur a annulé
      if (choice.mode === 'all') {
        await importPdfAllPages(buffer, info, name);
        return;
      }
      const result = await BirdIO.pdfToSVG(buffer, { page: choice.page });
      importSVGText(result.svg, dropPoint, 'Import PDF p' + choice.page);
      toast('PDF page ' + choice.page + '/' + info.pages + ' importée ✓');
      return;
    }

    const result = await BirdIO.pdfToSVG(buffer);
    importSVGText(result.svg, dropPoint, 'Import PDF');
    toast('PDF vectoriel importé ✓');
  } catch (err) {
    console.error('[Bird PDF]', err);
    toast('Import PDF impossible : ' + (err.message || 'format non pris en charge'), true);
  }
}

/* Un plan de travail par page du PDF, au format exact de chaque page. */
async function importPdfAllPages(buffer, info, name) {
  const baseName = String(name || 'PDF').replace(/\.(pdf|ai)$/i, '').slice(0, 40) || 'PDF';
  toast('Import de ' + info.pages + ' pages…');
  let done = 0;
  for (let i = 1; i <= info.pages; i++) {
    let result;
    try {
      result = await BirdIO.pdfToSVG(buffer, { page: i });
    } catch (err) {
      console.warn('[Bird PDF] page ' + i + ' ignorée', err);
      continue;
    }
    // Chaque page : nouveau plan, format de la page PDF, contenu à 1:1.
    addPage(baseName + ' p' + i);
    setArtboardSize(Math.round(result.width), Math.round(result.height));
    await importSVGExact(result.svg, 'Import PDF p' + i);
    done++;
  }
  renderPages();
  setDirty(true);
  toast(done + ' plan(s) importé(s) depuis le PDF ✓');
}

/* Place un SVG importé à sa position et sa taille d'origine (0,0 à 1:1).
   Le flux « importer » classique centre et réduit l'objet : ici on veut la
   fidélité du fichier, pas une vignette confortable. */
function importSVGExact(svgText, label) {
  return new Promise((resolve) => {
    try {
      fabric.loadSVGFromString(String(svgText), (objects, options) => {
        if (!objects || !objects.length) { resolve(null); return; }
        const group = objects.length === 1 && objects[0].type === 'path'
          ? objects[0]
          : fabric.util.groupSVGElements(objects, options);
        if (!group) { resolve(null); return; }
        beginTxn();
        group.set({ left: 0, top: 0, originX: 'left', originY: 'top', scaleX: 1, scaleY: 1 });
        canvas.add(group);
        commitUndo(label || 'Import PDF');
        resolve(group);
      });
    } catch (e) {
      console.error('[Bird SVG exact]', e);
      resolve(null);
    }
  });
}

/* Demande à l'utilisateur quelle(s) page(s) importer. Résout null si annulé. */
function askPdfPages(info, name) {
  return new Promise((resolve) => {
    const modal = $('pdfPagesModal');
    if (!modal) { resolve({ mode: 'first', page: 1 }); return; }

    const lead = $('pdfPagesLead');
    const total = $('pdfPagesTotal');
    const number = $('pdfPageNumber');
    const pick = $('pdfPagePick');
    const sizes = $('pdfPagesSizes');

    lead.textContent = '« ' + (name || 'PDF') + ' » contient ' + info.pages + ' pages.';
    total.textContent = '/ ' + info.pages;
    number.max = String(info.pages);
    number.value = '1';
    if (info.sizes && info.sizes.length) {
      const first = info.sizes[0];
      sizes.textContent = 'Format de la page 1 : ' + Math.round(first.width) + ' × ' +
        Math.round(first.height) + ' px';
    } else {
      sizes.textContent = '';
    }
    document.querySelectorAll('input[name="pdfPageMode"]').forEach(r => {
      r.checked = r.value === 'first';
      r.onchange = () => { pick.hidden = r.value !== 'pick' || !r.checked; };
    });
    pick.hidden = true;
    modal.hidden = false;

    const cleanup = () => {
      modal.hidden = true;
      $('pdfPagesClose').onclick = null;
      $('pdfPagesCancel').onclick = null;
      $('pdfPagesRun').onclick = null;
      modal.onclick = null;
      number.onkeydown = null;
    };
    const cancel = () => { cleanup(); resolve(null); };
    const confirm = () => {
      const mode = (document.querySelector('input[name="pdfPageMode"]:checked') || {}).value || 'first';
      const page = Math.max(1, Math.min(info.pages, parseInt(number.value, 10) || 1));
      cleanup();
      resolve({ mode: mode === 'all' ? 'all' : (mode === 'pick' ? 'pick' : 'first'), page });
    };

    $('pdfPagesClose').onclick = cancel;
    $('pdfPagesCancel').onclick = cancel;
    $('pdfPagesRun').onclick = confirm;
    modal.onclick = (e) => { if (e.target === modal) cancel(); };
    number.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') cancel();
    };
    setTimeout(() => $('pdfPagesRun').focus(), 30);
  });
}

/* ── EPS / Illustrator 8 : interpréteur PostScript ── */
async function importEPS(file, dropPoint, name) {
  if (!window.BirdIO) { toast('Moteur EPS indisponible', true); return; }
  try {
    const buffer = await file.arrayBuffer();
    const result = await BirdIO.epsToFabricGroup(buffer, fabric);
    if (!result || !result.group) throw new Error('Aucun tracé');
    addImportedObject(result.group, dropPoint, 'Import EPS', true);
  } catch (err) {
    console.error('[Bird EPS]', err);
    toast('EPS illisible : ' + (err.message || 'PostScript non pris en charge'), true);
  }
}

/* ── SVG compressé (.svgz) ── */
async function importSVGZ(file, dropPoint, name) {
  try {
    const buffer = await file.arrayBuffer();
    if (typeof DecompressionStream === 'undefined') throw new Error('Décompression non prise en charge');
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    importSVGText(text, dropPoint, 'Import SVGZ');
  } catch (err) {
    toast('SVGZ illisible', true);
  }
}

function readAsText(file, cb) {
  const r = new FileReader();
  r.onload = () => cb(r.result);
  r.onerror = () => toast('Lecture impossible', true);
  r.readAsText(file);
}

/* ── Bitmap : centré ou à l'endroit du drop ── */
function importBitmap(file, dropPoint) {
  const r = new FileReader();
  r.onload = () => {
    fabric.Image.fromURL(r.result, (img) => {
      addImportedObject(img, dropPoint, 'Image');
    });
  };
  r.onerror = () => toast('Image illisible', true);
  r.readAsDataURL(file);
}

/* ── SVG : importé en tant que groupe vectoriel ── */
function importSVGText(svgContent, dropPoint, label) {
  try {
    const clean = window.BirdIO ? BirdIO.sanitizeSVG(svgContent) : { svg: svgContent };
    fabric.loadSVGFromString(clean.svg, (objects, options) => {
      if (!objects || !objects.length) { toast('SVG vide ou invalide', true); return; }
      if (objects.length === 1 && objects[0].type === 'path' && editablePenPath(objects[0])) {
        addImportedObject(objects[0], dropPoint, label || 'Import SVG');
        return;
      }
      const group = fabric.util.groupSVGElements(objects, options);
      if (!group) { toast('SVG invalide', true); return; }
      addImportedObject(group, dropPoint, label || 'Import SVG', true);
    });
  } catch (err) {
    console.error('[Bird SVG]', err);
    toast('Erreur d\'import SVG : ' + (err.message || ''), true);
  }
}

/* ── Vidéo : vignette (première frame) + donnée source conservée ── */
function importVideo(file, dropPoint) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  v.preload = 'metadata';
  let settled = false;
  const cleanup = () => { URL.revokeObjectURL(url); };
  v.onerror = () => { if (!settled) { settled = true; cleanup(); toast('Vidéo illisible', true); } };
  v.onloadeddata = () => {
    if (settled) return; settled = true;
    try { v.currentTime = Math.min(0.1, (v.duration || 1) / 2); } catch (e) {}
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 640; c.height = v.videoHeight || 360;
        const ctx = c.getContext('2d');
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const thumbnail = c.toDataURL('image/png');
        fabric.Image.fromURL(thumbnail, (img) => {
          addImportedObject(img, dropPoint, 'Vidéo');
          cleanup();
        });
      } catch (err) { cleanup(); toast('Vidéo illisible', true); }
    };
  };
  setTimeout(() => { if (!settled) { settled = true; cleanup(); } }, 6000);
}

/* ── Positionne et ajoute un objet importé, avec undo ── */
function addImportedObject(obj, dropPoint, label, isGroup) {
  if (!obj) return;
  beginTxn(); // capture l'état avant l'ajout (idempotent si déjà capturé)
  let px, py;
  if (dropPoint) {
    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    px = (dropPoint.x - vpt[4]) / vpt[0];
    py = (dropPoint.y - vpt[5]) / vpt[3];
  } else {
    px = state.artboardW / 2;
    py = state.artboardH / 2;
  }
  const max = Math.max(state.artboardW, state.artboardH) * 0.7;
  const w = obj.width || (obj.getScaledWidth && obj.getScaledWidth()) || 1;
  const h = obj.height || (obj.getScaledHeight && obj.getScaledHeight()) || 1;
  const scale = Math.min(1, max / Math.max(w || 1, h || 1));
  obj.set({ left: px, top: py, originX: 'center', originY: 'center', scaleX: scale, scaleY: scale });
  if (obj.type === 'group') obj.set({ subTargetCheck: false });
  canvas.add(obj);
  canvas.setActiveObject(obj);
  commitUndo(label);
  setDirty(true);
  canvas.requestRenderAll();
  toast(label + ' ajouté ✓');
  if (state.tool === 'image') setTool('select'); // usage unique : retour à la sélection après l'import
}

/* ════════════════════════════════════════════════════════════
   ZOOM & PAN
════════════════════════════════════════════════════════════ */
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

function zoomAtPoint(point, factor) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  state.zoom = clamp(vpt[0] * factor, MIN_ZOOM, MAX_ZOOM);
  factor = state.zoom / vpt[0];
  const newV = [state.zoom, 0, 0, state.zoom,
    point.x - factor * point.x + factor * vpt[4],
    point.y - factor * point.y + factor * vpt[5]];
  canvas.setViewportTransform(newV);
  canvas.requestRenderAll();
  updateZoomUI();
}

function setZoom(z) {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const cx = canvas.getWidth() / 2, cy = canvas.getHeight() / 2;
  state.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
  const factor = state.zoom / vpt[0];
  canvas.setViewportTransform([
    state.zoom, 0, 0, state.zoom,
    cx - factor * cx + factor * vpt[4],
    cy - factor * cy + factor * vpt[5]
  ]);
  canvas.requestRenderAll();
  updateZoomUI();
}

function centerView() {
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  canvas.setViewportTransform([vpt[0], 0, 0, vpt[3],
    (canvas.getWidth() - state.artboardW * vpt[0]) / 2,
    (canvas.getHeight() - state.artboardH * vpt[3]) / 2]);
  canvas.requestRenderAll();
  updateZoomUI();
}

function fitView() {
  const pad = 48;
  const availW = canvas.getWidth() - pad * 2;
  const availH = canvas.getHeight() - pad * 2;
  const z = clamp(Math.min(availW / state.artboardW, availH / state.artboardH), MIN_ZOOM, MAX_ZOOM);
  setZoom(z);
  centerView();
}

function updateZoomUI() {
  const el = els.zoomReadout;
  if (!el) return;
  const text = Math.round(state.zoom * 100) + '%';
  // Le champ est un vrai input (zoom saisissable) : on ne l'écrase pas
  // pendant que l'utilisateur tape dedans.
  if (document.activeElement === el) return;
  if ('value' in el) el.value = text;
  else el.textContent = text;
}

function startPan(opt) {
  state.panning = true;
  state.panLastX = opt.e.clientX;
  state.panLastY = opt.e.clientY;
  canvas.defaultCursor = 'grabbing';
  canvas.selection = false;
}

// Appelé par setTool() en quittant l'outil Main : la référence manquait, ce qui
// bloquait tout changement d'outil après un usage de la Main (ReferenceError).
function stopPan() {
  state.panning = false;
}

function movePan(opt) {
  if (!state.panning) return;
  const dx = opt.e.clientX - state.panLastX;
  const dy = opt.e.clientY - state.panLastY;
  state.panLastX = opt.e.clientX;
  state.panLastY = opt.e.clientY;
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  canvas.setViewportTransform([vpt[0], vpt[1], vpt[2], vpt[3], vpt[4] + dx, vpt[5] + dy]);
  canvas.requestRenderAll();
}

function endPan() {
  state.panning = false;
  // Comme Figma : la Main est un outil à usage unique, retour à la sélection après le glisser.
  if (state.tool === 'hand') { setTool('select'); return; }
  canvas.defaultCursor = state.tool === 'pen' ? 'crosshair' : 'default';
  canvas.selection = state.tool === 'select';
  refreshActiveSelection();
}

/* ════════════════════════════════════════════════════════════
   HISTORIQUE (UNDO / REDO) — incrémental
   ────────────────────────────────────────────────────────────
   Un état n'est plus un document complet mais une carte
   « id d'objet → JSON ». Les objets inchangés partagent la même
   chaîne entre deux états : modifier une forme dans un document de
   300 objets ne coûte que cette forme, pas les 299 autres.
   Voir js/history.js.
════════════════════════════════════════════════════════════ */
function canvasJSON() { return canvas.toJSON(SERIALIZED_PROPS); }

const history = window.BirdHistory
  ? BirdHistory.create({
    readObjects: () => canvas.getObjects(),
    properties: SERIALIZED_PROPS,
    header: () => ({ version: fabric.version, background: canvas.backgroundColor || '' })
  })
  : null;

const HISTORY_LIMIT = 80;                       // états (nombre)
const HISTORY_BUDGET = 64 * 1024 * 1024;        // états (octets, partagés)

function captureState() {
  return history ? history.capture() : canvasJSON();
}

/* `loadJSON` est asynchrone (fabric « enlivène » les objets). Entre le
   `canvas.clear()` et la fin du chargement, le document est VIDE : toute
   capture faite à cet instant enregistrerait un document vide dans la pile
   opposée. On verrouille donc undo/redo pendant la restauration. */
let _restoring = false;

/* INVARIANT : le sommet de `state.undo` est toujours l'état ANTÉRIEUR de la
   dernière opération, jamais l'état courant. `_current` retient l'état
   courant pour ne pas le recapturer à chaque frappe. Les deux ne sont
   qu'une référence : aucun octet dupliqué. */
let _current = null;

function currentState() {
  if (!_current) _current = captureState();
  return _current;
}

function invalidateCurrent() { _current = null; }

function restoreState(snapshot) {
  if (!history) return loadJSON(snapshot);
  const plain = history.materialize(snapshot);
  return plain ? loadJSON(plain) : Promise.resolve();
}

/* Pousse un état et applique la double limite (nombre + octets). */
function pushHistory(snapshot) {
  state.undo.push(snapshot);
  BirdHistory.trim(state.undo, HISTORY_LIMIT, HISTORY_BUDGET, historyBytes);
  updateUndoUI();
}

function historyBytes() {
  return history ? history.bytesOf(state.undo, state.redo) : 0;
}

function clearRedo() { state.redo = []; }

/* Vide les piles sans toucher au cache d'objets : les instantanés déjà
   retenus (autres plans de travail) continuent de partager leurs chaînes. */
function resetStacks() {
  state.undo = [];
  state.redo = [];
  invalidateCurrent();
  updateUndoUI();
}

/* Nouveau document : là, tout le cache devient inutile. */
function clearHistory() {
  state.undo = [];
  state.redo = [];
  if (history) history.reset();
  invalidateCurrent();
  updateUndoUI();
}

// Transaction : capture l'état AVANT la mutation pour que undo restaure l'état
// précédent (essentiel pour les ajouts d'objets).
let _txn = null;
function beginTxn() {
  if (!_txn) _txn = { before: currentState() };
  return _txn;
}
function commitUndo(label) {
  const before = _txn ? _txn.before : currentState();
  _txn = null;
  pushHistory(before);
  invalidateCurrent();
  clearRedo();
}
function cancelTxn() { _txn = null; invalidateCurrent(); }

/* `pushUndo` s'appelle AVANT la mutation : il enregistre l'état courant tel
   quel comme état antérieur. Il ne consomme pas une transaction ouverte, pour
   qu'un `beginTxn` en cours ne soit pas perdu. */
function pushUndo(label) {
  pushHistory(currentState());
  invalidateCurrent();
  clearRedo();
}

/* Les réglages du panneau (couleur, opacité, épaisseur…) arrivent par rafales.
   On capture un seul état avant la rafale, puis on le valide après 350 ms. */
let _propTxn = null;
let _propTimer = 0;
function beginPropChange() {
  if (!_propTxn) _propTxn = currentState();
  clearTimeout(_propTimer);
  _propTimer = setTimeout(flushPropChange, 350);
}
function flushPropChange() {
  clearTimeout(_propTimer);
  _propTimer = 0;
  if (!_propTxn) return;
  pushHistory(_propTxn);
  _propTxn = null;
  invalidateCurrent();
  clearRedo();
}

function undo() {
  if (state.penActive) { penUndoPoint(); return; }
  if (_restoring) return;
  flushPropChange();
  if (!state.undo.length) return;
  const cur = currentState();
  const prev = state.undo.pop();
  state.redo.push(cur);
  _restoring = true;
  Promise.resolve(restoreState(prev)).then(() => {
    _current = prev;
    _restoring = false;
  });
  updateUndoUI();
}

function redo() {
  if (state.penActive) { penRedoPoint(); return; }
  if (_restoring) return;
  flushPropChange();
  if (!state.redo.length) return;
  const cur = currentState();
  const next = state.redo.pop();
  state.undo.push(cur);
  _restoring = true;
  Promise.resolve(restoreState(next)).then(() => {
    _current = next;
    _restoring = false;
  });
  updateUndoUI();
}

function penUndoPoint() {
  if (state.penPoints.length) {
    state.penUndo.push(state.penPoints.pop());
    if (state.penClosed && state.penPoints.length < 3) state.penClosed = false;
    drawPenPreview();
  }
}
function penRedoPoint() {
  if (state.penUndo.length) {
    state.penPoints.push(state.penUndo.pop());
    drawPenPreview();
  }
}

function loadJSON(json) {
  canvas.clear();
  return new Promise((resolve) => {
    canvas.loadFromJSON(json, () => {
      canvas.getObjects().forEach(o => {
        if (o.type === 'i-text' || o.type === 'textbox') o.set({ editable: true });
        if (o._plumeData) attachPenSerializer(o);
        if (o.birdLocked) setObjectLocked(o, true);
        if (o.birdHidden) { o.visible = false; o.evented = false; }
      });
      canvas.requestRenderAll();
      updateHint();
      renderLayers();
      scheduleOverlayUpdate();
      resolve();
    });
  });
}

function attachPenSerializer(path) {
  if (!path || !path._plumeData || path.__birdPenSerializer) return;
  const original = path.toObject.bind(path);
  path.toObject = function (properties) {
    return fabric.util.object.extend(original(properties), { _plumeData: this._plumeData });
  };
  path.__birdPenSerializer = true;
}

function updateUndoUI() {
  els.btnUndo.disabled = !state.undo.length;
  els.btnRedo.disabled = !state.redo.length;
  // La mémoire de l'historique est visible : c'est le seul moyen de savoir
  // si l'incrémental fait son travail sur un vrai document.
  if (els.btnUndo && history) {
    const bytes = historyBytes();
    els.btnUndo.title = 'Annuler (Ctrl+Z) — ' + state.undo.length + ' état(s), ' +
      BirdHistory.formatBytes(bytes);
  }
}

function canGroupSelection(active) {
  return !!active && active.type === 'activeSelection' && active._objects && active._objects.length > 1;
}

function canUngroupSelection(active) {
  return !!active && active.type === 'group';
}

function updateGroupingUI() {
  const active = canvas && canvas.getActiveObject();
  els.btnGroup.disabled = !canGroupSelection(active);
  els.btnUngroup.disabled = !canUngroupSelection(active);
}

function groupSelection() {
  const active = canvas.getActiveObject();
  if (!canGroupSelection(active)) return false;
  pushUndo('Grouper');
  const group = active.toGroup();
  group.set({ subTargetCheck: false });
  canvas.setActiveObject(group);
  setDirty(true);
  refreshActiveSelection();
  onSelection();
  toast('Objets groupés');
  return true;
}

function ungroupSelection() {
  const active = canvas.getActiveObject();
  if (!canUngroupSelection(active)) return false;
  pushUndo('Dégrouper');
  const selection = active.toActiveSelection();
  canvas.setActiveObject(selection);
  setDirty(true);
  refreshActiveSelection();
  onSelection();
  toast('Groupe décomposé');
  return true;
}

function closeCanvasContextMenu() {
  if (els.canvasContextMenu) els.canvasContextMenu.hidden = true;
}

function bindGroupingControls() {
  els.btnGroup.addEventListener('click', groupSelection);
  els.btnUngroup.addEventListener('click', ungroupSelection);
  els.canvasContextMenu.addEventListener('click', event => {
    const item = event.target.closest('[data-context-action]');
    if (!item) return;
    const action = item.dataset.contextAction;
    closeCanvasContextMenu();
    if (action === 'group') groupSelection();
    else if (action === 'ungroup') ungroupSelection();
    else if (action === 'bring-front') zOrder('front');
    else if (action === 'send-back') zOrder('back');
    else if (action === 'edit-path') {
      const path = editablePenPath(canvas.getActiveObject());
      if (path) beginPenEdit(path);
      else toast('Ce tracé ne peut pas être édité avec la Plume', true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!els.canvasContextMenu.contains(event.target)) closeCanvasContextMenu();
  });
  window.addEventListener('blur', closeCanvasContextMenu);
  window.addEventListener('resize', closeCanvasContextMenu);
}

/* ════════════════════════════════════════════════════════════
   PROPRIÉTÉS (panneau de droite)
════════════════════════════════════════════════════════════ */
function bindProps() {
  els.fillColor.addEventListener('input', () => { applyToSelection('fill', els.fillColor.value); updateFillChips(appearanceTarget()); });
  els.strokeColor.addEventListener('input', () => { applyToSelection('stroke', els.strokeColor.value); updateFillChips(appearanceTarget()); });
  els.strokeWidth.addEventListener('input', () => {
    const v = parseFloat(els.strokeWidth.value);
    els.strokeWidthVal.textContent = v;
    applyToSelection('strokeWidth', v);
  });

  document.querySelectorAll('#brushPresets .brush-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      state.brushPreset = btn.dataset.brush;
      document.querySelectorAll('#brushPresets .brush-preset').forEach(item => item.classList.toggle('active', item === btn));
      configureDrawingBrush();
    });
  });
  bindBrushRange('brushSize', 'brushSizeVal', 'brushSize', value => String(value));
  bindBrushRange('brushSmoothing', 'brushSmoothingVal', 'brushSmoothing', value => value + '%');
  bindBrushRange('brushOpacity', 'brushOpacityVal', 'brushOpacity', value => value + '%', value => value / 100);
  $('brushPressure').addEventListener('change', e => { state.brushPressure = e.target.checked; });
  els.opacity.addEventListener('input', () => {
    const v = parseInt(els.opacity.value, 10);
    els.opacityVal.textContent = v + '%';
    applyToSelection('opacity', v / 100);
  });
  els.fontSize.addEventListener('input', () => {
    const v = parseInt(els.fontSize.value, 10);
    els.fontSizeVal.textContent = v;
    applyToSelection('fontSize', v);
  });
  els.fontFamily.addEventListener('change', () => applyToSelection('fontFamily', els.fontFamily.value));

  els.fillNone.addEventListener('click', () => { els.fillColor.value = '#4f8cff'; applyToSelection('fill', null); updateFillChips(appearanceTarget()); });
  els.strokeNone.addEventListener('click', () => { applyToSelection('stroke', null); updateFillChips(appearanceTarget()); });

  // texte
  $('textBold').addEventListener('click', function () { this.classList.toggle('on'); toggleTextStyle('fontWeight', this.classList.contains('on') ? 'bold' : 'normal'); });
  $('textItalic').addEventListener('click', function () { this.classList.toggle('on'); toggleTextStyle('fontStyle', this.classList.contains('on') ? 'italic' : 'normal'); });
  $('textUnderline').addEventListener('click', function () { this.classList.toggle('on'); toggleTextStyle('underline', this.classList.contains('on')); });
  $('textStrike').addEventListener('click', function () { this.classList.toggle('on'); toggleTextStyle('linethrough', this.classList.contains('on')); });
  $('textCenter').addEventListener('click', () => applyToSelection('textAlign', 'center'));

  // disposition
  $('bringFront').addEventListener('click', () => zOrder('front'));
  $('bringForward').addEventListener('click', () => zOrder('forward'));
  $('sendBackward').addEventListener('click', () => zOrder('backward'));
  $('sendBack').addEventListener('click', () => zOrder('back'));
  $('duplicate').addEventListener('click', duplicate);
  $('deleteObj').addEventListener('click', deleteSelection);

  // document
  els.artboardColor.addEventListener('input', () => setArtboardColor(els.artboardColor.value));
  $('artboardNone').addEventListener('click', () => { setArtboardColor(null); els.artboardColor.value = '#ffffff'; });
  els.artboardSize.addEventListener('change', () => {
    const [w, h] = els.artboardSize.value.split('x').map(Number);
    if (w && h) setArtboardSize(w, h);
  });
  $('btnClear').addEventListener('click', clearAll);

  // ── Dégradé ──
  $('gradNone').addEventListener('click', function () {
    setGradientActive(null);
    applyToSelection('fill', currentFill()); // reprend la couleur unie
  });
  $('gradLinear').addEventListener('click', function () {
    setGradientActive('linear');
    applyGradient();
  });
  $('gradRadial').addEventListener('click', function () {
    setGradientActive('radial');
    applyGradient();
  });
  $('gradColor1').addEventListener('input', () => { if (state.gradType) applyGradient(); });
  $('gradColor2').addEventListener('input', () => { if (state.gradType) applyGradient(); });
  $('gradAngle').addEventListener('input', () => {
    const v = parseInt($('gradAngle').value, 10);
    $('gradAngleVal').textContent = v + '°';
    if (state.gradType) applyGradient();
  });

  // ── Pathfinder ──
  $('pfUnion').addEventListener('click', () => pathfinderOp('union'));
  $('pfSubtract').addEventListener('click', () => pathfinderOp('subtract'));
  $('pfIntersect').addEventListener('click', () => pathfinderOp('intersect'));
  $('pfExclude').addEventListener('click', () => pathfinderOp('exclude'));

  // ── Nuancier ──
  renderSwatches();
  $('swatchAddBtn').addEventListener('click', () => {
    const o = canvas.getActiveObject();
    if (!o) { toast('Sélectionnez un objet d\'abord', true); return; }
    const color = o.fill && o.fill !== 'transparent' ? o.fill : currentFill();
    if (!state.swatches.includes(color)) {
      state.swatches.push(color);
      renderSwatches();
      toast('Couleur ajoutée au nuancier ✓');
    }
  });

  // topbar
  els.btnUndo.addEventListener('click', undo);
  els.btnRedo.addEventListener('click', redo);
  $('btnZoomIn').addEventListener('click', () => setZoom(state.zoom * 1.25));
  $('btnZoomOut').addEventListener('click', () => setZoom(state.zoom / 1.25));
  $('btnFit').addEventListener('click', fitView);
  $('btnZoomSel').addEventListener('click', zoomToSelection);
  bindZoomReadout();
  bindExportMenu();
  $('btnSave').addEventListener('click', saveFile);
  $('btnOpen').addEventListener('click', () => els.fileOpen.click());
  els.fileOpen.addEventListener('change', openFile);
  bindSettings();
  bindAI();
}

/* ════════════════════════════════════════════════════════════
   CALQUES (liste des objets)
════════════════════════════════════════════════════════════ */
const LAYER_ICONS = {
  eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8S4 3.8 8 3.8 14.5 8 14.5 8 12 12.2 8 12.2 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2.1"/></svg>',
  eyeOff: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2l12 12M6.2 4.2A6.9 6.9 0 0 1 8 3.8c4 0 6.5 4.2 6.5 4.2a11 11 0 0 1-2.4 2.9M4.1 5.1A11.6 11.6 0 0 0 1.5 8S4 12.2 8 12.2c.8 0 1.5-.1 2.2-.4"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.2"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2"/></svg>',
  unlock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.2"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.3-1"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12V4M4.5 7.5 8 4l3.5 3.5"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4v8M4.5 8.5 8 12l3.5-3.5"/></svg>'
};

function objectLabel(o) {
  if (o.name) return o.name;
  if (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') {
    const txt = String(o.text || '').replace(/\s+/g, ' ').trim();
    return txt ? (txt.length > 26 ? txt.slice(0, 26) + '…' : txt) : 'Texte';
  }
  const labels = {
    rect: 'Rectangle', ellipse: 'Ellipse', circle: 'Cercle', line: 'Ligne',
    polygon: 'Polygone', triangle: 'Triangle', path: 'Tracé', group: 'Groupe',
    image: 'Image', activeSelection: 'Sélection'
  };
  const base = labels[o.type] || o.type;
  const shape = o._birdShape && o._birdShape.kind === 'star' ? 'Étoile' : base;
  return shape;
}

function renderLayers() {
  const list = $('layersList');
  if (!list) return;
  // `filter(Boolean)` : un objet invalide glissé dans le canvas ne doit pas
  // faire tomber tout le panneau (ni, en cascade, la sélection et l'export).
  const objects = canvas.getObjects().filter(Boolean);
  const active = canvas.getActiveObject();
  const activeSet = new Set(canvas.getActiveObjects().filter(Boolean));
  list.innerHTML = '';
  if (!objects.length) {
    const empty = document.createElement('div');
    empty.className = 'layers-empty';
    empty.textContent = 'Aucun calque';
    list.appendChild(empty);
    return;
  }
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    const row = document.createElement('div');
    row.className = 'layer-row' + (activeSet.has(o) ? ' active' : '') + (o.visible === false ? ' is-hidden' : '');
    row.dataset.index = String(i);

    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'layer-btn' + (o.visible === false ? ' on' : '');
    eye.dataset.act = 'visible';
    eye.title = o.visible === false ? 'Afficher' : 'Masquer';
    eye.innerHTML = o.visible === false ? LAYER_ICONS.eyeOff : LAYER_ICONS.eye;

    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'layer-btn' + (o.birdLocked ? ' on' : '');
    lock.dataset.act = 'lock';
    lock.title = o.birdLocked ? 'Déverrouiller' : 'Verrouiller';
    lock.innerHTML = o.birdLocked ? LAYER_ICONS.lock : LAYER_ICONS.unlock;

    const name = document.createElement('span');
    name.className = 'layer-name';
    name.textContent = objectLabel(o);
    name.title = 'Double-clic pour renommer';

    const kind = document.createElement('span');
    kind.className = 'layer-kind';
    kind.textContent = o.type === 'group' && o._objects ? o._objects.length + ' obj.' : '';

    const up = document.createElement('button');
    up.type = 'button'; up.className = 'layer-btn'; up.dataset.act = 'up';
    up.title = 'Avancer'; up.innerHTML = LAYER_ICONS.up;
    const down = document.createElement('button');
    down.type = 'button'; down.className = 'layer-btn'; down.dataset.act = 'down';
    down.title = 'Reculer'; down.innerHTML = LAYER_ICONS.down;

    row.append(eye, lock, name, kind, up, down);
    list.appendChild(row);
  }
}

function bindLayerPanel() {
  const list = $('layersList');
  if (!list) return;
  list.addEventListener('click', (e) => {
    const row = e.target.closest('.layer-row');
    if (!row) return;
    const index = Number(row.dataset.index);
    const o = canvas.getObjects()[index];
    if (!o) return;
    const btn = e.target.closest('.layer-btn');
    if (btn) {
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'visible') {
        beginPropChange();
        o.visible = o.visible === false;
        o.birdHidden = !o.visible;
        if (!o.visible) { o.evented = false; }
        else { o.evented = !o.birdLocked; }
        if (!o.visible && canvas.getActiveObject() === o) canvas.discardActiveObject();
        canvas.requestRenderAll(); setDirty(true); renderLayers(); onSelection();
        return;
      }
      if (act === 'lock') {
        beginPropChange();
        setObjectLocked(o, !o.birdLocked);
        canvas.requestRenderAll(); setDirty(true); renderLayers(); onSelection();
        return;
      }
      if (act === 'up' || act === 'down') {
        beginPropChange();
        if (act === 'up') canvas.bringForward(o); else canvas.sendBackwards(o);
        canvas.requestRenderAll(); setDirty(true); renderLayers();
        return;
      }
    }
    canvas.setActiveObject(o);
    canvas.requestRenderAll();
    refreshActiveSelection();
    onSelection();
  });

  list.addEventListener('dblclick', (e) => {
    const name = e.target.closest('.layer-name');
    if (!name) return;
    const row = e.target.closest('.layer-row');
    const o = row && canvas.getObjects()[Number(row.dataset.index)];
    if (!o) return;
    const next = window.prompt('Nom du calque', objectLabel(o));
    if (next == null) return;
    beginPropChange();
    o.name = String(next).trim() || undefined;
    setDirty(true);
    renderLayers();
  });
}

function setObjectLocked(o, locked) {
  o.birdLocked = !!locked;
  o.selectable = !locked && o.visible !== false;
  o.evented = !locked && o.visible !== false;
  o.lockMovementX = !!locked;
  o.lockMovementY = !!locked;
  o.lockRotation = !!locked;
  o.lockScalingX = !!locked;
  o.lockScalingY = !!locked;
  if (locked && canvas.getActiveObject() === o) canvas.discardActiveObject();
}

function toggleLockSelection() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) { toast('Sélectionnez un objet', true); return; }
  beginPropChange();
  const target = !objs.every(o => o.birdLocked);
  objs.forEach(o => setObjectLocked(o, target));
  setDirty(true);
  canvas.requestRenderAll();
  renderLayers();
  toast(target ? 'Sélection verrouillée ✓' : 'Sélection déverrouillée ✓');
}

function toggleVisibleSelection() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) { toast('Sélectionnez un objet', true); return; }
  beginPropChange();
  const target = objs.some(o => o.visible !== false);
  objs.forEach(o => {
    o.visible = !target;
    o.birdHidden = target;
    if (target) o.evented = false;
    else o.evented = !o.birdLocked;
  });
  if (target) canvas.discardActiveObject();
  setDirty(true);
  canvas.requestRenderAll();
  refreshActiveSelection();
  renderLayers();
  toast(target ? 'Sélection masquée' : 'Sélection affichée ✓');
}

/* ── « Tout déverrouiller » / « Tout afficher » (Ctrl+Alt+2 / Ctrl+Alt+3) ──
   Indispensables dès qu'un objet masqué ou verrouillé n'est plus
   sélectionnable : sans elles, l'objet est perdu pour l'utilisateur. */
function unlockAll() {
  const objs = canvas.getObjects().filter(o => o.birdLocked);
  if (!objs.length) { toast('Aucun objet verrouillé'); return; }
  beginPropChange();
  objs.forEach(o => setObjectLocked(o, false));
  setDirty(true);
  canvas.requestRenderAll();
  renderLayers();
  toast(objs.length + (objs.length > 1 ? ' objets déverrouillés ✓' : ' objet déverrouillé ✓'));
}

function showAll() {
  const objs = canvas.getObjects().filter(o => o.visible === false);
  if (!objs.length) { toast('Aucun objet masqué'); return; }
  beginPropChange();
  objs.forEach(o => {
    o.visible = true;
    o.birdHidden = false;
    o.evented = !o.birdLocked;
  });
  setDirty(true);
  canvas.requestRenderAll();
  renderLayers();
  toast(objs.length + (objs.length > 1 ? ' objets affichés ✓' : ' objet affiché ✓'));
}

function deselectAll() {
  canvas.discardActiveObject();
  refreshActiveSelection();
  updateGroupingUI();
}

/* Taille de police au clavier (Ctrl+Maj+. / Ctrl+Maj+, comme Illustrator). */
function changeFontSize(delta) {
  const objs = canvas.getActiveObjects().filter(o => o.type === 'i-text' || o.type === 'text' || o.type === 'textbox');
  if (!objs.length) { toast('Sélectionnez un texte', true); return; }
  beginPropChange();
  objs.forEach(o => {
    const size = Math.max(1, Math.round((o.fontSize || 16) + delta));
    o.set({ fontSize: size });
    o.set('dirty', true);
  });
  canvas.requestRenderAll();
  refreshActiveSelection();
  setDirty(true);
  toast('Corps ' + Math.round(objs[0].fontSize) + ' px');
}

/* ════════════════════════════════════════════════════════════
   CONTRÔLES DE FORME, CONTOUR, FUSION
════════════════════════════════════════════════════════════ */
function bindShapeControls() {
  $('shapeRadius').addEventListener('input', () => {
    const o = canvas.getActiveObject();
    if (!o) return;
    const v = Number($('shapeRadius').value);
    $('shapeRadiusVal').textContent = v;
    beginPropChange();
    o.set({ rx: v, ry: v });
    o.setCoords();
    canvas.requestRenderAll();
    setDirty(true);
  });

  const rebuild = () => {
    const o = canvas.getActiveObject();
    const info = shapeInfo(o);
    if (!o || !info || (info.kind !== 'polygon' && info.kind !== 'star')) return;
    const n = Number($('shapePoints').value);
    $('shapePointsVal').textContent = n;
    const radius = info.radius || Math.max(o.width || 1, o.height || 1) / 2;
    const center = o.getCenterPoint();
    beginPropChange();
    if (info.kind === 'star') {
      const ratio = Number($('shapeInner').value) / 100;
      $('shapeInnerVal').textContent = Math.round(ratio * 100) + '%';
      replaceStar(o, center.x, center.y, radius, radius * ratio, n, o.fill, o.stroke, o.strokeWidth);
      o._birdShape = { kind: 'star', points: n, innerRatio: ratio, radius: radius };
    } else {
      replacePolygon(o, center.x, center.y, radius, n, o.fill, o.stroke, o.strokeWidth);
      o._birdShape = { kind: 'polygon', points: n, radius: radius };
    }
    o.setCoords();
    canvas.requestRenderAll();
    setDirty(true);
    syncShapeFields(o);
  };
  $('shapePoints').addEventListener('input', rebuild);
  $('shapeInner').addEventListener('input', rebuild);

  $('shapeToPath').addEventListener('click', convertShapeToPath);
}

function convertShapeToPath() {
  const o = canvas.getActiveObject();
  if (!o) return;
  if (typeof paper === 'undefined') { toast('Moteur de conversion indisponible', true); return; }
  beginTxn();
  try {
    paper.setup(document.createElement('canvas'));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + o.toSVG() + '</svg>';
    const item = paper.project.importSVG(svg, { expandShapes: true, insert: true });
    const out = item.exportSVG({ asString: true, precision: 3 });
    item.remove();
    fabric.loadSVGFromString('<svg xmlns="http://www.w3.org/2000/svg">' + out + '</svg>', (objects, options) => {
      let replacement = null;
      if (objects.length === 1) replacement = objects[0];
      else replacement = fabric.util.groupSVGElements(objects, options);
      if (!replacement) { cancelTxn(); toast('Conversion impossible', true); return; }
      const index = canvas.getObjects().indexOf(o);
      canvas.remove(o);
      canvas.add(replacement);
      if (index >= 0 && index < canvas.getObjects().length - 1) {
        canvas.moveTo(replacement, index);
      }
      replacement.set({ fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth });
      canvas.setActiveObject(replacement);
      commitUndo('Convertir en chemin');
      setDirty(true);
      canvas.requestRenderAll();
      toast('Forme convertie en chemin ✓');
    });
  } catch (err) {
    console.error('[Bird shape→path]', err);
    cancelTxn();
    toast('Conversion impossible', true);
  }
}

function bindStrokeControls() {
  $('strokeDash').addEventListener('change', () => {
    const v = $('strokeDash').value;
    if (v === 'custom') {
      $('strokeDashCustomRow').hidden = false;
      $('strokeDashCustom').focus();
      return;
    }
    $('strokeDashCustomRow').hidden = true;
    const arr = v ? v.split(/\s+/).map(Number).filter(n => n > 0) : null;
    applyToSelection('strokeDashArray', arr);
  });
  $('strokeDashCustom').addEventListener('change', () => {
    const arr = $('strokeDashCustom').value.split(/[\s,]+/).map(Number).filter(n => n > 0);
    applyToSelection('strokeDashArray', arr.length ? arr : null);
  });
  $('strokeCap').addEventListener('change', () => applyToSelection('strokeLineCap', $('strokeCap').value));
  $('strokeJoin').addEventListener('change', () => applyToSelection('strokeLineJoin', $('strokeJoin').value));
  $('blendMode').addEventListener('change', () => applyToSelection('globalCompositeOperation', $('blendMode').value));
  $('toggleLock').addEventListener('click', toggleLockSelection);
  $('toggleVisible').addEventListener('click', toggleVisibleSelection);
}

/* ════════════════════════════════════════════════════════════
   RÉGLAGES DOCUMENT : grille, règles, magnétisme
════════════════════════════════════════════════════════════ */
function bindDocumentToggles() {
  $('gridSize').addEventListener('change', () => {
    state.gridSize = Math.max(1, parseInt($('gridSize').value, 10) || 20);
    canvas.requestRenderAll();
    setDirty(true);
  });
  $('showGrid').addEventListener('change', () => {
    setGrid($('showGrid').checked);
  });
  $('showRulers').addEventListener('change', () => {
    setRulers($('showRulers').checked);
  });
  $('snapEnabled').addEventListener('change', () => {
    setSnap($('snapEnabled').checked);
  });
  $('clearGuides').addEventListener('click', () => {
    if (!state.guides.length) return;
    beginPropChange();
    state.guides = [];
    renderGuides(true);
    setDirty(true);
    toast('Repères effacés');
  });
  $('gridSize').value = state.gridSize;
  syncViewToggles();
}

/* ────────────────────────────────────────────────────────────
   RÈGLES / GRILLE / MAGNÉTISME — une seule source de vérité
   Chaque bascule existe en trois endroits : la barre haute, le
   panneau Document et le clavier. Les trois passent ici, donc
   l'état affiché ne peut jamais diverger de l'état réel.
──────────────────────────────────────────────────────────── */
const RULER_SIZE = 18;

function syncViewToggles() {
  const set = (id, on) => {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('is-on', !!on);
    b.setAttribute('aria-pressed', String(!!on));
  };
  set('btnRulers', state.showRulers);
  set('btnGrid', state.showGrid);
  set('btnSnap', state.snapEnabled);
  const cbR = $('showRulers'); if (cbR) cbR.checked = !!state.showRulers;
  const cbG = $('showGrid'); if (cbG) cbG.checked = !!state.showGrid;
  const cbS = $('snapEnabled'); if (cbS) cbS.checked = !!state.snapEnabled;
  const btn = $('btnRulers');
  if (btn) btn.title = state.showRulers ? 'Règles affichées (Ctrl+R) — cliquer pour masquer' : 'Règles masquées (Ctrl+R) — cliquer pour afficher';
}

function setRulers(on) {
  state.showRulers = !!on;
  els.stage.classList.toggle('rulers-off', !state.showRulers);
  syncViewToggles();
  resizeCanvas();       // le plan de travail se décale sous les règles
  setDirty(true);
}

function setGrid(on) {
  state.showGrid = !!on;
  syncViewToggles();
  canvas.requestRenderAll();
  setDirty(true);
}

function setSnap(on) {
  state.snapEnabled = !!on;
  syncViewToggles();
  setDirty(true);
}

function bindViewToggles() {
  const bind = (id, fn) => {
    const b = $(id);
    if (b) b.addEventListener('click', fn);
  };
  bind('btnRulers', () => setRulers(!state.showRulers));
  bind('btnGrid', () => setGrid(!state.showGrid));
  bind('btnSnap', () => setSnap(!state.snapEnabled));
  if (!state.showRulers) els.stage.classList.add('rulers-off');
  syncViewToggles();
}

/* ════════════════════════════════════════════════════════════
   COQUILLE NATIVE (Tauri) — macOS / Windows / Linux
   ────────────────────────────────────────────────────────────
   Le moteur est identique au web ; la coquille apporte le disque
   natif, une vraie fenêtre et surtout le MENU SYSTÈME, qui porte les
   raccourcis Adobe/Figma (⌘ sur macOS, Ctrl ailleurs).

   Le menu émet des identifiants de commande ; le moteur les exécute.
   Quand la plateforme a accepté l'accélérateur, on empêche le clavier
   du webview de rejouer la même touche : sans ça, un Ctrl+Z natif
   provoquerait DEUX annulations.
════════════════════════════════════════════════════════════ */
async function detectNativeShell() {
  if (!window.BirdNative) return;
  const info = await BirdNative.init();
  if (!info.available) return;

  const platform = BirdNative.platform;
  document.documentElement.dataset.shell = 'native';
  document.documentElement.dataset.platform = platform;
  if (window.BirdCommands) BirdCommands.setPlatform(platform);

  if (platform === 'mac') {
    document.querySelectorAll('.empty-hint .kbd, kbd').forEach(el => {
      if (el.textContent.trim() === 'Ctrl') el.textContent = '⌘';
    });
    const title = document.querySelector('.empty-hint .kbd');
    if (title) title.innerHTML = title.innerHTML.replace(/Ctrl/g, '⌘');
  }

  Bird.native = info.info || {};
  BirdNative.onCommand(runNativeCommand);
  /* Association de fichiers : un .plume double-cliqué arrive soit en argv
     (Windows/Linux), soit par « Ouvrir avec » (macOS). */
  BirdNative.onOpenFile(openNativePath);
  BirdNative.pendingFile().then((path) => { if (path) openNativePath(path); }).catch(() => {});
  renderShortcuts();

  const version = (info.info && info.info.version) || Bird.version || '';
  document.title = 'Bird ' + version + ' — Éditeur vectoriel';
  BirdNative.setTitle('Bird — Éditeur vectoriel');
  const versionNode = document.querySelector('.settings-version');
  if (versionNode) versionNode.textContent = 'Bird ' + version + ' · ' + platform;
}

/* ════════════════════════════════════════════════════════════
   SHELL : widgets détachables + plug-ins
   Les deux systèmes vivent dans leurs propres fichiers
   (js/widgets.js, js/plugins.js) et ne reçoivent ici que des
   points d'accroche : jamais un accès direct aux internes.
════════════════════════════════════════════════════════════ */
let widgetsApi = null;

function mountShellExtras() {
  window.__birdCanvas = canvas;
  window.__birdToast = toast;
  window.__birdBeginTxn = beginTxn;
  window.__birdCommitUndo = commitUndo;
  window.__birdRefreshSelection = onSelection;
  window.__birdRenderLayers = renderLayers;
  window.__birdSetDirty = setDirty;

  const newBtn = $('btnNew');
  if (newBtn && !newBtn.dataset.bound) {
    newBtn.dataset.bound = '1';
    newBtn.addEventListener('click', () => resetDocument());
  }
  const brand = $('brandHome');
  if (brand && !brand.dataset.bound) {
    brand.dataset.bound = '1';
    brand.addEventListener('click', () => { fitView(); toast('Vue ajustée'); });
  }

  if (window.BirdWidgets) {
    widgetsApi = BirdWidgets.init({
      sidebar: els.rightSidebar,
      layer: $('widgetsLayer')
    });
  }
  if (window.BirdPlugins) {
    try { BirdPlugins.init(); } catch (e) { console.warn('[bird plugins]', e); }
  }
  detectNativeShell();
}

/* ════════════════════════════════════════════════════════════
   WIDGET ZOOM — position publiée pour que la sidebar le pousse
════════════════════════════════════════════════════════════ */
function publishSidebarWidth() {
  if (!els.rightSidebar) return;
  const w = Math.round(els.rightSidebar.getBoundingClientRect().width) || 56;
  document.documentElement.style.setProperty('--bird-sidebar-r', w + 'px');
}

/* La largeur est publiée en continu : la sidebar s'anime, et le widget de
   zoom doit la suivre image par image, pas seulement à l'arrivée. */
function observeSidebar() {
  if (!els.rightSidebar || typeof ResizeObserver === 'undefined') {
    publishSidebarWidth();
    return;
  }
  if (els.rightSidebar.__birdObserved) return;
  els.rightSidebar.__birdObserved = true;
  const ro = new ResizeObserver(() => publishSidebarWidth());
  ro.observe(els.rightSidebar);
  publishSidebarWidth();
}

/* Le pourcentage de zoom est saisissable, comme dans SuperPrint. */
function bindZoomReadout() {
  const input = els.zoomReadout;
  if (!input || !('value' in input)) return;
  const commit = () => {
    const raw = String(input.value).replace(/[^\d.,]/g, '').replace(',', '.');
    const pct = parseFloat(raw);
    if (isFinite(pct) && pct > 0) {
      setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pct / 100)));
    }
    updateZoomUI();
    input.blur();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); updateZoomUI(); input.blur(); }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('focus', () => input.select());
}

/* ════════════════════════════════════════════════════════════
   OUTILS VECTORIELS (le panneau, pas les mathématiques)
════════════════════════════════════════════════════════════ */
function selectedObjects() {
  const objs = canvas.getActiveObjects();
  return objs.length ? objs : [];
}

function requireSelection(count) {
  const objs = selectedObjects();
  if (!objs.length) { toast('Sélectionnez un objet', true); return null; }
  if (count && objs.length < count) {
    toast('Sélectionnez ' + count + ' objets', true);
    return null;
  }
  return objs;
}

function replaceObject(oldObj, newObj, label) {
  if (!newObj) return;
  beginTxn();
  const index = canvas.getObjects().indexOf(oldObj);
  canvas.remove(oldObj);
  if (index >= 0) canvas.insertAt(newObj, index, false);
  else canvas.add(newObj);
  newObj.setCoords();
  canvas.setActiveObject(newObj);
  commitUndo(label);
  refreshActiveSelection();
  renderLayers();
  setDirty(true);
}

/* Actions du panneau « Outils vectoriels », exposées comme fonctions nommées :
   le bouton, le menu natif et le clavier appellent la MÊME implémentation. */
function outlineTextSelection() {
  const objs = requireSelection();
  if (!objs) return;
  let done = 0;
  const failed = [];
  objs.slice().forEach(obj => {
    try {
      beginTxn();
      const result = BirdVector.vectorizeTextObject(canvas, obj, { silent: true });
      if (result) { commitUndo('Texte en courbes'); done++; }
      else failed.push(obj.fontFamily || 'police inconnue');
    } catch (e) { failed.push(e.message); }
  });
  if (done) {
    renderLayers();
    setDirty(true);
    toast(done + (done > 1 ? ' textes convertis' : ' texte converti') + ' en courbes ✓');
  }
  if (failed.length) toast('Police non chargée : ' + failed[0], true);
}

function outlineStrokeSelection() {
  const objs = requireSelection();
  if (!objs) return;
  let done = 0;
  objs.slice().forEach(obj => {
    try {
      const result = BirdVector.outlineStroke(obj);
      if (result) { replaceObject(obj, result, 'Contour de trait'); done++; }
    } catch (e) { toast(e.message || 'Contour impossible', true); }
  });
  if (done) toast('Contour vectorisé ✓');
}

function simplifySelection() {
  const objs = requireSelection();
  if (!objs) return;
  objs.slice().forEach(obj => {
    try {
      const result = BirdVector.simplifyPath(obj, 2);
      replaceObject(obj, result, 'Simplification');
      const stats = result.birdSimplified || { before: 0, after: 0 };
      toast('Simplifié : ' + stats.before + ' → ' + stats.after + ' points');
    } catch (e) { toast(e.message || 'Simplification impossible', true); }
  });
}

function bindVectorTools() {
  const outlineTextBtn = $('toolOutlineText');
  if (outlineTextBtn) outlineTextBtn.addEventListener('click', outlineTextSelection);

  const outlineBtn = $('toolOutlineStroke');
  if (outlineBtn) outlineBtn.addEventListener('click', outlineStrokeSelection);

  const simplifyBtn = $('toolSimplify');
  if (simplifyBtn) simplifyBtn.addEventListener('click', simplifySelection);

  const offsetRange = $('offsetAmount');
  if (offsetRange) {
    const out = $('offsetAmountVal');
    const sync = () => { if (out) out.textContent = offsetRange.value; };
    offsetRange.addEventListener('input', sync);
    sync();
  }
  const offsetBtn = $('toolOffset');
  if (offsetBtn) offsetBtn.addEventListener('click', () => {
    const objs = requireSelection();
    if (!objs) return;
    const distance = Number($('offsetAmount').value) || 0;
    if (!distance) { toast('Réglez une distance non nulle', true); return; }
    objs.slice().forEach(obj => {
      try {
        const bridge = BirdVector.fabricToPaper(obj);
        if (!bridge || !bridge.item) throw new Error('Objet non convertible');
        const item = bridge.item;
        const result = BirdVector.offsetPathItem(item, distance);
        if (!result) throw new Error('Décalage impossible');
        const made = [];
        const parts = result.className === 'CompoundPath' ? result.children : [result];
        parts.forEach(child => {
          const path = BirdVector.paperToFabricPath(child, {
            fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth
          });
          if (path) made.push(path);
        });
        if (!made.length) throw new Error('Décalage vide');
        const group = made.length === 1 ? made[0] : new fabric.Group(made, { objectCaching: false });
        group.set({
          left: obj.left, top: obj.top, originX: obj.originX, originY: obj.originY,
          angle: obj.angle, scaleX: obj.scaleX, scaleY: obj.scaleY, opacity: obj.opacity
        });
        replaceObject(obj, group, 'Décalage de tracé');
      } catch (e) { toast(e.message || 'Décalage impossible', true); }
    });
    toast('Tracé décalé de ' + distance + ' px');
  });

  const blendRange = $('blendSteps');
  if (blendRange) {
    const out = $('blendStepsVal');
    const sync = () => { if (out) out.textContent = blendRange.value; };
    blendRange.addEventListener('input', sync);
    sync();
  }
  const blendBtn = $('toolBlend');
  if (blendBtn) blendBtn.addEventListener('click', async () => {
    const objs = requireSelection(2);
    if (!objs) return;
    const steps = parseInt($('blendSteps').value, 10) || 5;
    try {
      const made = await BirdVector.blendObjects(objs[0], objs[1], steps);
      const valid = (made || []).filter(Boolean);
      if (!valid.length) { toast('Blend vide', true); return; }
      beginTxn();
      valid.forEach(o => canvas.add(o));
      canvas.discardActiveObject();
      commitUndo('Blend');
      renderLayers(); setDirty(true);
      toast(valid.length + ' étapes de blend créées ✓');
    } catch (e) { toast(e.message || 'Blend impossible', true); }
  });

  bindSymbols();
  bindFonts();

  const toolsBtn = $('btnVectorTools');
  if (toolsBtn) toolsBtn.addEventListener('click', () => {
    els.rightSidebar.classList.remove('collapsed');
    requestAnimationFrame(() => {
      const target = document.querySelector('.props-section[data-section="tools"]');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

/* ── Symboles ── */
function renderSymbols() {
  const list = $('symbolsList');
  if (!list) return;
  list.innerHTML = '';
  if (!state.symbols.length) {
    list.innerHTML = '<div class="empty-inline">Aucun symbole.</div>';
    return;
  }
  state.symbols.forEach((sym, index) => {
    const row = document.createElement('div');
    row.className = 'symbol-row';
    const name = document.createElement('span');
    name.className = 'symbol-name';
    name.textContent = sym.name;
    const inst = document.createElement('span');
    inst.className = 'font-glyphs';
    inst.textContent = countInstances(sym.id) + ' inst.';
    const place = document.createElement('button');
    place.type = 'button'; place.className = 'page-tool'; place.textContent = '＋';
    place.title = 'Placer une instance';
    place.addEventListener('click', async () => {
      const obj = await BirdVector.instantiateSymbol(sym, 40, 40);
      beginTxn();
      canvas.add(obj);
      canvas.setActiveObject(obj);
      commitUndo('Instance de symbole');
      renderLayers(); renderSymbols(); setDirty(true);
    });
    const sync = document.createElement('button');
    sync.type = 'button'; sync.className = 'page-tool'; sync.textContent = '↻';
    sync.title = 'Mettre à jour les instances depuis la sélection';
    sync.addEventListener('click', async () => {
      const objs = selectedObjects();
      if (!objs.length) { toast('Sélectionnez une instance', true); return; }
      sym.json = objs[0].toObject(['birdSymbolId']);
      const targets = canvas.getObjects().filter(o => o.birdSymbolId === sym.id);
      if (!targets.length) { toast('Symbole enregistré (aucune instance)', false); return; }
      for (const t of targets) {
        const fresh = await BirdVector.instantiateSymbol(sym, t.left, t.top);
        beginTxn();
        const index2 = canvas.getObjects().indexOf(t);
        canvas.remove(t);
        canvas.insertAt(fresh, index2, false);
        commitUndo('Symbole mis à jour');
      }
      renderLayers(); setDirty(true);
      toast(targets.length + ' instance(s) mises à jour ✓');
    });
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'page-tool page-del'; del.textContent = '×';
    del.title = 'Retirer le symbole';
    del.addEventListener('click', () => {
      state.symbols.splice(index, 1);
      renderSymbols(); setDirty(true);
    });
    row.appendChild(name); row.appendChild(inst);
    row.appendChild(place); row.appendChild(sync); row.appendChild(del);
    list.appendChild(row);
  });
}

function countInstances(id) {
  return canvas.getObjects().filter(o => o.birdSymbolId === id).length;
}

function bindSymbols() {
  const create = $('toolSymbolCreate');
  if (create) create.addEventListener('click', () => {
    const objs = requireSelection();
    if (!objs) return;
    const def = BirdVector.createSymbol(objs[0], 'Symbole ' + (state.symbols.length + 1));
    objs[0].birdSymbolId = def.id;
    state.symbols.push(def);
    renderSymbols();
    setDirty(true);
    toast('Symbole « ' + def.name + ' » créé ✓');
  });
  const place = $('toolSymbolPlace');
  if (place) place.addEventListener('click', async () => {
    const sym = state.symbols[state.symbols.length - 1];
    if (!sym) { toast('Créez d’abord un symbole', true); return; }
    const obj = await BirdVector.instantiateSymbol(sym, 40, 40);
    beginTxn();
    canvas.add(obj);
    canvas.setActiveObject(obj);
    commitUndo('Instance de symbole');
    renderLayers(); renderSymbols(); setDirty(true);
  });
  renderSymbols();
}

/* ── Polices ── */
function renderFonts() {
  const list = $('fontsList');
  if (!list) return;
  list.innerHTML = '';
  if (!window.BirdVector) return;
  const registered = BirdVector.listFonts();
  // On signale aussi les familles utilisées dans le document mais absentes.
  const used = new Set();
  canvas.getObjects().forEach(o => {
    if (o.type === 'i-text' || o.type === 'text' || o.type === 'textbox') {
      const fam = String(o.fontFamily || '').split(',')[0].replace(/['"]/g, '').trim();
      if (fam && !BirdVector.hasFont(o.fontFamily)) used.add(fam);
    }
  });
  if (!registered.length && !used.size) {
    list.innerHTML = '<div class="empty-inline">Aucune police chargée.</div>';
    return;
  }
  registered.forEach(f => {
    const row = document.createElement('div');
    row.className = 'font-row';
    const name = document.createElement('span');
    name.className = 'font-name';
    name.textContent = f.name;
    const glyphs = document.createElement('span');
    glyphs.className = 'font-glyphs';
    glyphs.textContent = f.glyphs + ' glyphes';
    row.appendChild(name); row.appendChild(glyphs);
    list.appendChild(row);
  });
  used.forEach(fam => {
    const row = document.createElement('div');
    row.className = 'font-row is-missing';
    const name = document.createElement('span');
    name.className = 'font-name';
    name.textContent = fam + ' — manquante';
    const glyphs = document.createElement('span');
    glyphs.className = 'font-glyphs';
    glyphs.textContent = 'à charger';
    row.appendChild(name); row.appendChild(glyphs);
    list.appendChild(row);
  });
}

function bindFonts() {
  const add = $('fontsAdd');
  const file = $('fontsFile');
  if (add && file) {
    add.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      try {
        const parsed = await BirdVector.loadFontFile(f);
        renderFonts();
        toast('Police « ' + parsed.name + ' » chargée ✓');
      } catch (e) {
        toast('Police illisible : ' + (e.message || ''), true);
      }
    });
  }
  if (window.BirdVector) {
    BirdVector.restoreFonts().then(n => { if (n) renderFonts(); });
  }
  renderFonts();
}

/* ════════════════════════════════════════════════════════════
   MODALE D'EXPORT AVANCÉ
════════════════════════════════════════════════════════════ */
function currentExportSize() {
  const bounds = exportBounds(state.exportScope);
  if (!bounds) return '—';
  const scale = Number($('exportScale').value) || 1;
  const fmt = state.exportFormat;
  if (fmt === 'svg' || fmt === 'pdf') {
    return Math.round(bounds.width) + ' × ' + Math.round(bounds.height) + ' px';
  }
  return Math.round(bounds.width * scale) + ' × ' + Math.round(bounds.height * scale) + ' px';
}

function syncExportUI() {
  document.querySelectorAll('#exportFormats .export-format').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.format === state.exportFormat);
  });
  const isVector = state.exportFormat === 'svg' || state.exportFormat === 'pdf' || state.exportFormat === 'pdfx';
  const isPrint = state.exportFormat === 'pdfx';
  $('exportScaleField').hidden = isVector;
  $('exportBgField').hidden = false;
  // Les réglages d'imprimerie n'apparaissent que pour le PDF/X.
  const printBox = $('exportPrint');
  if (printBox) printBox.hidden = !isPrint;
  if ($('exportScopePages')) $('exportScopePages').disabled = state.pages.length < 2 || isPrint;
  if (isPrint && state.exportScope === 'pages') {
    state.exportScope = 'document';
    $('exportScope').value = 'document';
  }
  const bg = $('exportBackground');
  bg.querySelector('option[value="transparent"]').disabled = state.exportFormat === 'jpg';
  if (state.exportFormat === 'jpg') bg.value = 'white';
  const notes = {
    svg: 'SVG conserve les objets, le texte et les dégradés. Idéal pour le web et l’édition.',
    pdf: 'PDF vectoriel écran, compatible Illustrator. Les polices non standard sont remplacées par Helvetica, Times ou Courier.',
    pdfx: 'PDF/X-1a:2001 : CMJN uniquement, dégradés en shadings, texte vectorisé, profil ICC déclaré. C’est le fichier à envoyer à l’imprimeur.',
    png: 'PNG avec transparence. Choisissez un fond si vous voulez un aplat.',
    jpg: 'JPG sans transparence : le fond est composité en blanc.',
    webp: 'WEBP : meilleur compromis poids/qualité pour le web.'
  };
  $('exportNote').textContent = state.exportScope === 'pages'
    ? 'Chaque plan de travail devient une page du PDF, à son propre format. Le plus proche d’un document Illustrator multi-plans.'
    : (notes[state.exportFormat] || '');
  $('exportSize').textContent = state.exportScope === 'pages'
    ? state.pages.length + ' pages PDF'
    : currentExportSize();
}

function syncIccUI() {
  const name = $('exportIccName');
  const hint = $('exportIccHint');
  if (!name) return;
  if (state.iccProfile) {
    name.textContent = state.iccProfile.name;
    const ko = state.iccProfile.components !== 4;
    hint.textContent = ko
      ? '⚠ Profil non CMJN : le PDF/X ne sera pas conforme. Choisissez un profil CMJN.'
      : 'Profil embarqué comme /DestOutputProfile du PDF.';
  } else {
    name.textContent = 'Bird CMYK (générique)';
    hint.textContent = 'Chargez le profil ICC de votre imprimeur pour un PDF/X de production.';
  }
}

/* Ouverture programmatique du panneau d'export (menu natif, Ctrl+E).
   Le panneau reste la seule porte d'entrée : un export lancé sans
   réglages visibles serait une surprise désagréable. */
let openExportModal = null;

function showExportPanel(format) {
  if (!openExportModal) return;
  if (format) {
    state.exportFormat = format;
    document.querySelectorAll('#exportFormats .export-format').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.format === format);
    });
  }
  openExportModal();
}

function bindExportModal() {
  const modal = $('exportModal');
  if (!modal) return;
  const open = () => {
    state.exportScope = canvas.getActiveObjects().length ? 'selection' : 'document';
    $('exportScope').value = state.exportScope;
    // L'option multi-plans n'a de sens qu'avec au moins deux plans.
    const pagesOpt = $('exportScopePages');
    if (pagesOpt) {
      pagesOpt.disabled = state.pages.length < 2;
      pagesOpt.textContent = state.pages.length < 2
        ? 'Tous les plans de travail (PDF)'
        : 'Tous les plans de travail — ' + state.pages.length + ' pages (PDF)';
    }
    modal.hidden = false;
    syncExportUI();
  };
  openExportModal = open;
  const close = () => { modal.hidden = true; };

  document.querySelectorAll('#exportFormats .export-format').forEach(btn => {
    btn.addEventListener('click', () => {
      state.exportFormat = btn.dataset.format;
      syncExportUI();
    });
  });
  $('exportScope').addEventListener('change', () => {
    state.exportScope = $('exportScope').value;
    // La portée « tous les plans » implique le PDF.
    if (state.exportScope === 'pages' && state.exportFormat !== 'pdf') {
      state.exportFormat = 'pdf';
    }
    syncExportUI();
  });
  $('exportScale').addEventListener('change', syncExportUI);
  $('exportBackground').addEventListener('change', syncExportUI);

  // ── Réglages d'imprimerie ──
  if ($('exportBleed')) $('exportBleed').addEventListener('change', () => {
    state.pdfxBleed = Number($('exportBleed').value) || 0;
  });
  if ($('exportGcr')) $('exportGcr').addEventListener('change', () => {
    state.cmykGcr = Number($('exportGcr').value);
    if (isNaN(state.cmykGcr)) state.cmykGcr = 0.6;
  });
  if ($('exportInk')) $('exportInk').addEventListener('change', () => {
    state.cmykInkLimit = Number($('exportInk').value) || 3;
  });
  if ($('exportIccLoad') && $('exportIccFile')) {
    $('exportIccLoad').addEventListener('click', () => $('exportIccFile').click());
    $('exportIccFile').addEventListener('change', async () => {
      const file = $('exportIccFile').files && $('exportIccFile').files[0];
      $('exportIccFile').value = '';
      if (!file) return;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const profile = BirdColor.readProfile(buf);
        state.iccProfile = {
          bytes: buf,
          name: file.name.replace(/\.(icc|icm)$/i, '') + ' · ' + profile.name,
          components: profile.components
        };
        if (profile.components !== 4) {
          toast('Ce profil n’est pas CMJN (' + profile.colorspace + ') : intrants non conformes', true);
        } else {
          toast('Profil ICC chargé ✓');
        }
        syncIccUI();
      } catch (e) {
        toast('Profil illisible : ' + (e.message || ''), true);
      }
    });
  }
  if ($('exportIccReset')) $('exportIccReset').addEventListener('click', () => {
    state.iccProfile = null;
    syncIccUI();
    toast('Profil ICC générique rétabli');
  });
  syncIccUI();

  $('exportClose').addEventListener('click', close);
  $('exportCancel').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  $('exportRun').addEventListener('click', async () => {
    const fmt = state.exportFormat;
    close();
    await runExport({
      format: fmt,
      scope: state.exportScope,
      scale: Number($('exportScale').value) || 1,
      background: $('exportBackground').value,
      bleed: state.pdfxBleed,
      outlineText: $('exportOutlineText') ? $('exportOutlineText').value === '1' : true
    });
  });

  $('exportClipboard').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.write) throw new Error('Presse-papiers non disponible');
      const fmt = state.exportFormat;
      if (fmt === 'svg') {
        const blob = await runExport({ format: 'svg', scope: state.exportScope, background: $('exportBackground').value, returnBlob: true });
        if (!blob) return;
        await navigator.clipboard.write([new ClipboardItem({ 'image/svg+xml': blob })]);
      } else if (fmt === 'pdf') {
        toast('Le PDF ne peut pas être copié : exportez-le', true);
        return;
      } else {
        const dataURL = await runExport({ format: fmt, scope: state.exportScope, scale: Number($('exportScale').value) || 1, background: $('exportBackground').value, returnDataURL: true });
        if (!dataURL) return;
        const blob = await (await fetch(dataURL)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      }
      close();
      toast('Copié dans le presse-papiers ✓');
    } catch (err) {
      console.error('[Bird clipboard]', err);
      toast('Copie impossible : ' + (err.message || ''), true);
    }
  });

  // Ouverture depuis le menu rapide
  const list = $('exportList');
  if (list) {
    const more = list.querySelector('[data-export="options"]');
    if (more) more.addEventListener('click', open);
  }
  window.__birdOpenExport = open;
}

/* ════════════════════════════════════════════════════════════
   ZOOM SUR LA SÉLECTION
════════════════════════════════════════════════════════════ */
function zoomToSelection() {
  const objs = canvas.getActiveObjects();
  if (!objs.length) { fitView(); return; }
  const boxes = objs.map(o => o.getBoundingRect(true, true));
  const left = Math.min(...boxes.map(b => b.left));
  const top = Math.min(...boxes.map(b => b.top));
  const right = Math.max(...boxes.map(b => b.left + b.width));
  const bottom = Math.max(...boxes.map(b => b.top + b.height));
  const w = Math.max(1, right - left), h = Math.max(1, bottom - top);
  const pad = 80;
  const availW = canvas.getWidth() - pad * 2;
  const availH = canvas.getHeight() - pad * 2;
  const z = clamp(Math.min(availW / w, availH / h), MIN_ZOOM, MAX_ZOOM);
  state.zoom = z;
  canvas.setViewportTransform([
    z, 0, 0, z,
    canvas.getWidth() / 2 - (left + w / 2) * z,
    canvas.getHeight() / 2 - (top + h / 2) * z
  ]);
  canvas.requestRenderAll();
  updateZoomUI();
  scheduleOverlayUpdate();
}

/* ════════════════════════════════════════════════════════════
   PIPETTE
════════════════════════════════════════════════════════════ */
function pickColorAt(opt) {
  const target = opt.target || canvas.findTarget(opt.e, false);
  if (!target) return;
  const active = canvas.getActiveObject();
  const fill = typeof target.fill === 'string' && target.fill !== 'none' ? target.fill : null;
  const stroke = typeof target.stroke === 'string' && target.stroke !== 'none' ? target.stroke : null;
  if (active && active !== target) {
    beginPropChange();
    if (fill) active.set('fill', fill);
    if (stroke) active.set('stroke', stroke);
    canvas.requestRenderAll();
    setDirty(true);
    onSelection();
    toast('Couleur prélevée et appliquée ✓');
  } else {
    if (fill) els.fillColor.value = colorInputValue(fill, els.fillColor.value);
    if (stroke) els.strokeColor.value = colorInputValue(stroke, els.strokeColor.value);
    toast('Couleur prélevée');
  }
}

/* ════════════════════════════════════════════════════════════
   PRESSE-PAPIERS SYSTÈME (SVG, image)
════════════════════════════════════════════════════════════ */
function bindClipboardPaste() {
  document.addEventListener('paste', (e) => {
    if (isEditingText()) return;
    const data = e.clipboardData;
    if (!data) return;
    const html = data.getData('text/html') || '';
    const text = data.getData('text/plain') || '';
    const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i) || text.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      e.preventDefault();
      importSVGText(svgMatch[0], null, 'Collage SVG');
      return;
    }
    if (data.items) {
      for (const item of data.items) {
        if (item.type && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); importFile(file); return; }
        }
      }
    }
    if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) {
      e.preventDefault();
      importSVGText(text, null, 'Collage SVG');
    }
  });
}

function copySelectionToSystemClipboard(active) {
  if (!active || !navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') return;
  try {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      Math.round(active.getScaledWidth()) + '" height="' + Math.round(active.getScaledHeight()) + '">' +
      active.toSVG() + '</svg>';
    const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
    const textBlob = new Blob([svg], { type: 'text/plain' });
    navigator.clipboard.write([new ClipboardItem({
      'image/svg+xml': svgBlob,
      'text/plain': textBlob
    })]).catch(() => {});
  } catch (e) { /* presse-papiers optionnel */ }
}

function bindBrushRange(id, valueId, stateKey, format, transform) {
  const input = $(id);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    state[stateKey] = transform ? transform(value) : value;
    $(valueId).textContent = format(value);
    if (state.tool === 'brush') configureDrawingBrush();
  });
}

/* ── Préférences (engrenage) ── */
function bindSettings() {
  const modal = $('settingsModal');
  const btn = $('btnSettings');
  if (!modal || !btn) return;
  btn.addEventListener('click', () => { modal.hidden = false; });
  $('settingsClose').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });
  $('btnResetDoc').addEventListener('click', () => {
    resetDocument();
    modal.hidden = true;
    toast('Document réinitialisé');
  });
}

/* ── Création SVG via IA (OpenRouter + DeepSeek) ── */
const AI_PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    keyLabel: 'Clé OpenRouter',
    keyPlaceholder: 'sk-or-v1-…',
    keyStorage: 'bird_openrouter_key',
    chatEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    nativeEndpoint: 'https://openrouter.ai/api/v1/images',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models'
  },
  deepseek: {
    label: 'DeepSeek',
    keyLabel: 'Clé DeepSeek',
    keyPlaceholder: 'sk-…',
    keyStorage: 'bird_deepseek_key',
    chatEndpoint: 'https://api.deepseek.com/chat/completions',
    nativeEndpoint: null,      // DeepSeek ne produit pas de SVG natif
    modelsEndpoint: 'https://api.deepseek.com/models'
  }
};

const AI_TEXT_MODELS = [
  ['openrouter/free', 'Gratuit · sélection automatique'],
  ['z-ai/glm-5.2:free', 'GLM 5.2 · gratuit'],
  ['minimax/minimax-m3:free', 'MiniMax M3 · gratuit'],
  ['cohere/north-mini-code:free', 'North Mini Code · gratuit'],
  ['deepseek/deepseek-chat', 'DeepSeek Chat · OpenRouter'],
  ['deepseek/deepseek-reasoner', 'DeepSeek R1 · raisonnement'],
  ['openai/gpt-5.6-luna', 'GPT-5.6 Luna · économique'],
  ['anthropic/claude-sonnet-5', 'Claude Sonnet 5']
];
/* Catalogue DeepSeek en direct : `deepseek-chat` pour la vitesse,
   `deepseek-reasoner` quand la composition demande du raisonnement. */
const AI_DEEPSEEK_MODELS = [
  ['deepseek-chat', 'DeepSeek Chat · V3 · rapide'],
  ['deepseek-reasoner', 'DeepSeek Reasoner · R1 · réfléchi']
];
const AI_NATIVE_MODELS = [
  ['recraft/recraft-v4.1-vector', 'Recraft V4.1 Vector · SVG natif'],
  ['recraft/recraft-v4.1-pro-vector', 'Recraft V4.1 Pro Vector · SVG natif'],
  ['recraft/recraft-v4-vector', 'Recraft V4 Vector · SVG natif']
];

function getAIProvider() {
  const select = $('aiProvider');
  const value = select ? select.value : 'openrouter';
  return AI_PROVIDERS[value] ? value : 'openrouter';
}

function aiProviderConfig() { return AI_PROVIDERS[getAIProvider()]; }

function syncAIProviderUI() {
  const provider = getAIProvider();
  const cfg = aiProviderConfig();
  const label = $('aiKeyLabel');
  const key = $('aiApiKey');
  if (label) label.textContent = cfg.keyLabel;
  if (key) key.placeholder = cfg.keyPlaceholder;
  try { if (key) key.value = sessionStorage.getItem(cfg.keyStorage) || ''; } catch (e) {}
  // Le SVG natif n'existe que chez OpenRouter : on désactive l'option.
  const nativeRadio = document.querySelector('input[name="aiMode"][value="native"]');
  if (nativeRadio) {
    nativeRadio.disabled = provider !== 'openrouter';
    if (nativeRadio.disabled && nativeRadio.checked) {
      const textRadio = document.querySelector('input[name="aiMode"][value="text"]');
      if (textRadio) textRadio.checked = true;
    }
    const holder = nativeRadio.closest('label');
    if (holder) holder.classList.toggle('is-disabled', provider !== 'openrouter');
  }
  const refresh = $('aiRefreshModels');
  if (refresh) refresh.title = 'Actualiser les modèles ' + cfg.label;
}

function bindAI() {
  const modal = $('aiModal');
  const form = $('aiForm');
  if (!modal || !form) return;
  const close = () => { if (!form.classList.contains('loading')) modal.hidden = true; };
  $('btnAI').addEventListener('click', () => {
    modal.hidden = false;
    syncAIProviderUI();
    updateAIModels();
    setTimeout(() => $('aiPrompt').focus(), 20);
  });
  $('aiClose').addEventListener('click', close);
  $('aiCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  form.querySelectorAll('input[name="aiMode"]').forEach(input => input.addEventListener('change', updateAIModels));
  const providerSelect = $('aiProvider');
  if (providerSelect) providerSelect.addEventListener('change', () => {
    syncAIProviderUI();
    updateAIModels();
  });
  $('aiRefreshModels').addEventListener('click', refreshAIModels);
  form.addEventListener('submit', generateAIVector);
}

function getAIMode() {
  const selected = document.querySelector('input[name="aiMode"]:checked');
  return selected ? selected.value : 'text';
}

function setAIModelOptions(models, preferred) {
  const select = $('aiModel');
  select.innerHTML = '';
  models.forEach(([id, label]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    select.appendChild(option);
  });
  if (preferred && models.some(model => model[0] === preferred)) select.value = preferred;
}

function updateAIModels() {
  const current = $('aiModel').value;
  const native = getAIMode() === 'native';
  const provider = getAIProvider();
  const fallback = provider === 'deepseek' ? AI_DEEPSEEK_MODELS : AI_TEXT_MODELS;
  setAIModelOptions(native ? AI_NATIVE_MODELS : fallback, current);
  $('aiAspect').disabled = false;
  if (provider === 'deepseek') {
    setAIStatus('DeepSeek rédige le SVG en code : formes éditables, pas d’image raster.');
  } else {
    setAIStatus(native ? 'SVG natif spécialisé, facturé par OpenRouter.' : 'Le routeur gratuit génère du SVG éditable comme code.');
  }
}

async function refreshAIModels() {
  const button = $('aiRefreshModels');
  button.disabled = true;
  setAIStatus('Actualisation des modèles…');
  try {
    const native = getAIMode() === 'native';
    const cfg = aiProviderConfig();
    const endpoint = native ? 'https://openrouter.ai/api/v1/images/models' : cfg.modelsEndpoint;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Catalogue ' + cfg.label + ' indisponible');
    const payload = await response.json();
    let models;
    if (native) {
      models = (payload.data || [])
        .filter(model => model.supported_parameters && model.supported_parameters.output_format && model.supported_parameters.output_format.values.includes('svg'))
        .map(model => [model.id, model.name + ' · SVG natif']);
    } else if (getAIProvider() === 'deepseek') {
      models = (payload.data || [])
        .map(model => [model.id, model.id + ' · DeepSeek']);
      if (!models.length) models = AI_DEEPSEEK_MODELS.slice();
    } else {
      models = (payload.data || [])
        .filter(model => model.pricing && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0 && model.architecture && model.architecture.output_modalities.includes('text'))
        .map(model => [model.id, model.name.replace(/\s*\(free\)$/i, '') + ' · gratuit'])
        .slice(0, 40);
      if (!models.some(model => model[0] === 'openrouter/free')) models.unshift(AI_TEXT_MODELS[0]);
    }
    if (!models.length) throw new Error('Aucun modèle compatible trouvé');
    setAIModelOptions(models, $('aiModel').value);
    setAIStatus(models.length + ' modèle(s) compatible(s) trouvé(s).');
  } catch (error) {
    setAIStatus(error.message || 'Actualisation impossible', true);
  } finally { button.disabled = false; }
}

async function generateAIVector(event) {
  event.preventDefault();
  const form = $('aiForm');
  const key = $('aiApiKey').value.trim();
  const prompt = $('aiPrompt').value.trim();
  const cfg = aiProviderConfig();
  if (!key) { setAIStatus('Ajoutez votre clé ' + cfg.label + '.', true); $('aiApiKey').focus(); return; }
  if (!prompt) { setAIStatus('Décrivez le vecteur à créer.', true); $('aiPrompt').focus(); return; }
  try { sessionStorage.setItem(cfg.keyStorage, key); } catch (e) {}
  form.classList.add('loading');
  $('aiGenerate').disabled = true;
  $('aiCancel').disabled = true;
  setAIStatus('Création du vecteur…');
  try {
    const mode = getAIMode();
    const native = mode === 'native' && cfg.nativeEndpoint;
    const url = native ? cfg.nativeEndpoint : cfg.chatEndpoint;
    const headers = {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    };
    // Ces deux en-têtes sont propres à OpenRouter.
    if (getAIProvider() === 'openrouter') {
      headers['HTTP-Referer'] = location.href;
      headers['X-Title'] = 'Bird Vector Editor';
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(native ? buildNativeAIRequest(prompt) : buildTextAIRequest(prompt))
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((payload.error && payload.error.message) || 'Erreur ' + cfg.label + ' ' + response.status);
    const rawSVG = native ? await extractNativeSVG(payload) : extractTextSVG(payload);
    const safeSVG = sanitizeSVG(rawSVG);
    await insertGeneratedSVG(safeSVG, $('aiInsert').value === 'replace');
    setAIStatus('Vecteur ajouté au document.');
    $('aiModal').hidden = true;
  } catch (error) {
    console.error('[Bird AI]', error);
    setAIStatus(error.message || 'Génération impossible', true);
  } finally {
    form.classList.remove('loading');
    $('aiGenerate').disabled = false;
    $('aiCancel').disabled = false;
  }
}

function buildTextAIRequest(prompt) {
  const style = $('aiStyle').value;
  const dimensions = Math.round(state.artboardW) + ' × ' + Math.round(state.artboardH);
  return {
    model: $('aiModel').value,
    temperature: 0.35,
    max_tokens: 12000,
    messages: [
      { role: 'system', content: 'You are a senior vector illustrator. Return only one complete standalone SVG, without markdown. Use a viewBox, editable vector shapes and paths, clean geometry, a restrained palette, and no scripts, external files, embedded HTML, raster images, or text unless explicitly requested.' },
      { role: 'user', content: 'Create an SVG for a ' + dimensions + ' artboard. Direction: ' + (style || 'free art direction') + '. Request: ' + prompt }
    ]
  };
}

function buildNativeAIRequest(prompt) {
  const request = {
    model: $('aiModel').value,
    prompt: (($('aiStyle').value ? $('aiStyle').value + '. ' : '') + prompt),
    output_format: 'svg',
    n: 1
  };
  const aspect = $('aiAspect').value;
  if (aspect !== 'auto') request.aspect_ratio = aspect;
  return request;
}

function extractTextSVG(payload) {
  const message = payload.choices && payload.choices[0] && payload.choices[0].message;
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part.text || '').join('');
  throw new Error('Le modèle n’a pas renvoyé de SVG.');
}

async function extractNativeSVG(payload) {
  const item = (payload.data && payload.data[0]) || (payload.images && payload.images[0]);
  const source = item && (item.b64_json || item.url || item.svg || (item.image_url && item.image_url.url));
  if (!source) throw new Error('OpenRouter n’a pas renvoyé d’image SVG.');
  if (/^data:image\/svg\+xml;base64,/i.test(source)) return decodeURIComponent(escape(atob(source.split(',')[1])));
  if (/^data:image\/svg\+xml[,;]/i.test(source)) return decodeURIComponent(source.slice(source.indexOf(',') + 1));
  if (/^https:\/\//i.test(source)) {
    const response = await fetch(source, { credentials: 'omit' });
    if (!response.ok) throw new Error('Téléchargement du SVG généré impossible.');
    return response.text();
  }
  return source;
}

function sanitizeSVG(raw) {
  if (typeof raw !== 'string' || raw.length > 1500000) throw new Error('Réponse SVG vide ou trop volumineuse.');
  const match = raw.match(/<svg\b[\s\S]*<\/svg>/i);
  if (!match) throw new Error('La réponse ne contient pas de SVG complet.');
  const doc = new DOMParser().parseFromString(match[0], 'image/svg+xml');
  if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.localName !== 'svg') throw new Error('SVG mal formé.');
  doc.querySelectorAll('script, foreignObject, iframe, object, embed, audio, video, style').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => {
    Array.from(node.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      else if (name === 'href' || name === 'xlink:href') {
        if (!value.startsWith('#')) node.removeAttribute(attribute.name);
      } else if ((name === 'style' || name === 'fill' || name === 'stroke' || name === 'filter') && /url\((?!["']?#)/i.test(value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  doc.documentElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function insertGeneratedSVG(svg, replaceSelection) {
  return new Promise((resolve, reject) => {
    fabric.loadSVGFromString(svg, (objects, options) => {
      if (!objects || !objects.length) { reject(new Error('SVG vide après validation.')); return; }
      const group = fabric.util.groupSVGElements(objects, options);
      if (!group) { reject(new Error('SVG impossible à convertir.')); return; }
      beginTxn();
      if (replaceSelection) {
        const selected = canvas.getActiveObjects().slice();
        canvas.discardActiveObject();
        selected.forEach(object => canvas.remove(object));
      }
      addImportedObject(group, null, 'Vecteur IA', true);
      resolve();
    });
  });
}

function setAIStatus(message, error) {
  const status = $('aiStatus');
  status.textContent = message || '';
  status.classList.toggle('error', !!error);
}

/* ── Menu Export multi-formats ── */
function bindExportMenu() {
  const menu = $('exportMenu');
  const list = $('exportList');
  if (!menu || !list) return;
  const toggle = () => {
    const open = list.hidden;
    list.hidden = !open;
  };
  $('btnExport').addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) list.hidden = true;
  });
  list.querySelectorAll('.export-item').forEach(item => {
    item.addEventListener('click', () => {
      list.hidden = true;
      const fmt = item.dataset.export;
      if (fmt === 'svg') exportSVG();
      else if (fmt === 'pdf') exportPDF();
      else if (fmt === 'png') exportPNG();
      else if (fmt === 'jpg') exportJPG();
      else if (fmt === 'webp') exportWEBP();
    });
  });
}

/* ── Drag & drop global sur le plan de travail ── */
function bindDragDrop() {
  const overlay = $('dropOverlay');
  if (!overlay) return;
  let depth = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (!hasFiles(e)) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay.hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    const files = e.dataTransfer ? e.dataTransfer.files : null;
    if (!files || !files.length) return;

    // point de chute sur le plan de travail
    const stageRect = els.stage.getBoundingClientRect();
    const cx = e.clientX - stageRect.left;
    const cy = e.clientY - stageRect.top;
    const inStage = cx >= 0 && cy >= 0 && cx <= stageRect.width && cy <= stageRect.height;

    for (let i = 0; i < files.length; i++) {
      importFile(files[i], inStage ? { x: cx, y: cy } : null);
    }
  });
}

function hasFiles(e) {
  const dt = e.dataTransfer;
  if (!dt) return false;
  if (dt.types && dt.types.indexOf) {
    return Array.prototype.indexOf.call(dt.types, 'Files') !== -1;
  }
  return !!(dt.files && dt.files.length);
}

function applyToSelection(prop, value) {
  const editingPen = state.penActive && state.penMode === 'edit' && state.penEditTarget && state.penOrigData;
  if (editingPen) {
    if (prop === 'stroke') state.penOrigData.stroke = value;
    if (prop === 'strokeWidth') state.penOrigData.strokeWidth = value;
    if (prop === 'fill') state.penOrigData.fill = value;
    if (prop === 'opacity') state.penOrigData.opacity = value;
    drawPenPreview();
    updateFillChips(state.penOrigData);
    setDirty(true);
    return;
  }
  const o = canvas.getActiveObject();
  if (!o) return;
  beginPropChange();
  const targets = (o.type === 'activeSelection' && o._objects) ? o._objects.slice() : [o];
  targets.forEach(target => {
    target.set(prop, value);
    if (target.type === 'i-text' || target.type === 'text' || target.type === 'textbox') {
      if (prop === 'fontSize' || prop === 'fontFamily' || prop === 'fontWeight' ||
          prop === 'fontStyle' || prop === 'textAlign') {
        target.set('dirty', true);
      }
    }
    target.setCoords();
  });
  canvas.requestRenderAll();
  setDirty(true);
}

function toggleTextStyle(prop, value) {
  const o = canvas.getActiveObject();
  if (!o || (o.type !== 'i-text' && o.type !== 'text')) return;
  beginPropChange();
  o.set(prop, value);
  o.set('dirty', true);
  canvas.requestRenderAll();
  setDirty(true);
}

function zOrder(mode) {
  const o = canvas.getActiveObject();
  if (!o) return;
  beginPropChange();
  if (mode === 'front') o.bringToFront();
  else if (mode === 'back') o.sendToBack();
  else if (mode === 'forward') o.bringForward();
  else if (mode === 'backward') o.sendBackwards();
  canvas.requestRenderAll();
  setDirty(true);
}

/* ════════════════════════════════════════════════════════════
   ALIGNEMENT — objets, plan de travail, tidy et miroir
════════════════════════════════════════════════════════════ */
function bindAlignment() {
  $('alignLeft').addEventListener('click', () => alignObjects('left'));
  $('alignCenterH').addEventListener('click', () => alignObjects('center'));
  $('alignRight').addEventListener('click', () => alignObjects('right'));
  $('alignTop').addEventListener('click', () => alignObjects('top'));
  $('alignCenterV').addEventListener('click', () => alignObjects('middle'));
  $('alignBottom').addEventListener('click', () => alignObjects('bottom'));
  $('tidyHorizontal').addEventListener('click', () => tidySelection('horizontal'));
  $('tidyVertical').addEventListener('click', () => tidySelection('vertical'));
  $('centerOnArtV').addEventListener('click', () => centerOnArtboard('h'));
  $('centerOnArtH').addEventListener('click', () => centerOnArtboard('v'));
  $('centerOnArtBoth').addEventListener('click', () => centerOnArtboard('both'));
  $('flipH').addEventListener('click', () => flipSelection('flipX'));
  $('flipV').addEventListener('click', () => flipSelection('flipY'));
}

// direction : left/center/right (axe X) ou top/middle/bottom (axe Y).
// Un seul objet sélectionné → alignement sur le plan de travail ; plusieurs → sur la bbox de la sélection.
function alignObjects(direction) {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  let minX, maxX, minY, maxY;
  if (objs.length === 1) {
    minX = 0; maxX = state.artboardW;
    minY = 0; maxY = state.artboardH;
  } else {
    const boxes = objs.map(o => o.getBoundingRect(true, true));
    minX = Math.min(...boxes.map(b => b.left));
    maxX = Math.max(...boxes.map(b => b.left + b.width));
    minY = Math.min(...boxes.map(b => b.top));
    maxY = Math.max(...boxes.map(b => b.top + b.height));
  }
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;

  pushUndo('Alignement');
  objs.forEach(o => {
    const bb = o.getBoundingRect(true, true);
    if (direction === 'left') o.left += minX - bb.left;
    else if (direction === 'center') o.left += centerX - (bb.left + bb.width / 2);
    else if (direction === 'right') o.left += (maxX - bb.width) - bb.left;
    else if (direction === 'top') o.top += minY - bb.top;
    else if (direction === 'middle') o.top += centerY - (bb.top + bb.height / 2);
    else if (direction === 'bottom') o.top += (maxY - bb.height) - bb.top;
    o.setCoords();
  });
  refreshActiveSelection();
  setDirty(true);
}

// Égalise les écarts entre 3 objets ou plus, sans figer les extrêmes, et recentre l'ensemble.
function tidySelection(mode) {
  const objs = canvas.getActiveObjects();
  if (objs.length < 3) { toast('Sélectionnez au moins 3 objets', true); return; }
  const gapField = parseFloat($('tidyGap').value);
  const fixedGap = Number.isFinite(gapField) && gapField > 0 ? gapField : null;
  const items = objs.map(o => ({ obj: o, bb: o.getBoundingRect(true, true) }));

  pushUndo('Tidy');
  if (mode === 'horizontal') {
    items.sort((a, b) => a.bb.left - b.bb.left);
    const totalWidth = items.reduce((s, it) => s + it.bb.width, 0);
    const firstLeft = items[0].bb.left;
    const lastRight = items[items.length - 1].bb.left + items[items.length - 1].bb.width;
    const originalCenter = (firstLeft + lastRight) / 2;
    const gap = fixedGap !== null ? fixedGap : (lastRight - firstLeft - totalWidth) / (items.length - 1);
    let cursor = firstLeft;
    const targets = items.map(it => { const t = cursor; cursor += it.bb.width + gap; return t; });
    const shift = originalCenter - ((targets[0] + targets[targets.length - 1] + items[items.length - 1].bb.width) / 2);
    items.forEach((it, i) => {
      const currentBB = it.obj.getBoundingRect(true, true);
      it.obj.left += (targets[i] + shift) - currentBB.left;
      it.obj.setCoords();
    });
  } else {
    items.sort((a, b) => a.bb.top - b.bb.top);
    const totalHeight = items.reduce((s, it) => s + it.bb.height, 0);
    const firstTop = items[0].bb.top;
    const lastBottom = items[items.length - 1].bb.top + items[items.length - 1].bb.height;
    const originalCenter = (firstTop + lastBottom) / 2;
    const gap = fixedGap !== null ? fixedGap : (lastBottom - firstTop - totalHeight) / (items.length - 1);
    let cursor = firstTop;
    const targets = items.map(it => { const t = cursor; cursor += it.bb.height + gap; return t; });
    const shift = originalCenter - ((targets[0] + targets[targets.length - 1] + items[items.length - 1].bb.height) / 2);
    items.forEach((it, i) => {
      const currentBB = it.obj.getBoundingRect(true, true);
      it.obj.top += (targets[i] + shift) - currentBB.top;
      it.obj.setCoords();
    });
  }
  refreshActiveSelection();
  setDirty(true);
}

// Centre la sélection (un ou plusieurs objets) sur le plan de travail, en bloc.
function centerOnArtboard(axis) {
  const objs = canvas.getActiveObjects();
  if (!objs.length) return;
  const boxes = objs.map(o => o.getBoundingRect(true, true));
  const minX = Math.min(...boxes.map(b => b.left));
  const maxX = Math.max(...boxes.map(b => b.left + b.width));
  const minY = Math.min(...boxes.map(b => b.top));
  const maxY = Math.max(...boxes.map(b => b.top + b.height));
  const dx = state.artboardW / 2 - (minX + maxX) / 2;
  const dy = state.artboardH / 2 - (minY + maxY) / 2;

  pushUndo('Alignement plan de travail');
  objs.forEach(o => {
    if (axis === 'h' || axis === 'both') o.left += dx;
    if (axis === 'v' || axis === 'both') o.top += dy;
    o.setCoords();
  });
  refreshActiveSelection();
  setDirty(true);
}

function flipSelection(prop) {
  const o = canvas.getActiveObject();
  if (!o) return;
  pushUndo(prop === 'flipX' ? 'Miroir horizontal' : 'Miroir vertical');
  o.set(prop, !o[prop]);
  o.setCoords();
  canvas.requestRenderAll();
  setDirty(true);
}

function duplicate() {
  const o = canvas.getActiveObject();
  if (!o) return;
  beginTxn(); // capture l'état avant l'ajout du clone
  o.clone((clone) => {
    clone.set({ left: (clone.left || 0) + 20, top: (clone.top || 0) + 20, _plumeData: o._plumeData ? JSON.parse(JSON.stringify(o._plumeData)) : undefined });
    canvas.add(clone);
    canvas.setActiveObject(clone);
    commitUndo('Dupliquer');
    setDirty(true);
    canvas.requestRenderAll();
  });
}

function selectAll() {
  const objects = canvas.getObjects().filter(object => object.selectable && !object.__penTemp);
  if (!objects.length) return;
  canvas.setActiveObject(objects.length === 1 ? objects[0] : new fabric.ActiveSelection(objects, { canvas }));
  refreshActiveSelection();
}

function copySelection() {
  const active = canvas.getActiveObject();
  if (!active) return;
  active.clone(clone => { clipboardObject = clone; toast('Copié'); });
  copySelectionToSystemClipboard(active);
}

function cutSelection() {
  const active = canvas.getActiveObject();
  if (!active) return;
  active.clone(clone => {
    clipboardObject = clone;
    deleteSelection();
    toast('Coupé');
  });
}

function pasteSelection(inPlace) {
  if (!clipboardObject) return;
  clipboardObject.clone(clone => {
    beginTxn(); // état AVANT l'ajout
    canvas.discardActiveObject();
    const offset = inPlace ? 0 : 20;
    clone.set({ left: (clone.left || 0) + offset, top: (clone.top || 0) + offset, evented: true });
    if (clone.type === 'activeSelection') clone.canvas = canvas;
    canvas.add(clone);
    canvas.setActiveObject(clone);
    commitUndo(inPlace ? 'Coller sur place' : 'Coller');
    setDirty(true);
    refreshActiveSelection();
    toast(inPlace ? 'Collé sur place' : 'Collé');
  });
}

function nudgeSelection(key, amount) {
  const active = canvas.getActiveObject();
  if (!active) return;
  const dx = key === 'ArrowLeft' ? -amount : key === 'ArrowRight' ? amount : 0;
  const dy = key === 'ArrowUp' ? -amount : key === 'ArrowDown' ? amount : 0;
  beginPropChange();
  active.set({ left: (active.left || 0) + dx, top: (active.top || 0) + dy });
  active.setCoords();
  setDirty(true);
  refreshActiveSelection();
}

function deleteSelection() {
  const objects = canvas.getActiveObjects().slice();
  if (!objects.length) return;
  pushUndo('Supprimer'); // capture l'état AVANT la suppression
  canvas.discardActiveObject();
  objects.forEach(object => canvas.remove(object));
  setDirty(true);
  refreshActiveSelection();
}

function updateFillChips(obj) {
  const fillNone = obj ? !obj.fill : false;
  const strokeNone = obj ? !obj.stroke : false;
  els.fillNone.classList.toggle('on', fillNone);
  els.strokeNone.classList.toggle('on', strokeNone);
  els.fillNone.setAttribute('aria-pressed', String(fillNone));
  els.strokeNone.setAttribute('aria-pressed', String(strokeNone));
}

function appearanceTarget() {
  return state.penActive && state.penMode === 'edit' && state.penOrigData
    ? state.penOrigData
    : canvas.getActiveObject();
}

/* ════════════════════════════════════════════════════════════
   DÉGRADÉ
════════════════════════════════════════════════════════════ */
function setGradientActive(type) {
  state.gradType = type;
  $('gradNone').classList.toggle('on', !type);
  $('gradLinear').classList.toggle('on', type === 'linear');
  $('gradRadial').classList.toggle('on', type === 'radial');
}

function applyGradient() {
  const o = canvas.getActiveObject();
  if (!o) return;
  if (!state.gradType) return;
  const c1 = $('gradColor1').value;
  const c2 = $('gradColor2').value;
  const angle = parseInt($('gradAngle').value, 10) || 90;
  const w = o.width || o.getScaledWidth?.() || 100;
  const h = o.height || o.getScaledHeight?.() || 100;
  // coordonnées relative à l'objet (0..1)
  let coords;
  if (state.gradType === 'linear') {
    const rad = (angle - 90) * Math.PI / 180;
    coords = {
      x1: 0, y1: 0, x2: Math.cos(rad) * 1, y2: Math.sin(rad) * 1,
      type: 'linear'
    };
  } else {
    coords = { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.71, type: 'radial' };
  }
  beginPropChange();
  const gradient = new fabric.Gradient({
    type: state.gradType,
    gradientUnits: 'percentage',
    coords,
    colorStops: [
      { offset: 0, color: c1, opacity: 1 },
      { offset: 1, color: c2, opacity: 1 }
    ]
  });
  const targets = (o.type === 'activeSelection' && o._objects) ? o._objects.slice() : [o];
  targets.forEach(target => target.set('fill', gradient));
  canvas.requestRenderAll();
  setDirty(true);
}

/* ════════════════════════════════════════════════════════════
   PATHFINDER (opérations booléennes sur 2 objets)
════════════════════════════════════════════════════════════ */
function pathfinderOp(op) {
  const objs = canvas.getActiveObjects().slice().sort((a, b) => canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b));
  if (objs.length < 2) { toast('Sélectionnez au moins 2 formes', true); return; }
  if (typeof paper === 'undefined') { toast('Moteur Pathfinder indisponible', true); return; }
  beginTxn();
  // Une sélection multiple rend les coordonnées des objets relatives au groupe :
  // on quitte la sélection pour restaurer leurs coordonnées absolues avant l'export SVG.
  canvas.discardActiveObject();
  canvas.requestRenderAll();

  try {
    paper.setup(document.createElement('canvas'));

    const importObject = obj => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + obj.toSVG() + '</svg>';
      const imported = paper.project.importSVG(svg, { expandShapes: true, insert: true });
      let item = imported;
      while (item && item.className === 'Group' && item.children && item.children.length === 1) item = item.firstChild;
      if (!item) throw new Error('Objet SVG vide');
      item.remove();
      return item;
    };

    let result = importObject(objs[0]);
    for (let index = 1; index < objs.length; index++) {
      const operand = importObject(objs[index]);
      let next;
      if (op === 'union') next = result.unite(operand);
      else if (op === 'subtract') next = result.subtract(operand);
      else if (op === 'intersect') next = result.intersect(operand);
      else next = result.exclude(operand);
      result.remove();
      operand.remove();
      result = next;
    }

    const base = objs[0];
    result.fillColor = typeof base.fill === 'string' && base.fill !== 'none' ? new paper.Color(base.fill) : null;
    result.strokeColor = typeof base.stroke === 'string' && base.stroke !== 'none' ? new paper.Color(base.stroke) : null;
    result.strokeWidth = base.stroke ? (base.strokeWidth || 1) : 0;
    result.opacity = base.opacity == null ? 1 : base.opacity;

    const svgResult = result.exportSVG({ asString: true, precision: 3 });
    result.remove();
    fabric.loadSVGFromString('<svg xmlns="http://www.w3.org/2000/svg">' + svgResult + '</svg>', (objects, options) => {
      const vector = fabric.util.groupSVGElements(objects, options);
      if (!vector) { cancelTxn(); toast('Résultat Pathfinder vide', true); return; }
      objs.forEach(obj => canvas.remove(obj));
      canvas.add(vector);
      canvas.setActiveObject(vector);
      commitUndo('Pathfinder : ' + op);
      setDirty(true);
      canvas.requestRenderAll();
      toast('Pathfinder : ' + op + ' ✓');
    });
  } catch (error) {
    console.error('[Pathfinder]', error);
    cancelTxn();
    toast('Pathfinder impossible sur cette sélection', true);
  }
}

/* ════════════════════════════════════════════════════════════
   NUANCIER (swatches)
════════════════════════════════════════════════════════════ */
function renderSwatches() {
  const grid = $('swatchesGrid');
  if (!grid) return;
  grid.innerHTML = '';
  state.swatches.forEach(color => {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.style.background = color;
    sw.title = color;
    sw.addEventListener('click', () => {
      const o = canvas.getActiveObject();
      if (o) {
        applyToSelection('fill', color);
        els.fillColor.value = color;
        toast('Couleur appliquée ✓');
      } else {
        els.fillColor.value = color;
        toast('Couleur de remplissage définie');
      }
    });
    grid.appendChild(sw);
  });
}

/* ════════════════════════════════════════════════════════════
   DOCUMENT
════════════════════════════════════════════════════════════ */
function setArtboardColor(color) {
  beginPropChange();
  state.artboardColor = color || 'transparent';
  canvas.__plume.artColor = state.artboardColor;
  // Le fond est dessiné par _renderBackground + injecté à l'export SVG :
  // on désactive backgroundColor pour éviter un double rect dans l'export.
  canvas.backgroundColor = '';
  canvas.requestRenderAll();
  setDirty(true);
}

function setArtboardSize(w, h) {
  beginPropChange();
  state.artboardW = w;
  state.artboardH = h;
  canvas.__plume.artW = w;
  canvas.__plume.artH = h;
  canvas.requestRenderAll();
  fitView(); // réajuste la vue sur le nouveau format
  setDirty(true);
}

function updateHint() {
  const count = canvas.getObjects().length;
  els.hint.style.opacity = count ? '0' : '1';
  els.hint.style.pointerEvents = count ? 'none' : 'none';
}

/* ════════════════════════════════════════════════════════════
   PLANS DE TRAVAIL (pages)
   ────────────────────────────────────────────────────────────
   Un seul canvas : le plan actif vit dedans, les autres sont
   sérialisés dans `state.pages[i].json`. Changer de plan, c'est
   vider le canvas et recharger le JSON du plan cible.
   L'historique est PAR PLAN : chaque plan garde son propre
   annuler/rétablir, ce qui évite de stocker tous les plans dans
   chaque instantané (images comprises).
════════════════════════════════════════════════════════════ */
const pageHistory = new Map();   // pageId -> { undo, redo }
let pageSeq = 1;

function newPageId() {
  pageSeq += 1;
  return 'p' + Date.now().toString(36) + '-' + pageSeq;
}

function createPage(name, w, h, color) {
  return {
    id: newPageId(),
    name: name || 'Plan ' + (state.pages.length + 1),
    w: w || state.artboardW,
    h: h || state.artboardH,
    color: color !== undefined ? color : state.artboardColor,
    json: null            // null = ce plan est celui qui est sur le canvas
  };
}

function activePage() {
  return state.pages[state.activePage] || null;
}

/* Écrit l'état du canvas dans le plan actif. */
function flushActivePage() {
  const page = activePage();
  if (!page) return;
  page.w = state.artboardW;
  page.h = state.artboardH;
  page.color = state.artboardColor;
  page.json = canvasJSON();
}

/* Mémorise les piles d'historique du plan qui s'en va. */
function stashPageHistory() {
  const page = activePage();
  if (!page) return;
  pageHistory.set(page.id, { undo: state.undo.slice(), redo: state.redo.slice() });
}

function restorePageHistory(pageId) {
  const saved = pageHistory.get(pageId);
  state.undo = saved ? saved.undo.slice() : [];
  state.redo = saved ? saved.redo.slice() : [];
  invalidateCurrent();
  updateUndoUI();
}

/* Applique le format d'un plan au canvas. */
function applyPageArtboard(page) {
  state.artboardW = page.w;
  state.artboardH = page.h;
  state.artboardColor = page.color;
  canvas.__plume.artW = page.w;
  canvas.__plume.artH = page.h;
  canvas.__plume.artColor = page.color;
  canvas.backgroundColor = '';
  if ($('artboardColor')) $('artboardColor').value = page.color === 'transparent' ? '#ffffff' : page.color;
}

/* Installe un plan sur le canvas (échange bas niveau, sans vue ni toast).
   `loadFromJSON` est asynchrone dès qu'une page contient une image : on
   attend la fin pour que l'export voie réellement les objets du plan. */
async function loadPageIntoCanvas(index) {
  flushActivePage();
  stashPageHistory();
  state.activePage = index;
  const page = state.pages[index];
  if (!page) return;
  canvas.discardActiveObject();
  applyPageArtboard(page);
  await loadJSON(page.json || { version: '5.1.0', objects: [], background: '' });
  page.json = null;                 // c'est de nouveau le plan vivant
  restorePageHistory(page.id);
  renderLayers();
  renderPages();
  updateUI();
}

async function gotoPage(index, options) {
  options = options || {};
  if (!state.pages.length) return;
  index = Math.max(0, Math.min(state.pages.length - 1, index));
  if (index === state.activePage && !options.force) return;

  if (!options.silent) {
    // On termine proprement ce qui est en cours avant de changer de plan.
    if (state.penActive) endPen(true);
    if (state.shapeObj) { cancelTxn(); state.shapeObj = null; state.shapeStart = null; }
    cancelTxn();
    flushPropChange();
  }

  await loadPageIntoCanvas(index);

  if (!options.keepView) {
    requestAnimationFrame(() => { resizeCanvas(); fitView(); });
  }
  if (!options.silent) toast('Plan « ' + state.pages[index].name + ' »');
}

function duplicatePage() {
  flushActivePage();
  const source = activePage();
  if (!source) return;
  const copy = createPage(source.name + ' copie', source.w, source.h, source.color);
  copy.json = JSON.parse(JSON.stringify(source.json || { version: '5.1.0', objects: [] }));
  const at = state.activePage + 1;
  state.pages.splice(at, 0, copy);
  renderPages();
  gotoPage(at, { force: true });
  setDirty(true);
  toast('Plan dupliqué');
}

function addPage(name) {
  flushActivePage();
  stashPageHistory();
  loadJSON({ version: '5.1.0', objects: [], background: '' });
  state.pages.push(createPage(name));
  state.activePage = state.pages.length - 1;
  resetStacks();
  applyPageArtboard(activePage());
  renderLayers();
  renderPages();
  updateUI();
  requestAnimationFrame(() => { resizeCanvas(); fitView(); });
  setDirty(true);
  toast('Plan « ' + activePage().name + ' » ajouté');
  return activePage();
}

async function deletePage(index) {
  if (state.pages.length <= 1) {
    toast('Un document doit garder au moins un plan', true);
    return;
  }
  index = index === undefined ? state.activePage : index;
  const page = state.pages[index];
  if (!page) return;
  const count = index === state.activePage ? canvas.getObjects().length
    : (page.json && page.json.objects ? page.json.objects.length : 0);
  if (count > 0 && !window.confirm('Supprimer « ' + page.name + ' » et ses ' + count + ' objet(s) ?')) return;
  pageHistory.delete(page.id);
  const wasActive = index === state.activePage;
  if (wasActive) flushActivePage();
  state.pages.splice(index, 1);
  if (index < state.activePage) state.activePage -= 1;
  else if (wasActive) {
    state.activePage = Math.min(state.activePage, state.pages.length - 1);
    await loadPageIntoCanvas(state.activePage);
    requestAnimationFrame(() => { resizeCanvas(); fitView(); });
  }
  renderPages();
  setDirty(true);
  toast('Plan supprimé');
}

function renamePage(index, name) {
  const page = state.pages[index];
  if (!page) return;
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return;
  page.name = clean;
  renderPages();
  setDirty(true);
}

function movePage(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.pages.length) return;
  flushActivePage();
  const [page] = state.pages.splice(index, 1);
  state.pages.splice(target, 0, page);
  if (state.activePage === index) state.activePage = target;
  else if (state.activePage === target) state.activePage = index;
  activePage().json = null;
  renderPages();
  setDirty(true);
}

function applyPageList(pages, active) {
  state.pages = pages.map((p, i) => ({
    id: p.id || newPageId(),
    name: p.name || 'Plan ' + (i + 1),
    w: Number(p.w) || 800,
    h: Number(p.h) || 600,
    color: p.color || '#ffffff',
    json: p.json || null
  }));
  state.activePage = Math.max(0, Math.min(state.pages.length - 1, Number(active) || 0));
  pageHistory.clear();
  resetStacks();
}

function renderPages() {
  const list = $('pagesList');
  if (list) {
    list.innerHTML = '';
    state.pages.forEach((page, index) => {
      const row = document.createElement('div');
      row.className = 'page-row' + (index === state.activePage ? ' is-active' : '');
      row.dataset.index = String(index);

      const num = document.createElement('span');
      num.className = 'page-num';
      num.textContent = String(index + 1);

      const body = document.createElement('div');
      body.className = 'page-body';
      const name = document.createElement('span');
      name.className = 'page-name';
      name.textContent = page.name;
      name.title = 'Double-clic pour renommer';
      name.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        name.contentEditable = 'true';
        name.focus();
        document.execCommand && document.execCommand('selectAll', false, null);
        const done = () => {
          name.contentEditable = 'false';
          renamePage(index, name.textContent);
        };
        name.addEventListener('blur', done, { once: true });
        name.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); name.blur(); }
          if (ev.key === 'Escape') { ev.preventDefault(); name.textContent = page.name; name.blur(); }
          ev.stopPropagation();
        });
      });
      const meta = document.createElement('span');
      meta.className = 'page-meta';
      const count = index === state.activePage
        ? canvas.getObjects().length
        : (page.json && page.json.objects ? page.json.objects.length : 0);
      meta.textContent = Math.round(page.w) + '×' + Math.round(page.h) + ' · ' + count + ' obj.';
      body.appendChild(name);
      body.appendChild(meta);

      const tools = document.createElement('div');
      tools.className = 'page-tools';
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'page-tool'; up.title = 'Monter'; up.textContent = '↑';
      up.disabled = index === 0;
      up.addEventListener('click', (e) => { e.stopPropagation(); movePage(index, -1); });
      const down = document.createElement('button');
      down.type = 'button'; down.className = 'page-tool'; down.title = 'Descendre'; down.textContent = '↓';
      down.disabled = index === state.pages.length - 1;
      down.addEventListener('click', (e) => { e.stopPropagation(); movePage(index, 1); });
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'page-tool page-del'; del.title = 'Supprimer'; del.textContent = '×';
      del.addEventListener('click', (e) => { e.stopPropagation(); deletePage(index); });
      tools.appendChild(up); tools.appendChild(down); tools.appendChild(del);

      row.appendChild(num);
      row.appendChild(body);
      row.appendChild(tools);
      row.addEventListener('click', () => gotoPage(index));
      list.appendChild(row);
    });
  }

  const switcher = $('pageSwitcher');
  const label = $('pageCurrentLabel');
  const counter = $('pageCurrentCount');
  if (switcher) switcher.hidden = state.pages.length < 2;
  if (label) label.textContent = activePage() ? activePage().name : 'Plan 1';
  if (counter) counter.textContent = (state.activePage + 1) + ' / ' + state.pages.length;
  const prev = $('pagePrev');
  const next = $('pageNext');
  if (prev) prev.disabled = state.activePage === 0;
  if (next) next.disabled = state.activePage >= state.pages.length - 1;
}

function bindPages() {
  const add = $('pageAdd');
  if (add) add.addEventListener('click', () => addPage());
  const dup = $('pageDuplicate');
  if (dup) dup.addEventListener('click', duplicatePage);
  const prev = $('pagePrev');
  if (prev) prev.addEventListener('click', () => gotoPage(state.activePage - 1));
  const next = $('pageNext');
  if (next) next.addEventListener('click', () => gotoPage(state.activePage + 1));
  const current = $('pageCurrent');
  if (current) current.addEventListener('click', () => {
    els.rightSidebar.classList.remove('collapsed');
    requestAnimationFrame(() => {
      const section = document.querySelector('.props-section[data-section="pages"]');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
  renderPages();
}


function setDirty(d) {
  state.dirty = d;
  els.dirtyDot.hidden = !d;
  if (d) scheduleAutoSave();
}

/* Autosave : sauvegarde locale automatique dès qu'une modification survient */
let _autoSaveTimer = null;
function scheduleAutoSave() {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (state.dirty) saveDoc();
  }, 1200);
}

/* ════════════════════════════════════════════════════════════
   SAUVEGARDE / CHARGEMENT (localStorage)
════════════════════════════════════════════════════════════ */
function saveDoc() {
  const payload = createProjectPayload();
  let json = '';
  try { json = JSON.stringify(payload); } catch (e) { json = ''; }
  const meta = {
    savedAt: payload.savedAt,
    count: payload.json.objects.length,
    size: json.length,
    storage: 'local'
  };
  try {
    if (json && json.length < 4.2 * 1024 * 1024) {
      localStorage.setItem(LS_KEY, json);
      localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
    } else {
      // Au-delà de la limite localStorage (images embarquées) : IndexedDB.
      localStorage.removeItem(LS_KEY);
      meta.storage = 'idb';
      localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
    }
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch (e) {
    try {
      localStorage.removeItem(LS_KEY);
      meta.storage = 'idb';
      localStorage.setItem(LS_META_KEY, JSON.stringify(meta));
    } catch (e2) { /* stockage totalement indisponible */ }
  }
  // Copie de sécurité dans IndexedDB (documents volumineux, images).
  if (window.BirdIO && BirdIO.store) {
    BirdIO.store.set(IDB_KEY, payload).catch(() => {});
  }
}

function createProjectPayload() {
  flushActivePage();
  const total = state.pages.reduce((sum, p, i) =>
    sum + (i === state.activePage ? canvas.getObjects().length
      : (p.json && p.json.objects ? p.json.objects.length : 0)), 0);
  return {
    app: 'Bird',
    format: 'bird-vector-project',
    version: PROJECT_VERSION,
    artboard: { w: state.artboardW, h: state.artboardH, color: state.artboardColor },
    pages: state.pages.map((p, i) => ({
      id: p.id,
      name: p.name,
      w: p.w,
      h: p.h,
      color: p.color,
      json: i === state.activePage ? canvasJSON() : p.json
    })),
    activePage: state.activePage,
    objectCount: total,
    view: {
      showGrid: state.showGrid,
      gridSize: state.gridSize,
      showRulers: state.showRulers,
      snapEnabled: state.snapEnabled,
      guides: state.guides.map(g => ({ axis: g.axis, pos: g.pos }))
    },
    // `json` reste le plan actif : un lecteur qui ignore `pages` ouvre au moins
    // le plan affiché (compatibilité ascendante des anciens projets).
    json: canvasJSON(),
    savedAt: Date.now()
  };
}

async function loadDoc() {
  let payload = null;
  const raw = getSavedProjectRaw();
  if (raw) {
    try { payload = normalizeProjectPayload(JSON.parse(raw)); }
    catch (e) { console.warn('Sauvegarde locale invalide', e); }
  }
  if (!payload && window.BirdIO && BirdIO.store) {
    try {
      const stored = await BirdIO.store.get(IDB_KEY);
      if (stored) payload = normalizeProjectPayload(stored);
    } catch (e) { console.warn('IndexedDB indisponible', e); }
  }
  if (!payload) return false;
  try {
    applyProjectPayload(payload);
    return true;
  } catch (e) {
    console.warn('Chargement doc échoué', e);
    return false;
  }
}

/* Point d'entrée unique pour installer un projet normalisé sur l'éditeur,
   qu'il vienne du stockage local, d'un fichier .plume ou de l'API. */
function applyProjectPayload(payload) {
  if (!payload) return;
  if (payload.artboard) {
    state.artboardW = payload.artboard.w;
    state.artboardH = payload.artboard.h;
    state.artboardColor = payload.artboard.color;
    canvas.__plume.artW = state.artboardW;
    canvas.__plume.artH = state.artboardH;
    canvas.__plume.artColor = state.artboardColor;
    canvas.backgroundColor = ''; // le fond est géré par _renderBackground
  }
  applyProjectView(payload.view);

  if (payload.pages && payload.pages.length) {
    // Le plan actif est chargé sur le canvas, les autres restent sérialisés.
    const active = Math.max(0, Math.min(payload.pages.length - 1, payload.activePage || 0));
    const pages = payload.pages.map((p, i) => ({
      id: p.id || newPageId(),
      name: p.name || 'Plan ' + (i + 1),
      w: p.w,
      h: p.h,
      color: p.color,
      json: i === active ? null : p.json
    }));
    state.pages = pages;
    state.activePage = active;
    pageHistory.clear();
    const page = pages[active];
    applyPageArtboard(page);
    loadJSON(payload.pages[active].json);
    resetStacks();
    renderLayers();
    renderPages();
    return;
  }

  // Projet mono-plan (ancien format) : on en fait le premier plan.
  state.pages = [{
    id: newPageId(),
    name: 'Plan 1',
    w: state.artboardW,
    h: state.artboardH,
    color: state.artboardColor,
    json: null
  }];
  state.activePage = 0;
  pageHistory.clear();
  if (payload.json) loadJSON(payload.json);
  renderLayers();
  renderPages();
}

function applyProjectView(view) {
  if (!view) return;
  state.showGrid = !!view.showGrid;
  state.gridSize = Math.max(1, Number(view.gridSize) || 20);
  state.showRulers = view.showRulers !== false;
  state.snapEnabled = view.snapEnabled !== false;
  state.guides = Array.isArray(view.guides)
    ? view.guides.filter(g => g && (g.axis === 'x' || g.axis === 'y') && Number.isFinite(Number(g.pos)))
      .map(g => ({ axis: g.axis, pos: Number(g.pos) }))
    : [];
  if ($('showGrid')) $('showGrid').checked = state.showGrid;
  if ($('gridSize')) $('gridSize').value = state.gridSize;
  if ($('showRulers')) $('showRulers').checked = state.showRulers;
  if ($('snapEnabled')) $('snapEnabled').checked = state.snapEnabled;
  els.stage.classList.toggle('rulers-off', !state.showRulers);
  syncViewToggles();
  renderGuides(true);
  canvas.requestRenderAll();
}

function normalizeProjectPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('Projet vide');
  const wrapped = data.json ? data : { version: 0, json: data };
  if (wrapped.version != null && Number(wrapped.version) > PROJECT_VERSION) throw new Error('Version de projet plus récente non prise en charge');
  if (!wrapped.json || !Array.isArray(wrapped.json.objects)) throw new Error('Contenu Fabric manquant');
  const sourceArtboard = wrapped.artboard || {};
  const width = Number(sourceArtboard.w || state.artboardW);
  const height = Number(sourceArtboard.h || state.artboardH);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 50000 || height > 50000) throw new Error('Dimensions de plan de travail invalides');
  const artboard = { w: width, h: height, color: sourceArtboard.color === 'transparent' ? 'transparent' : (sourceArtboard.color || '#ffffff') };

  // Projet multi-plans : on valide chaque plan, on ignore les entrées cassées.
  let pages = null;
  let activePage = 0;
  if (Array.isArray(wrapped.pages) && wrapped.pages.length) {
    pages = wrapped.pages
      .filter(p => p && p.json && Array.isArray(p.json.objects))
      .map((p, i) => ({
        id: typeof p.id === 'string' && p.id ? p.id : null,
        name: String(p.name || 'Plan ' + (i + 1)).slice(0, 60),
        w: Math.min(50000, Math.max(1, Number(p.w) || width)),
        h: Math.min(50000, Math.max(1, Number(p.h) || height)),
        color: p.color === 'transparent' ? 'transparent' : (p.color || artboard.color),
        json: p.json
      }));
    if (!pages.length) pages = null;
    activePage = Math.max(0, Math.min(pages ? pages.length - 1 : 0, Number(wrapped.activePage) || 0));
  }

  return {
    version: Number(wrapped.version) || 0,
    artboard,
    pages,
    activePage,
    view: wrapped.view || null,
    json: wrapped.json,
    savedAt: Number(wrapped.savedAt) || null
  };
}

/* ════════════════════════════════════════════════════════════
   EXPORT MULTI-FORMATS (SVG / PNG / JPG / WEBP)
════════════════════════════════════════════════════════════ */
function finalizePendingForExport() {
  if (state.penActive) {
    if (state.penPoints.length >= 2) finalizePen(state.penClosed);
    else endPen(false);
  }
  if (state.textCreating) finalizeText();
}

function exportSVG() { exportAs('svg'); }
function exportPNG() { exportAs('png'); }
function exportJPG() { exportAs('jpg'); }
function exportWEBP() { exportAs('webp'); }
function exportPDF() { exportAs('pdf'); }

function exportAs(format) {
  const background = format === 'png' ? 'transparent'
    : format === 'jpg' ? 'white'
      : 'artboard';
  return runExport({
    format,
    scope: 'document',
    background,
    scale: (format === 'svg' || format === 'pdf') ? 1 : 2
  });
}

function exportBounds(scope) {
  if (scope === 'selection') {
    const selected = canvas.getActiveObjects();
    if (!selected.length) return null;
    const boxes = selected.map(o => o.getBoundingRect(true, true));
    const left = Math.min(...boxes.map(b => b.left));
    const top = Math.min(...boxes.map(b => b.top));
    const right = Math.max(...boxes.map(b => b.left + b.width));
    const bottom = Math.max(...boxes.map(b => b.top + b.height));
    return {
      left, top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      selected
    };
  }
  return {
    left: 0, top: 0,
    width: Math.max(1, Math.round(state.artboardW)),
    height: Math.max(1, Math.round(state.artboardH)),
    selected: null
  };
}

/**
 * Export unifié. * opts = { format:'svg'|'pdf'|'png'|'jpg'|'webp', scope:'document'|'selection',
 *          scale:1..4, background:'artboard'|'transparent'|'white', returnBlob:boolean }
 */
async function runExport(opts) {
  opts = opts || {};
  finalizePendingForExport();
  const format = opts.format || 'svg';
  const scope = opts.scope || 'document';

  // Export multi-plans : un seul PDF, une page par plan de travail.
  if (scope === 'pages') {
    if (format !== 'pdf') { toast('L’export multi-plans produit un PDF', true); return null; }
    return await exportPagesPDF(opts);
  }

  // PDF d'imprimerie : chemin entièrement séparé (CMJN, shadings, ICC).
  if (format === 'pdfx') return await exportPDFX(opts);

  const bounds = exportBounds(scope);
  if (!bounds) { toast('Sélectionnez au moins un objet', true); return null; }

  const background = opts.background ||
    (format === 'png' ? 'transparent' : format === 'jpg' ? 'white' : 'artboard');
  const scale = Number(opts.scale) || 1;
  const base = opts.filename || ('bird-' + timestamp());
  const active = canvas.getActiveObject();
  const all = canvas.getObjects().slice();
  const savedVisibility = all.map(o => o.visible === false);
  const savedVpt = canvas.viewportTransform.slice();
  const savedBgRenderer = canvas._renderBackground;
  const savedSelection = bounds.selected;

  if (scope === 'selection') {
    all.forEach(o => { o.visible = savedSelection.includes(o); });
  }
  canvas.discardActiveObject();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

  try {
    if (format === 'svg' || format === 'pdf') {
      const svg = buildSVGString(bounds.width, bounds.height, { bounds, background });
      if (format === 'svg') {
        const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        if (opts.returnBlob) return blob;
        downloadBlob(blob, base + '.svg', 'SVG exporté ✓');
        return blob;
      }
      if (!window.BirdIO) throw new Error('Moteur PDF indisponible');
      toast('Composition du PDF…');
      const result = await BirdIO.svgToPDF(svg, bounds.width, bounds.height, { title: 'Bird' });
      if (opts.returnBlob) return result.blob;
      downloadBlob(result.blob, base + '.pdf', 'PDF vectoriel exporté ✓');
      return result.blob;
    }

    // Raster
    const fmt = format === 'jpg' ? 'jpeg' : (format === 'webp' ? 'webp' : 'png');
    const maxSide = 8192;
    const effectiveScale = Math.max(0.1, Math.min(scale, maxSide / Math.max(bounds.width, bounds.height)));
    let bgColor = null;
    if (format === 'jpg' || background === 'white') bgColor = '#ffffff';
    else if (background === 'artboard' && state.artboardColor !== 'transparent') bgColor = state.artboardColor;

    canvas._renderBackground = function (ctx) {
      if (!bgColor) return;
      ctx.save();
      ctx.fillStyle = bgColor;
      ctx.fillRect(bounds.left, bounds.top, bounds.width, bounds.height);
      ctx.restore();
    };
    const dataURL = canvas.toDataURL({
      format: fmt,
      quality: format === 'png' ? 1 : 0.92,
      multiplier: effectiveScale,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    });
    if (!dataURL) throw new Error('Rendu impossible');
    if (opts.returnDataURL) return dataURL;
    const ext = format === 'jpg' ? '.jpg' : format === 'webp' ? '.webp' : '.png';
    downloadDataURL(dataURL, base + ext,
      (format === 'jpg' ? 'JPG' : format === 'webp' ? 'WEBP' : 'PNG') + ' exporté ✓');
    return dataURL;
  } catch (err) {
    console.error('[Bird export]', err);
    toast('Export impossible : ' + (err.message || 'erreur inconnue'), true);
    return null;
  } finally {
    all.forEach((o, i) => { o.visible = !savedVisibility[i]; });
    canvas._renderBackground = savedBgRenderer;
    canvas.setViewportTransform(savedVpt);
    if (active) canvas.setActiveObject(active);
    else if (savedSelection) canvas.discardActiveObject();
    refreshActiveSelection();
    canvas.requestRenderAll();
  }
}

/* ════════════════════════════════════════════════════════════
   EXPORT PDF/X-1a (IMPRIMERIE)
   ────────────────────────────────────────────────────────────
   Chemin séparé de l'export PDF « écran » : ici on écrit le PDF
   nous-mêmes (js/pdfx.js) pour avoir du CMJN, de vrais shadings,
   un OutputIntent ICC et du texte vectorisé.
════════════════════════════════════════════════════════════ */
async function exportPDFX(opts) {
  opts = opts || {};
  if (!window.BirdPDFX) { toast('Moteur PDF/X indisponible', true); return null; }
  if (!window.paper) { toast('Moteur vectoriel indisponible', true); return null; }

  const page = activePage();
  const width = Math.max(1, Math.round(state.artboardW));
  const height = Math.max(1, Math.round(state.artboardH));
  const bleedPx = Math.max(0, Number(opts.bleed) || 0);
  const warnings = [];

  // ── 1. Texte → courbes (aucune police à embarquer) ──
  let entries = [];
  if (opts.outlineText !== false) {
    const prepared = BirdVector.vectorizeForExport(canvas);
    prepared.warnings.forEach(w => warnings.push('Texte non vectorisé : ' + w));
    entries = prepared.entries;
  } else {
    canvas.getObjects().forEach(o => entries.push({ source: o, paths: null }));
  }

  // ── 2. Fabric → Paper → entrées PDF, dans l'ordre d'empilement ──
  const items = [];
  const images = [];
  const flipY = [1, 0, 0, -1, 0, height];

  for (const entry of entries) {
    const objects = entry.paths && entry.paths.length ? entry.paths : [entry.source];
    for (const obj of objects) {
      if (!obj || obj.visible === false) continue;

      if (obj.type === 'image') {
        const img = await rasterToPdfImage(obj, flipY);
        if (img) images.push(img);
        else warnings.push('Image non convertible (format source)');
        continue;
      }
      if (obj.type === 'group' && containsText(obj)) {
        warnings.push('Un groupe contient du texte : il restera du texte, pas des courbes');
      }
      if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') {
        warnings.push('Texte conservé tel quel (option « vectoriser » désactivée)');
        continue;
      }

      try {
        const bridge = BirdVector.fabricToPaper(obj);
        if (!bridge || !bridge.item) continue;
        const collected = BirdPDFX.itemsFromPaper([bridge.item]);
        // Paper.js réimporte un <radialGradient> comme un dégradé linéaire.
        // On rétablit le type réel depuis l'objet Fabric d'origine.
        const fabricFill = obj.fill;
        const isRadial = fabricFill && fabricFill.type === 'radial';
        collected.forEach(item => {
          // Le repère Paper.js est celui du canvas : on applique la bascule Y.
          item.paths.forEach(p => { p.matrix = mul3(flipY, p.matrix); });
          item.matrix = mul3(flipY, item.matrix);
          if (isRadial && item.fill && item.fill.gradient) {
            item.fill.gradient.gradientType = 'radial';
          }
          items.push(item);
        });
      } catch (e) {
        console.warn('[Bird PDF/X] objet ignoré', e);
        warnings.push('Objet ignoré (' + obj.type + ')');
      }
    }
  }

  // Le projet Paper.js privé a servi : on le vide pour l'export suivant.
  if (window.BirdVector && BirdVector.resetPaperScope) {
    try { BirdVector.resetPaperScope(); } catch (e) {}
  }

  // ── 3. Écriture ──
  toast('Composition du PDF/X-1a…');
  const icc = state.iccProfile && state.iccProfile.bytes
    ? state.iccProfile
    : { bytes: BirdColor.buildProfile({ name: 'Bird CMYK', colorspace: 'CMYK' }), name: 'Bird CMYK (générique)' };
  if (!state.iccProfile) {
    warnings.push('Profil ICC générique : chargez le profil de votre imprimeur pour un PDF/X de production');
  }

  let bytes;
  try {
    bytes = await BirdPDFX.build({
      width: width,
      height: height,
      bleed: bleedPx,
      background: opts.background === 'transparent' ? null : (state.artboardColor || '#ffffff'),
      title: (page ? page.name + ' — ' : '') + 'Bird',
      author: 'Bird',
      items: items,
      images: images,
      icc: icc,
      cmyk: { gcr: state.cmykGcr, inkLimit: state.cmykInkLimit }
    });
  } catch (e) {
    console.error('[Bird PDF/X]', e);
    toast('PDF/X impossible : ' + (e.message || 'erreur'), true);
    return null;
  }

  const blob = new Blob([bytes], { type: 'application/pdf' });
  if (warnings.length) {
    console.info('[Bird PDF/X] avertissements', warnings);
    toast('PDF/X-1a prêt · ' + warnings.length + ' avertissement(s) en console');
  } else {
    toast('PDF/X-1a exporté ✓');
  }
  if (opts.returnBlob) return { blob, bytes, warnings };
  downloadBlob(blob, (opts.filename || ('bird-' + timestamp())) + '-x1a.pdf', 'PDF/X-1a exporté ✓');
  return { blob, bytes, warnings };
}

function mul3(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function containsText(obj) {
  if (!obj) return false;
  if (obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox') return true;
  if (obj._objects) return obj._objects.some(containsText);
  return false;
}

/* Extrait les pixels d'un objet image et calcule sa matrice PDF. */
async function rasterToPdfImage(obj, flipY) {
  const el = obj._element;
  if (!el) return null;
  const w0 = Math.max(1, Math.round(el.naturalWidth || el.videoWidth || el.width || 1));
  const h0 = Math.max(1, Math.round(el.naturalHeight || el.videoHeight || el.height || 1));
  if (w0 * h0 > 40e6) throw new Error('Image trop grande pour un PDF/X sans compression JPEG');

  const c = document.createElement('canvas');
  c.width = w0; c.height = h0;
  const ctx = c.getContext('2d');
  ctx.drawImage(el, 0, 0, w0, h0);
  let data;
  try { data = ctx.getImageData(0, 0, w0, h0).data; }
  catch (e) { return null; }   // canvas « tainted »

  // Unité (0,0)-(1,1) → boîte locale (v vers le bas) → canvas → PDF.
  const local = [w0, 0, 0, -h0, -w0 / 2, h0 / 2];
  const matrix = mul3(flipY, mul3(obj.calcTransformMatrix(), local));
  return { width: w0, height: h0, data: data, matrix: matrix, opacity: obj.opacity };
}

/* ── PDF de tous les plans ──
   On installe chaque plan sur le canvas, on en tire un SVG au format exact
   du plan, puis on rend les pages dans un seul document jsPDF. */
async function exportPagesPDF(opts) {
  if (!window.BirdIO || !BirdIO.svgPagesToPDF) {
    toast('Moteur PDF indisponible', true);
    return null;
  }
  if (!state.pages.length) return null;
  const initialPage = state.activePage;
  const savedVpt = canvas.viewportTransform.slice();
  const savedActive = canvas.getActiveObject();
  const background = opts.background || 'artboard';
  const entries = [];

  canvas.discardActiveObject();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  try {
    toast('Composition du PDF (' + state.pages.length + ' plans)…');
    for (let i = 0; i < state.pages.length; i++) {
      if (i !== state.activePage) await loadPageIntoCanvas(i);
      const bounds = exportBounds('document');
      const svg = buildSVGString(bounds.width, bounds.height, { bounds, background });
      entries.push({ svg, width: bounds.width, height: bounds.height });
    }
  } catch (err) {
    console.error('[Bird export pages]', err);
    toast('Export des plans impossible : ' + (err.message || 'erreur'), true);
    return null;
  } finally {
    if (state.activePage !== initialPage) await loadPageIntoCanvas(initialPage);
    canvas.setViewportTransform(savedVpt);
    if (savedActive) { try { canvas.setActiveObject(savedActive); } catch (e) {} }
    canvas.requestRenderAll();
  }

  try {
    const result = await BirdIO.svgPagesToPDF(entries, {
      title: opts.filename || 'Bird',
      subject: state.pages.length + ' plan(s) de travail'
    });
    if (opts.returnBlob) return result.blob;
    downloadBlob(result.blob,
      (opts.filename || ('bird-' + timestamp())) + '-' + result.pages + 'plans.pdf',
      result.pages + ' plans exportés en PDF ✓');
    return result.blob;
  } catch (err) {
    console.error('[Bird export pages]', err);
    toast('Export PDF impossible : ' + (err.message || 'erreur'), true);
    return null;
  }
}

function buildSVGString(w, h, opts) {
  opts = opts || {};
  const bounds = opts.bounds || { left: 0, top: 0, width: w, height: h };
  let bg = opts.background;
  if (bg === undefined) bg = state.artboardColor || null;
  if (bg === 'artboard') bg = state.artboardColor;
  if (bg === 'white') bg = '#ffffff';
  if (bg === 'transparent' || bg === false) bg = null;

  const savedVpt = canvas.svgViewportTransformation;
  canvas.svgViewportTransformation = false;
  let svg;
  try {
    svg = canvas.toSVG({
      width: bounds.width,
      height: bounds.height,
      viewBox: { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
    });
  } finally {
    canvas.svgViewportTransformation = savedVpt;
  }
  if (bg && bg !== 'transparent') {
    const bgRect = '<rect x="' + escapeXml(bounds.left) + '" y="' + escapeXml(bounds.top) +
      '" width="' + escapeXml(bounds.width) + '" height="' + escapeXml(bounds.height) +
      '" fill="' + escapeXml(bg) + '"/>';
    svg = svg.replace(/(<svg[^>]*>)/, '$1' + bgRect);
  }
  return svg.replace(/(<svg[^>]*>)/, '$1<metadata>Bird — ' +
    new Date().toISOString() + ' — ' + Math.round(bounds.width) + '×' + Math.round(bounds.height) + '</metadata>');
}

/* En application de bureau, un export est un FICHIER, pas un
   téléchargement : dialogue natif, puis écriture binaire. C'est le même
   point d'entrée pour SVG, PDF, PDF/X, PNG, JPG et WEBP. */
function saveNative(filename, data, msg) {
  const ext = (String(filename).split('.').pop() || '').toLowerCase();
  const filters = [{ name: ext.toUpperCase(), extensions: [ext] }];
  return BirdNative.saveFile(filename, data, filters)
    .then((path) => {
      if (path) toast((msg || 'Exporté') + ' → ' + BirdNative.basename(path));
    })
    .catch((err) => toast('Export impossible : ' + (err && err.message || err), true));
}

function downloadBlob(blob, filename, msg) {
  if (nativeShell()) {
    saveNative(filename, blob, msg);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (msg) toast(msg);
}

function downloadDataURL(dataURL, filename, msg) {
  if (nativeShell()) {
    const comma = dataURL.indexOf(',');
    const binary = atob(dataURL.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    saveNative(filename, bytes, msg);
    return;
  }
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast(msg);
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ════════════════════════════════════════════════════════════
   ENREGISTRER UN FICHIER .plume
   ────────────────────────────────────────────────────────────
   Navigateur : téléchargement.
   Application de bureau : écriture sur disque au chemin courant, ou
   dialogue natif au premier enregistrement. `Ctrl+S` ne redemande
   donc plus où enregistrer à chaque fois — c'est ce qu'on attend
   d'une application, pas d'une page web.
════════════════════════════════════════════════════════════ */
let projectPath = null;

function nativeShell() {
  return !!(window.BirdNative && BirdNative.ready);
}

function setDocumentTitle(name) {
  const base = 'Bird ' + (Bird.version || '') + ' — Éditeur vectoriel';
  document.title = name ? name + ' — ' + base : base;
  const label = document.querySelector('.brand-name');
  if (label) label.textContent = name ? name : 'BIRD';
  // La barre de titre native ne suit pas `document.title` : on la pilote.
  if (nativeShell() && BirdNative.setTitle) {
    BirdNative.setTitle(name ? name + ' — Bird' : 'Bird — Éditeur vectoriel');
  }
}

async function saveFile(opts) {
  opts = opts || {};
  if (state.penActive) {
    if (state.penPoints.length >= 2) finalizePen(state.penClosed);
    else endPen(false);
  }
  if (state.textCreating) finalizeText();
  const payload = createProjectPayload();
  const json = JSON.stringify(payload, null, 2);

  if (nativeShell()) {
    try {
      let path = opts.forceDialog ? null : projectPath;
      if (path) {
        await BirdNative.writeText(path, json);
      } else {
        path = await BirdNative.saveFile('bird-' + timestamp() + '.plume', json, 'project');
      }
      if (!path) { toast('Enregistrement annulé'); return; }
      projectPath = path;
      setDirty(false);
      setDocumentTitle(BirdNative.basename(path));
      toast('Enregistré : ' + BirdNative.basename(path) + ' ✓');
    } catch (err) {
      toast('Enregistrement impossible : ' + (err && err.message || err), true);
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bird-' + timestamp() + '.plume';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setDirty(false);
  toast('Fichier .plume enregistré ✓');
}

/* ════════════════════════════════════════════════════════════
   OUVRIR UN FICHIER
════════════════════════════════════════════════════════════ */
function openFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) importFile(file);
}

/* Ouverture native : dialogue du système, puis lecture disque.
   On réutilise exactement le même chemin d'import que le web. */
async function openProject() {
  if (!nativeShell()) {
    if (els.fileOpen) els.fileOpen.click();
    return;
  }
  try {
    const picked = await BirdNative.openFile(['project', 'vector', 'image']);
    if (!picked) return;
    if (typeof picked.text === 'string') {
      openFileContent(picked.text, picked.name);
      projectPath = /\.(plume|bird|json)$/i.test(picked.name) ? picked.path : null;
      setDocumentTitle(BirdNative.basename(picked.path));
    } else {
      projectPath = null;
      setDocumentTitle(picked.name);
      await importFile(new File([picked.bytes], picked.name));
    }
  } catch (err) {
    toast('Ouverture impossible : ' + (err && err.message || err), true);
  }
}

/* Ouvre un chemin connu sans dialogue : double-clic sur un fichier associé,
   « Ouvrir avec » sur macOS, ou ligne de commande. */
async function openNativePath(path) {
  if (!path) return;
  const name = BirdNative.basename(path);
  try {
    if (/\.(png|jpe?g|webp|gif|bmp|avif|pdf|ai|eps|svgz)$/i.test(name)) {
      const bytes = await BirdNative.readBinary(path);
      projectPath = null;
      setDocumentTitle(name);
      await importFile(new File([bytes], name));
    } else {
      const text = await BirdNative.readText(path);
      openFileContent(text, name);
      projectPath = /\.(plume|bird|json)$/i.test(name) ? path : null;
      setDocumentTitle(name);
    }
  } catch (err) {
    toast('Ouverture impossible : ' + (err && err.message || err), true);
  }
}

/* Ouvre un fichier à partir de son contenu texte (déjà lu) */
function openFileContent(content, name) {
  if (/\.svg$/i.test(name)) {
    importSVGText(content);
  } else {
    try {
      const data = normalizeProjectPayload(JSON.parse(content));
      applyProjectPayload(data);
      state.undo = [];
      state.redo = [];
      if (history) history.reset();
      setDirty(false);
      updateUndoUI();
      const extra = data.pages && data.pages.length > 1 ? ' — ' + data.pages.length + ' plans' : '';
      toast((data.version < PROJECT_VERSION ? 'Ancien projet migré et ouvert ✓' : 'Document ouvert ✓') + extra);
    } catch (err) { console.warn('[Bird project]', err); toast(err.message || 'Fichier invalide', true); }
  }
}

/* ════════════════════════════════════════════════════════════
   CLAVIER
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   COMMANDES — une définition, trois appelants
   ────────────────────────────────────────────────────────────
   Le clavier, le menu natif (Fichier / Édition / Objet / Affichage)
   et le panneau « Raccourcis » lisent la MÊME liste. Ajouter une
   action à un seul endroit suffit : impossible qu'un raccourci du
   menu et un raccourci clavier divergent.
════════════════════════════════════════════════════════════ */
function nativeOwns(id) {
  return !!(window.BirdNative && BirdNative.ready && BirdNative.ownsCommand(id));
}

function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

function focusPlugins() {
  if (widgetsApi && widgetsApi.isDetached('plugins')) {
    widgetsApi.raise('plugins');
    return;
  }
  els.rightSidebar.classList.remove('collapsed');
  const target = document.getElementById('section-plugins');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (window.BirdWidgets) BirdWidgets.publish();
}

function defineCommands() {
  const C = window.BirdCommands;
  if (!C) {
    console.warn('[Bird] registre de commandes absent');
    return;
  }
  C.defineAll([
    /* ── Fichier ── */
    { id: 'file.new', group: 'Fichier', label: 'Nouveau document', keys: 'Mod+N', run: resetDocument },
    { id: 'file.open', group: 'Fichier', label: 'Ouvrir…', keys: 'Mod+O', run: openProject },
    { id: 'file.save', group: 'Fichier', label: 'Enregistrer', keys: 'Mod+S', run: () => saveFile() },
    { id: 'file.saveAs', group: 'Fichier', label: 'Enregistrer sous…', keys: 'Mod+Shift+S', run: () => saveFile({ forceDialog: true }) },
    { id: 'file.import', group: 'Fichier', label: 'Importer un fichier…', keys: 'Mod+Shift+P', run: openProject },
    { id: 'file.export', group: 'Fichier', label: 'Exporter…', keys: 'Mod+E', run: () => { const b = $('btnExport'); if (b) b.click(); } },
    { id: 'file.exportPdfX', group: 'Fichier', label: 'Exporter en PDF/X-1a…', keys: [], run: () => { showExportPanel('pdfx'); } },
    { id: 'file.print', group: 'Fichier', label: 'Imprimer…', keys: 'Mod+P', run: printDocument },

    /* ── Édition ── */
    { id: 'edit.undo', group: 'Édition', label: 'Annuler', keys: 'Mod+Z', run: undo },
    { id: 'edit.redo', group: 'Édition', label: 'Rétablir', keys: 'Mod+Shift+Z', run: redo },
    { id: 'edit.redoAlt', group: 'Édition', label: 'Rétablir (variante Windows)', keys: 'Mod+Y', run: redo },
    { id: 'edit.cut', group: 'Édition', label: 'Couper', keys: 'Mod+X', run: cutSelection },
    { id: 'edit.copy', group: 'Édition', label: 'Copier', keys: 'Mod+C', run: copySelection },
    { id: 'edit.paste', group: 'Édition', label: 'Coller', keys: 'Mod+V', run: () => pasteSelection(false) },
    { id: 'edit.pasteInPlace', group: 'Édition', label: 'Coller sur place', keys: 'Mod+Shift+V', run: () => pasteSelection(true) },
    { id: 'edit.duplicate', group: 'Édition', label: 'Dupliquer', keys: 'Mod+D', run: duplicate },
    { id: 'edit.delete', group: 'Édition', label: 'Supprimer', keys: [], run: deleteSelection },
    { id: 'edit.selectAll', group: 'Édition', label: 'Tout sélectionner', keys: 'Mod+A', run: selectAll },
    { id: 'edit.deselect', group: 'Édition', label: 'Désélectionner', keys: 'Mod+Shift+A', run: deselectAll },

    /* ── Objet (ordre, verrouillage, vectorisation) ── */
    { id: 'object.group', group: 'Objet', label: 'Grouper', keys: 'Mod+G', run: groupSelection },
    { id: 'object.ungroup', group: 'Objet', label: 'Dégrouper', keys: 'Mod+Shift+G', run: ungroupSelection },
    { id: 'object.front', group: 'Objet', label: 'Premier plan', keys: 'Mod+Shift+]', run: () => zOrder('front') },
    { id: 'object.forward', group: 'Objet', label: 'Avancer d’un rang', keys: 'Mod+]', run: () => zOrder('forward') },
    { id: 'object.backward', group: 'Objet', label: 'Reculer d’un rang', keys: 'Mod+[', run: () => zOrder('backward') },
    { id: 'object.back', group: 'Objet', label: 'Arrière-plan', keys: 'Mod+Shift+[', run: () => zOrder('back') },
    { id: 'object.lock', group: 'Objet', label: 'Verrouiller / déverrouiller', keys: 'Mod+2', run: toggleLockSelection },
    { id: 'object.unlockAll', group: 'Objet', label: 'Tout déverrouiller', keys: 'Mod+Alt+2', run: unlockAll },
    { id: 'object.hide', group: 'Objet', label: 'Masquer / afficher', keys: 'Mod+3', run: toggleVisibleSelection },
    { id: 'object.showAll', group: 'Objet', label: 'Tout afficher', keys: 'Mod+Alt+3', run: showAll },
    { id: 'object.outlineStroke', group: 'Objet', label: 'Contour de trait', keys: 'Mod+Shift+O', run: outlineStrokeSelection },
    { id: 'object.textToCurves', group: 'Objet', label: 'Texte en courbes', keys: [], run: outlineTextSelection },
    { id: 'object.simplify', group: 'Objet', label: 'Simplifier le tracé', keys: [], run: simplifySelection },

    /* ── Texte ── */
    { id: 'text.bigger', group: 'Texte', label: 'Corps plus grand', keys: 'Mod+Shift+.', run: () => changeFontSize(2) },
    { id: 'text.smaller', group: 'Texte', label: 'Corps plus petit', keys: 'Mod+Shift+,', run: () => changeFontSize(-2) },

    /* ── Affichage ── */
    { id: 'view.zoomIn', group: 'Affichage', label: 'Zoom avant', keys: 'Mod+=', run: () => setZoom(state.zoom * 1.25) },
    { id: 'view.zoomOut', group: 'Affichage', label: 'Zoom arrière', keys: 'Mod+-', run: () => setZoom(state.zoom / 1.25) },
    { id: 'view.fit', group: 'Affichage', label: 'Ajuster à l’écran', keys: 'Mod+0', run: fitView },
    { id: 'view.actual', group: 'Affichage', label: 'Taille réelle (100 %)', keys: 'Mod+1', run: () => setZoom(1) },
    { id: 'view.selection', group: 'Affichage', label: 'Zoom sur la sélection', keys: ['Mod+Alt+0', 'Shift+2'], run: zoomToSelection },
    { id: 'view.rulers', group: 'Affichage', label: 'Règles', keys: 'Mod+R', run: () => { setRulers(!state.showRulers); toast(state.showRulers ? 'Règles affichées' : 'Règles masquées'); } },
    { id: 'view.grid', group: 'Affichage', label: 'Grille', keys: 'Mod+\'', run: () => { setGrid(!state.showGrid); toast(state.showGrid ? 'Grille affichée' : 'Grille masquée'); } },
    { id: 'view.snap', group: 'Affichage', label: 'Magnétisme', keys: 'Mod+;', run: () => { setSnap(!state.snapEnabled); toast(state.snapEnabled ? 'Magnétisme activé' : 'Magnétisme désactivé'); } },
    { id: 'view.fullscreen', group: 'Affichage', label: 'Plein écran', keys: 'F11', run: toggleFullscreen },
    { id: 'view.panel', group: 'Affichage', label: 'Panneau de droite', keys: 'Mod+Alt+P', run: toggleRightPanel },

    /* ── Plans de travail ── */
    { id: 'page.next', group: 'Plans de travail', label: 'Plan suivant', keys: 'Mod+PageDown', run: () => { if (state.pages.length > 1) gotoPage(state.activePage + 1); } },
    { id: 'page.prev', group: 'Plans de travail', label: 'Plan précédent', keys: 'Mod+PageUp', run: () => { if (state.pages.length > 1) gotoPage(state.activePage - 1); } },

    /* ── Aide ── */
    { id: 'help.shortcuts', group: 'Aide', label: 'Raccourcis clavier', keys: 'F1', run: openShortcuts },
    { id: 'help.plugins', group: 'Aide', label: 'Plug-ins', keys: 'Mod+K', run: focusPlugins },
    { id: 'help.prefs', group: 'Aide', label: 'Préférences', keys: 'Mod+,', run: () => { if ($('btnSettings')) $('btnSettings').click(); } },
    { id: 'help.docs', group: 'Aide', label: 'Documentation', keys: [], run: openDocs }
  ]);
}

/** Le menu natif passe par ici : même chemin que le clavier. */
function runNativeCommand(id) {
  if (isTextInputFocused()) {
    // Le menu a intercepté Ctrl+Z avant le champ de saisie : on lui rend
    // l'annulation native, sinon taper dans un champ ferait annuler le dessin.
    if (id === 'edit.undo' || id === 'edit.redo' || id === 'edit.redoAlt') {
      try { document.execCommand(id === 'edit.undo' ? 'undo' : 'redo'); } catch (err) { /* sans objet */ }
      return;
    }
    if (/^(edit|object|view|page)\./.test(id)) return;
  }
  if (window.BirdCommands) BirdCommands.run(id);
}

function toggleFullscreen() {
  if (window.BirdNative && BirdNative.ready) return; // le menu natif s'en charge
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}

function toggleRightPanel() {
  els.rightSidebar.classList.toggle('collapsed');
  publishSidebarWidth();
}

function printDocument() {
  if (window.BirdNative && BirdNative.ready && BirdNative.platform === 'mac') {
    toast('Sur macOS : Exporter en PDF, puis Imprimer depuis Aperçu', true);
    return;
  }
  window.print();
}

function openDocs() {
  const url = 'https://github.com/zigmoon/bird#readme';
  if (window.BirdNative && BirdNative.ready) {
    __TAURI__.core.invoke('open_external', { url }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function openShortcuts() {
  const modal = $('shortcutsModal');
  if (!modal) return;
  renderShortcuts();
  modal.hidden = false;
}

function bindShortcutsModal() {
  const modal = $('shortcutsModal');
  if (!modal) return;
  const close = () => { modal.hidden = true; };
  if ($('shortcutsClose')) $('shortcutsClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (!modal.hidden && e.key === 'Escape') { e.preventDefault(); close(); }
  });
}

/** Construit le tableau des raccourcis depuis le registre (jamais désynchronisé). */
function renderShortcuts() {
  const host = $('shortcutsList');
  if (!host || !window.BirdCommands) return;
  const platform = BirdCommands.platform;
  const frag = document.createDocumentFragment();
  BirdCommands.groups(platform).forEach((group) => {
    const title = document.createElement('div');
    title.className = 'shortcuts-group';
    title.textContent = group.name;
    frag.appendChild(title);
    const table = document.createElement('div');
    table.className = 'shortcuts-rows';
    group.items.forEach((item) => {
      if (!item.keys.length) return;
      const row = document.createElement('div');
      row.className = 'shortcuts-row';
      const label = document.createElement('span');
      label.textContent = item.label;
      const keys = document.createElement('span');
      keys.className = 'shortcuts-keys';
      item.keys.forEach((text) => {
        const kbd = document.createElement('kbd');
        kbd.textContent = text;
        keys.appendChild(kbd);
      });
      row.appendChild(label);
      row.appendChild(keys);
      table.appendChild(row);
    });
    frag.appendChild(table);
  });
  host.textContent = '';
  host.appendChild(frag);
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    const cmd = e.metaKey || e.ctrlKey;

    if (e.code === 'Space' && !e.repeat) {
      if (!state.spaceDown && !isEditingText()) {
        state.spaceDown = true;
        canvas.defaultCursor = 'grab';
        e.preventDefault();
      }
      return;
    }

    /* 1. Commandes — le registre décide, le menu natif a priorité.
       Dans l'application de bureau, le raccourci appartient au menu :
       le webview ne reçoit alors même pas l'événement, mais si la
       plateforme a refusé l'accélérateur, c'est cette branche qui
       rattrape la touche. */
    if (cmd || e.key === 'F1' || e.key === 'F11') {
      const id = window.BirdCommands ? BirdCommands.match(e) : null;
      if (id) {
        e.preventDefault();
        if (!nativeOwns(id)) BirdCommands.run(id);
        return;
      }
      if (cmd) return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.penActive) {
        e.preventDefault();
        if (state.penMode === 'edit' && state.penSelected >= 0 && state.penPoints.length > 2) {
          state.penPoints.splice(state.penSelected, 1);
          state.penSelected = -1;
          drawPenPreview();
        } else if (state.penPoints.length) {
          state.penUndo.push(state.penPoints.pop());
          drawPenPreview();
        }
        return;
      }
      e.preventDefault();
      deleteSelection();
      return;
    }
    if (e.key === 'Escape') {
      if (!els.canvasContextMenu.hidden) { closeCanvasContextMenu(); return; }
      canvas.discardActiveObject(); refreshActiveSelection(); updateGroupingUI(); return;
    }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      nudgeSelection(e.key, e.shiftKey ? 10 : 1);
      return;
    }

    if (state.penActive) { handlePenKeys(e); return; }
    if (cmd) return;

    // raccourcis outils
    switch (e.key.toLowerCase()) {
      case 'v': setTool('select'); break;
      case 'p': setTool('pen'); break;
      case 'n': setTool('pencil'); break;
      case 'b': setTool('brush'); break;
      case 'r': setTool('rect'); break;
      case 'e': setTool('ellipse'); break;
      case 'l': setTool('line'); break;
      case 't': setTool('text'); break;
      case 'i': setTool('eyedropper'); break;
      case 'h': setTool('hand'); break;
      case '1': if (e.shiftKey) fitView(); break;
      case '2': if (e.shiftKey) zoomToSelection(); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      state.spaceDown = false;
      if (!state.panning && !state.penActive) canvas.defaultCursor = state.tool === 'hand' ? 'grab' : 'default';
    }
    if (e.key === 'Alt') state.penAlt = false;
    if (e.key === 'Shift') state.penShift = false;
  });

  window.addEventListener('beforeunload', () => { if (state.dirty) saveDoc(); });
  // autosave
  setInterval(() => { if (state.dirty) saveDoc(); }, 15000);
}

function isEditingText() {
  const o = canvas.getActiveObject();
  return o && o.type === 'i-text' && o.isEditing;
}

function handlePenKeys(e) {
  if (e.key === 'Alt') { state.penAlt = true; return; }
  if (e.key === 'Shift') { state.penShift = true; return; }
  if (e.metaKey || e.ctrlKey) {
    if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) { penUndoPoint(); return; }
    if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) { penRedoPoint(); return; }
    if ((e.key === 'y' || e.key === 'Y')) { penRedoPoint(); return; }
    if ((e.key === 's' || e.key === 'S')) { e.preventDefault(); return; }
    e.preventDefault();
    return;
  }
  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      if (state.penMode === 'edit' && state.penOrigData) {
        // restaurer le tracé original
        clearPenPreview();
        try {
          const dStr = buildPenSVG(state.penOrigData.points, state.penOrigData.closed);
          if (dStr) {
            const restored = new fabric.Path(dStr, {
              fill: state.penOrigData.closed ? state.penOrigData.fill : null,
              stroke: state.penOrigData.stroke,
              strokeWidth: state.penOrigData.strokeWidth,
              strokeLineCap: 'round', strokeLineJoin: 'round',
              selectable: true, evented: true
            });
            if (!state.penOrigData.closed) restored.fill = null;
            restored._plumeData = { points: state.penOrigData.points, closed: state.penOrigData.closed };
            const orig = restored.toObject.bind(restored);
            restored.toObject = function (p) { return fabric.util.object.extend(orig(p), { _plumeData: this._plumeData }); };
            canvas.add(restored);
            canvas.setActiveObject(restored);
            canvas.requestRenderAll();
          }
        } catch (err) {}
        endPen(false);
      } else if (state.penPoints.length >= 2) {
        finalizePen(state.penMode === 'edit' ? state.penClosed : false);
      } else {
        endPen(false);
      }
      break;
    case 'Enter':
      e.preventDefault();
      if (state.penMode === 'edit' && state.penPoints.length >= 2) finalizePen(state.penClosed);
      else if (state.penPoints.length >= 2) finalizePen(false);
      else endPen(false);
      break;
    case 'Tab':
      e.preventDefault();
      if (state.penPoints.length >= 2) {
        state.penMode = state.penMode === 'draw' ? 'edit' : 'draw';
        canvas.defaultCursor = state.penMode === 'edit' ? 'default' : 'crosshair';
        drawPenPreview();
      }
      break;
  }
}

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function snap45(origin, target) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return target;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(angle) * len, y: origin.y + Math.sin(angle) * len };
}

function currentFill() {
  return els.fillColor.value || '#4f8cff';
}
function currentStroke() {
  return els.strokeColor.value || '#141821';
}
function currentStrokeW() {
  return parseFloat(els.strokeWidth.value) || 2;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}

let toastTimer = null;
function toast(msg, isError) {
  els.toast.textContent = msg;
  els.toast.classList.toggle('error', !!isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

function clearAll() {
  if (!canvas.getObjects().length) return;
  pushUndo('Tout effacer'); // capture l'état AVANT le vidage (annulable)
  canvas.clear();
  canvas.discardActiveObject();
  updateUndoUI();
  updateHint();
  setDirty(true);
  toast('Document vidé');
}

function updateUI() {
  updateZoomUI();
  updateUndoUI();
  updateHint();
}

/* ════════════════════════════════════════════════════════════
   RÈGLES, REPÈRES, GRILLE ET MAGNÉTISME
════════════════════════════════════════════════════════════ */
let _overlayRaf = 0;
let _overlayKey = '';
function scheduleOverlayUpdate() {
  if (_overlayRaf) return;
  _overlayRaf = requestAnimationFrame(() => {
    _overlayRaf = 0;
    updateRulers();
    const key = (canvas.viewportTransform || []).join(',') + '|' +
      state.guides.map(g => g.axis + g.pos).join(',');
    if (key !== _overlayKey) { _overlayKey = key; renderGuides(); }
  });
}

function niceStep(zoom) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  for (let i = 0; i < steps.length; i++) if (steps[i] * zoom >= 48) return steps[i];
  return 10000;
}

function updateRulers() {
  if (!state.showRulers || !canvas) return;
  const rect = els.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const zoom = vpt[0] || 1;
  const step = niceStep(zoom);
  const minor = step / 5;

  const h = $('rulerH'), v = $('rulerV');
  if (!h || !v) return;
  const R = RULER_SIZE;
  const hw = Math.max(1, rect.width - R), hh = R;
  const vw = R, vh = Math.max(1, rect.height - R);
  if (h.width !== Math.round(hw * dpr) || h.height !== Math.round(hh * dpr)) {
    h.width = Math.round(hw * dpr); h.height = Math.round(hh * dpr);
    h.style.width = hw + 'px'; h.style.height = hh + 'px';
  }
  if (v.width !== Math.round(vw * dpr) || v.height !== Math.round(vh * dpr)) {
    v.width = Math.round(vw * dpr); v.height = Math.round(vh * dpr);
    v.style.width = vw + 'px'; v.style.height = vh + 'px';
  }

  const draw = (ctx, horizontal) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, horizontal ? hw : vw, horizontal ? hh : vh);
    ctx.fillStyle = '#fbfbfb';
    ctx.fillRect(0, 0, horizontal ? hw : vw, horizontal ? hh : vh);
    ctx.strokeStyle = '#cfcfcf';
    ctx.fillStyle = '#8b8b8b';
    ctx.lineWidth = 1;
    ctx.font = '8px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    const size = horizontal ? hw : vh;
    const offset = horizontal ? vpt[4] : vpt[5];
    const startDoc = (-offset) / zoom;
    const endDoc = (size - offset) / zoom;
    const first = Math.floor(startDoc / minor) * minor;
    for (let d = first; d <= endDoc + minor; d += minor) {
      const p = Math.round(d * zoom + offset) + 0.5;
      if (p < 0 || p > size) continue;
      const major = Math.abs(d / step - Math.round(d / step)) < 1e-6;
      const len = major ? 8 : 4;
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(p, hh); ctx.lineTo(p, hh - len); }
      else { ctx.moveTo(vw, p); ctx.lineTo(vw - len, p); }
      ctx.stroke();
      if (major) {
        const label = String(Math.round(d));
        if (horizontal) ctx.fillText(label, p + 2, 1);
        else {
          ctx.save();
          ctx.translate(1, p - 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    // Repères
    ctx.strokeStyle = 'rgba(22,119,255,.75)';
    state.guides.forEach(g => {
      // Une règle horizontale marque les repères verticaux (x), et inversement.
      if (horizontal ? g.axis !== 'x' : g.axis !== 'y') return;
      const p = Math.round(g.pos * zoom + offset) + 0.5;
      if (p < 0 || p > size) return;
      ctx.beginPath();
      if (horizontal) { ctx.moveTo(p, 0); ctx.lineTo(p, hh); }
      else { ctx.moveTo(0, p); ctx.lineTo(vw, p); }
      ctx.stroke();
    });
  };
  draw(h.getContext('2d'), true);
  draw(v.getContext('2d'), false);
}

function rulerOffset() { return state.showRulers ? RULER_SIZE : 0; }

/* Coordonnées de la SCÈNE (le <main>) → coordonnées document.
   On retire le décalage des règles : sans cela une règle lâchée à
   100 px du bord haut se posait à 118 px dans le plan de travail. */
function screenToDoc(x, y) {
  const off = rulerOffset();
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  return { x: (x - off - vpt[4]) / vpt[0], y: (y - off - vpt[5]) / vpt[3] };
}
function docToScreen(x, y) {
  const off = rulerOffset();
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  return { x: x * vpt[0] + vpt[4] + off, y: y * vpt[3] + vpt[5] + off };
}

function renderGuides(force) {
  const layer = $('guidesLayer');
  if (!layer) return;
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const off = rulerOffset();
  layer.innerHTML = '';
  state.guides.forEach((g, index) => {
    const el = document.createElement('div');
    el.className = 'guide guide--' + g.axis;
    if (g.axis === 'x') el.style.left = Math.round(g.pos * vpt[0] + vpt[4] + off) + 'px';
    else el.style.top = Math.round(g.pos * vpt[3] + vpt[5] + off) + 'px';
    el.dataset.index = String(index);
    el.title = 'Glisser pour déplacer · double-clic pour supprimer';
    layer.appendChild(el);
  });
}

function addGuide(axis, pos) {
  pos = Math.round(pos);
  state.guides.push({ axis, pos });
  renderGuides(true);
  setDirty(true);
}

function bindGuides() {
  const stage = els.stage;
  const temp = $('guideTemp');
  if (!temp) return;

  // Bulle de valeur : on voit la position exacte pendant le glissement.
  let tip = document.createElement('div');
  tip.className = 'guide-tip';
  tip.hidden = true;
  stage.appendChild(tip);

  const stagePoint = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const showTip = (axis, p, value) => {
    tip.hidden = false;
    tip.textContent = Math.round(value) + ' px';
    tip.style.left = p.x + 'px';
    tip.style.top = p.y + 'px';
  };

  const startFromRuler = (axis) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = stagePoint(e);
    temp.hidden = false;
    temp.className = 'guide-temp guide--' + axis + ' is-visible';
    if (axis === 'x') temp.style.left = p.x + 'px';
    else temp.style.top = p.y + 'px';

    const move = (ev) => {
      const q = stagePoint(ev);
      if (axis === 'x') temp.style.left = q.x + 'px';
      else temp.style.top = q.y + 'px';
      const doc = screenToDoc(q.x, q.y);
      showTip(axis, q, axis === 'x' ? doc.x : doc.y);
    };

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', onKey);
      temp.hidden = true;
      tip.hidden = true;
    };

    const onKey = (ev) => { if (ev.key === 'Escape') stop(); };

    const up = (ev) => {
      stop();
      // On accepte le dépôt sur toute la scène, pas seulement sur le canvas :
      // c'est le geste naturel quand on vise le bord du plan de travail.
      const r = stage.getBoundingClientRect();
      const inside = ev.clientX >= r.left && ev.clientX <= r.right &&
                     ev.clientY >= r.top && ev.clientY <= r.bottom;
      if (!inside) return;
      const q = stagePoint(ev);
      const doc = screenToDoc(q.x, q.y);
      addGuide(axis, axis === 'x' ? doc.x : doc.y);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', onKey);
  };

  $('rulerH').addEventListener('pointerdown', startFromRuler('y'));
  $('rulerV').addEventListener('pointerdown', startFromRuler('x'));

  // Le coin des règles efface tous les repères (comme Illustrator).
  const corner = $('rulerCorner');
  if (corner) corner.addEventListener('dblclick', () => {
    if (!state.guides.length) return;
    beginPropChange();
    state.guides = [];
    renderGuides(true);
    setDirty(true);
    toast('Repères effacés');
  });

  // Déplacement / suppression des repères existants
  $('guidesLayer').addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.guide');
    if (!el) return;
    e.preventDefault();
    el.classList.add('dragging');
    const index = Number(el.dataset.index);
    const axis = el.classList.contains('guide--x') ? 'x' : 'y';
    beginPropChange();
    const move = (ev) => {
      const p = stagePoint(ev);
      const doc = screenToDoc(p.x, p.y);
      state.guides[index].pos = Math.round(axis === 'x' ? doc.x : doc.y);
      renderGuides(true);
      const live = document.querySelector('.guide[data-index="' + index + '"]');
      const r = live ? live.getBoundingClientRect() : null;
      if (r) showTip(axis, { x: r.left + 12, y: r.top + 18 }, state.guides[index].pos);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      tip.hidden = true;
      const live = document.querySelector('.guide[data-index="' + index + '"]');
      if (live) live.classList.remove('dragging');
      const p = stagePoint(ev);
      const off = rulerOffset();
      const vpt = canvas.viewportTransform;
      const x = p.x - off;
      const y = p.y - off;
      if (x < 0 || y < 0 || x > canvas.getWidth() || y > canvas.getHeight()) {
        state.guides.splice(index, 1);
      }
      flushPropChange();
      renderGuides(true);
      setDirty(true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  $('guidesLayer').addEventListener('dblclick', (e) => {
    const el = e.target.closest('.guide');
    if (!el) return;
    beginPropChange();
    state.guides.splice(Number(el.dataset.index), 1);
    flushPropChange();
    renderGuides(true);
    setDirty(true);
  });
}

/* Aimante un objet en déplacement sur les repères, la grille et les autres objets. */
function snapMovingObject(o) {
  if (!state.snapEnabled || !o) return;
  const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
  const zoom = vpt[0] || 1;
  const threshold = 6 / zoom;
  const bb = o.getBoundingRect(true, true);
  const xs = [bb.left, bb.left + bb.width / 2, bb.left + bb.width];
  const ys = [bb.top, bb.top + bb.height / 2, bb.top + bb.height];
  const xCandidates = [0, state.artboardW / 2, state.artboardW];
  const yCandidates = [0, state.artboardH / 2, state.artboardH];
  state.guides.forEach(g => { if (g.axis === 'x') xCandidates.push(g.pos); else yCandidates.push(g.pos); });
  if (state.showGrid && state.gridSize > 0) {
    for (let x = 0; x <= state.artboardW; x += state.gridSize) xCandidates.push(x);
    for (let y = 0; y <= state.artboardH; y += state.gridSize) yCandidates.push(y);
  }
  canvas.getObjects().forEach(other => {
    if (other === o || !other.visible) return;
    const b = other.getBoundingRect(true, true);
    xCandidates.push(b.left, b.left + b.width / 2, b.left + b.width);
    yCandidates.push(b.top, b.top + b.height / 2, b.top + b.height);
  });

  const nearest = (values, candidates) => {
    let best = null;
    values.forEach(v => {
      candidates.forEach(c => {
        const d = Math.abs(c - v);
        if (d <= threshold && (!best || d < best.d)) best = { d, delta: c - v };
      });
    });
    return best;
  };
  const sx = nearest(xs, xCandidates);
  const sy = nearest(ys, yCandidates);
  if (sx) o.left += sx.delta;
  if (sy) o.top += sy.delta;
  if (sx || sy) { o.setCoords(); canvas.requestRenderAll(); }
}

/* ── Resize : adapter la taille du canvas à la scène ── */
function resizeCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const pad = rulerOffset();
  // Les règles occupent une bande fixe : le canvas doit se réduire d'autant,
  // sinon les 18 premiers pixels du plan de travail sont sous la règle.
  els.stage.classList.toggle('has-rulers', pad > 0);
  const w = Math.max(1, Math.round(rect.width - pad));
  const h = Math.max(1, Math.round(rect.height - pad));
  canvas.setDimensions({ width: w, height: h }, { cssOnly: false });
  canvas.calcOffset();
  canvas.requestRenderAll();
  // Le widget de zoom se cale sur la largeur réelle du panneau de droite :
  // rétractée elle le ramène, ouverte elle le pousse.
  publishSidebarWidth();
  updateRulers();
  renderGuides(true);
}
window.addEventListener('resize', resizeCanvas);

/* ════════════════════════════════════════════════════════════
   API PUBLIQUE (intégration Astro / Rust / automatisation)
════════════════════════════════════════════════════════════ */
let nativeInfo = null;

window.Bird = {
  version: '2.0.0',
  get canvas() { return canvas; },
  state,
  tools: { set: setTool, current: () => state.tool },
  view: {
    rulers: setRulers,
    grid: setGrid,
    snap: setSnap,
    sync: syncViewToggles
  },
  get widgets() { return widgetsApi; },
  get plugins() { return window.BirdPlugins || null; },
  get native() { return nativeInfo; },
  set native(v) { nativeInfo = v; },
  /* Registre de commandes : même point d'entrée que le menu natif.
     `Bird.commands.run('file.export')` fonctionne sur toutes les plateformes. */
  commands: {
    run: (id) => (window.BirdCommands ? BirdCommands.run(id) : false),
    list: () => (window.BirdCommands ? BirdCommands.list() : []),
    groups: () => (window.BirdCommands ? BirdCommands.groups() : [])
  },
  document: {
    new: resetDocument,
    clear: clearAll,
    save: saveFile,
    open: (file, point) => importFile(file, point),
    payload: createProjectPayload,
    /* Annulation exposée : un plug-in doit pouvoir inscrire ses propres
       modifications dans le même historique que l'application. */
    undo,
    redo,
    commit: (label) => commitUndo(label),
    begin: () => beginTxn(),
    /* Enveloppe sûre pour les plug-ins : la transaction est ouverte AVANT
       la mutation, ce qui garantit que l'annulation restaure bien l'état
       précédent même pour un ajout d'objet. */
    edit: (fn, label) => {
      beginTxn();
      let result;
      try { result = fn(canvas); }
      catch (e) { cancelTxn(); throw e; }
      commitUndo(label || 'Modification');
      setDirty(true);
      renderLayers();
      return result;
    },
    history: () => ({
      undo: state.undo.length,
      redo: state.redo.length,
      bytes: historyBytes(),
      readable: BirdHistory.formatBytes(historyBytes()),
      limit: HISTORY_LIMIT,
      budget: HISTORY_BUDGET,
      cached: history ? history.stats().cachedObjects : 0
    }),
    load: (payload) => {
      const data = normalizeProjectPayload(payload);
      applyProjectPayload(data);
      state.undo = [];
      state.redo = [];
      if (history) history.reset();
      updateUndoUI();
      setDirty(false);
      return requestAnimationFrame(() => { resizeCanvas(); fitView(); });
    },
    validate: (payload) => normalizeProjectPayload(payload)
  },
  pages: {
    list: () => state.pages.map((p, i) => ({
      index: i, id: p.id, name: p.name, width: p.w, height: p.h, active: i === state.activePage
    })),
    active: () => state.activePage,
    count: () => state.pages.length,
    go: (index) => gotoPage(index),
    add: (name) => addPage(name),
    duplicate: duplicatePage,
    remove: (index) => deletePage(index),
    rename: (index, name) => renamePage(index, name),
    move: (index, delta) => movePage(index, delta)
  },
  io: {
    importSVG: (text, point) => importSVGText(text, point),
    importPDF: async (buffer) => BirdIO.pdfToSVG(buffer),
    importEPS: async (buffer) => BirdIO.epsToFabricGroup(buffer, fabric),
    detect: (bytes, name) => BirdIO.detectKind(bytes, name)
  },
  export: runExport,
  exportSVG: (opts) => buildSVGString(
    (opts && opts.width) || Math.round(state.artboardW),
    (opts && opts.height) || Math.round(state.artboardH),
    opts || {}
  ),
  zoom: { fit: fitView, set: setZoom, selection: zoomToSelection },
  layers: renderLayers,
  selection: {
    all: () => canvas.getActiveObjects(),
    group: groupSelection,
    ungroup: ungroupSelection,
    lock: toggleLockSelection,
    hide: toggleVisibleSelection
  },
  ready: true
};

/* ── Boot ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); });
} else {
  init();
}

})();
