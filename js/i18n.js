/* Bird — interface language.
 *
 * French is the source language: the markup and the scripts are written in
 * French. English is the DEFAULT interface language, French is an option in
 * Preferences. Rather than duplicating every string in two templates, this
 * module translates the live DOM — text nodes and the four attributes a user
 * can actually see — and exposes T() for strings assembled in code.
 *
 * Why a dictionary keyed by the French text instead of data-i18n keys:
 * most messages are produced dynamically (toasts, shortcut sheet, layer rows).
 * Keying on the text means both static and generated content go through the
 * same table, and a new message is translated the moment it is added to the
 * table — no attribute to remember on each element.
 *
 * The original French is stored on the node itself (`__birdFr`, `__birdAttr`),
 * so switching language is lossless and idempotent: French is restored from
 * the node, never re-derived.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'bird.lang';
  var DEFAULT_LANG = 'en';
  var LANGS = ['en', 'fr'];
  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  /* ── Dictionary : français → English ───────────────────────────
     Insensible à l'apostrophe typographique (’ et ') et aux espaces
     insécables : le source mélange les deux, la comparaison non. */
  var EN = {
    /* ── Marque, écran de démarrage, fenêtre ── */
    'Bird — éditeur vectoriel': 'Bird — vector editor',
    'Bird — Éditeur vectoriel gratuit | Import PDF/AI, SVG, export PDF':
      'Bird — Free vector editor | PDF/AI, SVG import, PDF export',
    'Bird — retour au document': 'Bird — back to document',
    'ÉDITEUR VECTORIEL': 'VECTOR EDITOR',
    'ATELIER VECTORIEL': 'VECTOR STUDIO',
    'LOCAL-FIRST VECTOR STUDIO': 'LOCAL-FIRST VECTOR STUDIO',
    'v2.1.2 — anglais par défaut · français dans les préférences':
      'v2.1.2 — English by default · French in Preferences',
    'v2.1.1 — logo unifié · monochrome strict': 'v2.1.1 — unified logo · strict monochrome',
    'Créateurs': 'Authors',
    'Chargement…': 'Loading…',
    'Bon retour': 'Welcome back',
    'Une session précédente a été trouvée.': 'A previous session was found.',
    'Créez un nouveau document ou ouvrez un fichier enregistré.':
      'Create a new document or open a saved file.',
    'Reprendre le document': 'Resume document',
    'Ouvrir depuis l’ordinateur': 'Open from computer',
    "Ouvrir depuis l'ordinateur": 'Open from computer',
    'Nouveau document': 'New document',
    'Modifications non enregistrées': 'Unsaved changes',
    'pour les raccourcis': 'for shortcuts',

    /* ── Barre haute ── */
    'Ouvrir': 'Open',
    'Ouvrir un fichier (.plume, SVG, PDF, AI, EPS…)': 'Open a file (.plume, SVG, PDF, AI, EPS…)',
    'Enregistrer': 'Save',
    'Enregistrer le fichier .plume (Ctrl+S)': 'Save the .plume file (Ctrl+S)',
    'Annuler': 'Undo',
    'Annuler (Ctrl+Z)': 'Undo (Ctrl+Z)',
    'Rétablir': 'Redo',
    'Rétablir (Ctrl+Shift+Z)': 'Redo (Ctrl+Shift+Z)',
    'Grouper': 'Group',
    'Grouper la sélection': 'Group selection',
    'Grouper la sélection (Ctrl+G)': 'Group selection (Ctrl+G)',
    'Dégrouper': 'Ungroup',
    'Dégrouper la sélection': 'Ungroup selection',
    'Dégrouper la sélection (Ctrl+Shift+G)': 'Ungroup selection (Ctrl+Shift+G)',
    'Règles': 'Rulers',
    'Règles (Ctrl+R) — afficher ou masquer': 'Rulers (Ctrl+R) — show or hide',
    'Grille': 'Grid',
    'Grille (Ctrl+\') — afficher ou masquer': 'Grid (Ctrl+\') — show or hide',
    'Magnétisme': 'Snapping',
    'Magnétisme (Ctrl+;) — repères, grille et objets': 'Snapping (Ctrl+;) — guides, grid and objects',
    'Outils vectoriels': 'Vector tools',
    'Créer avec l’IA': 'Create with AI',
    "Créer avec l'IA": 'Create with AI',
    'Créer un dessin vectoriel avec l’IA': 'Create a vector drawing with AI',
    'Préférences': 'Preferences',
    'Exporter': 'Export',
    'Exporter le document': 'Export the document',
    'EXPORT ▾': 'EXPORT ▾',
    'EXPORTER': 'EXPORT',
    'ANNULER': 'CANCEL',
    'COPIER': 'COPY',
    'APPLIQUER': 'APPLY',
    'IMPORTER': 'IMPORT',
    'GÉNÉRER LE VECTEUR': 'GENERATE VECTOR',

    /* ── Outils ── */
    'Sélection': 'Select',
    'Sélection (V)': 'Select (V)',
    '· Sélection': '· Select',
    'Plume': 'Pen',
    'Plume (P) — clic = sommet, drag = courbe': 'Pen (P) — click = anchor, drag = curve',
    'Texte': 'Text',
    'Texte (T)': 'Text (T)',
    '· Texte': '· Text',
    'Crayon': 'Pencil',
    'Crayon (N) — tracé libre': 'Pencil (N) — freehand',
    'Pinceau vectoriel': 'Vector brush',
    'Pinceau vectoriel (B)': 'Vector brush (B)',
    'Style de pinceau': 'Brush style',
    'Pipette (I) — prélever une couleur': 'Eyedropper (I) — pick a colour',
    'Main / déplacer (H ou Espace)': 'Hand / pan (H or Space)',
    'Rectangle': 'Rectangle',
    'Rectangle (R)': 'Rectangle (R)',
    'Ellipse': 'Ellipse',
    'Ellipse (E)': 'Ellipse (E)',
    'Ligne': 'Line',
    'Ligne (L)': 'Line (L)',
    'Étoile': 'Star',
    'Polygone': 'Polygon',
    'Formes (Rectangle, Ellipse, Ligne, Étoile, Polygone)':
      'Shapes (Rectangle, Ellipse, Line, Star, Polygon)',
    'Image': 'Image',
    'Importer une image': 'Import an image',

    /* ── Aperçu du plan vide ── */
    'Choisissez un outil et dessinez,': 'Pick a tool and draw,',
    'ou déposez un fichier — SVG, PDF, AI, EPS.': 'or drop a file — SVG, PDF, AI, EPS.',
    'Zoom molette · Espace = déplacer ·': 'Scroll to zoom · Space = pan ·',
    'règles': 'rulers',
    '· Plug-ins': '· Plug-ins',

    /* ── Réglages / propriétés ── */
    'PROPRIÉTÉS': 'PROPERTIES',
    'Document': 'Document',

    'Apparence': 'Appearance',
    'Remplissage': 'Fill',
    'Contour': 'Stroke',
    'Sans fond': 'No fill',
    'Sans contour': 'No stroke',
    'Couleur': 'Colour',
    'Nuancier': 'Swatches',
    'Ajouter au document': 'Add to document',
    '+ Ajouter la couleur': '+ Add colour',
    'Dégradé': 'Gradient',
    'Dégradé linéaire': 'Linear gradient',
    'Dégradé radial': 'Radial gradient',
    'Aucun dégradé': 'No gradient',
    'Linéaire': 'Linear',
    'Radial': 'Radial',
    'Angle': 'Angle',
    'Direction': 'Direction',
    'Opacité': 'Opacity',
    'Transparence': 'Transparency',
    'Épaisseur': 'Weight',
    'Extrémités': 'Caps',
    'Jonctions': 'Joins',
    'Tirets': 'Dashes',
    'Pointillés': 'Dashed',
    'Continu': 'Continuous',
    'Aucun': 'None',
    'Taille': 'Size',
    'Position': 'Position',
    'Disposition': 'Layout',
    'Alignement': 'Alignment',
    'Aligner à gauche': 'Align left',
    'Aligner à droite': 'Align right',
    'Aligner en haut': 'Align top',
    'Aligner en bas': 'Align bottom',
    'Centrer': 'Centre',
    'Centrer horizontalement': 'Centre horizontally',
    'Centrer verticalement': 'Centre vertically',
    'Centrer sur le plan de travail': 'Centre on artboard',
    'Centrer horizontalement sur le plan de travail': 'Centre horizontally on artboard',
    'Centrer verticalement sur le plan de travail': 'Centre vertically on artboard',
    'Alignement plan de travail': 'Artboard alignment',
    'Écarts égaux horizontaux (3 objets min)': 'Equal horizontal spacing (min. 3 objects)',
    'Écarts égaux verticaux (3 objets min)': 'Equal vertical spacing (min. 3 objects)',
    'Écart': 'Spacing',
    'Avancer': 'Forward',
    'Reculer': 'Backward',
    'Premier plan': 'Bring to front',
    'Arrière-plan': 'Send to back',
    'Miroir horizontal': 'Flip horizontal',
    'Miroir vertical': 'Flip vertical',
    'Miroir': 'Flip',
    'Dupliquer': 'Duplicate',
    'Dupliquer (Ctrl+D)': 'Duplicate (Ctrl+D)',
    'Supprimer (Suppr)': 'Delete (Del)',
    'Verrouiller': 'Lock',
    'Déverrouiller': 'Unlock',
    'Masquer': 'Hide',
    'Masquer / afficher la sélection (Ctrl+3)': 'Hide / show selection (Ctrl+3)',
    'Verrouiller / déverrouiller la sélection (Ctrl+2)': 'Lock / unlock selection (Ctrl+2)',
    'Calques': 'Layers',
    'Forme': 'Shape',
    'Tracé': 'Path',
    'Convertir en chemin': 'Convert to path',
    'Convertir la forme en chemin éditable': 'Convert the shape into an editable path',
    'Modifier le tracé': 'Edit path',
    'Simplifier': 'Simplify',
    'Réduire le nombre de points du tracé': 'Reduce the number of path points',
    'Décalage': 'Offset',
    'Décaler le tracé': 'Offset path',
    'Décaler le tracé vers l\'extérieur (valeur positive) ou l\'intérieur':
      'Offset the path outwards (positive value) or inwards',
    'Contour de trait': 'Outline stroke',
    'Transformer le contour en forme fermée': 'Turn the stroke into a closed shape',
    'Blend': 'Blend',
    'Interpoler entre deux objets sélectionnés': 'Blend between two selected objects',
    'Créer un symbole': 'Create symbol',
    'Créer un symbole à partir de la sélection': 'Create a symbol from the selection',
    'Placer': 'Place',
    'Placer une instance du dernier symbole': 'Place an instance of the last symbol',
    'Pathfinder': 'Pathfinder',
    'Union': 'Union',
    'Union — fusionner les formes': 'Union — merge the shapes',
    'Intersection': 'Intersection',
    'Intersection — garder la zone commune': 'Intersection — keep the overlapping area',
    'Soustraction': 'Subtract',
    'Soustraction — retirer la forme du dessus': 'Subtract — remove the top shape',
    'Exclusion': 'Exclude',
    'Exclusion — garder tout sauf la zone commune': 'Exclude — keep everything but the overlap',
    'Police': 'Font',
    'Polices': 'Fonts',
    'Charger une police…': 'Load a font…',
    'Charger un fichier de police': 'Load a font file',
    'Chargez des .ttf/.otf pour que le texte devienne des courbes exactes à l\'export.':
      'Load .ttf/.otf files so text becomes exact outlines on export.',
    'Texte → courbes': 'Text → outlines',
    'Convertir le texte en courbes (aucune police requise à l\'impression)':
      'Convert text to outlines (no font needed for printing)',
    'Vectoriser (courbes)': 'Vectorise (outlines)',
    'Conserver le texte': 'Keep text',
    'Gras': 'Bold',
    'Italique': 'Italic',
    'Souligné': 'Underline',
    'Barré': 'Strikethrough',
    'Lissage': 'Smoothing',
    'Arrondi': 'Corner radius',
    'Rayon': 'Radius',
    'Rayon int.': 'Inner radius',
    'Points': 'Points',
    'Échelle': 'Scale',

    'Pression du stylet': 'Stylus pressure',
    'Densité +': 'Density +',
    'Densité −': 'Density −',
    'Incrustation': 'Overlay',
    'Éclaircir': 'Lighten',
    'Obscurcir': 'Darken',
    'Lumière douce': 'Soft light',
    'Lumière crue': 'Hard light',
    'Différence': 'Difference',

    'Teinte': 'Hue',
    'Saturation': 'Saturation',
    'Luminosité': 'Brightness',
    'Normal': 'Normal',
    'Produit': 'Multiply',
    'Écran': 'Screen',
    'Fusion': 'Merge',
    'Mixte': 'Mixed',
    'Néon': 'Neon',
    'Encre': 'Ink',
    'Marker': 'Marker',
    'Spray': 'Spray',
    'Aucun (noir composite)': 'None (composite black)',
    'Noir de soutien': 'Rich black',
    'Taux d’encre': 'Ink coverage',
    'Blanc': 'White',
    'Transparent': 'Transparent',
    'Fond': 'Background',
    'Fond blanc': 'White background',
    'Fond transparent': 'Transparent background',
    'Votre idée': 'Your idea',
    'Type de génération': 'Generation type',
    'Modèle': 'Template',
    'Modèles gratuits disponibles': 'Free templates available',
    'Actualiser les modèles': 'Refresh templates',
    'Actualiser les modèles OpenRouter': 'Refresh OpenRouter templates',
    'Clé OpenRouter': 'OpenRouter key',
    'Clé DeepSeek': 'DeepSeek key',
    'Fournisseur': 'Provider',
    'OpenRouter': 'OpenRouter',
    'Recraft via OpenRouter': 'Recraft via OpenRouter',
    'DeepSeek': 'DeepSeek',
    'La clé reste dans cet onglet et n’est jamais incluse dans le fichier projet.':
      'The key stays in this tab and is never written into the project file.',
    'ex. 6 3 2 3': 'e.g. 6 3 2 3',
    'Une affiche vectorielle Bauhaus, formes géométriques rouges et noires, composition asymétrique…':
      'A Bauhaus vector poster, red and black geometric shapes, asymmetric composition…',

    /* ── Plans de travail ── */
    'Plan de travail': 'Artboard',
    'Plans de travail': 'Artboards',

    '+ Plan': '+ Artboard',
    'Plan 1': 'Artboard 1',
    'Ajouter un plan de travail': 'Add an artboard',
    'Dupliquer le plan actif': 'Duplicate the active artboard',
    'Plan précédent': 'Previous artboard',
    'Plan suivant': 'Next artboard',
    'Plan précédent (Ctrl+Page↑)': 'Previous artboard (Ctrl+Page↑)',
    'Plan suivant (Ctrl+Page↓)': 'Next artboard (Ctrl+Page↓)',
    'Première page': 'First page',
    'Page': 'Page',
    'Tous les plans de travail': 'All artboards',
    'Tous les plans de travail (PDF)': 'All artboards (PDF)',
    'Tout le plan de travail': 'Whole artboard',
    'Sélection uniquement': 'Selection only',
    'Toutes les pages → un plan par page': 'All pages → one artboard per page',
    'Une page précise': 'A specific page',
    'Comme avant : un seul plan de travail.': 'As before: a single artboard.',
    'Ce PDF contient plusieurs pages.': 'This PDF has several pages.',
    'Chaque page devient un plan de travail à son format exact, placé à sa taille réelle.':
      'Each page becomes an artboard at its exact format, placed at actual size.',
    'Choisissez le numéro ci-dessous.': 'Choose the page number below.',
    'Importer un PDF': 'Import a PDF',
    'Fond perdu': 'Bleed',
    'Format': 'Format',
    'Personnalisé': 'Custom',
    'Personnalisé…': 'Custom…',
    'Paysage 4:3': 'Landscape 4:3',
    'Portrait 3:4': 'Portrait 3:4',
    'Carré 1:1': 'Square 1:1',
    'Large 16:9': 'Wide 16:9',
    'Mobile 9:16': 'Mobile 9:16',
    'A4 portrait (px)': 'A4 portrait (px)',
    'A4 paysage (px)': 'A4 landscape (px)',
    'A4 portrait 300 dpi': 'A4 portrait 300 dpi',
    'A4 paysage 300 dpi': 'A4 landscape 300 dpi',
    '1920 × 1080 (Full HD)': '1920 × 1080 (Full HD)',
    '1280 × 720 (16:9)': '1280 × 720 (16:9)',
    '1080 × 1080 (carré)': '1080 × 1080 (square)',
    '800 × 800 (logo)': '800 × 800 (logo)',
    'Carré': 'Square',
    'Portée': 'Scope',
    'Grille visible': 'Show grid',

    /* ── Export ── */
    'Options d’export…': 'Export options…',
    'Format d’export': 'Export format',
    'Vectoriel web': 'Web vector',
    'Illustrator / print': 'Illustrator / print',
    'CMJN · imprimeur': 'CMYK · printer',
    'Web léger': 'Lightweight web',
    'SVG — vectoriel': 'SVG — vector',
    'PDF — vectoriel (Illustrator)': 'PDF — vector (Illustrator)',
    'PDF/X-1a — imprimeur (CMJN)': 'PDF/X-1a — printer (CMYK)',
    'PNG — transparent': 'PNG — transparent',
    'JPG — fond blanc': 'JPG — white background',
    'SVG natif': 'Native SVG',
    'SVG par code': 'SVG by code',
    'Le SVG conserve les objets, le texte et les dégradés.':
      'SVG keeps objects, text and gradients.',
    'IMPRIMERIE': 'PRINT',
    'PDF/X-1a:2001': 'PDF/X-1a:2001',
    'Charger un .icc…': 'Load an .icc…',
    'Chargez le profil ICC de votre imprimeur pour un PDF/X de production.':
      'Load your printer’s ICC profile for a production PDF/X.',
    'Bird CMYK (générique)': 'Bird CMYK (generic)',
    'Revenir au profil générique': 'Revert to the generic profile',

    /* ── Préférences ── */
    'Sauvegarde automatique': 'Autosave',
    'Le document est enregistré localement à chaque modification.':
      'The document is saved locally on every change.',
    'Activée': 'Enabled',
    'Réinitialiser': 'Reset',
    'Réinitialiser le document': 'Reset document',
    'Efface le plan de travail et la sauvegarde locale.':
      'Clears the artboard and the local backup.',
    'Langue de l’interface': 'Interface language',
    "Langue de l'interface": 'Interface language',
    'L’anglais est la langue par défaut de Bird.': 'English is Bird’s default language.',
    "L'anglais est la langue par défaut de Bird.": 'English is Bird’s default language.',

    /* ── Panneau droit / widgets ── */
    'Réduire / agrandir le panneau': 'Collapse / expand the panel',
    'Agrandir le panneau': 'Expand the panel',
    'Rattacher tous les widgets': 'Dock all widgets',
    'Replier / déplier': 'Collapse / expand',
    'Plug-ins': 'Plug-ins',
    'Étendez Bird avec des modules. Les plug-ins actifs s’ajoutent à la barre d’outils.':
      'Extend Bird with modules. Active plug-ins are added to the toolbar.',
    'Intégrés': 'Built-in',
    'Installer…': 'Install…',
    'Installer un fichier .plugin.js': 'Install a .plugin.js file',
    'Ouvrir le dossier des plug-ins intégrés': 'Open the built-in plug-ins folder',
    'Chargement des plug-ins…': 'Loading plug-ins…',
    'Désactiver': 'Disable',
    'Activer': 'Enable',
    'Raccourcis clavier': 'Keyboard shortcuts',

    /* ── Règles, repères, zoom ── */
    'Règles : glissez pour créer un repère': 'Rulers: drag to create a guide',
    'Effacer les repères': 'Clear guides',
    'Supprimer tous les repères': 'Delete all guides',
    'Glisser pour déplacer · double-clic pour supprimer':
      'Drag to move · double-click to delete',
    'Zoom avant': 'Zoom in',
    'Zoom arrière': 'Zoom out',
    'Zoom +': 'Zoom +',
    'Zoom −': 'Zoom −',
    'Ajuster à l’écran': 'Fit to screen',
    "Ajuster à l'écran": 'Fit to screen',
    'Ajuster à l’écran (Maj+1)': 'Fit to screen (Shift+1)',
    "Ajuster à l'écran (Maj+1)": 'Fit to screen (Shift+1)',
    'Zoom sur la sélection': 'Zoom to selection',
    'Zoom sur la sélection (Maj+2)': 'Zoom to selection (Shift+2)',
    'Niveau de zoom': 'Zoom level',
    'Cliquer pour saisir un zoom (5–6400 %)': 'Click to type a zoom (5–6400 %)',
    'Taille réelle (100 %)': 'Actual size (100 %)',

    'Groupe': 'Group',

    /* ── Feuille de raccourcis : groupes et commandes ── */
    'Fichier': 'File',
    'Édition': 'Edit',
    'Objet': 'Object',
    'Affichage': 'View',
    'Aide': 'Help',
    'Ouvrir…': 'Open…',
    'Enregistrer sous…': 'Save as…',
    'Importer un fichier…': 'Import a file…',
    'Exporter…': 'Export…',
    'Exporter en PDF/X-1a…': 'Export as PDF/X-1a…',
    'Imprimer…': 'Print…',
    'Rétablir (variante Windows)': 'Redo (Windows variant)',
    'Tout sélectionner': 'Select all',
    'Désélectionner': 'Deselect all',
    'Avancer d’un rang': 'Bring forward',
    'Reculer d’un rang': 'Send backward',
    'Verrouiller / déverrouiller': 'Lock / unlock',
    'Tout déverrouiller': 'Unlock all',
    'Simplifier le tracé': 'Simplify path',
    'Plein écran': 'Full screen',
    'Montrer / masquer': 'Show / hide',
    'Règles affichées': 'Rulers shown',
    'Règles masquées': 'Rulers hidden',
    'Magnétisme activé': 'Snapping on',
    'Magnétisme désactivé': 'Snapping off',
    'Sur macOS : Exporter en PDF, puis Imprimer depuis Aperçu':
      'On macOS: export to PDF, then print from Preview',

    /* ── Messages ── */
    'Analyse du PDF…': 'Reading the PDF…',
    'PDF vectoriel importé ✓': 'Vector PDF imported ✓',
    'Vidéo illisible': 'Unreadable video',
    'Objets groupés': 'Objects grouped',
    'Groupe décomposé': 'Group ungrouped',
    'Ce tracé ne peut pas être édité avec la Plume': 'This path cannot be edited with the Pen',
    'Couleur ajoutée au nuancier ✓': 'Colour added to swatches ✓',
    'Sélectionnez un objet': 'Select an object',
    'Sélection verrouillée ✓': 'Selection locked ✓',
    'Sélection déverrouillée ✓': 'Selection unlocked ✓',
    'Sélection masquée': 'Selection hidden',
    'Sélection affichée ✓': 'Selection shown ✓',
    'Aucun objet verrouillé': 'No locked object',
    'Aucun objet masqué': 'No hidden object',
    'Sélectionnez un texte': 'Select a text object',
    'Forme convertie en chemin ✓': 'Shape converted to path ✓',
    'Repères effacés': 'Guides cleared',
    'Règles affichées (Ctrl+R) — cliquer pour masquer': 'Rulers shown (Ctrl+R) — click to hide',
    'Règles masquées (Ctrl+R) — cliquer pour afficher': 'Rulers hidden (Ctrl+R) — click to show',
    'Vue ajustée': 'View fitted',
    'Réglez une distance non nulle': 'Set a non-zero distance',
    'Décalage impossible': 'Cannot offset',
    'Sélectionnez au moins 3 objets': 'Select at least 3 objects',
    'Sélectionnez au moins 2 formes': 'Select at least 2 shapes',
    'Résultat Pathfinder vide': 'Empty Pathfinder result',
    'Pathfinder impossible sur cette sélection': 'Pathfinder cannot run on this selection',
    'Couleur appliquée ✓': 'Colour applied ✓',
    'Couleur de remplissage définie': 'Fill colour set',
    'Copié': 'Copied',
    'Coupé': 'Cut',
    'Collé': 'Pasted',
    'Collé sur place': 'Pasted in place',
    'Plan dupliqué': 'Artboard duplicated',
    'Plan supprimé': 'Artboard deleted',
    'L’export multi-plans produit un PDF': 'Multi-artboard export produces a PDF',
    "L'export multi-plans produit un PDF": 'Multi-artboard export produces a PDF',
    'Sélectionnez au moins un objet': 'Select at least one object',
    'Composition du PDF…': 'Building the PDF…',
    'Composition du PDF/X-1a…': 'Building the PDF/X-1a…',
    'PDF/X-1a exporté ✓': 'PDF/X-1a exported ✓',
    'Enregistrement annulé': 'Save cancelled',
    'Fichier .plume enregistré ✓': '.plume file saved ✓',
    'Ancien projet migré et ouvert ✓': 'Legacy project migrated and opened ✓',
    'Document ouvert ✓': 'Document opened ✓',
    'Le PDF ne peut pas être copié : exportez-le': 'The PDF cannot be copied: export it',
    'Copié dans le presse-papiers ✓': 'Copied to clipboard ✓',
    'Couleur prélevée et appliquée ✓': 'Colour sampled and applied ✓',
    'Couleur prélevée': 'Colour sampled',
    'Document réinitialisé': 'Document reset',
    'Document vidé': 'Document cleared',
    'Profil ICC chargé ✓': 'ICC profile loaded ✓',
    'Profil ICC générique rétabli': 'Generic ICC profile restored',
    'Police non chargée :': 'Font not loaded:',
    'Contour vectorisé ✓': 'Stroke outlined ✓',
    'Mettre à jour les instances depuis la sélection': 'Update instances from the selection',
    'Sélectionnez une instance': 'Select an instance',
    'Symbole enregistré (aucune instance)': 'Symbol saved (no instance)',
    'Créez d’abord un symbole': 'Create a symbol first',
    "Créez d'abord un symbole": 'Create a symbol first',
    'Aucun symbole.': 'No symbol.',
    'Aucun calque': 'No layer',
    'Fermer': 'Close',
    'Double-clic pour renommer': 'Double-click to rename',
    'Monter': 'Raise',
    'Renommer': 'Rename',
    'Dupliquer le plan': 'Duplicate the artboard',
    'Gratuit · sélection automatique': 'Free · automatic selection',
    'GLM 5.2 · gratuit': 'GLM 5.2 · free',
    'MiniMax M3 · gratuit': 'MiniMax M3 · free',
    'North Mini Code · gratuit': 'North Mini Code · free',
    'DeepSeek R1 · raisonnement': 'DeepSeek R1 · reasoning',
    'GPT-5.6 Luna · économique': 'GPT-5.6 Luna · economical',
    'DeepSeek Chat · V3 · rapide': 'DeepSeek Chat · V3 · fast',
    'DeepSeek Reasoner · R1 · réfléchi': 'DeepSeek Reasoner · R1 · deliberate',
    'Recraft V4.1 Vector · SVG natif': 'Recraft V4.1 Vector · native SVG',
    'Recraft V4.1 Pro Vector · SVG natif': 'Recraft V4.1 Pro Vector · native SVG',
    'Recraft V4 Vector · SVG natif': 'Recraft V4 Vector · native SVG',
    'Dupliquer le plan actif': 'Duplicate the active artboard',
    'Aucun objet': 'No object',
    'Aucun objet Fabric produit': 'No Fabric object produced',
    'Aucun tracé': 'No path',
    'Aucun tracé exploitable': 'No usable path',
    'Aucune page à exporter': 'No page to export',
    'Actualisation des modèles…': 'Refreshing templates…',
    'Création du vecteur…': 'Creating the vector…',
    'Décalage vide': 'Empty offset',
    'Décalage de tracé': 'Path offset',
    'Décompression non prise en charge': 'Decompression not supported',
    'Décrivez le vecteur à créer.': 'Describe the vector you want to create.',
    'Descendre': 'Send backward',
    'Génération impossible': 'Generation failed',
    'Grille affichée': 'Grid shown',
    'Grille masquée': 'Grid hidden',
    'Lecture impossible': 'Cannot read',
    'Plan de travail indisponible': 'Artboard unavailable',
    'Police illisible': 'Unreadable font',
    'Police illisible :': 'Unreadable font:',
    'Rien à simplifier': 'Nothing to simplify',
    'SVG mal formé.': 'Malformed SVG.',
    'SVG impossible à convertir.': 'SVG cannot be converted.',
    'SVG vide après validation.': 'SVG empty after validation.',
    'Vecteur ajouté au document.': 'Vector added to the document.',
    'Version de projet plus récente non prise en charge':
      'A newer project version is not supported',
    'Cet objet n’a pas de contour à vectoriser': 'This object has no stroke to outline',
    "Cet objet n'a pas de contour à vectoriser": "This object has no stroke to outline",
    'Aucun modèle compatible trouvé': 'No compatible template found',
    'Le plug-in n’a pas appelé BirdPlugins.register().':
      'The plug-in did not call BirdPlugins.register().',
    "Le plug-in n'a pas appelé BirdPlugins.register().":
      "The plug-in did not call BirdPlugins.register().",
    'Manifeste introuvable : la propriété `id` est obligatoire.':
      'Manifest missing: the `id` property is required.',
    'Un document doit garder au moins un plan':
      'A document must keep at least one artboard',
    'La réponse ne contient pas de SVG complet.':
      'The response does not contain a complete SVG.',
    'Le modèle n’a pas renvoyé de SVG.': 'The model did not return any SVG.',
    "Le modèle n'a pas renvoyé de SVG.": 'The model did not return any SVG.',
    'OpenRouter n’a pas renvoyé d’image SVG.': 'OpenRouter did not return an SVG image.',
    "OpenRouter n'a pas renvoyé d'image SVG.": 'OpenRouter did not return an SVG image.',
    'Réponse SVG vide ou trop volumineuse.': 'SVG response empty or too large.',
    'Téléchargement du SVG généré impossible.': 'Cannot download the generated SVG.',
    'DeepSeek rédige le SVG en code : formes éditables, pas d’image raster.':
      'DeepSeek writes the SVG as code: editable shapes, no raster image.',
    "DeepSeek rédige le SVG en code : formes éditables, pas d'image raster.":
      "DeepSeek writes the SVG as code: editable shapes, no raster image.",
    'Le routeur gratuit génère du SVG éditable comme code.':
      'The free router generates editable SVG as code.',
    'SVG natif spécialisé, facturé par OpenRouter.':
      'Specialised native SVG, billed by OpenRouter.',
    'Aucun modèle compatible trouvé.': 'No compatible template found.',
    'À l’instant': 'Just now',
    "À l'instant": 'Just now',
    'PDF vectoriel écran, compatible Illustrator. Les polices non standard sont remplacées par Helvetica, Times ou Courier.':
      'Screen vector PDF, Illustrator-compatible. Non-standard fonts are replaced by Helvetica, Times or Courier.',
    'PDF/X-1a:2001 : CMJN uniquement, dégradés en shadings, texte vectorisé, profil ICC déclaré. C’est le fichier à envoyer à l’imprimeur.':
      'PDF/X-1a:2001: CMYK only, gradients as real shadings, text as outlines, declared ICC profile. This is the file to send to a printer.',
    "PDF/X-1a:2001 : CMJN uniquement, dégradés en shadings, texte vectorisé, profil ICC déclaré. C'est le fichier à envoyer à l'imprimeur.":
      "PDF/X-1a:2001: CMYK only, gradients as real shadings, text as outlines, declared ICC profile. This is the file to send to a printer.",
    'PNG transparent, échelle 1× à 4×.': 'Transparent PNG, 1× to 4× scale.',
    'JPG sans transparence : le fond est composité en blanc.':
      'JPG without transparency: the background is composited onto white.',
    'WEBP : meilleur compromis poids/qualité pour le web.':
      'WEBP: best size/quality trade-off for the web.',
    'Chaque plan de travail devient une page du PDF, à son propre format. Le plus proche d’un document Illustrator multi-plans.':
      'Each artboard becomes a PDF page at its own format. The closest thing to a multi-artboard Illustrator document.',
    "Chaque plan de travail devient une page du PDF, à son propre format. Le plus proche d'un document Illustrator multi-plans.":
      "Each artboard becomes a PDF page at its own format. The closest thing to a multi-artboard Illustrator document.",
    'Profil embarqué comme /DestOutputProfile du PDF.':
      'Profile embedded as the PDF /DestOutputProfile.',
    'Sélectionnez un objet d’abord': 'Select an object first',
    "Sélectionnez un objet d'abord": 'Select an object first',
    'Aucune police chargée.': 'No font loaded.',
    'à charger': 'to load',
    '— manquante': '— missing',
    'Plugin retiré': 'Plug-in removed',
    'Plugin «': 'Plug-in “',
    'Plug-in retiré': 'Plug-in removed',
    'Plug-in «': 'Plug-in “',
    'échec': 'failed',
    'désactivé': 'disabled',
    'activé ✓': 'enabled ✓',

    /* ── Divers ── */
    'Charger un fichier .plugin.js': 'Load a .plugin.js file',
    'Tidy ⇔': 'Tidy ⇔',
    'Tidy ⇕': 'Tidy ⇕',
    '↔ Horizontal': '↔ Horizontal',
    '↕ Vertical': '↕ Vertical',
    'Droit': 'Straight',
    'Libre': 'Free',
    'Géométrique': 'Geometric',
    'Éditorial': 'Editorial',
    'Illustré': 'Illustrated',
    'Standard': 'Standard',
    'Défaut': 'Default',
    'Maximum (textes fins)': 'Maximum (thin text)',
    '300 % (standard)': '300 % (standard)',
    '330 % (couche)': '330 % (coated)',
    '240 % (journaux)': '240 % (newspapers)',
    'Biseau': 'Bevel',
    'Couleur 1': 'Colour 1',
    'Couleur 2': 'Colour 2',
    'Masquer / afficher': 'Hide / show',
    'Motif vectoriel': 'Vector pattern',
    'SVG conserve les objets, le texte et les dégradés. Idéal pour le web et l’édition.':
      'SVG keeps objects, text and gradients. Ideal for the web and for publishing.',
    "SVG conserve les objets, le texte et les dégradés. Idéal pour le web et l'édition.":
      "SVG keeps objects, text and gradients. Ideal for the web and for publishing.",
    'Motif': 'Pattern',
    'Icône': 'Icon',
    'Placement': 'Placement',
    'Remplacer la sélection': 'Replace the selection',
    'Tout effacer': 'Clear all',
    'Tout afficher': 'Show all',
    'Coller sur place': 'Paste in place',
    'Corps plus grand': 'Larger body',
    'Corps plus petit': 'Smaller body',
    'Panneau de droite': 'Right panel',
    '0 = automatique (écarts égaux)': '0 = automatic (equal spacing)',
    'Copier le rendu dans le presse-papiers': 'Copy the render to the clipboard',
    'Les opérations d’Illustrator : elles agissent sur la sélection et produisent de vrais objets.':
      'Illustrator’s operations: they act on the selection and produce real objects.',
    "Les opérations d'Illustrator : elles agissent sur la sélection et produisent de vrais objets.":
      "Illustrator's operations: they act on the selection and produce real objects.",
    'Textures répétées sans raccord : en un objet léger ou en vraies formes vectorielles.':
      'Seamless repeating textures: as a lightweight object or as real vector shapes.',
    'Déposez vos fichiers sur le plan de travail': 'Drop your files on the artboard',
    'SVG · PDF · AI · EPS · PNG · JPG · WEBP · GIF · WEBM':
      'SVG · PDF · AI · EPS · PNG · JPG · WEBP · GIF · WEBM'
  };

  /* ── Messages construits : le nombre est déjà dans la chaîne ──
     Le texte final arrive dans un seul nœud, on pattern donc sur la phrase
     entière. Cela évite de réécrire chaque appel de toast(). */
  var PATTERNS = [
    [/^(\d+) pages…$/, '$1 pages…'],
    [/^PDF page (\d+)\/(\d+) importée ✓$/, 'PDF page $1/$2 imported ✓'],
    [/^Annuler \(Ctrl\+Z\) — (\d+) état\(s\), (.+)$/, function (all, n, label) {
      return 'Undo (Ctrl+Z) — ' + n + ' state(s), ' + (LOOKUP[norm(label)] || label);
    }],
    [/^(\d+) modèle\(s\) compatible\(s\) trouvé\(s\)\.$/, '$1 compatible template(s) found.'],
    [/^Police « (.+) » introuvable\. Chargez le fichier \.ttf\/\.otf dans Préférences → Polices\.$/,
      'Font "$1" not found. Load the .ttf/.otf file in Preferences → Fonts.'],
    [/^« (.+) » introuvable\. Chargez le fichier \.ttf\/\.otf dans Préférences → Polices\.$/,
      '"$1" not found. Load the .ttf/.otf file in Preferences → Fonts.'],
    [/^Ajoutez votre clé (.+)\.$/, 'Add your $1 key.'],
    [/^Bibliothèque inconnue : (.+)$/, 'Unknown library: $1'],
    [/^(.+) · détaché$/, '$1 · detached'],
    [/^(\d+) plan\(s\) importé\(s\) depuis le PDF ✓$/, '$1 artboard(s) imported from the PDF ✓'],
    [/^(\d+) objet\(s\) déverrouillés ✓$/, '$1 object(s) unlocked ✓'],
    [/^(\d+) objet déverrouillé ✓$/, '$1 object unlocked ✓'],
    [/^(\d+) objets affichés ✓$/, '$1 objects shown ✓'],
    [/^(\d+) objet affiché ✓$/, '$1 object shown ✓'],
    [/^(\d+) instance\(s\) mises à jour ✓$/, '$1 instance(s) updated ✓'],
    [/^(\d+) étapes de blend créées ✓$/, '$1 blend steps created ✓'],
    [/^(\d+) objets? supprimés? ✓$/, '$1 object(s) deleted ✓'],
    [/^Symbole « (.+) » créé ✓$/, 'Symbol “$1” created ✓'],
    [/^Police « (.+) » chargée ✓$/, 'Font “$1” loaded ✓'],
    [/^Plan « (.+) » dupliqué ✓$/, 'Artboard “$1” duplicated ✓'],
    [/^Plan « (.+) » supprimé ✓$/, 'Artboard “$1” deleted ✓'],
    [/^Plan « (.+) » ajouté$/, 'Artboard “$1” added'],
    [/^Plan « (.+) »$/, 'Artboard “$1”'],
    [/^Plan « (.+) » et ses (\d+) objet\(s\) \?$/, 'Artboard “$1” and its $2 object(s)?'],
    [/^Supprimer « (.+) » et ses (\d+) objet\(s\) \?$/, 'Delete “$1” and its $2 object(s)?'],
    [/^Exporté$/, 'Exported'],
    [/^Enregistré : (.+)$/, 'Saved: $1'],
    [/^PDF\/X-1a prêt · (.+)$/, 'PDF/X-1a ready · $1'],
    [/^Simplifié : (.+)$/, 'Simplified: $1'],
    [/^Tracé décalé de (.+)$/, 'Path offset by $1'],
    [/^(.+) en courbes ✓$/, '$1 to outlines ✓'],
    [/^(.+) ajouté ✓$/, '$1 added ✓'],
    [/^(\d+) états?, (.+)$/, '$1 state(s), $2'],
    [/^Détacher « (.+) » en panneau flottant$/, 'Detach “$1” as a floating panel'],
    [/^Plug-in « (.+) » installé$/, 'Plug-in “$1” installed'],
    [/^Actualiser les modèles (.+)$/, 'Refresh $1 templates'],
    [/^(.+) — manquante$/, '$1 — missing'],
    [/^(.+) — Éditeur vectoriel$/, '$1 — Vector editor'],
    [/^Analyse du PDF…$/, 'Reading the PDF…'],
    [/^Ce profil n’est pas CMJN \((.+)\)$/, 'This profile is not CMYK ($1)'],
    [/^Ce profil n'est pas CMJN \((.+)\)$/, 'This profile is not CMYK ($1)'],
    [/^Sélectionnez (.+)$/, 'Select $1'],
    [/^Zoom ([\d.]+) %$/, 'Zoom $1 %']
  ];

  /* ── Normalisation : le source mélange ’ et ', et parfois une espace
     insécable. On compare sur une forme normalisée, on réécrit avec la
     valeur du dictionnaire. ── */
  function norm(s) {
    return String(s)
      .replace(/\u2019/g, "'")
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var LOOKUP = Object.create(null);
  var REVERSE = Object.create(null);
  (function build() {
    for (var fr in EN) {
      if (!Object.prototype.hasOwnProperty.call(EN, fr)) continue;
      var k = norm(fr);
      if (!(k in LOOKUP)) LOOKUP[k] = EN[fr];
      var rk = norm(EN[fr]);
      if (!(rk in REVERSE)) REVERSE[rk] = fr;
    }
  })();

  var lang = DEFAULT_LANG;
  var suppress = 0;
  var observer = null;
  var listeners = [];

  function translate(str) {
    if (str == null) return str;
    if (lang === 'fr') return str;
    var lead = (/^\s*/.exec(str) || [''])[0];
    var trail = (/\s*$/.exec(str) || [''])[0];
    var core = str.slice(lead.length, str.length - trail.length);
    if (!core) return str;
    var key = norm(core);
    if (Object.prototype.hasOwnProperty.call(LOOKUP, key)) return lead + LOOKUP[key] + trail;
    for (var i = 0; i < PATTERNS.length; i++) {
      var p = PATTERNS[i];
      var m = norm(core).match(p[0]);
      if (!m) continue;
      // Le remplacement peut être une fonction : les messages composés
      // contiennent un fragment lui-même traduisible (le libellé d'annulation).
      if (typeof p[1] === 'function') return lead + p[1].apply(null, m) + trail;
      return lead + core.replace(p[0], p[1]) + trail;
    }
    return str;
  }

  function skipped(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hasAttribute('translate') && el.getAttribute('translate') === 'no') return true;
    if (el.classList && (el.classList.contains('i18n-skip') || el.classList.contains('notranslate'))) return true;
    var tag = el.tagName;
    // TEXTAREA n'est pas exclu ici : son attribut placeholder doit être
    // traduit. C'est son contenu (la valeur par défaut) qu'on ne touche pas —
    // voir skippedText().
    if (tag === 'SCRIPT' || tag === 'STYLE') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function skippedText(parent) {
    if (!parent || parent.nodeType !== 1) return false;
    if (parent.tagName === 'TEXTAREA') return true;
    return skipped(parent);
  }

  var WALKER_FILTER = {
    acceptNode: function (node) {
      if (node.nodeType === 1) return skipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      if (node.nodeType === 3) return skippedText(node.parentNode) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_REJECT;
    }
  };

  function applyTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    var parent = node.parentNode;
    if (skippedText(parent)) return;
    if (node.__birdFr === undefined) node.__birdFr = node.nodeValue;
    var next = translate(node.__birdFr);
    if (node.nodeValue !== next) {
      suppress++;
      node.nodeValue = next;
      suppress--;
    }
  }

  function applyAttr(el, name) {
    if (!el || el.nodeType !== 1 || !el.hasAttribute(name)) return;
    if (skipped(el)) return;
    var store = el.__birdAttr || (el.__birdAttr = Object.create(null));
    if (!(name in store)) store[name] = el.getAttribute(name);
    var next = translate(store[name]);
    if (el.getAttribute(name) !== next) {
      suppress++;
      el.setAttribute(name, next);
      suppress--;
    }
  }

  function applyElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (skipped(el)) return;
    // Éléments ET nœuds de texte : sans SHOW_ELEMENT, les attributs des
    // descendants (title, aria-label…) n'étaient jamais traduits — seuls ceux
    // de la racine l'étaient.
    var walker = document.createTreeWalker(
      el,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      WALKER_FILTER
    );
    var n = walker.currentNode;
    while (n) {
      if (n.nodeType === 1) {
        for (var i = 0; i < ATTRS.length; i++) applyAttr(n, ATTRS[i]);
      } else if (n.nodeType === 3) {
        applyTextNode(n);
      }
      n = walker.nextNode();
    }
  }

  function applyAll() {
    if (!document.body) return;
    applyElement(document.body);
    if (document.title) document.title = translate(document.title);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function (records) {
      if (suppress) return;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'characterData') { applyTextNode(r.target); continue; }
        if (r.type === 'attributes') { applyAttr(r.target, r.attributeName); continue; }
        for (var j = 0; j < r.addedNodes.length; j++) {
          var added = r.addedNodes[j];
          if (added.nodeType === 3) applyTextNode(added);
          else if (added.nodeType === 1) applyElement(added);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  function syncSelect() {
    var sel = document.getElementById('uiLanguage');
    if (sel && sel.value !== lang) sel.value = lang;
  }

  function set(next, silent) {
    if (LANGS.indexOf(next) < 0) next = DEFAULT_LANG;
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* mode privé */ }
    document.documentElement.setAttribute('lang', lang === 'fr' ? 'fr' : 'en');
    applyAll();
    syncSelect();
    if (!silent) for (var i = 0; i < listeners.length; i++) listeners[i](lang);
  }

  function stored() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (LANGS.indexOf(v) >= 0) return v;
    } catch (e) { /* mode privé */ }
    return DEFAULT_LANG;
  }

  function init() {
    set(stored(), true);
    startObserver();
    var sel = document.getElementById('uiLanguage');
    if (sel && !sel.__birdBound) {
      sel.__birdBound = true;
      sel.addEventListener('change', function () { set(sel.value); });
    }
    // Le corps arrive peut-être après ce script : on repasse une fois chargé.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { applyAll(); syncSelect(); });
    }
  }

  global.BirdI18n = {
    t: translate,
    apply: applyAll,
    set: function (l) { set(l); },
    get: function () { return lang; },
    languages: LANGS.slice(),
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };

  if (document.readyState === 'loading') {
    lang = stored();
    document.documentElement.setAttribute('lang', lang === 'fr' ? 'fr' : 'en');
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
