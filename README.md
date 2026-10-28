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
  <a href="https://app.zigmoon.com/bird/"><b>▶ Open the web app — app.zigmoon.com/bird</b></a>
</p>

<p align="center">
  <a href="https://github.com/zigmoon/bird/releases/latest"><b>⬇ Download for macOS · Windows · Linux</b></a>
</p>

<p align="center">
  <a href="https://github.com/zigmoon/bird/releases/latest"><img src="https://img.shields.io/github/v/release/zigmoon/bird?label=release" alt="Latest release"></a>
  <a href="https://github.com/zigmoon/bird/actions/workflows/desktop.yml"><img src="https://github.com/zigmoon/bird/actions/workflows/desktop.yml/badge.svg" alt="Build"></a>
  <a href="https://app.zigmoon.com/bird/"><img src="https://img.shields.io/badge/web%20app-online-1a1a1a" alt="Web app online"></a>
</p>

> **The web version is live: <https://app.zigmoon.com/bird/>** — nothing to
> install, the whole engine runs in the browser. The same build is shipped as
> the desktop app on the [releases page](https://github.com/zigmoon/bird/releases/latest).

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

### Text inside or around a shape

Right-click any shape → **Write inside the shape** or **Write around the shape**.
Two genuinely different techniques, because one does not cover the other:

- **Inside** — the text follows the *silhouette*. The shape is rasterised off
  screen, a chamfer distance transform gives the distance to the empty border of
  every pixel, and the usable width is read row by row. Each line is therefore
  as wide as the shape actually is at that height: a phrase typed into an
  ellipse fills the ellipse and stops, instead of being clipped to a rectangle.
  This is InDesign's "text on a shape", and it is the only way to write legibly
  inside a star.
- **Around** — the text runs along the outline. A closed path offset outwards is
  built (edge intersection for a polygon, an enlarged ellipse otherwise) and
  handed to `fabric.Text`, which places glyphs along a path since 5.1.

The generated text is a **real object**: it is saved in the document and appears
in every export. It is not selectable or movable, though — it is driven by the
shape. That is deliberate: two linked objects you can drag apart is the classic
bug of this feature (move the shape, the text stays behind). Move the shape, the
text follows; edit the text through the shape's menu.

If the silhouette cannot hold the text at the requested size, the body is
**reduced** until everything fits, down to a 6 px floor. Silently dropping the
end of a sentence — which is what a naive greedy wrap does — is worse than a
smaller font: the user sees half their text and has no clue why.

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

- **Two buttons in the top bar**: `+` creates a *document*, `+` inside a square
  creates an *artboard*.
- **A number is painted beside the dashed frame.** It is an annotation, not an
  object: it is drawn on the canvas context after the objects, so it is in no
  SVG, no PDF, and the raster export explicitly locks it out (`state.exporting`).
  The number sits *outside* the artboard so it never covers the artwork.
- **Click the number** — or the frame itself — to select the artboard. The frame
  goes solid, gets corner squares, and the right panel opens on Document so the
  format can be changed straight away.
- **Move it.** Drag the frame or the number: the artboard slides over the
  workspace and the artwork does not move with it — the gesture Illustrator
  users expect, and the only one that makes sense when the artboard is a crop
  on an infinite surface. The handle stays live **whatever tool is selected**
  (Space and the Hand tool keep panning, an in-progress Pen path keeps the
  click), the cursor turns to `move` on hover, and the drag survives leaving the
  canvas: you can release over a ruler or the panel. `X` / `Y` in the Document
  panel set the exact position; arrow keys nudge it (10 px with `Shift`). The
  workspace is a shade greyer than the sheet, so the sheet is visible wherever
  you put it.
- **Bleed** is an artboard property (0–200 px), stored with the artboard and
  used as the default in the export dialog. A printer asking for 3 mm once can
  still override it at export time.
- **Duplicate / Delete** appear in the Document panel as soon as the artboard is
  selected; `Delete` does the same from the keyboard.
- **`Ctrl/Cmd + C` then `V`** copies and pastes an artboard: the copy is inserted
  right after the current one, in the same document, and becomes active.
- **A new artboard lands next to the current one, in the current document** — and
  the tab's counter (`3 artboards`) updates immediately, so it is obvious that
  nothing switched document.
- **Artboards panel** — numbered list, rename (double-click), dimensions, object
  count, reorder, delete with confirmation.
- **Floating switcher** at the bottom of the canvas once there are two or more.
- `Ctrl/Cmd + PageUp / PageDown`.
- **Per-artboard undo/redo**: switching stores the history stacks, so undoing on
  one artboard never touches another — and each snapshot holds one artboard, not
  the whole document (this is what keeps memory sane with images).
- Saved in the `.plume` project as `pages[]` + `activePage`, with `ox`, `oy` and
  `bleed` per artboard (all defaulting to 0); older single-page projects open as
  a one-artboard document.
- **The first-run hint** (grey logo and shortcut reminder, centred on screen) is
  only there before the first gesture. A click in the workspace, picking a tool,
  a keyboard shortcut or a dropped file removes it — and it **does not come
  back** when the canvas becomes empty again (last object deleted).
  `updateHint()` only restores it for a brand-new document.

The number's colours are swapped in dark mode: a black cartouche on a dark canvas
would simply not exist.

### Transform — the numbers you can read *and* edit

Selecting anything — shape, path, image, group, multi-selection — opens a
**Transform** section at the top of the right panel: `X`, `Y`, `W`, `H`, angle,
plus a *Constrain proportions* switch.

- The values are the **bounding box** of the selection, not `object.width`: a
  shape rotated 30° is wider on screen than its local width, and the measure
  people expect is the one they can see.
- `X`/`Y` are **artboard coordinates** — 0 at the artboard's top-left corner,
  like Illustrator's rulers.
- Typing a value **translates** the selection by the difference between the
  wanted and the measured box, so it stays exact whatever the rotation or the
  origin. Resizing re-anchors the top-left corner, so a rotated shape grows
  without sliding.
- One field edit is one undo step, and the fields follow the mouse live while
  you drag, scale or rotate.

---

## Documents — one tab per document

Bird is not limited to one document. Each **tab** under the top bar is a whole
document with its own artboards, its own format and its own undo history.

- **`+` in the tab bar** — or `Ctrl/Cmd + N` — opens the *New document* dialog:
  six presets, free width and height, white / transparent / black background.
- **Double-click a tab** to rename it. `×` closes it (with confirmation when it
  holds anything). `Ctrl/Cmd + W` closes, `Ctrl/Cmd + Alt + PageUp/PageDown`
  moves between documents.
- **Creating a document on a blank canvas reuses the current tab** instead of
  stacking an empty tab next to another empty tab.
- The `.plume` project gained `documents[]` + `activeDocument`. A reader that
  ignores those fields still opens the active document through the old
  `pages[]` + `json` keys, so **older projects open unchanged and newer ones
  degrade gracefully**.

---

## Export: choosing artboards and documents

The export dialog knows what a document contains:

- **Scope** — the displayed artboard · the selection · *chosen artboards*.
- **Artboards (1, 3-5)** — a free field; empty means all. Ranges and commas, as
  you would write in an email to a printer. The size readout updates live, so
  you see `2 PDF pages` before pressing Export.
- **Documents** — *active document* or *all documents*, only shown when there is
  more than one.

One artboard → the file is exactly what the chosen format produces (SVG, PNG,
PDF/X-1a…). Several artboards → **one multi-page PDF, one page per artboard, at
its own format**. That is a hard constraint, not a preference: there is no single
PNG that holds twelve artboards.

```js
await Bird.export({ format: 'pdf', scope: 'pages', pages: '1, 3-5' });
await Bird.export({ format: 'pdf', scope: 'pages', documents: 'all' });
```

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

The consequence is worth stating once, because it caused a real bug: the section
carries both `is-detached` (which hides it *in the panel*) and `is-floating`
(which restyles it *in the card*). The hide rule won, so a detached widget opened
with a title and an empty body — the card appeared, its controls did not. The
override lives in `.sp-widget-body .props-section.is-floating { display: block }`,
and `scripts/check-ui.mjs` refuses to let it disappear.

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
| `Alt` + drag | Duplicate the selection while dragging it |
| `Ctrl+A` / `Ctrl+Shift+A` / `Ctrl+D` | Select all / deselect / duplicate |
| `Ctrl+Shift+G` (or `Ctrl+G`) / `Ctrl+Shift+U` | Group / Ungroup |
| `Ctrl+]` `Ctrl+[` `Ctrl+Shift+]` `Ctrl+Shift+[` | Forward, backward, to front, to back |
| `Ctrl+2` / `Ctrl+Alt+2` / `Ctrl+3` / `Ctrl+Alt+3` | Lock / unlock all / hide / show all |
| `Ctrl+Shift+O` | Outline stroke |
| `Ctrl+Shift+.` / `Ctrl+Shift+,` | Font size up / down |
| `Ctrl+=` `Ctrl++` / `Ctrl+-` / `Ctrl+0` | Zoom in / zoom out / **100 %** |
| `Ctrl+Alt+0` / `Shift+2` | Fit view / zoom to selection |
| `Ctrl+R` / `Ctrl+'` / `Ctrl+;` | Rulers / grid / snapping |
| `Ctrl+K` | Plug-ins |
| `Ctrl+,` | Preferences |
| `Ctrl+PageUp` / `Ctrl+PageDown` | Previous / next artboard |
| `Ctrl+Alt+PageUp` / `Ctrl+Alt+PageDown` | Previous / next document |
| `Ctrl+N` / `Ctrl+W` | New document / close document |
| `F1` / `F11` | Shortcut sheet / full screen |

Grouping is on <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> and ungrouping on
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd>. <kbd>Ctrl</kbd>+<kbd>G</kbd>
still groups — it is the Illustrator reflex and costs nothing — but
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> can no longer ungroup, since it
now groups. Ungrouping has a single key.

<span></span>

Two details that were measured rather than assumed:

- **`Ctrl+0` is 100 %, not "fit"**, as requested. Fit moved to `Ctrl+Alt+0`.
- **`Ctrl++` needs its own registration.** On a physical keyboard `+` is
  `Shift`+`=`, so the event carries `shiftKey` *and* the character `+`. The
  command registry now folds `+` onto the `=` key, otherwise zoom-in via the
  `+` key silently did nothing (verified: it stayed at the same zoom level).


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

### Panels never touch the artboard

A document opens with **no display tool active**: no rulers, no snapping, no
grid. `scripts/check-ui.mjs` fails the build if the state default or the
top-bar button says otherwise.

Opening or closing the right-hand drawer must never move what you are drawing.
Two things made that untrue, and both are now structural:

* **`fitView()` on every collapse.** The drawer used to refit the view, which
  re-centred and re-zoomed the whole document. Collapsing a panel is a change of
  *surface*, not of *view*: the canvas keeps its origin and its
  `viewportTransform`, so objects stay at the same screen coordinate. To resize
  without moving anything, call `Bird.view.resize()` — it exists for hosts too.
* **A void at the drawer's edge.** The rulers and the canvas carry **pixel**
  sizes (an inline width and Fabric's bitmap), which do not follow CSS. Opening
  the drawer left a ruler 894 px wide over a 718 px stage; closing it left an
  18 px gap where the drawer had been. A `ResizeObserver` on the stage plus a
  `resize` listener now drive a single `syncStageSurface()`, and every path that
  opens the panel goes through `openRightPanel()`, which resizes as it opens.

The panel's width is deliberately **not animated**: animating it means one
canvas resize per frame, and between two frames the ruler is shorter than the
stage — a visible gap. It snaps, so the measurement is exact immediately.

### Icons: no plate, ever

Every icon — favicon, PWA icons, desktop `.ico`/`.icns` — is the mark on a
**transparent** canvas, with a margin. No white rounded square. That is how
SuperPrint, SuperPhoto and PDF-YZ are drawn, and it is what makes an icon
survive a light tab, a dark tab and the system's own shape mask:

| App | Transparent | Margins |
|---|---|---|
| SuperPrint | 31 % | 8 % all round |
| SuperPhoto | 45 % | 10 % / 2 % |
| PDF-YZ | 45 % | 9 % / 2 % |
| Bird | 77 % | 9 % / 22 % |

The margins differ because Bird's mark is 505 × 361: the constraint is the
width — 84 % of the side, centred — which leaves 22 % above and below.

`scripts/check-ui.mjs` reads the top-centre pixel of every PNG: with a plate it
is opaque (even with rounded corners, that pixel sits inside the plate), without
a plate it is transparent. A corner check would not do — a rounded square has a
transparent corner, which is exactly how the old icons went unnoticed. The
favicon SVG is checked for a full-frame white `<rect>`.

The `maskable` PWA icon is a **separate file** (`icons/icon-maskable-512.png`,
20 % margin): the Android safe zone is a circle of 80 % diameter, and the main
icon's wings would be clipped by it.

In dark mode the **file-based** icons are inverted (`img.tool-icon { filter:
invert(1) }`). On transparent line art that turns dark strokes light and white
fills dark — the correct rendering for a light-on-dark interface. Inline `<svg>`
elements follow `currentColor` and are **not** inverted; see below.

### Day / night theme

The moon/sun button left of *Preferences* switches theme; the choice is stored
in `localStorage` under `bird.theme` and applied by a small inline script in
`<head>` **before the first paint**, so a dark-theme reload never flashes white.

The whole palette lives in one place: `:root` defines 46 shades ordered by
**luminance** (`--n00` lightest → `--n45` darkest), not by role — in this
stylesheet the same shade is a background here and a border there, so a role
name would lie. Components are written `background: var(--n00); color:
var(--n45)`, so they invert themselves; `html[data-theme="dark"]` only
redefines the variables. The light theme holds the exact former literals, so it
is pixel-identical to the monochrome version that preceded it.

Three things sit outside the variables and need explicit handling:

* **Canvas painting.** The infinite work area, the dashed artboard frame and the
  rulers are drawn with the 2D context, which cannot read CSS variables. They go
  through `themeColor()` in `js/app.js`, which reads the `--canvas-*` and
  `--ruler-*` custom properties (cached per theme) and is invalidated on the
  `bird:theme` event.
* **The paper.** The artboard keeps its own colour (`artColor`, white by
  default): dark mode darkens the surround, never the document. Anything painted
  *on* the paper therefore must **not** follow the theme — that is what
  `--paper-ink`, `--paper-chip` and `--paper-line` are for. They are defined once
  in `:root` and deliberately **not** redefined in the dark block: the empty
  artboard hint used to inherit `--n44` and turned `#e9e9e9` on a white sheet,
  invisible.
* **Two kinds of icon, two treatments.** A black SVG loaded through `<img>` never
  receives `currentColor`, so those are inverted (`img.tool-icon { filter:
  invert(1) }`). An **inline** `<svg>` does inherit `currentColor` and is already
  correct — invert it too and it goes back to dark. The selector said
  `.tool-icon` and caught both: measured, `rgb(233,233,233)` strokes were then
  inverted to `rgb(22,22,22)` on a `#161616` canvas. Two corrections cancel each
  other, exactly like the zoom bug that divided by the DPR *and* multiplied by
  the canvas ratio. `check-ui.mjs` now refuses the bare selector.

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

**A module writes the French source, never the translation.** `js/i18n.js` is
the only place that calls `t()` on interface text; if a module writes an
already-translated string into a node or an attribute, i18n takes it for a
fresh write from the application and freezes it as the new source — switching
back to French then does nothing. `scripts/check-ui.mjs` fails the build on any
`BirdI18n.t(` in another module; the two legitimate escapes (the native window
title, which is outside the DOM, and a value returned by the API) are annotated
with `i18n:allow <reason>`.

```
bird/
├── index.html                  UI (stable DOM, reused by Astro and Tauri)
├── css/style.css               IBM Plex Mono, black & white, 4 px grid
├── icons/                      logo variants, favicon, PWA icons
├── js/
│   ├── i18n.js                 interface language: English default, French option
│   ├── theme.js                day / night switch (data-theme + localStorage)
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
├── scripts/
│   ├── check-ui.mjs            UI invariants (design, i18n, versions, defaults)
│   ├── check-desktop.mjs       desktop pre-flight: versions, tag, icons, cargo --locked
│   └── pack-ftp.mjs            white-listed static package (--flat for a site root)
├── astro/                      Astro version (marketing, docs, PWA, API routes)
├── rust/                       bird-core + bird-cli (no Node required)
├── desktop/                    Tauri 2 shell → macOS, Windows, Linux
└── .github/workflows/          pre-flight, web, Rust, 4 desktop targets, release
```

### JavaScript API

```js
Bird.version                                   // '2.3.0'
Bird.document.new() / .payload() / .load(p)
Bird.document.open(file)                       // any supported format

Bird.pages.list() / .count() / .go(n) / .add(name) / .duplicate() / .remove(n)
Bird.view.rulers(true) / .grid(false) / .snap(true)
Bird.theme.get() / .set('dark') / .toggle()   // 'light' | 'dark'
Bird.widgets.detach('layers') / .dockAll()
BirdPlugins.list() / .open(id) / .toggle(id)

Bird.io.pdfPageCount(buffer)                   // { pages, sizes }
Bird.io.svgPagesToPDF([{ svg, width, height }])
```

#### `Bird.export(opts)` — one shape for every format

```js
const res = await Bird.export({
  format: 'pdfx',            // 'svg' | 'pdf' | 'pdfx' | 'png' | 'jpg' | 'webp'
  scope: 'document',         // 'document' | 'selection' | 'pages'
  scale: 2,                  // raster only
  background: 'artboard',    // 'artboard' | 'transparent' | 'white'
  bleed: 0,                  // pdfx only
  filename: 'poster',        // without extension
  download: true             // false = return only, do not save
});

// Always resolves to the same object — never `null`, never a bare Blob:
//   res.ok          boolean, false on failure
//   res.format      the format actually produced
//   res.filename    suggested name, extension included
//   res.blob        Blob, always present on success
//   res.bytes       Uint8Array (pdf, pdfx, pages)
//   res.dataURL     string (png, jpg, webp)
//   res.warnings    string[] (pdfx: missing ICC profile, skipped object…)
//   res.downloaded  whether a file was written
//   res.error       message when ok is false
```

`returnBlob` / `returnDataURL` are still accepted as aliases of
`download: false`, so an older call keeps its "do not save" meaning instead of
silently starting a download.

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

### Before the runners start

```bash
node scripts/check-desktop.mjs
```

Ten seconds, no compilation. A version number replaced blindly across
`Cargo.lock` once put six third-party crates (`icu_properties`, `icu_collections`…)
at a version that does not exist: **all four desktop builds** failed in the same
way, each after several minutes, with the reason buried in Tauri's output.

That check therefore runs as its own job (`pré-vol`) **before** anything is
built, and it:

* requires **one version everywhere** — `js/app.js` is the reference, compared
  against `rust/Cargo.toml` (workspace), `desktop/src-tauri/Cargo.toml` and
  `tauri.conf.json`;
* requires the **tag to match** that version, so a release can never be named
  `v2.5.0` while its installers say `2.4.0`;
* checks the **icon files** `tauri build` and `tauri icon` need exist;
* runs **`cargo metadata --locked`** on both workspaces — dependency resolution
  without a single line compiled. `--locked` also means a stale `Cargo.lock`
  fails here instead of being silently repaired inside the runner.

Two other rules keep the pipeline honest:

* the desktop build is pinned **not** to invalidate `Cargo.lock` — a step after
  compilation fails if `git diff` shows the lockfiles changed;
* `release` needs **every** job (`preflight`, `web`, `rust`, `desktop`). It used
  to need only `desktop`, and one run published a release while the UI
  invariants were failing.

The Rust toolchain is pinned (`1.99.0`) rather than `stable`: `clippy -D
warnings` on a floating stable turns the build red the day a new lint ships,
with no code change at all.

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

Two coordinate spaces, and mixing them is silent:

- `canvas.getPointer(e)` returns **document** coordinates (it undoes
  `viewportTransform`); `canvas.getPointer(e, true)` returns **canvas** pixels.
  Everything that places or picks an object wants document space — but the zoom
  anchor wants canvas space. Feeding document coordinates to `zoomAtPoint` made
  the whole view creep away from the cursor at every wheel tick (35 px over five
  ticks, measured). `canvasPointFromEvent()` computes the canvas point straight
  from the event and the canvas rect, also avoiding the `_pointer` cache that
  `getPointer(e, true)` may replay.
- Every 1 px stroke is snapped to the **physical** pixel grid, not to `+0.5`
  CSS: `Math.round(v * dpr) / dpr + 0.5 / dpr` with `lineWidth: 1 / dpr`. The
  `+0.5` idiom is only correct at DPR 1; at 1.5 (this machine) it blurred the
  artboard frame across two pixels, and the blur changed at every zoom step, so
  the frame looked like it drifted.

### UI invariants, checked before every build

`node scripts/check-ui.mjs` (run in CI before the Astro build) encodes ten
regressions that already shipped, each invisible to the developer and obvious to
the user:

| Check | The bug it prevents |
|---|---|
| No literal `stroke`/`fill` colour in CSS | `.btn.is-on svg { stroke: #fff }` survived from the old dark active state; once the active state became light, the icons turned white on white |
| No chromatic colour in CSS, JS or HTML | the active toggle state was blue (`#eef4ff` / `#1677ff`) — outside a design language that is strictly black, white and grey |
| A file named `*white*` must contain white | `bird-mark-white.svg` contained `#0C0C0F` — the exact colour of the splash panel behind it |
| Every referenced asset must exist | A deployment package could omit `css/fonts/`; the `@font-face` rules then failed silently and the page fell back to a system font |
| No module may call `BirdI18n.t()` | a module wrote a translated label into the DOM; i18n read it back as a fresh write and froze it as the source — "Apparence" stayed "Appearance" after switching back to French |
| One version number, everywhere | a global `2.3.0 → 2.3.1` replacement in `Cargo.lock` bumped six unrelated `icu_*` crates to a version that does not exist; all four desktop builds failed |
| No display tool active by default | rulers and snapping were on at first paint, so a new document opened on a crowded artboard |
| No background plate on any icon | the icon was a white rounded square, alone among SuperPrint, SuperPhoto and PDF-YZ — it disappeared on a light tab bar |
| No double inversion in dark mode | `html[data-theme="dark"] .tool-icon { filter: invert(1) }` also caught inline `<svg>`, which already follow `currentColor`: the icons were sent back to black on a black canvas |
| A detached section must stay visible | `is-detached` hides a section *in the panel*; the floating card contains that same section, so the rule emptied the widget — the card opened with a title and no controls |

A legitimate exception is written as `check-ui:allow <reason>` (or
`i18n:allow <reason>` for the translation one) on the same line.

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
node scripts/pack-ftp.mjs                 # → bird-ftp-<version>.zip, everything under bird/
node scripts/pack-ftp.mjs --flat          # → files at the archive root
```

White-listed, not "everything except": only `index.html`, `manifest.webmanifest`,
`llms.txt` and the `css/`, `js/`, `icons/`, `plugins/` trees go in. Nothing from
`astro/`, `rust/`, `desktop/`, `.git` or `node_modules` can leak to the server.

Without `--flat` everything sits under a single `bird/` folder — one drag and
drop whatever the target. With `--flat` the archive *is* the site root
(`index.html` next to `css/`, `js/`, `icons/`), which is what a hosting panel
that unpacks an archive at the first level expects.

### Hosting in a subdirectory

Bird runs unchanged at `https://example.com/bird/` — every reference is
relative (`css/…`, `js/…`, `icons/…`, `manifest.webmanifest`), there is no
leading slash anywhere in the markup, the stylesheet or the JavaScript, and the
standalone build registers no service worker, so no scope can escape the folder.
The bundled plug-in is resolved from the URL of `js/plugins.js`, not from a
fixed path.

Two things to check on the server:

* **The trailing slash matters.** `/bird` must redirect to `/bird/`; otherwise
  the browser resolves `css/style.css` against the parent and the page loads
  unstyled. Apache `mod_dir` and nginx both do this by default for a real
  directory — do not disable it.
* **`.htaccess` is a dotfile.** Most FTP clients hide it; make sure it was
  uploaded. It is optional (MIME types, gzip, cache lifetimes) and has no effect
  on nginx.

Serve over **HTTPS**: the clipboard API and the File System Access API require a
secure context. Without it, plain downloads still work, but "copy the render"
and direct disk access do not.

`localStorage` and IndexedDB are scoped to the **origin**, not the path: another
application at `example.com/bird2/` shares them. Every key Bird writes is
prefixed (`bird.lang`, `bird.theme`, `bird_doc_v2`, `bird-db`, `bird-fonts`,
`bird_plugins_*`), so coexistence is safe as long as the other app does not use
the same prefix.

---

## Roadmap

- [x] Multiple artboards
- [x] Artboard numbering, selection and format editing on the canvas
- [x] Multiple documents, one tab per document
- [x] Export by artboard range and by document
- [x] Text inside a shape (silhouette wrap) and around a shape (text on path)
- [x] Option+drag duplication, Illustrator key map
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
