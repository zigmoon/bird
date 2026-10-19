# Bird — Vector Editor

<p align="center">
  <img src="icons/bird-logo.svg" width="240" alt="Bird — vector editor">
</p>

<p align="center">
  <b>A local-first vector studio that runs entirely in your browser.</b><br>
  Bézier pen, layers, multiple artboards, plug-ins, detachable panels, PDF/AI/EPS import,<br>
  and a real press-ready <b>PDF/X-1a</b> export — CMYK, ICC output intent, outlined text.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#pdfx-1a-export">PDF/X-1a</a> ·
  <a href="#artboards">Artboards</a> ·
  <a href="#plug-ins">Plug-ins</a> ·
  <a href="#desktop-builds">Desktop builds</a>
</p>

<p align="center">
  <a href="https://github.com/zigmoon/bird/releases/latest"><b>⬇ Download for macOS · Windows · Linux</b></a>
</p>

<p align="center">
  <a href="https://github.com/zigmoon/bird/releases/latest"><img src="https://img.shields.io/github/v/release/zigmoon/bird?label=release" alt="Latest release"></a>
  <a href="https://github.com/zigmoon/bird/actions/workflows/desktop.yml"><img src="https://github.com/zigmoon/bird/actions/workflows/desktop.yml/badge.svg" alt="Build"></a>
</p>

---

## Why Bird

Most browser editors stop at "export SVG". That is enough for the web and useless
for a printer. Bird was built for a small print shop, so the last step of the
pipeline is the one that got the most attention:

- **No server, no account.** Your files never leave the machine.
- **Real vector work.** Bézier editing, boolean operations, path tools, and a
  text engine that can turn type into curves.
- **A print pipeline that does not lie.** Where the PDF standard cannot do
  something (transparency in PDF/X-1a), Bird says so instead of pretending.

---

## Quick start

```bash
npx serve .        # http://localhost:3000
```

No build step for the web app. The Astro version (`astro/`), the Rust engine
(`rust/`) and the native shell (`desktop/`) wrap the *same* engine — one source
of truth, not four.

Desktop installers (`.dmg`, `.msi`/`.exe`, `.deb`/`.rpm`/`.AppImage`) are built
by CI on real macOS, Windows and Linux runners — a `.dmg` cannot be produced
from Windows, and pretending otherwise is how teams ship broken bundles.

---

## Features

### Drawing
- **Pen (Bézier)** — click for an anchor, drag for handles, re-edit any path
  (add/remove points, curve segments).
- **Pencil** and **vector brushes** — Line, Ink, Marker, Spray, Neon; size,
  smoothing, opacity, stylus pressure.
- **Shapes** — rectangle (editable corner radius), ellipse, line, star, polygon.
- **Text** — family, size, weight, style, alignment, and **convert to curves**.
- **Pathfinder** — union, subtract, intersect, exclude, without rasterisation.
- **Images and video** — PNG/JPG/WebP/GIF/BMP/AVIF, first frame of WebM/MP4.

### Organisation and precision
- **Layers panel** — list, select, rename, hide, lock, reorder.
- **Rulers, guides, grid, snapping** — drag a guide off any ruler, `Esc` cancels,
  double-click the ruler corner clears them all.
- **Artboards** — see below.
- **Zoom** 5 % → 6400 %, wheel-to-cursor, zoom to selection.
- **Align / distribute / mirror**, opacity, blend modes, dashes, caps, joins.
- **Eyedropper**.

### Illustrator-style vector tools
| Tool | What it does |
|---|---|
| **Outline stroke** | Turns a stroke into a closed filled shape (offset ring, no raster) |
| **Offset path** | Offsets ±px with rounded joins, self-intersections resolved |
| **Simplify** | Reduces anchor count while keeping the shape |
| **Text → curves** | Real glyph outlines via `opentype.js`, so no font dependency |
| **Symbols** | Definition + linked instances, with propagation |
| **Blend** | Interpolates shape, transform and colour between two objects |

---

## PDF/X-1a export

This is a **separate writer**, not a flag on the screen-PDF path. `jsPDF` and
`svg2pdf` cannot produce press files: they emit RGB, fall back to Helvetica, and
drop gradients to their first colour. `js/pdfx.js` writes the PDF itself.

What comes out:

