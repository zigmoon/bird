// Coquille native de Bird (Tauri 2).
//
// Elle n'ajoute AUCUNE logique métier : le moteur reste `bird/js/`, identique
// au web. Tauri apporte trois choses que le navigateur ne donne pas :
//   • un MENU NATIF qui porte les raccourcis (⌘ sur macOS, Ctrl ailleurs)
//   • l'accès disque : ouvrir/enregistrer un vrai fichier, sans détour par
//     le dossier « Téléchargements »
//   • un binaire signable pour macOS, Windows et Linux
//
// Le menu n'exécute rien lui-même : il émet `bird://command` avec un
// identifiant, et le moteur web lance la commande correspondante
// (`BirdCommands`, js/commands.js). Une seule implémentation par action,
// donc aucun risque qu'un raccourci du menu et un raccourci clavier
// divergent.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem, MenuItemBuilder, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::menu::AboutMetadata;
use tauri::{Emitter, Manager, Runtime};

/// Identifiants que le menu sait émettre. Tout le reste (Échap, V, P, T…)
/// reste au clavier du web : une touche seule ne passe jamais par un menu.
const PREFIXES: [&str; 5] = ["file.", "edit.", "object.", "view.", "help."];

#[derive(Default)]
struct ShellState {
    /// Commandes dont le menu natif possède réellement le raccourci.
    /// Le web s'en sert pour ne pas rejouer la même touche deux fois.
    menu_commands: Mutex<Vec<String>>,
    /// Fichier reçu au lancement (double-clic sur un .plume) ou par
    /// l'événement « Ouvrir avec » de macOS. Consommé une seule fois.
    pending_file: Mutex<Option<String>>,
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    platform: String,
    /// Commandes dont le menu natif gère le raccourci.
    menu: Vec<String>,
}

#[tauri::command]
fn app_info(state: tauri::State<'_, ShellState>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        menu: state.menu_commands.lock().map(|m| m.clone()).unwrap_or_default(),
    }
}

/// Fichier à ouvrir au démarrage (association de fichiers), ou `null`.
#[tauri::command]
fn pending_file(state: tauri::State<'_, ShellState>) -> Option<String> {
    state.pending_file.lock().ok().and_then(|mut slot| slot.take())
}

/// Le titre de la fenêtre suit le document ouvert. Tauri ne le fait pas
/// automatiquement quand `document.title` change dans le webview.
#[tauri::command]
fn set_window_title(window: tauri::WebviewWindow, title: String) {
    let _ = window.set_title(&title);
}

/* ════════════════════════════════════════════════════════════
   FICHIERS — le dialogue est côté web (`plugin:dialog|open`), la
   lecture/écriture est ici. Deux raisons : aucune configuration de
   portée `fs` à maintenir, et les exports binaires (PDF/X, PNG)
   sortent en un seul appel.
   ════════════════════════════════════════════════════════════ */
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Lecture de {path} impossible : {e}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    write_bytes(&path, contents.as_bytes())
}

#[tauri::command]
fn write_binary_file(path: String, base64: String) -> Result<(), String> {
    let bytes = base64_decode(&base64).ok_or_else(|| "Contenu base64 invalide".to_string())?;
    write_bytes(&path, &bytes)
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Lecture de {path} impossible : {e}"))?;
    Ok(base64_encode(&bytes))
}

fn write_bytes(path: &str, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Dossier {} impossible à créer : {e}", parent.display()))?;
        }
    }
    std::fs::write(path, bytes).map_err(|e| format!("Écriture de {path} impossible : {e}"))
}

/// Ouvre une URL de documentation dans le navigateur par défaut.
/// Tout ce qui n'est pas http(s) est refusé : cette commande ne doit pas
/// devenir un lanceur de programme arbitraire.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Seules les URL http(s) sont autorisées".into());
    }
    if url.contains('"') || url.contains(' ') || url.contains('\n') {
        return Err("URL invalide".into());
    }
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .status();
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(&url).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = std::process::Command::new("xdg-open").arg(&url).status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("Ouverture refusée ({s})")),
        Err(e) => Err(format!("Impossible d'ouvrir le navigateur : {e}")),
    }
}

