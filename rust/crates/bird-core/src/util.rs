//! Petits utilitaires partagés par les exporteurs : accès JSON, matrices
//! affines, couleurs, échappement et lecture des commandes de chemin Fabric.

use serde_json::Value;

pub fn num(value: &Value, key: &str, default: f64) -> f64 {
    value.get(key).and_then(Value::as_f64).unwrap_or(default)
}

pub fn int(value: &Value, key: &str, default: i64) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(default)
}

pub fn boolv(value: &Value, key: &str, default: bool) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(default)
}

pub fn strv<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

pub fn xml_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Matrice affine au format SVG/Fabric : x' = a*x + c*y + e, y' = b*x + d*y + f.
#[derive(Debug, Clone, Copy)]
pub struct Mat {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
}

impl Default for Mat {
    fn default() -> Self {
        Self::identity()
    }
}

impl Mat {
    pub const fn identity() -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: 0.0, f: 0.0 }
    }

    pub fn translate(x: f64, y: f64) -> Self {
        Self { a: 1.0, b: 0.0, c: 0.0, d: 1.0, e: x, f: y }
    }

    pub fn scale(x: f64, y: f64) -> Self {
        Self { a: x, b: 0.0, c: 0.0, d: y, e: 0.0, f: 0.0 }
    }

    pub fn rotate_deg(angle: f64) -> Self {
        let rad = angle.to_radians();
        let cos = rad.cos();
        let sin = rad.sin();
        Self { a: cos, b: sin, c: -sin, d: cos, e: 0.0, f: 0.0 }
    }

    /// `self` après `rhs` : le point est d'abord transformé par `rhs`, puis par `self`.
    /// L'opérateur `*` fait la même chose ; la méthode nommée reste pour la
    /// lisibilité des compositions en chaîne dans les exporteurs.
    #[allow(clippy::should_implement_trait)]
    pub fn mul(self, rhs: Mat) -> Mat {
        Mat {
            a: self.a * rhs.a + self.c * rhs.b,
            b: self.b * rhs.a + self.d * rhs.b,
            c: self.a * rhs.c + self.c * rhs.d,
            d: self.b * rhs.c + self.d * rhs.d,
            e: self.a * rhs.e + self.c * rhs.f + self.e,
            f: self.b * rhs.e + self.d * rhs.f + self.f,
        }
    }

    pub fn apply(&self, x: f64, y: f64) -> (f64, f64) {
        (
            self.a * x + self.c * y + self.e,
            self.b * x + self.d * y + self.f,
        )
    }

    pub fn scale_factor(&self) -> f64 {
        (self.a * self.d - self.b * self.c).abs().sqrt().max(0.0001)
    }

    pub fn to_svg(&self) -> String {
        format!(
            "matrix({:.4} {:.4} {:.4} {:.4} {:.4} {:.4})",
            self.a, self.b, self.c, self.d, self.e, self.f
        )
    }
}

impl std::ops::Mul for Mat {
    type Output = Mat;
    fn mul(self, rhs: Mat) -> Mat {
        Mat::mul(self, rhs)
    }
}

/// Boîte d'un objet Fabric : taille non mise à l'échelle et centre transformé.
#[derive(Debug, Clone, Copy)]
pub struct ObjectBox {
    pub w: f64,
    pub h: f64,
    pub center_x: f64,
    pub center_y: f64,
}

pub fn object_box(value: &Value) -> ObjectBox {
    let w = num(value, "width", 1.0);
    let h = num(value, "height", 1.0);
    let sx = num(value, "scaleX", 1.0);
    let sy = num(value, "scaleY", 1.0);
    let left = num(value, "left", 0.0);
    let top = num(value, "top", 0.0);
    let origin_x = strv(value, "originX").unwrap_or("left");
    let origin_y = strv(value, "originY").unwrap_or("top");
    let sw = (w * sx).abs();
    let sh = (h * sy).abs();
    let ox = match origin_x {
        "center" => 0.0,
        "right" => -sw / 2.0,
        _ => sw / 2.0,
    };
    let oy = match origin_y {
        "center" => 0.0,
        "bottom" => -sh / 2.0,
        _ => sh / 2.0,
    };
    ObjectBox { w, h, center_x: left + ox, center_y: top + oy }
}

/// Matrice d'un objet (translation au centre, rotation, échelle, miroirs).
pub fn object_matrix(value: &Value) -> Mat {
    let b = object_box(value);
    let angle = num(value, "angle", 0.0);
    let sx = num(value, "scaleX", 1.0) * if boolv(value, "flipX", false) { -1.0 } else { 1.0 };
    let sy = num(value, "scaleY", 1.0) * if boolv(value, "flipY", false) { -1.0 } else { 1.0 };
    Mat::translate(b.center_x, b.center_y)
        .mul(Mat::rotate_deg(angle))
        .mul(Mat::scale(sx, sy))
}