| Requirement | Implementation |
|---|---|
| PDF 1.3, single page | own object store + xref table |
| Colour | `/DeviceCMYK` only — no RGB operator ever appears |
| Gradients | **shadings** (type 2 axial, type 3 radial) with per-channel CMYK functions |
| Text | converted to outlines by default (no font embedding needed) |
| Output intent | `/OutputIntent /S /GTS_PDFX` + embedded `/DestOutputProfile` |
| Metadata | XMP declaring `PDF/X-1a:2001` |
| Boxes | `/MediaBox`, `/CropBox`, `/BleedBox`, `/TrimBox`, `/ArtBox` |
| Trapping flag | `/Trapped /False` |

Export panel options: bleed (up to 6 mm), black generation (UCR/GCR), total ink
limit (240/300/330 %), and text handling (outline or keep).

### ICC profiles

Bird ships a **synthetically generated, structurally valid CMYK profile**
("Bird CMYK"). It makes the container conform, but it is *not* a measured
FOGRA39 or GRACoL. Load your printer's `.icc`/`.icm` in the export panel and it
is embedded verbatim as the `/DestOutputProfile`.

> **Honest limits.** PDF/X-1a:2001 forbids transparency, so object opacity is
> blended into the CMYK components (exact over an opaque flat, approximate over a
> gradient). Raster images are converted to CMYK and Flate-compressed. Complex
> nested groups are flattened.

Validation performed during development: the produced file re-opens in `pdf.js`
with the correct page box, renders a real axial ramp (measured 248 → 154 → 56
across a black-to-white gradient), and re-imports into Bird as editable paths.

---

## Artboards

A document holds several artboards, like Illustrator. One canvas: the active
artboard lives in it, the others are serialised.

- **Artboards panel** — numbered list, rename (double-click), dimensions, object
  count, reorder, delete with confirmation.
- **Floating switcher** at the bottom of the canvas once there are two or more.
- `Ctrl/Cmd + PageUp / PageDown`.
- **Per-artboard undo/redo**: switching stores the history stacks, so undoing on
  one artboard never touches another — and each snapshot holds one artboard, not
  the whole document (this is what keeps memory sane with images).
- Saved in the `.plume` project as `pages[]` + `activePage`; older single-page
  projects open as a one-artboard document.

---

## PDF import

| Format | Method | Result |
|---|---|---|
| `.svg` / `.svgz` | sanitising parser + Fabric | editable vector objects |
| `.pdf` | `pdf.js` (paths, clips, colours, text, images) | editable vector group |
| `.pdf`, many pages | page picker: first / specific / **all → one artboard per page** | exact page sizes, content at 1:1 |
| `.ai` (modern) | signature detection → PDF import | editable vector |
| `.ai` / `.eps` PostScript | Illustrator level-2 interpreter | editable Fabric paths |
| `.png .jpg .webp .gif .bmp .avif` | bitmap | editable image |
| `.webm .mp4` | first frame | thumbnail |
| `.plume` / `.bird` / `.json` | `bird-vector-project` schema v2/v3 | full document |

The system clipboard works too: paste SVG or an image straight onto the canvas.

---

## Plug-ins

A plug-in is a standalone `.plugin.js` file:

```js
BirdPlugins.register({
  id: 'my-plugin',
  name: 'My plug-in',
  version: '1.0.0',
  ui: {
    preview: true,
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', value: 'a',
        options: [{ value: 'a', label: 'Option A' }] },
      { key: 'step', label: 'Step', type: 'range', min: 4, max: 200, value: 40, unit: ' px' }
    ]
  },
  preview(api, values, canvas, ctx) { /* live preview */ },
  run(api, values) {                      // APPLY
    api.begin();                          // single history entry
    api.add(new api.fabric.Rect({ /* … */ }), 'My object');
  }
});
```

| API | Role |
|---|---|
| `api.fabric` | Fabric 5.1 |
| `api.canvas` / `api.document` | active canvas / document info |
| `api.selection()` / `api.selectionBounds()` | selected objects and their bounds |
| `api.add()` / `api.replaceSelection()` | add or replace, with one undo entry |
| `api.begin()` / `api.commit()` | manual transaction |
| `api.settings.get/set` | persisted per plug-in |
| `api.svgToGroup()` / `api.pattern()` | SVG → Fabric group, `fabric.Pattern` |

Field types: `select`, `range` (with `<output>`), `number`, `color`, `checkbox`,
`text`, `textarea`, `group`. Install from file, toggle on, then open it from the
**Plug-ins** panel in the right rail — the top toolbar stays free of extensions,
one button per plug-in would not scale.