/* ── Base64 (RFC 4648) — 40 lignes plutôt qu'une dépendance de plus ── */
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(input.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for byte in input.bytes() {
        if byte == b'=' || byte == b'\n' || byte == b'\r' {
            continue;
        }
        let value = B64.iter().position(|&c| c == byte)? as u32;
        acc = (acc << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((acc >> bits) & 0xff) as u8);
        }
    }
    Some(out)
}

/* ════════════════════════════════════════════════════════════
   MENU NATIF
   ════════════════════════════════════════════════════════════ */

/// Construit un élément de menu. Si le raccourci est refusé par la
/// plateforme, on garde l'élément SANS raccourci : une entrée de menu qui
/// perd sa touche reste utilisable, elle ne casse pas le démarrage.
fn item<R: Runtime, M: Manager<R>>(
    app: &M,
    id: &str,
    label: &str,
    accel: Option<&str>,
    owned: &mut Vec<String>,
) -> MenuItem<R> {
    if let Some(a) = accel {
        if let Ok(built) = MenuItemBuilder::with_id(id, label).accelerator(a).build(app) {
            owned.push(id.to_string());
            return built;
        }
        eprintln!("[bird] raccourci refusé par la plateforme : {id} — {a}");
    }
    MenuItemBuilder::with_id(id, label)
        .build(app)
        .unwrap_or_else(|e| panic!("menu : {id} impossible à construire ({e})"))
}