/// Matrice pour dessiner une forme centrée (rect, ellipse, polygone).
pub fn centered_matrix(value: &Value) -> Mat {
    let b = object_box(value);
    object_matrix(value).mul(Mat::translate(-b.w / 2.0, -b.h / 2.0))
}

pub fn normalize_hex(color: &str) -> Option<String> {
    let c = color.trim();
    if c.is_empty() || c == "none" || c == "transparent" {
        return None;
    }
    if c.starts_with('#') {
        return Some(c.to_string());
    }
    // rgb(r,g,b) et rgba(r,g,b,a)
    if let Some(rest) = c.strip_prefix("rgb") {
        let inside = rest
            .trim_start_matches('a')
            .trim_start_matches('(')
            .trim_end_matches(')');
        let parts: Vec<f64> = inside
            .split(',')
            .filter_map(|p| p.trim().parse::<f64>().ok())
            .collect();
        if parts.len() >= 3 {
            return Some(format!(
                "#{:02x}{:02x}{:02x}",
                parts[0].clamp(0.0, 255.0) as u8,
                parts[1].clamp(0.0, 255.0) as u8,
                parts[2].clamp(0.0, 255.0) as u8
            ));
        }
    }
    // Couleurs nommées : on laisse le SVG les gérer, PDF/EPS retomberont sur noir.
    Some(c.to_string())
}

pub fn fill_color(value: &Value) -> Option<String> {
    match value.get("fill") {
        Some(Value::String(s)) => normalize_hex(s),
        Some(Value::Object(obj)) => {
            // Dégradé Fabric : première couleur comme repli.
            obj.get("colorStops")
                .and_then(Value::as_array)
                .and_then(|stops| stops.first())
                .and_then(|stop| stop.get("color"))
                .and_then(Value::as_str)
                .and_then(normalize_hex)
        }
        _ => None,
    }
}

pub fn stroke_color(value: &Value) -> Option<String> {
    value
        .get("stroke")
        .and_then(Value::as_str)
        .and_then(normalize_hex)
}

pub fn dash_array(value: &Value) -> Vec<f64> {
    value
        .get("strokeDashArray")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_f64).collect())
        .unwrap_or_default()
}

#[derive(Debug, Clone, PartialEq)]
pub enum PathCmd {
    Move(f64, f64),
    Line(f64, f64),
    Curve(f64, f64, f64, f64, f64, f64),
    Quad(f64, f64, f64, f64),
    Close,
}