**Bundled: Vector pattern** — 9 seamless patterns (stripes, checker, dots,
waves, chevrons, triangles, crosses, grid, scales). Each tile has a whole-number
period, so the seam is mathematically exact. Output is either a single
`fabric.Pattern` (light) or real stacked shapes (exportable to PDF/EPS).

> A plug-in runs with page privileges — it is a user choice, like an editor
> extension. The API is a **contract boundary** that protects your plug-ins from
> internal changes, not a security sandbox.

---

## Detachable widgets

Every section of the right panel can be detached into a floating card: drag by
the header, collapse, dock back. Position is remembered.

Because the **DOM node itself is moved** (not cloned), every listener keeps
working — a detached layer panel is still the live layer panel.

```js
Bird.widgets.detach('layers');
Bird.widgets.dockAll();
Bird.widgets.reset();
```

---

## Undo/redo — incremental, not snapshots

The naïve design stores `canvas.toJSON()` at every step. With one 2 MB image and
60 undo steps that is 120 MB of memory for an object that never changed.

Bird stores **maps of `objectId → objectJSON`** instead. Two consecutive states
share the *same string* for every object that did not move, so an edit costs
only the objects it actually touched:

| Scenario | Full snapshots | Bird 2.0 |
|---|---|---|
| 30 rectangles, 30 undo steps | ~1 Mo (30 × 33 Ko) | **33 Ko** |
| + one 400 Ko image | +400 Ko *per step* | **+400 Ko once** |
| + 20 nudges of one rectangle | +660 Ko | **+21 Ko** |
| Total for one full snapshot of that document | — | **1,1 Mo** |

A whole undo history ends up costing about as much as **one** old-style
snapshot. Images are interned, never duplicated.

- Serialised objects carry a stable `birdId`, so identity survives a round trip
  and the sharing keeps working across undo/redo.
- Trimming is bounded by **bytes**, not just by step count: 80 steps *or* 64 Mo,
  whichever comes first.
- `undo` reports its real weight in its tooltip (`Ctrl+Z` — 12 states, 84 Ko) —
  memory you cannot see is memory you cannot fix.
- Undo/redo is locked while a document is being re-materialised, so a fast
  double `Ctrl+Z` can never record the empty canvas that Fabric exposes mid-load.
- Every artboard has its own stacks; shared strings stay shared across them.

```js
Bird.document.history();   // { undo, redo, bytes, readable, limit, budget, cached }
Bird.document.edit((canvas) => { /* … */ }, 'Label');  // one safe undo entry
```

---

## AI-assisted drawing

| Provider | Models | Principle |
|---|---|---|
| **OpenRouter** | `openrouter/free`, GLM 5.2, MiniMax M3, North Mini Code, DeepSeek Chat / R1, GPT-5.6 Luna, Claude Sonnet 5 | the model **writes SVG** — editable shapes, no raster |
| **OpenRouter · native SVG** | Recraft V4 / V4.1 (Pro) | specialised vector generation, billed per use |
| **DeepSeek** | `deepseek-chat` (V3, fast), `deepseek-reasoner` (R1) | direct API, SVG as code |

Keys are stored per provider in `sessionStorage` and never written into a project
file. Every generated SVG goes through the same sanitiser as imports.

---

## Keyboard shortcuts

`Cmd` replaces `Ctrl` on macOS, so the same build behaves natively on every
platform. The shortcuts follow Illustrator and Figma.

Press <kbd>F1</kbd> in the app for the complete, generated list — it is built
from the command registry (`js/commands.js`), so it can never drift from what
the code actually handles.

