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
| **Identité** | Logo Bird (vol de cinq oiseaux) : écran de démarrage, **barre haute**, **pop-in de reprise de document**, aperçu du plan de travail vide, favicon et icônes PWA 192/512. Sur le splash, le panneau noir ne porte que la typographie — le logo vit au centre, sur le gris. |
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

Aucune liste de widgets séparée : **ce sont les sections existantes** du panneau qui se détachent. L’icône de la section dans le rail porte un point noir tant que son widget flotte, et un clic la ramène au premier plan. `•••` de l’en-tête replie le panneau, le bouton ↧ rattache tout d’un coup.

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

`⌘` remplace `Ctrl` sur macOS : la même build se comporte nativement sur chaque
plateforme. Les combinaisons suivent Illustrator et Figma.

<kbd>F1</kbd> dans l’application affiche la liste complète, **générée depuis le
registre de commandes** (`js/commands.js`) : elle ne peut pas diverger du code.

| Touche | Action |
|---|---|
| `V` / `P` / `N` / `B` / `I` | Sélection / Plume / Crayon / Pinceau / Pipette |
| `R` / `E` / `L` / `T` / `H` | Rectangle / Ellipse / Ligne / Texte / Main |
| `Espace` | Déplacer la vue (maintenu) |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Maj+S` | Nouveau / Ouvrir / Enregistrer / Enregistrer sous |
| `Ctrl+Maj+P` / `Ctrl+E` / `Ctrl+P` | Importer / Exporter / Imprimer |
| `Ctrl+Z` / `Ctrl+Maj+Z` / `Ctrl+Y` | Annuler / Rétablir |
| `Ctrl+X` / `Ctrl+C` / `Ctrl+V` / `Ctrl+Maj+V` | Couper / Copier / Coller / Coller sur place |
| `Ctrl+A` / `Ctrl+Maj+A` / `Ctrl+D` | Tout sélectionner / Désélectionner / Dupliquer |
| `Ctrl+G` / `Ctrl+Maj+G` | Grouper / Dégrouper |
| `Ctrl+]` / `Ctrl+[` / `Ctrl+Maj+]` / `Ctrl+Maj+[` | Avancer / Reculer / Premier plan / Arrière-plan |
| `Ctrl+2` / `Ctrl+Alt+2` / `Ctrl+3` / `Ctrl+Alt+3` | Verrouiller / Tout déverrouiller / Masquer / Tout afficher |
| `Ctrl+Maj+O` | Contour de trait |
| `Ctrl+Maj+.` / `Ctrl+Maj+,` | Corps de texte + / − |
| `Ctrl+0` / `Ctrl+1` / `Ctrl+=` / `Ctrl+-` | Ajuster / 100 % / Zoom avant / Zoom arrière |
| `Maj+1` / `Maj+2` | Ajuster à l’écran / Zoom sur la sélection |
| `Ctrl+R` / `Ctrl+'` / `Ctrl+;` | Règles / Grille / Magnétisme |
| `Ctrl+K` / `Ctrl+,` | Plug-ins / Préférences |
| `Ctrl+Page↑` / `Ctrl+Page↓` | Plan de travail précédent / suivant |
| `F1` / `F11` | Raccourcis / Plein écran |
| `Suppr` | Supprimer |
| `Flèches` / `Maj+Flèches` | Déplacer de 1 px / 10 px |
| `Échap` / `Entrée` | Terminer / annuler un tracé (ou `Échap` pendant un glissement de repère) |

Dans l’application de bureau, **chaque raccourci est aussi une entrée de menu**
(Fichier, Édition, Objet, Affichage) — un raccourci que personne ne peut
découvrir est un raccourci que personne n’utilise.

---

## Architecture

### Direction artistique — une règle, contrôlée

Noir, blanc, gris. **Aucune teinte dans l’interface** — pas même pour un état
actif, une erreur ou une action destructive. Un état s’exprime par une nuance de
remplissage, un bord plus sombre, une ombre interne ou une inversion
noir↔blanc. Le nuancier de l’utilisateur (les couleurs avec lesquelles il peint)
est la seule exception.

`node scripts/check-ui.mjs` fait échouer le build sur toute couleur chromatique
dans `css/style.css`, `js/app.js` ou `index.html` (écart max-min des canaux > 8),
et la CI l’exécute avant chaque publication. Les exceptions légitimes se
déclarent en ligne avec `check-ui:allow <raison>`.

### Thème jour / nuit

Le bouton lune / soleil, à gauche des *Préférences*, bascule le thème ; le choix
est conservé dans `localStorage` sous `bird.theme` et appliqué par un court
script en ligne dans le `<head>` **avant le premier rendu** : un rechargement en
thème sombre ne fait donc jamais clignoter l’écran en blanc.

Toute la palette vit à un seul endroit : `:root` définit 46 nuances classées par
**luminance** (`--n00` la plus claire → `--n45` la plus sombre), et non par rôle
— dans cette feuille une même nuance sert de fond ici et de bordure là, un nom
de rôle mentirait. Les composants s’écrivent `background: var(--n00); color:
var(--n45)` et s’inversent donc d’eux-mêmes ; `html[data-theme="dark"]` ne
redéfinit que les variables. Le thème clair conserve exactement les littéraux
d’origine : il est identique au pixel près à la version monochrome précédente.

Trois choses échappent aux variables et demandent un traitement explicite :

* **Le dessin au canvas.** La zone de travail infinie, le cadre pointillé du
  plan et les règles sont peints au contexte 2D, qui ne lit pas les variables
  CSS. Ils passent par `themeColor()` dans `js/app.js`, qui lit les propriétés
  `--canvas-*` et `--ruler-*` (avec cache par thème) et se vide sur l’évènement
  `bird:theme`.
* **Le papier.** Le plan de travail garde sa propre couleur (`artColor`, blanc
  par défaut) : le mode sombre assombrit l’entourage, jamais le document.
* **Les sources `<img>`.** Un SVG noir chargé par `<img>` ne reçoit pas
  `currentColor` ; ces images sont inversées par `filter: invert(1)` dans le
  bloc sombre.

### Langue de l’interface

**L’anglais est la langue par défaut.** Le français est disponible dans
*Préférences → Langue de l’interface* ; le choix est conservé dans
`localStorage` sous `bird.lang` et s’applique immédiatement, sans rechargement.

Le français est la langue *source* du balisage et des scripts ; `js/i18n.js`
traduit le DOM vivant — nœuds de texte et les quatre attributs qu’un utilisateur
peut lire (`title`, `aria-label`, `placeholder`, `alt`) — à partir d’une table
indexée par le texte français, plus des règles de motif pour les messages
construits par concaténation. La valeur d’origine est stockée sur le nœud
lui-même : le changement de langue est donc réversible et idempotent. Un
`MutationObserver` couvre tout ce que les scripts créent ensuite (toasts, lignes
de calques, feuille de raccourcis générée).

Pour ajouter une chaîne : l’écrire en français, puis ajouter la paire dans `EN`
de `js/i18n.js`. Si le message interpole des valeurs, ajouter un motif.

```
bird/
├── index.html                 interface (DOM stable, réutilisé par Astro)
├── css/style.css              design : IBM Plex Mono, noir & blanc, grille 4 px
├── js/i18n.js                 langue : anglais par défaut, français en option
├── icons/
│   ├── bird-logo.svg          logo complet (5 oiseaux) — splash
│   ├── bird-logo-gray.svg     logo complet en gris clair — aperçu du plan vide
│   ├── bird-mark.svg          logo seul — barre haute et pop-in de reprise
│   ├── bird-mark-white.svg    logo inversé — panneaux sombres
│   ├── favicon.svg            favicon (carré arrondi + logo centré)
│   └── icon-180/192/512.png   icônes PWA
├── js/
│   ├── fabric.min.js          moteur canvas (Fabric.js 5.1)
│   ├── paper-full.min.js      Pathfinder et conversion en chemins (Paper.js)
│   ├── io.js                  échange : SVG, PDF/AI, EPS, export PDF, IndexedDB
│   ├── eps-import.js          interpréteur PostScript (Illustrator niveau 2)
│   ├── history.js             historique incrémental (interning d’objets, budget en octets)
│   ├── commands.js            registre de commandes — clavier, menu natif, aide
│   ├── native.js              pont Tauri : dialogues, disque, événements de menu
│   ├── theme.js               bascule jour / nuit (data-theme + localStorage)
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
Bird.version                         // '2.3.0'
Bird.document.new()                  // nouveau document
Bird.document.payload()              // projet sérialisé (tous les plans)
Bird.document.load(payload)          // ouvre un projet
Bird.document.open(file)             // importe un File (tous formats)
Bird.io.importPDF(arrayBuffer)       // → { svg, width, height, pages, page }
Bird.io.pdfPageCount(arrayBuffer)    // → { pages, sizes:[{ index, width, height }] }
Bird.io.svgPagesToPDF([{ svg, width, height }])  // → PDF multi-pages
Bird.io.importEPS(arrayBuffer)       // → groupe Fabric
Bird.io.importSVG(svgText)
Bird.export({ format:'pdf', scope:'document' })   // → objet de résultat (voir ci-dessous)
Bird.exportSVG({ background:'transparent' })
Bird.zoom.selection()

Bird.pages.count()                   // plans de travail
Bird.pages.go(1)
Bird.pages.add('Plan 3')

Bird.view.rulers(true)               // règles / grille / magnétisme
Bird.theme.get() / .set('dark') / .toggle()   // 'light' | 'dark'
Bird.view.grid(false)
Bird.view.snap(true)

Bird.widgets.dockAll()               // panneaux détachables
Bird.widgets.detach('layers')

BirdPlugins.list()                   // manifestes enregistrés
BirdPlugins.open('motif-vectoriel')  // ouvre le tiroir de réglages
BirdPlugins.toggle('mon-plugin')     // active / désactive
```

#### `Bird.export(opts)` — une seule forme de retour, tous formats

```js
const res = await Bird.export({
  format: 'pdfx',            // 'svg' | 'pdf' | 'pdfx' | 'png' | 'jpg' | 'webp'
  scope: 'document',         // 'document' | 'selection' | 'pages'
  scale: 2,                  // raster uniquement
  background: 'artboard',    // 'artboard' | 'transparent' | 'white'
  bleed: 0,                  // pdfx uniquement
  filename: 'affiche',       // sans extension
  download: true             // false = renvoyer sans enregistrer
});

// Résout toujours vers le même objet — jamais `null`, jamais un Blob nu :
//   res.ok          booléen, false en cas d'échec
//   res.format      format réellement produit
//   res.filename    nom proposé, extension comprise
//   res.blob        Blob, toujours présent en cas de succès
//   res.bytes       Uint8Array (pdf, pdfx, pages)
//   res.dataURL     chaîne (png, jpg, webp)
//   res.warnings    string[] (pdfx : profil ICC absent, objet ignoré…)
//   res.downloaded  un fichier a-t-il été écrit
//   res.error       message lorsque ok vaut false
```

`returnBlob` / `returnDataURL` restent acceptés comme alias de
`download: false` : un appel existant garde son sens « n’enregistre pas » au
lieu de déclencher un téléchargement inattendu.

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

Le script `sync` extrait la coquille de l’éditeur **et l’ordre de chargement des
scripts** depuis `../index.html`, puis copie les assets sous
`public/assets/bird/` : toute modification de l’interface doit être suivie d’un
`npm run sync`. Ajouter un fichier au moteur ne demande aucune retouche
d’`editor.astro` — et la CI échoue si un script présent sur disque n’est pas
chargé par l’éditeur.

## Moteur Rust

`rust/` est un espace de travail Cargo indépendant (aucun Node requis) :

- `bird-core` — lecture/écriture du format `.plume`, géométrie, export SVG/PDF/EPS, validation, serveur statique ;
- `bird-cli` — `inspect`, `validate`, `to-svg`, `to-pdf`, `to-eps`, `serve`.

```bash
cd rust
cargo test                  # 14 tests
cargo clippy -- -D warnings
cargo run -p bird-cli -- inspect examples/sample.plume
```

Sous Windows, `scripts/build.ps1` détecte MSVC ou MinGW-W64 WinLibs et teste
puis compile la CLI ; `scripts/build.sh` fait de même sous Unix.

## Application de bureau

`desktop/` est une coquille **Tauri 2** autour du même moteur. Ce qu’elle
ajoute :

- un **menu système** (Fichier, Édition, Objet, Affichage, Fenêtre, Aide)
  portant tous les raccourcis Adobe/Figma. Ils vivent au niveau de l’OS : ils
  restent actifs même quand le plan de travail n’a pas le focus ;
- l’**accès disque natif** : `Ctrl+S` écrit au chemin courant, `Ctrl+Maj+S`
  ouvre le dialogue, chaque export (SVG, PDF, PDF/X, PNG, JPG, WEBP) produit un
  vrai fichier au lieu d’encombrer « Téléchargements » ;
- une fenêtre d’application dont le titre suit le document ouvert, plus
  l’association des fichiers `.plume` / `.bird`.

Le menu ne contient **aucune logique** : il émet `bird://command` avec un
identifiant et le moteur exécute la commande correspondante. Au démarrage,
`app_info` renvoie la liste des accélérateurs réellement acceptés par la
plateforme : si une combinaison est refusée (certains gestionnaires de fenêtres
Linux), le clavier du webview la reprend au lieu de la laisser morte. Et comme
un accélérateur géré par le menu n’atteint jamais le webview, aucune commande ne
peut s’exécuter deux fois.

```bash
cd desktop
npm install
npm run icons     # génère .ico / .icns / png depuis icons/icon-512.png
npm run dev       # fenêtre native
npm run build     # installeur de l’OS courant
```

Les installeurs macOS et Linux ne peuvent pas être produits depuis Windows :
`.github/workflows/desktop.yml` les construit sur les runners correspondants, à
chaque push et à chaque tag `v*`.

### Télécharger

Tout est sur la **[page des releases](https://github.com/zigmoon/bird/releases/latest)**.
Choisissez le fichier de votre machine :

| Machine | Fichier | Installation |
|---|---|---|
| macOS Apple Silicon (M1–M4) | `Bird_*_aarch64.dmg` | ouvrir le `.dmg`, glisser Bird dans *Applications* |
| macOS Intel | `Bird_*_x64.dmg` | idem |
| Windows | `Bird_*_x64-setup.exe` | l’exécuter (ou le `.msi` pour un déploiement géré) |
| Linux, toute distribution | `Bird_*_amd64.AppImage` | `chmod +x Bird_*.AppImage`, puis l’exécuter — rien à installer |
| Debian / Ubuntu | `Bird_*_amd64.deb` | `sudo apt install ./Bird_*.deb` |
| Fedora / RHEL | `Bird-*-1.x86_64.rpm` | `sudo dnf install ./Bird-*.rpm` |

Les paquets ne sont **ni signés ni notariés** — il n’y a ni certificat Apple ni
clé de signature Windows dans ce dépôt, et prétendre le contraire ne ferait que
déplacer l’échec chez l’utilisateur. Conséquences, en entier :

- **macOS** : le premier lancement demande un clic droit → *Ouvrir*, ou
  `xattr -dr com.apple.quarantine /Applications/Bird.app`.
- **Windows** : SmartScreen affiche « éditeur inconnu » → *Informations
  complémentaires* → *Exécuter quand même*.
- **Linux** : l’AppImage peut nécessiter FUSE 2 (`libfuse2`) sur les
  distributions récentes ; le `.deb` et le `.rpm` n’ont pas cette contrainte.

---

## Développement

Aucune compilation pour la version principale :

```bash
npx serve .          # http://localhost:3000
```

La sauvegarde locale est déclenchée 1,2 s après chaque modification, et à la fermeture.
Les bibliothèques PDF/EPS ne sont téléchargées qu’au premier import ou export concerné.
Les préférences d’interface (widgets détachés, plug-ins actifs, réglages de plug-ins) vivent dans `localStorage` et n’entrent jamais dans le fichier projet.

Deux espaces de coordonnées, et les mélanger ne fait aucun bruit :

* `canvas.getPointer(e)` renvoie des coordonnées **document** (il défait
  `viewportTransform`) ; `canvas.getPointer(e, true)` renvoie des pixels
  **canvas**. Tout ce qui place ou sélectionne un objet veut du document — mais
  l’ancre du zoom veut du canvas. Passer des coordonnées document à
  `zoomAtPoint` faisait dériver toute la vue à chaque cran de molette (35 px en
  cinq crans, mesuré). `canvasPointFromEvent()` calcule le point canvas
  directement depuis l’évènement et le rectangle du canvas, ce qui évite aussi le
  cache `_pointer` que `getPointer(e, true)` peut rejouer.
* Chaque trait de 1 px est calé sur la grille des pixels **physiques**, pas sur
  `+0,5` CSS : `Math.round(v * dpr) / dpr + 0.5 / dpr` avec `lineWidth: 1 / dpr`.
  L’idiome `+0,5` n’est juste qu’à DPR 1 ; à 1,5 (cette machine) le cadre du plan
  bavait sur deux pixels, et le flou changeait à chaque cran de zoom — le cadre
  semblait donc se décaler tout seul.

### Invariants d’interface, vérifiés avant chaque build

`node scripts/check-ui.mjs` (lancé en CI avant le build Astro) encode cinq
régressions déjà livrées, invisibles côté code et évidentes côté utilisateur :

| Contrôle | Le bug qu’il empêche |
|---|---|
| Aucune couleur `stroke`/`fill` littérale dans le CSS | `.btn.is-on svg { stroke: #fff }` avait survécu à l’ancien état actif sombre ; l’état étant devenu clair, les icônes étaient blanches sur fond blanc |
| Aucune couleur chromatique dans le CSS, le JS ou le HTML | l’état actif des bascules était bleu (`#eef4ff` / `#1677ff`) : hors DA, noir, blanc et gris |
| Un fichier nommé `*white*` doit contenir du blanc | `bird-mark-white.svg` contenait `#0C0C0F`, exactement la couleur du panneau du splash derrière lui |
| Tout asset référencé doit exister | Un paquet de déploiement pouvait omettre `css/fonts/` ; les `@font-face` échouaient en silence et la page retombait sur une police système |
| Aucun module n’appelle `BirdI18n.t()` | un module écrivait un libellé traduit dans le DOM ; i18n le relisait comme une écriture de l’application et le figeait comme source — « Apparence » restait « Appearance » après un retour au français |

Une exception légitime s’écrit `check-ui:allow <raison>` (ou `i18n:allow
<raison>` pour le dernier) sur la même ligne.

### Cache : la règle à ne pas oublier

Chaque asset est appelé avec une clé de version — `css/style.css?v=2.1.1`,
`icons/bird-mark.svg?v=2.1.1`, y compris les petites icônes d’outils. Deux
oublis successifs ont laissé un ancien logo à l’écran : le service worker de la
version Astro sert `/assets/**` en **cache-first**, et `.htaccess` cache les SVG
un mois. Une URL sans `?v=` est donc immuable chez le visiteur.

Trois gestes vont ensemble à chaque changement d’asset :

1. changer le `?v=` de l’asset concerné ;
2. changer `CACHE` dans `astro/public/sw.js` (`bird-v2.1.1`) — sans quoi les
   visiteurs déjà venus gardent l’ancien fichier ;
3. relancer `node scripts/pack-ftp.mjs` pour que le paquet statique suive.

### Empaqueter pour un serveur statique

```bash
node scripts/pack-ftp.mjs          # → bird-ftp-<version>.zip, tout sous bird/
node scripts/pack-ftp.mjs --flat   # → fichiers à la racine de l'archive
```

Liste blanche, pas « tout sauf » : seuls `index.html`, `manifest.webmanifest`,
`llms.txt` et les arborescences `css/`, `js/`, `icons/`, `plugins/` entrent dans
l’archive. Rien de `astro/`, `rust/`, `desktop/`, `.git` ou `node_modules` ne peut
fuiter sur le serveur.

Sans `--flat`, tout est rangé sous un unique dossier `bird/` : un seul glisser-
déposer, quelle que soit la cible. Avec `--flat`, l’archive **est** la racine du
site (`index.html` à côté de `css/`, `js/`, `icons/`), ce qu’attend un panneau
d’hébergement qui décompresse une archive au premier niveau.

### Héberger dans un sous-dossier

Bird fonctionne tel quel à l’adresse `https://exemple.com/bird/` : toutes les
références sont relatives (`css/…`, `js/…`, `icons/…`, `manifest.webmanifest`),
il n’y a aucun chemin absolu dans le balisage, la feuille de style ou le
JavaScript, et la version autonome n’enregistre aucun service worker — aucun
scope ne peut donc s’échapper du dossier. Le plug-in livré est résolu depuis
l’URL de `js/plugins.js`, pas depuis un chemin figé.

Deux points à vérifier côté serveur :

* **Le slash final compte.** `/bird` doit rediriger vers `/bird/`, sinon le
  navigateur résout `css/style.css` par rapport au dossier parent et la page
  s’affiche sans style. Apache (`mod_dir`) et nginx le font par défaut pour un
  vrai dossier — ne désactivez pas ce comportement.
* **`.htaccess` est un fichier caché.** La plupart des clients FTP le masquent :
  vérifiez qu’il a bien été envoyé. Il est facultatif (types MIME, gzip, durées
  de cache) et sans effet sur nginx.

Servez en **HTTPS** : l’API presse-papiers et l’accès direct aux fichiers
exigent un contexte sécurisé. Sans lui, les téléchargements simples continuent
de fonctionner, mais « copier le rendu » et l’écriture directe sur le disque non.

`localStorage` et IndexedDB sont liés à l’**origine**, pas au chemin : une autre
application à `exemple.com/bird2/` les partage. Toutes les clés écrites par Bird
sont préfixées (`bird.lang`, `bird.theme`, `bird_doc_v2`, `bird-db`,
`bird-fonts`, `bird_plugins_*`) : la cohabitation est donc sûre tant que l’autre
application n’utilise pas le même préfixe.

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
