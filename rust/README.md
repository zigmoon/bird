# Bird — moteur Rust

Cœur vectoriel natif de Bird : inspection, validation et conversion de projets
`.plume` en **SVG**, **PDF vectoriel** et **EPS**, plus un serveur local pour
l’éditeur web.

Aucune dépendance lourde : `serde` + `serde_json` uniquement.

## Contenu

```
rust/
├── Cargo.toml
├── crates/
│   ├── bird-core/        modèle, SVG, PDF, EPS, serveur statique
│   └── bird-cli/         commande `bird-cli`
├── examples/sample.plume
└── scripts/
    ├── build.ps1         build/test Windows (détecte MSVC ou MinGW)
    └── build.sh          build/test Unix
```

## Compiler

### Windows

Le toolchain MSVC peut être absent. Le script détecte automatiquement Visual
Studio, sinon un MinGW-W64 (WinLibs) installé via WinGet :

```powershell
cd bird/rust
./scripts/build.ps1
```

Équivalent manuel si vous avez le linker MSVC :

```powershell
cargo test
cargo build --release
```

Sans MSVC, avec MinGW-W64 :

```powershell
$mingw = "<chemin>\mingw64\bin"
$env:PATH = "$mingw;$env:PATH"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = "$mingw\gcc.exe"
cargo +stable-x86_64-pc-windows-gnu test
```

### Linux / macOS

```bash
cd bird/rust
./scripts/build.sh
# ou
cargo test
cargo build --release
```

## CLI

```bash
bird-cli inspect examples/sample.plume
bird-cli validate examples/sample.plume
bird-cli to-svg examples/sample.plume out.svg
bird-cli to-pdf examples/sample.plume out.pdf
bird-cli to-eps examples/sample.plume out.eps
bird-cli serve .. --port 8787
```

Le serveur sert l’éditeur web (par défaut la racine passée en argument) :

```bash
bird-cli serve .. --port 8787
# http://127.0.0.1:8787/index.html
```

Avec `cargo run` :

```bash
cargo run -p bird-cli -- inspect examples/sample.plume
```

## API Rust

```rust
use bird_core::{export_eps, export_pdf, export_svg, stats, Project};

let text = std::fs::read_to_string("doc.plume")?;
let project = Project::from_str_tolerant(&text)?; // accepte aussi un JSON Fabric brut
let svg = export_svg(&project);
let pdf = export_pdf(&project);
let eps = export_eps(&project);
let info = stats(&project);
```

## Conversions

| Type Fabric | SVG | PDF | EPS |
|---|---|---|---|
| `rect` (dont `rx/ry`) | oui | oui | oui |
| `ellipse` / `circle` | oui | oui | oui |
| `line` | oui | oui | oui |
| `polygon` / `triangle` | oui | oui | oui |
| `path` (M/L/H/V/C/S/Q/T/Z) | oui | oui | oui |
| `i-text` / `text` / `textbox` | oui | oui (Helvetica) | oui (Helvetica) |
| `image` | oui (data URL) | non | non |
| groupes | oui | récursif | récursif |
| dégradés | repli première couleur | non | non |

Les transformations prises en charge : `left`, `top`, `scaleX`, `scaleY`,
`angle`, `originX`, `originY`, `flipX`, `flipY`, `opacity`, `strokeWidth`,
`strokeDashArray`, `strokeLineCap`, `strokeLineJoin`.

### Limites

- PDF/EPS : une seule page, pas d’images, pas de dégradés, texte en Helvetica.
- SVG : le texte est exporté avec la famille demandée ; les images conservent
  leur data URL.
- Le modèle ne dépend pas de Fabric : il lit le JSON produit par l’éditeur.
  Les évolutions inconnues du schéma sont ignorées, les champs utiles validés.

## Tests

```bash
cargo test
```

14 tests couvrent le modèle, les matrices, les chemins, les trois exporteurs et
la sécurité du serveur (traversée de répertoire).