| Keys | Action |
|---|---|
| `V` `P` `N` `B` `I` | Select / Pen / Pencil / Brush / Eyedropper |
| `R` `E` `L` `T` `H` | Rectangle / Ellipse / Line / Text / Hand |
| `Space` (hold) | Temporary pan |
| `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` | New / Open / Save / Save as |
| `Ctrl+Shift+P` / `Ctrl+E` / `Ctrl+P` | Place (import) / Export / Print |
| `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+X` `Ctrl+C` `Ctrl+V` `Ctrl+Shift+V` | Cut, copy, paste, paste in place |
| `Ctrl+A` / `Ctrl+Shift+A` / `Ctrl+D` | Select all / deselect / duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup |
| `Ctrl+]` `Ctrl+[` `Ctrl+Shift+]` `Ctrl+Shift+[` | Forward, backward, to front, to back |
| `Ctrl+2` / `Ctrl+Alt+2` / `Ctrl+3` / `Ctrl+Alt+3` | Lock / unlock all / hide / show all |
| `Ctrl+Shift+O` | Outline stroke |
| `Ctrl+Shift+.` / `Ctrl+Shift+,` | Font size up / down |
| `Ctrl+0` / `Ctrl+1` / `Ctrl+=` / `Ctrl+-` | Fit view / 100 % / zoom in / zoom out |
| `Shift+1` / `Shift+2` | Fit / zoom to selection |
| `Ctrl+R` / `Ctrl+'` / `Ctrl+;` | Rulers / grid / snapping |
| `Ctrl+K` | Plug-ins |
| `Ctrl+,` | Preferences |
| `Ctrl+PageUp` / `Ctrl+PageDown` | Previous / next artboard |
| `F1` / `F11` | Shortcut sheet / full screen |
| `Delete`, arrows, `Shift+arrows` | Delete, nudge 1 px, nudge 10 px |
| `Esc` / `Enter` | Cancel / finish the current path or guide drag |

