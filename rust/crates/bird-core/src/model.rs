//! Modèle de document Bird / Fabric.
//!
//! Le cœur reste volontairement tolérant : un projet Bird contient une scène
//! Fabric (`objects`) dont les propriétés évoluent. On conserve donc la scène
//! en `serde_json::Value` et on n'exige que les champs utiles à l'export.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROJECT_VERSION: u32 = 3;
pub const FORMAT: &str = "bird-vector-project";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    #[serde(default = "default_app")]
    pub app: String,
    #[serde(default = "default_format")]
    pub format: String,
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub artboard: Artboard,
    #[serde(default)]
    pub view: Option<View>,
    #[serde(default)]
    pub json: Scene,
    #[serde(default, rename = "savedAt")]
    pub saved_at: Option<u64>,
}

fn default_app() -> String {
    "Bird".to_string()
}
fn default_format() -> String {
    FORMAT.to_string()
}
fn default_version() -> u32 {
    PROJECT_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artboard {
    #[serde(default = "default_width")]
    pub w: f64,
    #[serde(default = "default_height")]
    pub h: f64,
    #[serde(default)]
    pub color: Option<String>,
}

fn default_width() -> f64 {
    800.0
}
fn default_height() -> f64 {
    600.0
}

impl Default for Artboard {
    fn default() -> Self {
        Self { w: default_width(), h: default_height(), color: None }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct View {
    #[serde(default, rename = "showGrid")]
    pub show_grid: bool,
    #[serde(default, rename = "gridSize")]
    pub grid_size: f64,
    #[serde(default, rename = "showRulers")]
    pub show_rulers: bool,
    #[serde(default, rename = "snapEnabled")]
    pub snap_enabled: bool,
    #[serde(default)]
    pub guides: Vec<Guide>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guide {
    pub axis: String,
    pub pos: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Scene {
    #[serde(default)]
    pub objects: Vec<Value>,
    #[serde(default)]
    pub background: Option<String>,
}

impl Project {
    /// Charge un projet Bird, ou un ancien JSON Fabric brut.
    pub fn from_str_tolerant(input: &str) -> Result<Self, String> {
        let value: Value = serde_json::from_str(input)
            .map_err(|e| format!("JSON invalide : {e}"))?;
        Self::from_value(value)
    }

    pub fn from_value(value: Value) -> Result<Self, String> {
        let obj = value
            .as_object()
            .ok_or_else(|| "Le document doit être un objet JSON".to_string())?;

        // Projet Bird complet.
        if obj.contains_key("json") || obj.contains_key("artboard") {
            let project: Project = serde_json::from_value(value)
                .map_err(|e| format!("Schéma Bird invalide : {e}"))?;
            return project.normalized();
        }

        // Ancien projet : scène Fabric brute.
        if obj.contains_key("objects") {
            let scene: Scene = serde_json::from_value(value)
                .map_err(|e| format!("Scène Fabric invalide : {e}"))?;
            return Project {
                app: default_app(),
                format: FORMAT.to_string(),
                version: 0,
                artboard: Artboard::default(),
                view: None,
                json: scene,
                saved_at: None,
            }
            .normalized();
        }

        Err("Document sans 'json' ni 'objects'".to_string())
    }

    pub fn normalized(mut self) -> Result<Self, String> {
        if self.artboard.w <= 0.0 || self.artboard.h <= 0.0 {
            return Err("Dimensions de plan de travail invalides".to_string());
        }
        if self.artboard.w > 50_000.0 || self.artboard.h > 50_000.0 {
            return Err("Plan de travail trop grand (max 50 000 px)".to_string());
        }
        if self.version > PROJECT_VERSION {
            return Err(format!(
                "Version de projet {} plus récente que celle supportée ({})",
                self.version, PROJECT_VERSION
            ));
        }
        if self.format.is_empty() {
            self.format = FORMAT.to_string();
        }
        if self.app.is_empty() {
            self.app = default_app();
        }
        Ok(self)
    }

    pub fn objects(&self) -> &[Value] {
        &self.json.objects
    }

    pub fn background(&self) -> Option<&str> {
        self.artboard
            .color
            .as_deref()
            .or(self.json.background.as_deref())
            .filter(|c| *c != "transparent" && !c.is_empty())
    }
}

/// Statistiques lisibles pour `bird-cli inspect`.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Stats {
    pub objects: usize,
    pub groups: usize,
    pub paths: usize,
    pub rects: usize,
    pub ellipses: usize,
    pub polygons: usize,
    pub texts: usize,
    pub images: usize,
    pub hidden: usize,
    pub locked: usize,
}

pub fn collect_stats(objects: &[Value], stats: &mut Stats) {
    for object in objects {
        stats.objects += 1;
        let kind = object.get("type").and_then(Value::as_str).unwrap_or("?");
        match kind {
            "group" | "activeSelection" => {
                stats.groups += 1;
                if let Some(children) = object.get("objects").and_then(Value::as_array) {
                    collect_stats(children, stats);
                }
            }
            "path" => stats.paths += 1,
            "rect" => stats.rects += 1,
            "ellipse" | "circle" => stats.ellipses += 1,
            "polygon" | "triangle" => stats.polygons += 1,
            "i-text" | "text" | "textbox" => stats.texts += 1,
            "image" => stats.images += 1,
            _ => {}
        }
        if object.get("visible").and_then(Value::as_bool) == Some(false) {
            stats.hidden += 1;
        }
        if object.get("birdLocked").and_then(Value::as_bool) == Some(true) {
            stats.locked += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn loads_full_project() {
        let value = json!({
            "app": "Bird",
            "format": "bird-vector-project",
            "version": 3,
            "artboard": { "w": 1920, "h": 1080, "color": "#ffffff" },
            "json": { "objects": [ { "type": "rect" } ] }
        });
        let project = Project::from_value(value).unwrap();
        assert_eq!(project.artboard.w, 1920.0);
        assert_eq!(project.objects().len(), 1);
    }

    #[test]
    fn loads_legacy_fabric_scene() {
        let value = json!({ "objects": [ { "type": "path" } ], "background": "#fff" });
        let project = Project::from_value(value).unwrap();
        assert_eq!(project.version, 0);
        assert_eq!(project.artboard.w, 800.0);
        assert_eq!(project.objects().len(), 1);
    }

    #[test]
    fn rejects_bad_artboard() {
        let value = json!({
            "artboard": { "w": 0, "h": 100 },
            "json": { "objects": [] }
        });
        assert!(Project::from_value(value).is_err());
    }

    #[test]
    fn stats_walk_groups() {
        let objects = vec![
            json!({ "type": "group", "objects": [ { "type": "text" }, { "type": "image" } ] }),
            json!({ "type": "rect", "visible": false, "birdLocked": true }),
        ];
        let mut stats = Stats::default();
        collect_stats(&objects, &mut stats);
        assert_eq!(stats.objects, 4);
        assert_eq!(stats.texts, 1);
        assert_eq!(stats.images, 1);
        assert_eq!(stats.hidden, 1);
        assert_eq!(stats.locked, 1);
    }
}
