//! CLI Bird — inspecter, valider et convertir des projets .plume / Fabric.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use bird_core::{export_eps, export_pdf, export_svg, stats, Project};

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        print_help();
        return ExitCode::SUCCESS;
    }
    let result = match args[0].as_str() {
        "inspect" => cmd_inspect(&args[1..]),
        "validate" => cmd_validate(&args[1..]),
        "to-svg" => cmd_export(&args[1..], "svg"),
        "to-pdf" => cmd_export(&args[1..], "pdf"),
        "to-eps" => cmd_export(&args[1..], "eps"),
        "serve" => cmd_serve(&args[1..]),
        "help" | "--help" | "-h" => {
            print_help();
            Ok(())
        }
        other => Err(format!("Commande inconnue : {other} (essayez `bird-cli help`)")),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("bird-cli : {message}");
            ExitCode::FAILURE
        }
    }
}

fn print_help() {
    println!(
        "Bird CLI — moteur vectoriel natif\n\
         \n\
         USAGE\n\
         \x20 bird-cli inspect <fichier.plume>        Statistiques du document\n\
         \x20 bird-cli validate <fichier.plume>       Valide le schéma\n\
         \x20 bird-cli to-svg <entrée> [sortie]       Export SVG\n\
         \x20 bird-cli to-pdf <entrée> [sortie]       Export PDF vectoriel\n\
         \x20 bird-cli to-eps <entrée> [sortie]       Export EPS / PostScript\n\
         \x20 bird-cli serve [racine] [--port 8787]   Sert l'éditeur en local\n\
         \n\
         Sans chemin de sortie, le contenu est écrit sur stdout.\n\
         Formats acceptés : .plume, .bird, .json (projet Bird ou scène Fabric)."
    );
}

fn load(path: &str) -> Result<Project, String> {
    let text = fs::read_to_string(path)
        .map_err(|e| format!("Lecture impossible de {path} : {e}"))?;
    Project::from_str_tolerant(&text)
        .map_err(|e| format!("{path} : {e}"))
}

fn cmd_inspect(args: &[String]) -> Result<(), String> {
    let path = args.first().ok_or("Indiquez un fichier à inspecter")?;
    let project = load(path)?;
    let stats = stats(&project);
    let normalized = Path::new(path)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(path));
    let size = fs::metadata(&normalized).map(|m| m.len()).unwrap_or(0);

    println!("Bird — {}", normalized.display());
    println!("  application : {} {}", project.app, project.format);
    println!("  version     : {}", project.version);
    println!("  plan        : {} × {} px (fond {})",
        project.artboard.w,
        project.artboard.h,
        project.background().unwrap_or("transparent"));
    println!("  sauvegarde  : {}", project.saved_at.map(|t| t.to_string()).unwrap_or_else(|| "—".into()));
    println!("  taille      : {} octets", size);
    if let Some(view) = &project.view {
        println!("  guides      : {} · grille {} · règles {} · magnétisme {}",
            view.guides.len(),
            if view.show_grid { format!("{} px", view.grid_size) } else { "non".into() },
            if view.show_rulers { "oui" } else { "non" },
            if view.snap_enabled { "oui" } else { "non" });
    }
    println!("  objets      : {} (groupes {}, tracés {}, rects {}, ellipses {}, polygones {}, textes {}, images {})",
        stats.objects, stats.groups, stats.paths, stats.rects, stats.ellipses,
        stats.polygons, stats.texts, stats.images);
    println!("  masqués     : {} · verrouillés : {}", stats.hidden, stats.locked);
    Ok(())
}

fn cmd_validate(args: &[String]) -> Result<(), String> {
    let path = args.first().ok_or("Indiquez un fichier à valider")?;
    let project = load(path)?;
    let stats = stats(&project);
    println!("✓ {} valide — {} objets, plan {} × {}",
        path, stats.objects, project.artboard.w, project.artboard.h);
    Ok(())
}

fn cmd_export(args: &[String], format: &str) -> Result<(), String> {
    let input = args.first().ok_or("Indiquez un fichier d'entrée")?;
    let project = load(input)?;
    let default_name = format!(
        "{}.{}",
        Path::new(input)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("bird"),
        format
    );
    let output = args.get(1).cloned().unwrap_or(default_name);

    match format {
        "svg" => {
            let data = export_svg(&project);
            write_output(&output, data.as_bytes())?;
        }
        "pdf" => {
            let data = export_pdf(&project);
            write_output(&output, &data)?;
        }
        "eps" => {
            let data = export_eps(&project);
            write_output(&output, data.as_bytes())?;
        }
        _ => return Err("Format inconnu".into()),
    }
    let bytes = fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    println!("✓ {output} ({bytes} octets)");
    Ok(())
}

fn write_output(path: &str, bytes: &[u8]) -> Result<(), String> {
    if path == "-" {
        use std::io::Write;
        std::io::stdout()
            .write_all(bytes)
            .map_err(|e| format!("Écriture stdout impossible : {e}"))?;
    } else {
        fs::write(path, bytes).map_err(|e| format!("Écriture de {path} impossible : {e}"))?;
    }
    Ok(())
}

fn cmd_serve(args: &[String]) -> Result<(), String> {
    let mut root = ".".to_string();
    let mut host = "127.0.0.1".to_string();
    let mut port: u16 = 8787;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => {
                i += 1;
                port = args
                    .get(i)
                    .ok_or("--port attend un numéro")?
                    .parse()
                    .map_err(|_| "port invalide".to_string())?;
            }
            "--host" => {
                i += 1;
                host = args.get(i).ok_or("--host attend une adresse")?.clone();
            }
            value if value.starts_with('-') => return Err(format!("Option inconnue : {value}")),
            value => root = value.to_string(),
        }
        i += 1;
    }
    bird_core::server::serve(Path::new(&root), &host, port)
}