Every one of these is also a real menu item in the desktop builds (see
[Desktop builds](#desktop-builds)) — a shortcut nobody can discover is a
shortcut nobody uses.

---

## Architecture

### Design language — one rule, enforced

Black, white, grey. **No hue anywhere in the interface** — not even for an
active state, an error or a destructive action. A state is expressed by a fill
shade, a darker border, an inset shadow or a black↔white inversion. The user's
own colour palette (the swatches used to paint artwork) is the only exception.

`node scripts/check-ui.mjs` fails the build on any chromatic colour in
`css/style.css`, `js/app.js` or `index.html` (channel spread > 8), and CI runs it
before every release. Read-only escapes are declared inline with
`check-ui:allow <reason>`.

### Interface language

**English is the default.** French is available in *Preferences → Interface
language*; the choice is stored in `localStorage` under `bird.lang` and applied
immediately, without a reload.

French is the *source* language of the markup and the scripts; `js/i18n.js`
translates the live DOM — text nodes and the four attributes a user can read
(`title`, `aria-label`, `placeholder`, `alt`) — from a table keyed by the French
text, plus pattern rules for messages built by concatenation. The original value
is stored on the node itself, so switching language is lossless and idempotent.
A `MutationObserver` covers everything the scripts create later (toasts, layer
rows, the generated shortcut sheet).

To add a string: write it in French, then add the pair to `EN` in
`js/i18n.js`. If the message interpolates values, add a pattern instead.

```
bird/
├── index.html                  UI (stable DOM, reused by Astro and Tauri)
├── css/style.css               IBM Plex Mono, black & white, 4 px grid
├── icons/                      logo variants, favicon, PWA icons
├── js/
│   ├── i18n.js                 interface language: English default, French option
│   ├── fabric.min.js           canvas engine (Fabric.js 5.1)
│   ├── paper-full.min.js       boolean ops, path maths (Paper.js)
│   ├── opentype.min.js         font parsing → glyph outlines
│   ├── io.js                   SVG / PDF / AI / EPS import, screen PDF, IndexedDB
│   ├── eps-import.js           PostScript interpreter (Illustrator level 2)
│   ├── icc.js                  sRGB → CMYK, ICC profile build & read
│   ├── pdfx.js                 PDF/X-1a writer (CMYK, shadings, output intent)
│   ├── vector-tools.js         text→curves, outline, offset, simplify, symbols, blend
│   ├── history.js              incremental undo/redo (object-interning, byte budget)
│   ├── commands.js             command registry — keyboard, native menu, help sheet
│   ├── native.js               Tauri bridge: dialogs, disk I/O, menu events
│   ├── widgets.js              detachable panels
│   ├── plugins.js              plug-in host, registry, settings drawer
│   └── app.js                  application: tools, history, layers, export
├── plugins/motif-vectoriel.plugin.js
├── astro/                      Astro version (marketing, docs, PWA, API routes)
├── rust/                       bird-core + bird-cli (no Node required)
├── desktop/                    Tauri 2 shell → macOS, Windows, Linux
└── .github/workflows/          multi-OS desktop build
```

### JavaScript API

```js
Bird.version                                   // '1.9.0'
Bird.document.new() / .payload() / .load(p)
Bird.document.open(file)                       // any supported format
Bird.export({ format: 'pdfx', scope: 'document', returnBlob: true })
Bird.export({ format: 'pdf', scope: 'pages', returnBlob: true })
Bird.exportSVG({ background: 'transparent' })

Bird.pages.list() / .count() / .go(n) / .add(name) / .duplicate() / .remove(n)
Bird.view.rulers(true) / .grid(false) / .snap(true)
Bird.widgets.detach('layers') / .dockAll()
BirdPlugins.list() / .open(id) / .toggle(id)

Bird.io.pdfPageCount(buffer)                   // { pages, sizes }
Bird.io.svgPagesToPDF([{ svg, width, height }])
```

---

## Desktop builds

`desktop/` is a thin **Tauri 2** shell around the same engine — no logic is
duplicated. It adds:

- a **native menu** (File, Edit, Object, View, Window, Help) carrying every
  Adobe/Figma shortcut. Menu accelerators live at the OS level, so they keep
  working even when the canvas does not have focus — and pressing
  <kbd>F1</kbd> in a text field no longer scrolls the window;
- **native file I/O**: `Ctrl+S` writes to the current path, `Ctrl+Shift+S`
  opens the dialog, and every export (SVG, PDF, PDF/X, PNG, JPG, WEBP) writes a
  real file instead of filling *Downloads*;
- a real application window whose title follows the open document, plus
  `.plume` / `.bird` file associations.

The menu holds **no logic**. It emits `bird://command` with an identifier and
the engine runs the matching command from `js/commands.js`. At startup
`app_info` returns the list of accelerators the platform actually accepted: if
a key combination is refused (some Linux window managers do), the webview
keyboard handler takes it over instead of leaving the shortcut dead. Because a
menu-managed accelerator never reaches the webview, no command can run twice.

```bash
cd desktop
npm install
npm run icons      # generates .ico / .icns / png from icons/icon-512.png
npm run dev        # development window
npm run build      # installer for the current OS
```

**Windows without Visual Studio** (MinGW-W64):

```powershell
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = '<mingw>/bin/gcc.exe'
npx tauri build --target x86_64-pc-windows-gnu
```

**macOS and Linux installers cannot be produced on Windows** (and vice versa):
they need their own toolchain and code-signing. The GitHub Actions matrix in
`.github/workflows/desktop.yml` builds all four targets on every `v*` tag — and
on every push, so a broken bundle is caught immediately — and attaches the
artefacts to the release.

### Download

Everything is on the **[releases page](https://github.com/zigmoon/bird/releases/latest)**.
Pick the file for your machine:

| Your machine | File | Install |
|---|---|---|
| macOS, Apple Silicon (M1–M4) | `Bird_*_aarch64.dmg` | open the `.dmg`, drag Bird to *Applications* |
| macOS, Intel | `Bird_*_x64.dmg` | same |
| Windows | `Bird_*_x64-setup.exe` | run it (or the `.msi` for managed installs) |
| Linux, any distro | `Bird_*_amd64.AppImage` | `chmod +x Bird_*.AppImage`, then run it — nothing to install |
| Debian / Ubuntu | `Bird_*_amd64.deb` | `sudo apt install ./Bird_*.deb` |
| Fedora / RHEL | `Bird-*-1.x86_64.rpm` | `sudo dnf install ./Bird-*.rpm` |

The bundles are **not signed or notarised** — there is no Apple certificate or
Windows signing key in this repository, and pretending otherwise would just
move the failure to the user. Consequences, in full:

- **macOS**: the first launch needs right-click → *Open*, or
  `xattr -dr com.apple.quarantine /Applications/Bird.app`.
- **Windows**: SmartScreen shows "unknown publisher" → *More info* → *Run anyway*.
- **Linux**: AppImage may need FUSE 2 (`libfuse2`) on newer distros; the `.deb`
  and `.rpm` have no such requirement.

### Build matrix

| Platform | Artefact |
|---|---|
| macOS Apple Silicon | `.dmg` (`aarch64-apple-darwin`) |
| macOS Intel | `.dmg` (`x86_64-apple-darwin`) |
| Windows | `.msi` + `.exe` (NSIS) |
| Linux | `.deb`, `.rpm`, `.AppImage` |

`.plume` and `.bird` files are registered as document types, so double-clicking a
project opens Bird.

---

## Astro version

`astro/` wraps exactly the same engine: one source of truth, two deliveries.

```bash
cd astro
npm install
npm run sync       # copies js/, css/, icons/, plugins/ and the editor shell
npm run dev
npm run build
```

`sync-engine.mjs` generates **both** `editor-shell.html` and
`editor-scripts.html` from `index.html`. Adding a file to the engine therefore
requires no edit to `editor.astro` — the CI fails the build if a script exists in
`public/assets/bird/js/` without being loaded by the editor.

Re-run `npm run sync` after changing `index.html`, the CSS, or a plug-in.

## Rust engine

`rust/` is an independent Cargo workspace (no Node needed):

- `bird-core` — `.plume` reading/writing, geometry, SVG/PDF/EPS export,
  validation, static server;
- `bird-cli` — `inspect`, `validate`, `to-svg`, `to-pdf`, `to-eps`, `serve`.

```bash
cd rust
cargo test                 # 14 tests
cargo clippy -- -D warnings
cargo run -p bird-cli -- inspect examples/sample.plume
```

`scripts/build.ps1` (Windows) detects MSVC or MinGW-W64 and runs tests then a
release build; `scripts/build.sh` does the same on Unix.

---

## Development notes

Local autosave fires 1.2 s after each change and on close. PDF/EPS libraries are
lazy-loaded on first use. UI preferences (detached widgets, active plug-ins,
plug-in settings, loaded fonts) live in `localStorage`/IndexedDB and never enter
the project file.

Two bugs worth remembering, both fixed and documented in the code:

- `pdf.js` **transfers** the buffer you hand it. Counting pages then converting
  the same buffer failed with *detached ArrayBuffer* — every read now works on
  its own copy.
- `fabric.Object.clone(callback)` is **asynchronous** and returns nothing. Using
  it as a synchronous factory pushed `undefined` into the canvas and broke layer
  rendering; batch duplication goes through `enlivenObjects`.

### UI invariants, checked before every build

`node scripts/check-ui.mjs` (run in CI before the Astro build) encodes four
regressions that already shipped, each invisible to the developer and obvious to
the user:

| Check | The bug it prevents |
|---|---|
| No literal `stroke`/`fill` colour in CSS | `.btn.is-on svg { stroke: #fff }` survived from the old dark active state; once the active state became light, the icons turned white on white |
| No chromatic colour in CSS, JS or HTML | the active toggle state was blue (`#eef4ff` / `#1677ff`) — outside a design language that is strictly black, white and grey |
| A file named `*white*` must contain white | `bird-mark-white.svg` contained `#0C0C0F` — the exact colour of the splash panel behind it |
| Every referenced asset must exist | A deployment package could omit `css/fonts/`; the `@font-face` rules then failed silently and the page fell back to a system font |

A legitimate exception is written as `check-ui:allow <reason>` on the same line.

### Caching — the rule that keeps getting forgotten

Every asset is requested with a version key: `css/style.css?v=2.1.1`,
`icons/bird-mark.svg?v=2.1.1`, down to the small tool icons. Two successive
omissions left an old logo on screen: the Astro service worker serves
`/assets/**` **cache-first**, and `.htaccess` caches SVG for a month. A URL
without `?v=` is therefore immutable in the visitor's browser.

Three moves go together whenever an asset changes:

1. bump that asset's `?v=` ;
2. bump `CACHE` in `astro/public/sw.js` (`bird-v2.1.1`) — otherwise returning
   visitors keep the old file;
3. re-run `node scripts/pack-ftp.mjs` so the static package follows.

### Packaging for a static server

```bash
node scripts/pack-ftp.mjs          # → bird-ftp-<version>.zip
```

White-listed, not "everything except": only `index.html`, `manifest.webmanifest`,
`llms.txt` and the `css/`, `js/`, `icons/`, `plugins/` trees go in, under a single
`bird/` folder. Nothing from `astro/`, `rust/`, `desktop/`, `.git` or
`node_modules` can leak to the server.

---

## Roadmap

- [x] Multiple artboards
- [x] Multi-page PDF import with a page picker
- [x] Multi-artboard PDF export
- [x] PDF/X-1a, CMYK, ICC output intent
- [x] Text → curves (no font fallback)
- [x] Real PDF gradients (shadings)
- [x] Outline stroke, offset path, simplify, symbols, blend
- [x] Native desktop shell (macOS, Windows, Linux)
- [x] Incremental history (object-interning, byte-budgeted)
- [ ] WebGL / OffscreenCanvas rendering for very large documents
- [ ] Playwright visual regression tests on import/export
- [ ] Local-first collaboration (CRDT) and version history
- [ ] Full i18n and accessibility pass (keyboard navigation, ARIA panels)

---

## Licence

Proprietary — © Zigmoon. All rights reserved.