/// Convertit le tableau `path` de Fabric en commandes absolues.
/// Les commandes relatives (minuscules) sont résolues par rapport au point courant.
pub fn path_commands(value: &Value) -> Vec<PathCmd> {
    let mut out = Vec::new();
    let Some(items) = value.get("path").and_then(Value::as_array) else {
        return out;
    };
    // Fabric utilise un tableau de sous-tableaux [["M", x, y], ["C", ...]].
    let mut flat: Vec<Value> = Vec::with_capacity(items.len() * 2);
    for item in items {
        if let Some(parts) = item.as_array() {
            flat.extend(parts.iter().cloned());
        } else {
            flat.push(item.clone());
        }
    }
    let items = &flat;
    let mut cx = 0.0;
    let mut cy = 0.0;
    let mut start_x = 0.0;
    let mut start_y = 0.0;
    let mut i = 0;
    while i < items.len() {
        let Some(cmd) = items[i].as_str() else {
            i += 1;
            continue;
        };
        let relative = cmd.chars().next().map(|c| c.is_lowercase()).unwrap_or(false);
        let upper = cmd.to_uppercase();
        let n = |idx: usize| items.get(idx).and_then(Value::as_f64).unwrap_or(0.0);
        match upper.as_str() {
            "M" => {
                let x = n(i + 1) + if relative { cx } else { 0.0 };
                let y = n(i + 2) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Move(x, y));
                cx = x;
                cy = y;
                start_x = x;
                start_y = y;
                i += 3;
                // Coordonnées supplémentaires = lineto implicites.
                while i + 1 < items.len() && items[i].is_number() {
                    let x = n(i) + if relative { cx } else { 0.0 };
                    let y = n(i + 1) + if relative { cy } else { 0.0 };
                    out.push(PathCmd::Line(x, y));
                    cx = x;
                    cy = y;
                    i += 2;
                }
            }
            "L" => {
                let x = n(i + 1) + if relative { cx } else { 0.0 };
                let y = n(i + 2) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Line(x, y));
                cx = x;
                cy = y;
                i += 3;
            }
            "H" => {
                let x = n(i + 1) + if relative { cx } else { 0.0 };
                out.push(PathCmd::Line(x, cy));
                cx = x;
                i += 2;
            }
            "V" => {
                let y = n(i + 1) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Line(cx, y));
                cy = y;
                i += 2;
            }
            "C" => {
                let x1 = n(i + 1) + if relative { cx } else { 0.0 };
                let y1 = n(i + 2) + if relative { cy } else { 0.0 };
                let x2 = n(i + 3) + if relative { cx } else { 0.0 };
                let y2 = n(i + 4) + if relative { cy } else { 0.0 };
                let x = n(i + 5) + if relative { cx } else { 0.0 };
                let y = n(i + 6) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Curve(x1, y1, x2, y2, x, y));
                cx = x;
                cy = y;
                i += 7;
            }
            "S" => {
                let x2 = n(i + 1) + if relative { cx } else { 0.0 };
                let y2 = n(i + 2) + if relative { cy } else { 0.0 };
                let x = n(i + 3) + if relative { cx } else { 0.0 };
                let y = n(i + 4) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Curve(cx, cy, x2, y2, x, y));
                cx = x;
                cy = y;
                i += 5;
            }
            "Q" => {
                let x1 = n(i + 1) + if relative { cx } else { 0.0 };
                let y1 = n(i + 2) + if relative { cy } else { 0.0 };
                let x = n(i + 3) + if relative { cx } else { 0.0 };
                let y = n(i + 4) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Quad(x1, y1, x, y));
                cx = x;
                cy = y;
                i += 5;
            }
            "T" => {
                let x = n(i + 1) + if relative { cx } else { 0.0 };
                let y = n(i + 2) + if relative { cy } else { 0.0 };
                out.push(PathCmd::Quad(cx, cy, x, y));
                cx = x;
                cy = y;
                i += 3;
            }
            "Z" => {
                out.push(PathCmd::Close);
                cx = start_x;
                cy = start_y;
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

/// Sérialise un chemin pour SVG, avec une matrice appliquée aux points.
pub fn path_to_svg(cmds: &[PathCmd], mat: Mat) -> String {
    let mut out = String::new();
    for cmd in cmds {
        match cmd {
            PathCmd::Move(x, y) => {
                let (x, y) = mat.apply(*x, *y);
                out.push_str(&format!("M{:.3} {:.3} ", x, y));
            }
            PathCmd::Line(x, y) => {
                let (x, y) = mat.apply(*x, *y);
                out.push_str(&format!("L{:.3} {:.3} ", x, y));
            }
            PathCmd::Curve(x1, y1, x2, y2, x, y) => {
                let (x1, y1) = mat.apply(*x1, *y1);
                let (x2, y2) = mat.apply(*x2, *y2);
                let (x, y) = mat.apply(*x, *y);
                out.push_str(&format!(
                    "C{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} ",
                    x1, y1, x2, y2, x, y
                ));
            }
            PathCmd::Quad(x1, y1, x, y) => {
                let (x1, y1) = mat.apply(*x1, *y1);
                let (x, y) = mat.apply(*x, *y);
                out.push_str(&format!("Q{:.3} {:.3} {:.3} {:.3} ", x1, y1, x, y));
            }
            PathCmd::Close => out.push_str("Z "),
        }
    }
    out.trim().to_string()
}

pub fn polygon_points(value: &Value) -> Vec<(f64, f64)> {
    value
        .get("points")
        .and_then(Value::as_array)
        .map(|points| {
            points
                .iter()
                .map(|p| (num(p, "x", 0.0), num(p, "y", 0.0)))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn matrix_composition() {
        let m = Mat::translate(10.0, 0.0).mul(Mat::rotate_deg(90.0));
        let (x, y) = m.apply(0.0, 1.0);
        assert!((x - 9.0).abs() < 0.001);
        assert!((y - 0.0).abs() < 0.001);
    }

    #[test]
    fn parses_path() {
        let v = json!({ "path": [["M", 0, 0], ["L", 10, 0], ["C", 10, 0, 10, 10, 0, 10], ["Z"]] });
        let cmds = path_commands(&v);
        assert_eq!(cmds.len(), 4);
        assert_eq!(cmds[3], PathCmd::Close);
    }

    #[test]
    fn escapes_xml() {
        assert_eq!(xml_escape("a & <b>"), "a &amp; &lt;b&gt;");
    }
}