fn build_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let mut owned: Vec<String> = Vec::new();
    let sep = |a: &tauri::AppHandle<R>| PredefinedMenuItem::separator(a);

    let file = Submenu::new(app, "Fichier", true)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::new(app, "Bird", true)?;
        app_menu.append(&PredefinedMenuItem::about(
            app,
            Some("À propos de Bird"),
            Some(AboutMetadata {
                name: Some("Bird".into()),
                version: Some(env!("CARGO_PKG_VERSION").into()),
                comments: Some(
                    "Éditeur vectoriel local-first — import PDF/AI/EPS, export PDF/X-1a".into(),
                ),
                copyright: Some("© Zigmoon".into()),
                ..Default::default()
            }),
        )?)?;
        app_menu.append(&sep(app)?)?;
        app_menu.append(&PredefinedMenuItem::services(app, None)?)?;
        app_menu.append(&sep(app)?)?;
        app_menu.append(&PredefinedMenuItem::hide(app, None)?)?;
        app_menu.append(&PredefinedMenuItem::hide_others(app, None)?)?;
        app_menu.append(&PredefinedMenuItem::show_all(app, None)?)?;
        app_menu.append(&sep(app)?)?;
        app_menu.append(&PredefinedMenuItem::quit(app, Some("Quitter Bird"))?)?;
        file.append(&app_menu)?;
    }

    file.append(&item(app, "file.new", "Nouveau document", Some("CmdOrCtrl+N"), &mut owned))?;
    file.append(&item(app, "file.open", "Ouvrir…", Some("CmdOrCtrl+O"), &mut owned))?;
    file.append(&item(app, "file.save", "Enregistrer", Some("CmdOrCtrl+S"), &mut owned))?;
    file.append(&item(app, "file.saveAs", "Enregistrer sous…", Some("CmdOrCtrl+Shift+S"), &mut owned))?;
    file.append(&item(app, "file.import", "Importer un fichier…", Some("CmdOrCtrl+Shift+P"), &mut owned))?;
    file.append(&sep(app)?)?;
    file.append(&item(app, "file.export", "Exporter…", Some("CmdOrCtrl+E"), &mut owned))?;
    file.append(&item(app, "file.exportPdfX", "Exporter en PDF/X-1a…", None, &mut owned))?;
    file.append(&item(app, "file.print", "Imprimer…", Some("CmdOrCtrl+P"), &mut owned))?;
    file.append(&sep(app)?)?;
    file.append(&PredefinedMenuItem::close_window(app, Some("Fermer la fenêtre"))?)?;

    let edit = Submenu::new(app, "Édition", true)?;
    edit.append(&item(app, "edit.undo", "Annuler", Some("CmdOrCtrl+Z"), &mut owned))?;
    edit.append(&item(app, "edit.redo", "Rétablir", Some("CmdOrCtrl+Shift+Z"), &mut owned))?;
    edit.append(&item(app, "edit.redoAlt", "Rétablir (Ctrl+Y)", Some("CmdOrCtrl+Y"), &mut owned))?;
    edit.append(&sep(app)?)?;
    edit.append(&item(app, "edit.cut", "Couper", Some("CmdOrCtrl+X"), &mut owned))?;
    edit.append(&item(app, "edit.copy", "Copier", Some("CmdOrCtrl+C"), &mut owned))?;
    edit.append(&item(app, "edit.paste", "Coller", Some("CmdOrCtrl+V"), &mut owned))?;
    edit.append(&item(app, "edit.pasteInPlace", "Coller sur place", Some("CmdOrCtrl+Shift+V"), &mut owned))?;
    edit.append(&item(app, "edit.duplicate", "Dupliquer", Some("CmdOrCtrl+D"), &mut owned))?;
    edit.append(&item(app, "edit.delete", "Supprimer", None, &mut owned))?;
    edit.append(&sep(app)?)?;
    edit.append(&item(app, "edit.selectAll", "Tout sélectionner", Some("CmdOrCtrl+A"), &mut owned))?;
    edit.append(&item(app, "edit.deselect", "Désélectionner", Some("CmdOrCtrl+Shift+A"), &mut owned))?;

    let object = Submenu::new(app, "Objet", true)?;
    object.append(&item(app, "object.group", "Grouper", Some("CmdOrCtrl+G"), &mut owned))?;
    object.append(&item(app, "object.ungroup", "Dégrouper", Some("CmdOrCtrl+Shift+G"), &mut owned))?;
    object.append(&sep(app)?)?;
    object.append(&item(app, "object.front", "Premier plan", Some("CmdOrCtrl+Shift+]"), &mut owned))?;
    object.append(&item(app, "object.forward", "Avancer d'un rang", Some("CmdOrCtrl+]"), &mut owned))?;
    object.append(&item(app, "object.backward", "Reculer d'un rang", Some("CmdOrCtrl+["), &mut owned))?;
    object.append(&item(app, "object.back", "Arrière-plan", Some("CmdOrCtrl+Shift+["), &mut owned))?;
    object.append(&sep(app)?)?;
    object.append(&item(app, "object.lock", "Verrouiller", Some("CmdOrCtrl+2"), &mut owned))?;
    object.append(&item(app, "object.unlockAll", "Tout déverrouiller", Some("CmdOrCtrl+Alt+2"), &mut owned))?;
    object.append(&item(app, "object.hide", "Masquer", Some("CmdOrCtrl+3"), &mut owned))?;
    object.append(&item(app, "object.showAll", "Tout afficher", Some("CmdOrCtrl+Alt+3"), &mut owned))?;
    object.append(&sep(app)?)?;
    object.append(&item(app, "object.outlineStroke", "Contour de trait", Some("CmdOrCtrl+Shift+O"), &mut owned))?;
    object.append(&item(app, "object.textToCurves", "Texte en courbes", None, &mut owned))?;
    object.append(&item(app, "object.simplify", "Simplifier le tracé", None, &mut owned))?;

    let view = Submenu::new(app, "Affichage", true)?;
    view.append(&item(app, "view.zoomIn", "Zoom avant", Some("CmdOrCtrl+="), &mut owned))?;
    view.append(&item(app, "view.zoomOut", "Zoom arrière", Some("CmdOrCtrl+-"), &mut owned))?;
    view.append(&item(app, "view.fit", "Ajuster à l'écran", Some("CmdOrCtrl+0"), &mut owned))?;
    view.append(&item(app, "view.actual", "Taille réelle (100 %)", Some("CmdOrCtrl+1"), &mut owned))?;
    view.append(&item(app, "view.selection", "Zoom sur la sélection", Some("CmdOrCtrl+Alt+0"), &mut owned))?;
    view.append(&sep(app)?)?;
    view.append(&item(app, "view.rulers", "Règles", Some("CmdOrCtrl+R"), &mut owned))?;
    view.append(&item(app, "view.grid", "Grille", Some("CmdOrCtrl+'"), &mut owned))?;
    view.append(&item(app, "view.snap", "Magnétisme", Some("CmdOrCtrl+;"), &mut owned))?;
    view.append(&sep(app)?)?;
    view.append(&item(app, "view.fullscreen", "Plein écran", Some("F11"), &mut owned))?;
    view.append(&item(app, "view.panel", "Panneau de droite", Some("CmdOrCtrl+Alt+P"), &mut owned))?;

    let window = Submenu::new(app, "Fenêtre", true)?;
    window.append(&PredefinedMenuItem::minimize(app, None)?)?;
    #[cfg(target_os = "macos")]
    window.append(&PredefinedMenuItem::maximize(app, None)?)?;

    let help = Submenu::new(app, "Aide", true)?;
    help.append(&item(app, "help.shortcuts", "Raccourcis clavier", Some("F1"), &mut owned))?;
    help.append(&item(app, "help.plugins", "Plug-ins…", Some("CmdOrCtrl+K"), &mut owned))?;
    help.append(&sep(app)?)?;
    help.append(&item(app, "help.docs", "Documentation", None, &mut owned))?;

    let menu = Menu::new(app)?;
    menu.append(&file)?;
    menu.append(&edit)?;
    menu.append(&object)?;
    menu.append(&view)?;
    menu.append(&window)?;
    menu.append(&help)?;

    if let Some(state) = app.try_state::<ShellState>() {
        if let Ok(mut list) = state.menu_commands.lock() {
            *list = owned;
        }
    }
    Ok(menu)
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ShellState::default())
        .invoke_handler(tauri::generate_handler![
            app_info,
            pending_file,
            set_window_title,
            read_text_file,
            write_text_file,
            write_binary_file,
            read_binary_file,
            open_external,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            // Double-clic sur un .plume / .bird : le chemin arrive en argv.
            if let Some(path) = std::env::args().nth(1) {
                if std::path::Path::new(&path).is_file() {
                    if let Some(state) = app.try_state::<ShellState>() {
                        if let Ok(mut slot) = state.pending_file.lock() {
                            *slot = Some(path);
                        }
                    }
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if !PREFIXES.iter().any(|p| id.starts_with(p)) {
                return; // élément prédéfini (Fermer, Réduire…) : déjà traité
            }
            // Le plein écran est une affaire de fenêtre, pas de canevas :
            // il est traité ici et n'est pas renvoyé au web.
            if id == "view.fullscreen" {
                if let Some(window) = app.get_webview_window("main") {
                    let full = window.is_fullscreen().unwrap_or(false);
                    let _ = window.set_fullscreen(!full);
                }
                return;
            }
            if let Err(err) = app.emit("bird://command", id) {
                eprintln!("[bird] commande {id} non transmise : {err}");
            }
        })
        .build(tauri::generate_context!())
        .expect("erreur au lancement de Bird");

    app.run(|app, event| {
        // macOS ne passe pas les fichiers en argv : il émet « Ouvrir avec ».
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Ok(path) = url.to_file_path() {
                    if let Some(state) = app.try_state::<ShellState>() {
                        if let Ok(mut slot) = state.pending_file.lock() {
                            *slot = Some(path.to_string_lossy().to_string());
                        }
                    }
                    let _ = app.emit("bird://open-file", path.to_string_lossy().to_string());
                    break;
                }
            }
        }
        #[cfg(not(any(target_os = "macos", target_os = "ios")))]
        let _ = (app, event);
    });
}
