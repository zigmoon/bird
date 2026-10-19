# BIRD — Éditeur vectoriel

<img src="icons/bird-logo.svg" alt="Bird" width="180">

**Le studio de dessin vectoriel local-first du navigateur.**
Bézier, calques, règles et repères, Pathfinder, texte éditable, plug-ins, panneaux détachables, import PDF/AI/EPS/SVG et export SVG **ou PDF vectoriel**. Aucune installation, aucun compte : vos documents restent sur votre machine.

Ouvrez simplement `index.html` dans un navigateur moderne (Chrome, Edge, Firefox, Safari), ou utilisez la version Astro (`astro/`) / le moteur Rust (`rust/`).

---

## Sommaire

- [Nouveautés v1.6](#nouveautés-v16)
- [Ce qui fait de Bird un « Illustrator killer »](#ce-qui-fait-de-bird-un--illustrator-killer-)
- [Ergonomie : la barre haute](#ergonomie--la-barre-haute)
- [Widgets détachables](#widgets-détachables)
- [Plug-ins](#plug-ins)
- [Création assistée par IA](#création-assistée-par-ia)
- [Import](#import) · [Export](#export)
- [Raccourcis](#raccourcis)
- [Architecture](#architecture)
- [Version Astro](#version-astro) · [Moteur Rust](#moteur-rust)
- [Développement](#développement)

---

## Nouveautés v1.7

| Domaine | Ce qui change |
|---|---|
| **Plans de travail** | Un document contient désormais **plusieurs plans** (comme les artboards d’Illustrator) : panneau dédié, sélecteur flottant sur le plan de travail, `Ctrl+Page↑` / `Ctrl+Page↓`, format indépendant par plan, historique **par plan**. |
| **Import PDF multi-pages** | Un PDF de N pages propose trois choix : première page, page précise, ou **toutes les pages → un plan par page** au format exact de chaque page, contenu à 1:1. |
| **Export PDF multi-plans** | `Tous les plans de travail (PDF)` : un seul PDF, une page par plan, chacune à son format. |
| **Icônes** | L’aperçu du plan de travail vide utilise le logo en **gris clair** (marque discrète, pas un aplat noir). |
| **Panneau rétracté** | Le rail d’icônes passe de 13 à 7 entrées utiles ; les `•••` restent visibles pour rouvrir le panneau. |

### v1.6

| Domaine | Ce qui change |
|---|---|
| **Identité** | Nouveau logo Bird (vol de cinq oiseaux) : écran de démarrage, barre haute, aperçu du plan de travail vide, favicon et icônes PWA 192/512. |
| **Barre haute** | Grammaire SuperPrint : fichiers à gauche, outils **centrés sur la fenêtre**, zoom + `EXPORT` + réglages à droite. |
| **Bascules de vue** | Règles, grille et magnétisme deviennent des boutons à état (`aria-pressed`) synchronisés avec le panneau Document et le clavier. |
| **Règles** | Le plan de travail commence **après** les règles : plus de zone de dessin cachée sous la graduation. Bulle de valeur pendant le glissement, `Échap` annule, dépôt accepté sur toute la scène, double-clic sur le coin efface les repères. |
| **Widgets** | Chaque panneau de droite se détache en carte flottante : déplaçable, repliable, refermable, position mémorisée. |
| **Plug-ins** | Registre persistant, installation depuis un fichier `.plugin.js`, tiroir de réglages généré depuis le manifeste, icône dans la barre d’outils. |
| **Plug-in livré** | **Motif vectoriel** : 9 motifs sans raccord, sortie texture (1 objet) ou vectorielle (formes réelles). |
| **IA** | **DeepSeek** ajouté (API directe + modèles via OpenRouter), sélecteur de fournisseur, clés séparées par fournisseur. |
| **API** | `Bird.view.*`, `Bird.widgets.*`, `BirdPlugins.*` — contrat stable pour l’intégration. |

---

## Ce qui fait de Bird un « Illustrator killer »

### Dessin
- **Plume (Bézier)** : clic = ancre, glisser = poignées, ré-édition complète (ajout/suppression de points, segments courbes).
- **Crayon** et **pinceau vectoriel** : Ligne, Encre, Marker, Spray, Néon ; taille, lissage, opacité, pression du stylet.
- **Formes** : rectangle (rayon modifiable), ellipse, ligne, étoile et polygone paramétrables (nombre de points, rayon interne).
- **Texte** : police, taille, gras, italique, souligné, barré, alignement.
- **Pathfinder** : union, soustraction, intersection, exclusion, sans rasterisation (Paper.js).
- **Conversion forme → chemin** et **Pathfinder** conservent l’édition vectorielle.
- **Images et vidéos** : import PNG/JPG/WebP/GIF/BMP/AVIF, vignette de vidéo WebM/MP4.

### Organisation et précision
- **Panneau Calques** : liste des objets, sélection, renommage, visibilité, verrouillage, ordre.
- **Règles H/V** avec graduations dynamiques et **repères** (glisser depuis une règle, déplacer, double-clic pour supprimer).
- **Grille**, **magnétisme** (repères, grille, bords/centres des objets et du plan de travail).
- **Zoom infini** 5 % → 6400 %, molette vers le curseur, zoom sur sélection (`Maj+2`).
- **Alignements**, répartition « Tidy », alignement sur le plan de travail, miroir.
- **Opacité et modes de fusion** (produit, écran, incrustation, différence, teinte, luminosité…).
- **Contours** : épaisseur, pointillés (presets + motif libre), extrémités, jonctions.
- **Pipette** (`I`) : prélève une couleur et l’applique à la sélection.

---

## Ergonomie : la barre haute

La barre suit une règle simple : **une zone par intention**, et les outils toujours au même endroit, centrés sur la fenêtre — pas sur l’espace restant. Les boutons font strictement 32 × 32 px, pour que la rangée ne « respire » jamais au gré des libellés.

| Zone | Contenu | Règle |
|---|---|---|
| **Gauche** | logo (retour à la vue ajustée), nouveau, ouvrir, enregistrer | actions de fichier |
| **Centre** (absolu, centré) | annuler/rétablir, grouper/dégrouper, règles, grille, magnétisme, plug-ins actifs, IA | outils, jamais déplacés |
| **Droite** | zoom −/lecture/+, ajuster, zoom sélection, `EXPORT ▾`, préférences | sortie et réglages |

Les trois bascules de vue sont des boutons à état :

- **Règles** `Ctrl+R` — affiche/masque les graduations ; le plan de travail se décale de 18 px en conséquence.
- **Grille** `Ctrl+'` — grille de repérage dans le plan de travail (pas réglable dans *Document*).
- **Magnétisme** `Ctrl+;` — accroche aux repères, à la grille et aux bords/centres des objets.

Ces trois boutons, les interrupteurs du panneau *Document* et les raccourcis clavier passent tous par la même fonction : l’état affiché ne peut donc jamais diverger de l’état réel.

---

## Widgets détachables

Le panneau de droite reprend la grammaire de SuperPrint : en-tête `•••`, rail d’icônes quand il est rétracté, sections titrées.

Chaque section possède un bouton **détacher**. Une fois détachée :

- la section devient une **carte flottante** au-dessus du plan de travail ;
- elle se déplace en glissant son en-tête, se replie, se referme (retour au panneau) ;
- sa position est **mémorisée** (`localStorage`, clé `bird_widgets_v2`) ;
- elle **continue de fonctionner à l’identique** : c’est le même nœud DOM qui est déplacé, pas une copie. Aucun écouteur n’est perdu.

Aucune liste de widgets séparée : **ce sont les sections existantes** du panneau qui se détachent. L’icône de la section dans le rail porte un point bleu tant que son widget flotte, et un clic la ramène au premier plan. `•••` de l’en-tête replie le panneau, le bouton ↧ rattache tout d’un coup.

```js
Bird.widgets.detach('layers');   // détache le panneau Calques
Bird.widgets.dock('layers');     // le rattache
Bird.widgets.dockAll();          // tout rattacher
Bird.widgets.reset();            // positions et états d'origine
Bird.widgets.list();             // ['appearance', 'shape', …]
```

---

## Historique incrémental

Instantané complet à chaque pas = désastre dès qu’une image entre dans le
document : 60 pas d’annulation sur une image de 2 Mo, c’est 120 Mo pour un objet
qui n’a jamais bougé.

Bird stocke une **carte `id d’objet → JSON de l’objet`**. Deux états successifs
partagent la **même chaîne** pour tout objet inchangé : une modification ne coûte
que les objets réellement touchés.

| Scénario | Instantanés complets | Bird 2.0 |
|---|---|---|
| 30 rectangles, 30 pas d’annulation | ~1 Mo | **33 Ko** |
| + une image de 400 Ko | +400 Ko *par pas* | **+400 Ko une fois** |
| + 20 déplacements d’un rectangle | +660 Ko | **+21 Ko** |

Un historique entier finit par coûter le prix d’**un seul** instantané classique.

- Les objets sérialisés portent un `birdId` stable : l’identité survit à un
  aller-retour, donc le partage continue de fonctionner après un undo/redo.
- La purge est bornée en **octets** autant qu’en nombre de pas : 80 états *ou*
  64 Mo, au premier atteint.
- L’infobulle d’`Annuler` affiche le poids réel (`Ctrl+Z` — 12 états, 84 Ko).
- undo/redo est verrouillé pendant la reconstruction du document : un double
  `Ctrl+Z` rapide ne peut pas enregistrer le canvas vide que Fabric expose en
  cours de chargement.

```js
Bird.document.history();   // { undo, redo, bytes, readable, limit, budget, cached }
Bird.document.edit((canvas) => { /* … */ }, 'Libellé');  // une entrée d'annulation sûre
```

---

## Plug-ins

Un plug-in est un fichier **`.plugin.js`** autonome :

```js
BirdPlugins.register({
  id: 'mon-plugin',
  name: 'Mon plug-in',
  version: '1.0.0',
  description: 'Ce qu’il fait, en une phrase.',
  builtin: false,
  actifParDefaut: false,

  ui: {
    preview: true,                       // canvas d'aperçu dans le tiroir
    fields: [
      { key: 'motif', label: 'Motif', type: 'select', value: 'a',
        options: [{ value: 'a', label: 'Option A' }] },
      { key: 'pas', label: 'Pas', type: 'range', min: 4, max: 200, value: 40, unit: ' px', row: 1 },
      { key: 'couleur', label: 'Couleur', type: 'color', value: '#1a1a1a' },
      { key: 'fond', label: 'Fond opaque', type: 'checkbox', value: false }
    ]
  },

  preview(api, values, canvas, ctx) { /* dessin de l'aperçu */ },

  run(api, values) {                     // appelé sur APPLIQUER
    api.begin();                         // une seule entrée d'historique
    api.add(new api.fabric.Rect({ /* … */ }), 'Mon objet');
    api.toast('Fait');
  }
});
```

### API fournie

| Membre | Rôle |
|---|---|
| `api.fabric` | `window.fabric` (5.1) |
| `api.canvas` | le canvas Fabric actif |
| `api.document` | `{ width, height, background, objects }` |
| `api.selection()` / `api.selectionBounds()` | objets sélectionnés / leur boîte englobante |
| `api.add(object, label)` | ajoute un objet, avec **une** entrée d’historique |
| `api.replaceSelection(objects, label)` | remplace la sélection |
| `api.begin()` / `api.commit(label)` | transaction manuelle |
| `api.toast(msg, isError)` | notification |
| `api.settings.get/set` | réglages persistants du plug-in |
| `api.svgToGroup(svgText)` | SVG → groupe Fabric (promesse) |
| `api.pattern(source, repeat, transform)` | `fabric.Pattern` prêt à remplir une forme |

### Types de champs

`select`, `range` (avec `<output>` + unité), `number`, `color`, `checkbox`, `text`, `textarea`, `group`.
Deux champs consécutifs portant `row` vont côte à côte. `ui.preview: false` masque l’aperçu.

### Cycle de vie

1. **Installation** — bouton *Installer…* : le fichier est lu, son `id` extrait, le manifeste enregistré (`localStorage`, `bird_plugins_v1`).
2. **Activation** — interrupteur du panneau *Plug-ins* : le script est évalué et le plug-in s’ouvre depuis le panneau **Plug-ins** du rail de droite. La barre d’outils haute reste volontairement sans icône de plug-in : un bouton par extension ne passerait pas l’échelle.
3. **Utilisation** — clic sur l’icône ou *Utiliser* : le tiroir de réglages s’ouvre, l’aperçu se met à jour à chaque frappe, `APPLIQUER` écrit dans le document.
4. **Retrait** — bouton *Retirer* sur les plug-ins installés.

> Un plug-in s’exécute avec les droits de la page : c’est un choix de l’utilisateur, comme une extension d’éditeur. L’API n’est pas une frontière de sécurité, c’est une **frontière de contrat** — elle protège vos plug-ins des changements internes de Bird, pas l’inverse.

### Plug-in livré : Motif vectoriel

| | |
|---|---|
| **Motifs** | Rayures, Damier, Pois, Vagues, Chevrons, Triangles, Croix, Grille, Écailles |
| **Réglages** | pas, épaisseur, angle, opacité, couleur du motif, couleur de fond, fond opaque |
| **Sorties** | *Texture* — un seul `fabric.Pattern` (léger, idéal pour un fond) · *Vecteur* — de vraies formes Fabric (4000 max), exportables en PDF/EPS |
| **Portée** | plan de travail entier ou sélection (remplissage ou remplacement) |

Chaque motif est construit sur une **tuile de période entière** : le raccord est mathématiquement exact. Le motif est décrit une seule fois en primitives (`rect`, `circle`, `line`, `poly`), puis rendu par deux moteurs — Canvas2D pour l’aperçu et la texture, Fabric pour la vectorisation. Une description, deux rendus, aucune divergence.

---

## Création assistée par IA

Deux fournisseurs, deux philosophies :

| Fournisseur | Modèles | Principe |
|---|---|---|
| **OpenRouter** | `openrouter/free`, GLM 5.2, MiniMax M3, North Mini Code, DeepSeek Chat / R1, GPT-5.6 Luna, Claude Sonnet 5 | Le modèle **écrit le SVG** : formes éditables, aucun raster |
| **OpenRouter · SVG natif** | Recraft V4 / V4.1 (Pro) | génération vectorielle spécialisée, facturée à l’usage |
| **DeepSeek** | `deepseek-chat` (V3, rapide), `deepseek-reasoner` (R1, réfléchi) | API directe `api.deepseek.com`, écriture du SVG en code |

Sélecteur **Fournisseur** dans la fenêtre IA, clés stockées séparément (`sessionStorage`, jamais dans le fichier projet). Le bouton ↻ actualise le catalogue du fournisseur choisi ; en mode DeepSeek, « SVG natif » est désactivé (il n’existe pas chez eux).

Tout SVG généré passe par le **même nettoyeur** que l’import : scripts, `foreignObject`, `on*` et références externes sont supprimés avant insertion.

---

## Import

| Format | Méthode | Résultat |
|---|---|---|
| `.svg` / `.svgz` | parseur SVG sécurisé + Fabric | objets vectoriels éditables |
| `.pdf` | **pdf.js** (chemins, clips, couleurs, textes, images) | groupe vectoriel éditable (page 1) |
| `.ai` moderne | détection par signature → import PDF | vectoriel éditable |
| `.ai` / `.eps` PostScript | interpréteur Adobe Illustrator niveau 2 | chemins Fabric éditables |
| `.png .jpg .webp .gif .bmp .avif` | bitmap | image éditable |
| `.webm .mp4` | première frame | vignette |
| `.plume` / `.bird` / `.json` | schéma `bird-vector-project` v2/v3 | document complet + guides + calques |

Le presse-papiers système est aussi pris en charge : collez un SVG ou une image directement sur le plan de travail.

### PDF multi-pages

À l’import d’un PDF de plus d’une page, Bird demande quoi faire :

| Choix | Résultat |
|---|---|
| **Première page** | comportement historique : un seul plan de travail |
| **Une page précise** | un plan, la page demandée, contenu centré comme un import classique |
| **Toutes les pages** | **un plan de travail par page**, au format exact de la page PDF (595 × 842, 842 × 595, 300 × 300…), contenu placé à **1:1** et non réduit |

Les pages importées sont ajoutées à la suite des plans existants : rien n’est écrasé.

## Plans de travail

Un document contient plusieurs plans de travail, chacun avec son format, son fond et son contenu.

- **Panneau *Plans de travail*** : liste numérotée, nom éditable (double-clic), dimensions, nombre d’objets, monter/descendre, supprimer (confirmation si le plan n’est pas vide).
- **Sélecteur flottant** en bas du plan de travail, visible dès deux plans : `‹ Plan › ` + compteur, cliquable pour ouvrir le panneau.
- **Raccourcis** `Ctrl+Page↑` / `Ctrl+Page↓`.
- **Historique isolé par plan** : annuler sur le plan A ne touche pas le plan B. Les piles sont mémorisées au changement de plan.
- **Persistance** : le projet `.plume` enregistre tous les plans (`pages[]` + `activePage`). Un ancien projet mono-plan s’ouvre comme un document à un seul plan.

```js
Bird.pages.list()                  // [{ index, id, name, width, height, active }]
Bird.pages.count()
Bird.pages.go(2)                   // afficher le 3e plan
Bird.pages.add('Couverture')       // nouveau plan vide
Bird.pages.duplicate()             // copie du plan actif, juste après lui
Bird.pages.rename(1, 'Page de garde')
Bird.pages.remove(2)
Bird.pages.move(3, -1)
```

## Export

- **SVG** : document ou sélection, fond plan de travail / transparent / blanc.
- **PDF vectoriel** : via `svg2pdf` + jsPDF, compatible Illustrator et imprimeurs.
- **PDF multi-plans** : portée *Tous les plans de travail* → un PDF, une page par plan, chacune à son format.
- **PNG** transparent, **JPG** fond blanc, **WEBP**, avec échelle 1× à 4×.
- **Copie dans le presse-papiers** (SVG ou image).
- **Projet `.plume`** : JSON versionné, migration automatique des anciens projets.

> PDF : les polices non standard sont ramenées à Helvetica / Times / Courier. Pour une fidélité typographique parfaite, exportez en PNG ou installez la police dans le système.

## Fiabilité

- **Annuler / rétablir** couvre les créations, déplacements, rotations, réglages du panneau, verrouillage, plug-ins.
- **Sauvegarde automatique** dans `localStorage` et bascule automatique vers **IndexedDB** au-delà de 4,2 Mo (images embarquées).
- Historique **incrémental** borné par 80 états *ou* 64 Mo, au premier atteint ; les réglages continus sont coalescés en une seule entrée.
- Tout le contenu importé est **nettoyé** : scripts, `foreignObject`, gestionnaires `on*`, références externes.

---

## Raccourcis

| Touche | Action |
|---|---|
| `V` | Sélection |
| `P` | Plume |
| `N` | Crayon |
| `B` | Pinceau vectoriel |
| `I` | Pipette |
| `R` / `E` / `L` / `T` | Rectangle / Ellipse / Ligne / Texte |
| `H` ou `Espace` | Déplacer (main) |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Annuler / Rétablir |
| `Ctrl+A` | Tout sélectionner |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copier / Couper / Coller (interne + presse-papiers SVG) |
| `Ctrl+D` | Dupliquer |
| `Ctrl+G` / `Ctrl+Shift+G` | Grouper / Dégrouper |
| `Ctrl+2` / `Ctrl+3` | Verrouiller / Masquer la sélection |
| `Ctrl+0` | Ajuster à l’écran |
| `Maj+1` / `Maj+2` | Ajuster à l’écran / Zoom sur la sélection |
| `Ctrl+R` | Règles |
| `Ctrl+'` | Grille |
| `Ctrl+;` | Magnétisme |
| `Ctrl+K` | Plug-ins |
| `Ctrl+Page↑` / `Ctrl+Page↓` | Plan de travail précédent / suivant |
| `Suppr` | Supprimer |
| `Flèches` / `Maj+Flèches` | Déplacer de 1 px / 10 px |
| `Échap` / `Entrée` | Terminer / annuler un tracé (ou `Échap` pendant un glissement de repère) |

---

## Architecture

```
bird/
├── index.html                 interface (DOM stable, réutilisé par Astro)
├── css/style.css              design : IBM Plex Mono, noir & blanc, grille 4 px
├── icons/
│   ├── bird-logo.svg          logo complet (5 oiseaux) — splash
│   ├── bird-logo-gray.svg     logo complet en gris clair — aperçu du plan vide
│   ├── bird-mark.svg          marque seule — barre haute
│   ├── bird-mark-white.svg    marque inversée — panneaux sombres
│   ├── favicon.svg            favicon (carré arrondi + marque centrée)
│   └── icon-180/192/512.png   icônes PWA
├── js/
│   ├── fabric.min.js          moteur canvas (Fabric.js 5.1)
│   ├── paper-full.min.js      Pathfinder et conversion en chemins (Paper.js)
│   ├── io.js                  échange : SVG, PDF/AI, EPS, export PDF, IndexedDB
│   ├── eps-import.js          interpréteur PostScript (Illustrator niveau 2)
│   ├── history.js             historique incrémental (interning d’objets, budget en octets)
│   ├── widgets.js             panneaux détachables (carte flottante + mémoire)
│   ├── plugins.js             hôte de plug-ins : registre, tiroir, API
│   ├── pdf.min.js             lecture PDF (pdf.js 3.11, chargé à la demande)
│   ├── pdf.worker.min.js      worker pdf.js
│   ├── jspdf.umd.min.js       écriture PDF
│   ├── svg2pdf.umd.min.js     SVG → PDF vectoriel
│   └── app.js                 application : outils, historique, calques, export
├── plugins/
│   └── motif-vectoriel.plugin.js   plug-in livré (textures sans raccord)
├── astro/                     version Astro (pages, SEO, PWA, API)
├── rust/                      moteur Rust : CLI, serveur local, conversion
├── llms.txt                   manifeste lisible par les LLM
└── manifest.webmanifest       PWA
```

### API d’intégration

```js
Bird.version                         // '1.7.0'
Bird.document.new()                  // nouveau document
Bird.document.payload()              // projet sérialisé (tous les plans)
Bird.document.load(payload)          // ouvre un projet
Bird.document.open(file)             // importe un File (tous formats)
Bird.io.importPDF(arrayBuffer)       // → { svg, width, height, pages, page }
Bird.io.pdfPageCount(arrayBuffer)    // → { pages, sizes:[{ index, width, height }] }
Bird.io.svgPagesToPDF([{ svg, width, height }])  // → PDF multi-pages
Bird.io.importEPS(arrayBuffer)       // → groupe Fabric
Bird.io.importSVG(svgText)
Bird.export({ format:'pdf', scope:'document', background:'artboard', returnBlob:true })
Bird.export({ format:'pdf', scope:'pages', returnBlob:true })   // une page par plan
Bird.exportSVG({ background:'transparent' })
Bird.zoom.selection()

Bird.pages.count()                   // plans de travail
Bird.pages.go(1)
Bird.pages.add('Plan 3')

Bird.view.rulers(true)               // règles / grille / magnétisme
Bird.view.grid(false)
Bird.view.snap(true)

Bird.widgets.dockAll()               // panneaux détachables
Bird.widgets.detach('layers')

BirdPlugins.list()                   // manifestes enregistrés
BirdPlugins.open('motif-vectoriel')  // ouvre le tiroir de réglages
BirdPlugins.toggle('mon-plugin')     // active / désactive
```

---

## Version Astro

`astro/` encapsule exactement le même moteur : une seule source de vérité, deux livraisons.

```bash
cd astro
npm install
npm run sync      # copie js/, css/, icons/, plugins/ et l’interface
npm run dev
npm run build     # sortie dist/ (adapter node)
```

Le script `sync` extrait la coquille de l’éditeur depuis `../index.html` et copie les assets sous `public/assets/bird/` : toute modification de l’interface doit être suivie d’un `npm run sync`.

## Moteur Rust

`rust/` est un espace de travail Cargo indépendant (aucun Node requis) :

- `bird-core` — lecture/écriture du format `.plume`, géométrie, validation ;
- `bird-cli` — `bird-cli info`, `bird-cli export svg|json`, `bird-cli serve`.

```bash
cd rust
cargo test                  # 14 tests
cargo run -p bird-cli -- info examples/sample.plume
```

Sous Windows, `scripts/build.ps1` configure la chaîne MinGW WinLibs attendue par la machine de build.

---

## Développement

Aucune compilation pour la version principale :

```bash
npx serve .          # http://localhost:3000
```

La sauvegarde locale est déclenchée 1,2 s après chaque modification, et à la fermeture.
Les bibliothèques PDF/EPS ne sont téléchargées qu’au premier import ou export concerné.
Les préférences d’interface (widgets détachés, plug-ins actifs, réglages de plug-ins) vivent dans `localStorage` et n’entrent jamais dans le fichier projet.

---

## Feuille de route

- [x] Multi-plans de travail / pages
- [x] Import PDF multi-pages avec sélecteur de page
- [x] Export PDF multi-plans
- [x] Texte PDF vraiment vectoriel (embarquement de polices et conversion en courbes)
- [x] Export PDF/X-1a, CMJN et profils ICC
- [x] Dégradés PDF réels (shadings axiaux/radiaux)
- [x] Contour de trait, décalage de tracé, simplification, symboles, blend tool
- [x] Historique incrémental (interning d’objets, budget en octets)
- [x] Version desktop Tauri (macOS, Windows, Linux)
- [ ] Rendu WebGL / OffscreenCanvas pour les gros documents
- [ ] Tests Playwright de non-régression visuelle
- [ ] Collaboration local-first (CRDT) et gestion de versions
- [ ] i18n et accessibilité complète

© Zigmoon — Bird
