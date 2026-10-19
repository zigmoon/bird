//! Export PDF vectoriel minimaliste (chemins, formes, texte Helvetica).
//!
//! Le PDF produit est volontairement simple mais valide : une page, une police
//! base-14 et un flux de contenu non compressé. Il s'ouvre dans Illustrator,
//! Acrobat et les principaux RIP. Les images et les dégradés ne sont pas
//! convertis (utilisez l'export SVG pour ces cas).

use crate::model::Project;
use crate::util::*;
use serde_json::Value;

pub fn export(project: &Project) -> Vec<u8> {
    let w = project.artboard.w.max(1.0);
    let h = project.artboard.h.max(1.0);
    let mut content = String::new();

    if let Some(color) = project.background().and_then(normalize_hex) {
        let (r, g, b) = hex_to_rgb(&color);
        content.push_str(&format!("{r:.4} {g:.4} {b:.4} rg 0 0 {w:.3} {h:.3} re f\n"));
    }

    render_objects(project.objects(), Mat::identity(), h, &mut content);

    build_pdf(w, h, &content)
}

fn render_objects(objects: &[Value], parent: Mat, page_h: f64, content: &mut String) {
    for object in objects {
        if !boolv(object, "visible", true) {
            continue;
        }
        let kind = strv(object, "type").unwrap_or("path");
        match kind {
            "group" | "activeSelection" => {
                let m = parent.mul(object_matrix(object));
                if let Some(children) = object.get("objects").and_then(Value::as_array) {
                    render_objects(children, m, page_h, content);
                }
            }
            "rect" => {
                let b = object_box(object);
                let m = centered_matrix(object);
                path_rect(0.0, 0.0, b.w, b.h, num(object, "rx", 0.0), m, page_h, content);
                paint(object, m, page_h, content);
            }
            "ellipse" | "circle" => {
                let b = object_box(object);
                let m = centered_matrix(object);
                path_ellipse(b.w / 2.0, b.h / 2.0, m, page_h, content);
                paint(object, m, page_h, content);
            }
            "line" => {
                let m = parent.mul(object_matrix(object));
                let x1 = num(object, "x1", 0.0);
                let y1 = num(object, "y1", 0.0);
                let x2 = num(object, "x2", num(object, "width", 1.0));
                let y2 = num(object, "y2", 0.0);
                let p1 = m.apply(x1, y1);
                let p2 = m.apply(x2, y2);
                content.push_str(&format!(
                    "{:.3} {:.3} m {:.3} {:.3} l\n",
                    p1.0,
                    page_h - p1.1,
                    p2.0,
                    page_h - p2.1
                ));
                paint(object, m, page_h, content);
            }
            "polygon" | "triangle" => {
                let m = parent.mul(object_matrix(object));
                let points = polygon_points(object);
                if points.is_empty() {
                    continue;
                }
                for (i, (x, y)) in points.iter().enumerate() {
                    let (px, py) = m.apply(*x, *y);
                    content.push_str(&format!(
                        "{:.3} {:.3} {}",
                        px,
                        page_h - py,
                        if i == 0 { "m" } else { "l" }
                    ));
                    content.push(' ');
                }
                content.push_str("h\n");
                paint(object, m, page_h, content);
            }
            "path" => {
                let cmds = path_commands(object);
                if cmds.is_empty() {
                    continue;
                }
                let m = parent.mul(object_matrix(object));
                let po_x = object.get("pathOffset").map(|p| num(p, "x", 0.0)).unwrap_or(0.0);
                let po_y = object.get("pathOffset").map(|p| num(p, "y", 0.0)).unwrap_or(0.0);
                let pm = m.mul(Mat::translate(-po_x, -po_y));
                path_commands_pdf(&cmds, pm, page_h, content);
                paint(object, pm, page_h, content);
            }
            "i-text" | "text" | "textbox" => {
                render_text(object, parent, page_h, content);
            }
            _ => {}
        }
    }
}

