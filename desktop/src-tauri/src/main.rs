// Coquille native de Bird (Tauri 2).
//
// Elle n'ajoute AUCUNE logique métier : le moteur reste `bird/js/`, identique
// au web. Tauri apporte trois choses que le navigateur ne donne pas :
//   • accès disque natif (ouvrir/enregistrer sans passer par un téléchargement)
//   • une vraie fenêtre d'application, avec menu et raccourcis système
//   • un binaire signable pour macOS, Windows et Linux
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize)]
struct AppInfo {
    version: String,
    platform: String,
}

/// Le front-end interroge cette commande au démarrage pour afficher la
/// version réelle du binaire et adapter les libellés de raccourcis
/// (⌘ sur macOS, Ctrl ailleurs).
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Bird");
}
