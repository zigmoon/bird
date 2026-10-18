//! Bird Core — modèle de document vectoriel Bird/Fabric et exporteurs natifs.
//!
//! Le crate ne dépend que de `serde_json` : il compile vite, s'utilise en CLI,
//! en serveur ou comme bibliothèque dans une application desktop Rust.

pub mod eps;
pub mod model;
pub mod pdf;
pub mod server;
pub mod svg;
pub mod util;

pub use model::{collect_stats, Artboard, Project, Stats, PROJECT_VERSION};
pub use util::Mat;

/// Export SVG.
pub fn export_svg(project: &Project) -> String {
    svg::export(project)
}

/// Export PDF vectoriel.
pub fn export_pdf(project: &Project) -> Vec<u8> {
    pdf::export(project)
}

/// Export EPS (PostScript).
pub fn export_eps(project: &Project) -> String {
    eps::export(project)
}

/// Statistiques d'un projet.
pub fn stats(project: &Project) -> Stats {
    let mut stats = Stats::default();
    collect_stats(project.objects(), &mut stats);
    stats
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use serde_json::json;

    fn sample() -> Project {
        Project::from_value(json!({
            "app": "Bird",
            "format": "bird-vector-project",
            "version": 3,
            "artboard": { "w": 640, "h": 480, "color": "#ffffff" },
            "json": { "objects": [
                { "type": "rect", "left": 20, "top": 20, "width": 120, "height": 80, "fill": "#1677ff" },
                { "type": "ellipse", "left": 200, "top": 40, "width": 100, "height": 60, "fill": "#ff6b6b" },
                { "type": "polygon", "left": 320, "top": 300, "width": 120, "height": 120,
                  "fill": "#000000", "points": [ {"x":0,"y":0}, {"x":60,"y":0}, {"x":60,"y":60} ] },
                { "type": "i-text", "left": 40, "top": 120, "width": 240, "height": 40,
                  "text": "Bird Rust", "fontSize": 28, "fill": "#000000" }
            ]}
        }))
        .unwrap()
    }

    #[test]
    fn full_pipeline() {
        let project = sample();
        let svg = export_svg(&project);
        assert!(svg.contains("Bird Rust"));
        let pdf = export_pdf(&project);
        assert!(pdf.starts_with(b"%PDF-1.4"));
        let eps = export_eps(&project);
        assert!(eps.starts_with("%!PS-Adobe"));
        let stats = stats(&project);
        assert!(stats.objects >= 4);
        assert_eq!(stats.texts, 1);
    }
}