// Les huit paramètres sont la géométrie elle-même (position, taille, rayon,
// matrice, hauteur de page, sortie). Les regrouper dans une structure
// n'ajouterait qu'un niveau d'indirection à un calcul de tracé.
#[allow(clippy::too_many_arguments)]
fn path_rect(
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    radius: f64,
    mat: Mat,
    page_h: f64,
    content: &mut String,
) {
    let r = radius.min(w / 2.0).min(h / 2.0).max(0.0);
    if r <= 0.001 {
        let pts = [
            (x, y),
            (x + w, y),
            (x + w, y + h),
            (x, y + h),
        ];
        for (i, (px, py)) in pts.iter().enumerate() {
            let (tx, ty) = mat.apply(*px, *py);
            content.push_str(&format!(
                "{:.3} {:.3} {} ",
                tx,
                page_h - ty,
                if i == 0 { "m" } else { "l" }
            ));
        }
        content.push_str("h\n");
        return;
    }
    let k = 0.552_284_749_8 * r;
    let mut first = true;
    let mut line = |px: f64, py: f64, content: &mut String| {
        let (tx, ty) = mat.apply(px, py);
        content.push_str(&format!(
            "{:.3} {:.3} {}\n",
            tx,
            page_h - ty,
            if first { "m" } else { "l" }
        ));
        first = false;
    };
    let curve = |x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64, content: &mut String| {
        let p1 = mat.apply(x1, y1);
        let p2 = mat.apply(x2, y2);
        let p3 = mat.apply(x3, y3);
        content.push_str(&format!(
            "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} c\n",
            p1.0,
            page_h - p1.1,
            p2.0,
            page_h - p2.1,
            p3.0,
            page_h - p3.1
        ));
    };
    line(x + r, y, content);
    line(x + w - r, y, content);
    curve(x + w - r + k, y, x + w, y + r - k, x + w, y + r, content);
    line(x + w, y + h - r, content);
    curve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h, content);
    line(x + r, y + h, content);
    curve(x + r - k, y + h, x, y + h - r + k, x, y + h - r, content);
    line(x, y + r, content);
    curve(x, y + r - k, x + r - k, y, x + r, y, content);
    content.push_str("h\n");
}

fn path_ellipse(rx: f64, ry: f64, mat: Mat, page_h: f64, content: &mut String) {
    let k = 0.552_284_749_8;
    let p = |x: f64, y: f64| mat.apply(x, y);
    let c = |x1: f64, y1: f64, x2: f64, y2: f64, x3: f64, y3: f64| {
        let p1 = p(x1, y1);
        let p2 = p(x2, y2);
        let p3 = p(x3, y3);
        format!(
            "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} c\n",
            p1.0,
            page_h - p1.1,
            p2.0,
            page_h - p2.1,
            p3.0,
            page_h - p3.1
        )
    };
    let start = p(rx, 0.0);
    content.push_str(&format!("{:.3} {:.3} m\n", start.0, page_h - start.1));
    content.push_str(&c(rx, ry * k, rx * k, ry, 0.0, ry));
    content.push_str(&c(-rx * k, ry, -rx, ry * k, -rx, 0.0));
    content.push_str(&c(-rx, -ry * k, -rx * k, -ry, 0.0, -ry));
    content.push_str(&c(rx * k, -ry, rx, -ry * k, rx, 0.0));
    content.push_str("h\n");
}

fn path_commands_pdf(cmds: &[PathCmd], mat: Mat, page_h: f64, content: &mut String) {
    let (mut cx, mut cy) = (0.0, 0.0);
    for cmd in cmds {
        match cmd {
            PathCmd::Move(x, y) => {
                let (px, py) = mat.apply(*x, *y);
                content.push_str(&format!("{:.3} {:.3} m\n", px, page_h - py));
                cx = *x;
                cy = *y;
            }
            PathCmd::Line(x, y) => {
                let (px, py) = mat.apply(*x, *y);
                content.push_str(&format!("{:.3} {:.3} l\n", px, page_h - py));
                cx = *x;
                cy = *y;
            }
            PathCmd::Curve(x1, y1, x2, y2, x, y) => {
                let p1 = mat.apply(*x1, *y1);
                let p2 = mat.apply(*x2, *y2);
                let p3 = mat.apply(*x, *y);
                content.push_str(&format!(
                    "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} c\n",
                    p1.0,
                    page_h - p1.1,
                    p2.0,
                    page_h - p2.1,
                    p3.0,
                    page_h - p3.1
                ));
                cx = *x;
                cy = *y;
            }
            PathCmd::Quad(x1, y1, x, y) => {
                // Conversion quadratique → cubique depuis le point courant.
                let c1 = (cx + 2.0 / 3.0 * (x1 - cx), cy + 2.0 / 3.0 * (y1 - cy));
                let c2 = (x + 2.0 / 3.0 * (x1 - x), y + 2.0 / 3.0 * (y1 - y));
                let p1 = mat.apply(c1.0, c1.1);
                let p2 = mat.apply(c2.0, c2.1);
                let p3 = mat.apply(*x, *y);
                content.push_str(&format!(
                    "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} c\n",
                    p1.0,
                    page_h - p1.1,
                    p2.0,
                    page_h - p2.1,
                    p3.0,
                    page_h - p3.1
                ));
                cx = *x;
                cy = *y;
            }
            PathCmd::Close => {
                content.push_str("h\n");
            }
        }
    }
}

