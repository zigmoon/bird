# Bird — version Astro

Version **Astro 7** du studio vectoriel Bird : pages marketing, éditeur complet,
documentation, SEO, PWA et routes API.

## Principe

Une seule source pour le moteur : `../index.html`, `../js`, `../css`, `../icons`, `../plugins`.
`scripts/sync-engine.mjs` :

1. copie le moteur dans `public/assets/bird/` ;
2. extrait le DOM de l’éditeur dans `src/generated/editor-shell.html`
   (sans les balises `<script>`, chargées explicitement par `src/pages/editor.astro`) ;
3. adapte le manifeste PWA à la route `/editor`.

Les plug-ins livrés (`../plugins/`) sont copiés dans `public/assets/bird/plugins/`.
`js/plugins.js` résout leur URL depuis l’emplacement de son propre script : la
version autonome les sert depuis la racine, la version Astro depuis
`/assets/bird/plugins/`. Aucun chemin en dur, donc rien à changer entre les deux.

Le script est lancé automatiquement par `postinstall`, `dev` et `build`.
Après une modification de l’interface (`bird/index.html`) ou d’un plug-in,
relancez `npm run sync` ou `npm run dev`.

## Démarrage

```bash
cd bird/astro
npm install
npm run dev        # http://localhost:4321
```

## Production

```bash
npm run build
npm start          # serveur Node autonome (dist/server/entry.mjs)
```

Variables d’environnement :

| Variable | Rôle |
|---|---|
| `OPENROUTER_API_KEY` | facultatif — proxy `/api/ai` |
| `PORT` / `HOST` | port et interface du serveur Node |

## Routes

| Route | Description |
|---|---|
| `/` | page marketing |
| `/editor` | éditeur vectoriel complet |
| `/docs` | documentation |
| `/api/health` | état du service |
| `/api/ai` | proxy OpenRouter (clé en en-tête `x-openrouter-key` ou env) |
| `/sitemap.xml` | sitemap |

## Notes

- `output: 'server'` car les routes API sont dynamiques. Pour un site 100 % statique,
  passez `output: 'static'`, retirez l’adaptateur et supprimez `src/pages/api/`.
- Le service worker (`public/sw.js`) précache l’éditeur et les moteurs.
- Les bibliothèques PDF/EPS restent chargées à la demande, comme dans la version web.