fn paint(object: &Value, mat: Mat, _page_h: f64, content: &mut String) {
    let fill = fill_color(object);
    let stroke = stroke_color(object);
    let even_odd = strv(object, "fillRule").map(|f| f == "evenodd").unwrap_or(false);
    match (&fill, &stroke) {
        (Some(f), Some(s)) => {
            let (r, g, b) = hex_to_rgb(f);
            let (sr, sg, sb) = hex_to_rgb(s);
            let width = num(object, "strokeWidth", 1.0) * mat.scale_factor();
            content.push_str(&format!(
                "{r:.4} {g:.4} {b:.4} rg {sr:.4} {sg:.4} {sb:.4} RG {width:.3} w\n"
            ));
            content.push_str(if even_odd { "B*\n" } else { "B\n" });
        }
        (Some(f), None) => {
            let (r, g, b) = hex_to_rgb(f);
            content.push_str(&format!("{r:.4} {g:.4} {b:.4} rg\n"));
            content.push_str(if even_odd { "f*\n" } else { "f\n" });
        }
        (None, Some(s)) => {
            let (r, g, b) = hex_to_rgb(s);
            let width = num(object, "strokeWidth", 1.0) * mat.scale_factor();
            content.push_str(&format!("{r:.4} {g:.4} {b:.4} RG {width:.3} w\nS\n"));
        }
        (None, None) => content.push_str("n\n"),
    }
}

fn render_text(object: &Value, parent: Mat, page_h: f64, content: &mut String) {
    let text = strv(object, "text").unwrap_or("");
    if text.is_empty() {
        return;
    }
    let b = object_box(object);
    let m = parent.mul(object_matrix(object));
    let font_size = num(object, "fontSize", 16.0) * m.scale_factor();
    let fill = fill_color(object).unwrap_or_else(|| "#000000".to_string());
    let (r, g, bcol) = hex_to_rgb(&fill);
    let align = strv(object, "textAlign").unwrap_or("left");
    let x_local = match align {
        "center" => 0.0,
        "right" => b.w / 2.0,
        _ => -b.w / 2.0,
    };
    let y_local = -b.h / 2.0 + num(object, "fontSize", 16.0);
    let (px, py) = m.apply(x_local, y_local);
    let angle = -m.b.atan2(m.a).to_degrees();
    let rad = angle.to_radians();
    let cos = rad.cos();
    let sin = rad.sin();
    let neg_sin = -sin;
    content.push_str(&format!(
        "q {r:.4} {g:.4} {bcol:.4} rg BT /F1 {font_size:.3} Tf \
         {cos:.6} {sin:.6} {neg_sin:.6} {cos:.6} {px:.3} {:.3} Tm\n",
        page_h - py
    ));
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            content.push_str(&format!("0 {:.3} Td\n", -font_size * 1.2));
        }
        content.push_str(&format!("({}) Tj\n", pdf_escape(line)));
    }
    content.push_str("ET Q\n");
}

fn pdf_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '(' => out.push_str("\\("),
            ')' => out.push_str("\\)"),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(ch),
        }
    }
    out
}

fn hex_to_rgb(color: &str) -> (f64, f64, f64) {
    let hex = color.trim_start_matches('#');
    let parse = |s: &str| u8::from_str_radix(s, 16).unwrap_or(0) as f64 / 255.0;
    match hex.len() {
        3 => (
            parse(&hex[0..1].repeat(2)),
            parse(&hex[1..2].repeat(2)),
            parse(&hex[2..3].repeat(2)),
        ),
        6 => (parse(&hex[0..2]), parse(&hex[2..4]), parse(&hex[4..6])),
        _ => (0.0, 0.0, 0.0),
    }
}

fn build_pdf(w: f64, h: f64, content: &str) -> Vec<u8> {
    let objects: Vec<String> = vec![
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        format!(
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w:.3} {h:.3}] \
             /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>"
        ),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
        format!(
            "<< /Length {} >>\nstream\n{}\nendstream",
            content.len(),
            content
        ),
    ];

    let mut out = Vec::<u8>::new();
    out.extend_from_slice(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
    let mut offsets = Vec::with_capacity(objects.len());
    for (i, object) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.extend_from_slice(format!("{} 0 obj\n", i + 1).as_bytes());
        out.extend_from_slice(object.as_bytes());
        out.extend_from_slice(b"\nendobj\n");
    }
    let xref_at = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        out.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Info << /Producer (Bird Rust) >> >>\nstartxref\n{}\n%%EOF\n",
            objects.len() + 1,
            xref_at
        )
        .as_bytes(),
    );
    out
}

#[cfg(test)]
mod tests {
    use crate::model::Project;
    use serde_json::json;

    #[test]
    fn exports_valid_pdf_header() {
        let project = Project::from_value(json!({
            "artboard": { "w": 200, "h": 100, "color": "#ffffff" },
            "json": { "objects": [
                { "type": "rect", "left": 10, "top": 10, "width": 50, "height": 30, "fill": "#000000" },
                { "type": "ellipse", "left": 80, "top": 20, "width": 60, "height": 40, "fill": "#ff0000" }
            ]}
        }))
        .unwrap();
        let pdf = super::export(&project);
        assert!(pdf.starts_with(b"%PDF-1.4"));
        assert!(pdf.ends_with(b"%%EOF\n"));
        assert!(pdf.windows(4).any(|w| w == b"/F1 "));
    }
}
