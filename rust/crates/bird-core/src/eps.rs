//! Export EPS (PostScript) — Adobe Illustrator niveau 2.
//!
//! Le fichier produit contient des chemins vectoriels, des couleurs RVB et du
//! texte Helvetica. Les images et dégradés ne sont pas inclus.

use crate::model::Project;
use crate::util::*;
use serde_json::Value;

pub fn export(project: &Project) -> String {
    let w = project.artboard.w.max(1.0);
    let h = project.artboard.h.max(1.0);
    let mut out = String::new();
    out.push_str("%!PS-Adobe-3.0 EPSF-3.0\n");
    out.push_str("%%Creator: Bird Rust\n");
    out.push_str(&format!("%%BoundingBox: 0 0 {} {}\n", w.ceil() as i64, h.ceil() as i64));
    out.push_str(&format!("%%HiResBoundingBox: 0 0 {w:.3} {h:.3}\n"));
    out.push_str("%%LanguageLevel: 2\n%%EndComments\n%%BeginProlog\n");
    out.push_str("/F1 /Helvetica findfont def\n");
    out.push_str("%%EndProlog\n%%Page: 1 1\n");
    out.push_str("save\n");

    if let Some(color) = project.background().and_then(normalize_hex) {
        let (r, g, b) = hex_to_rgb(&color);
        out.push_str(&format!(
            "newpath {r:.4} {g:.4} {b:.4} setrgbcolor 0 0 {w:.3} {h:.3} rectfill\n"
        ));
    }

    render_objects(project.objects(), Mat::identity(), h, &mut out);
    out.push_str("restore\nshowpage\n%%EOF\n");
    out
}

fn render_objects(objects: &[Value], parent: Mat, page_h: f64, out: &mut String) {
    for object in objects {
        if boolv(object, "visible", true) == false {
            continue;
        }
        let kind = strv(object, "type").unwrap_or("path");
        match kind {
            "group" | "activeSelection" => {
                let m = parent.mul(object_matrix(object));
                if let Some(children) = object.get("objects").and_then(Value::as_array) {
                    render_objects(children, m, page_h, out);
                }
            }
            "rect" => {
                let b = object_box(object);
                let m = centered_matrix(object);
                out.push_str("gsave newpath\n");
                let pts = [(0.0, 0.0), (b.w, 0.0), (b.w, b.h), (0.0, b.h)];
                for (i, (x, y)) in pts.iter().enumerate() {
                    let (px, py) = m.apply(*x, *y);
                    out.push_str(&format!(
                        "{:.3} {:.3} {}\n",
                        px,
                        page_h - py,
                        if i == 0 { "moveto" } else { "lineto" }
                    ));
                }
                out.push_str("closepath\n");
                paint(object, m, out);
                out.push_str("grestore\n");
            }
            "ellipse" | "circle" => {
                let b = object_box(object);
                let m = centered_matrix(object);
                out.push_str("gsave newpath\n");
                let steps = 64;
                for i in 0..=steps {
                    let a = (i as f64 / steps as f64) * std::f64::consts::TAU;
                    let (px, py) = m.apply((b.w / 2.0) * a.cos(), (b.h / 2.0) * a.sin());
                    out.push_str(&format!(
                        "{:.3} {:.3} {}\n",
                        px,
                        page_h - py,
                        if i == 0 { "moveto" } else { "lineto" }
                    ));
                }
                out.push_str("closepath\n");
                paint(object, m, out);
                out.push_str("grestore\n");
            }
            "line" => {
                let m = parent.mul(object_matrix(object));
                let p1 = m.apply(num(object, "x1", 0.0), num(object, "y1", 0.0));
                let p2 = m.apply(
                    num(object, "x2", num(object, "width", 1.0)),
                    num(object, "y2", 0.0),
                );
                out.push_str(&format!(
                    "gsave newpath {:.3} {:.3} moveto {:.3} {:.3} lineto\n",
                    p1.0,
                    page_h - p1.1,
                    p2.0,
                    page_h - p2.1
                ));
                paint(object, m, out);
                out.push_str("grestore\n");
            }
            "polygon" | "triangle" => {
                let m = parent.mul(object_matrix(object));
                let points = polygon_points(object);
                if points.is_empty() {
                    continue;
                }
                out.push_str("gsave newpath\n");
                for (i, (x, y)) in points.iter().enumerate() {
                    let (px, py) = m.apply(*x, *y);
                    out.push_str(&format!(
                        "{:.3} {:.3} {}\n",
                        px,
                        page_h - py,
                        if i == 0 { "moveto" } else { "lineto" }
                    ));
                }
                out.push_str("closepath\n");
                paint(object, m, out);
                out.push_str("grestore\n");
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
                out.push_str("gsave newpath\n");
                for cmd in &cmds {
                    match cmd {
                        PathCmd::Move(x, y) => {
                            let (px, py) = pm.apply(*x, *y);
                            out.push_str(&format!("{:.3} {:.3} moveto\n", px, page_h - py));
                        }
                        PathCmd::Line(x, y) => {
                            let (px, py) = pm.apply(*x, *y);
                            out.push_str(&format!("{:.3} {:.3} lineto\n", px, page_h - py));
                        }
                        PathCmd::Curve(x1, y1, x2, y2, x, y) => {
                            let p1 = pm.apply(*x1, *y1);
                            let p2 = pm.apply(*x2, *y2);
                            let p3 = pm.apply(*x, *y);
                            out.push_str(&format!(
                                "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} curveto\n",
                                p1.0,
                                page_h - p1.1,
                                p2.0,
                                page_h - p2.1,
                                p3.0,
                                page_h - p3.1
                            ));
                        }
                        PathCmd::Quad(x1, y1, x, y) => {
                            let p1 = pm.apply(*x1, *y1);
                            let p2 = pm.apply(*x, *y);
                            out.push_str(&format!(
                                "{:.3} {:.3} {:.3} {:.3} {:.3} {:.3} curveto\n",
                                p1.0,
                                page_h - p1.1,
                                p2.0,
                                page_h - p2.1,
                                p2.0,
                                page_h - p2.1
                            ));
                        }
                        PathCmd::Close => out.push_str("closepath\n"),
                    }
                }
                paint(object, pm, out);
                out.push_str("grestore\n");
            }
            "i-text" | "text" | "textbox" => render_text(object, parent, page_h, out),
            _ => {}
        }
    }
}

fn paint(object: &Value, mat: Mat, out: &mut String) {
    let fill = fill_color(object);
    let stroke = stroke_color(object);
    if let Some(f) = &fill {
        let (r, g, b) = hex_to_rgb(f);
        out.push_str(&format!("{r:.4} {g:.4} {b:.4} setrgbcolor\n"));
    }
    if let Some(s) = &stroke {
        let (r, g, b) = hex_to_rgb(s);
        out.push_str(&format!(
            "{r:.4} {g:.4} {b:.4} setrgbcolor {:.3} setlinewidth\n",
            num(object, "strokeWidth", 1.0) * mat.scale_factor()
        ));
        let dash = dash_array(object);
        if !dash.is_empty() {
            let d: Vec<String> = dash.iter().map(|v| format!("{:.3}", v)).collect();
            out.push_str(&format!("[{}] 0 setdash\n", d.join(" ")));
        } else {
            out.push_str("[] 0 setdash\n");
        }
    }
    match (&fill, &stroke) {
        (Some(_), Some(_)) => {
            out.push_str("gsave fill grestore\n");
            out.push_str("stroke\n");
        }
        (Some(_), None) => out.push_str("fill\n"),
        (None, Some(_)) => out.push_str("stroke\n"),
        (None, None) => out.push_str("newpath\n"),
    }
}

fn render_text(object: &Value, parent: Mat, page_h: f64, out: &mut String) {
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
    out.push_str(&format!(
        "gsave {r:.4} {g:.4} {bcol:.4} setrgbcolor\n\
         F1 {font_size:.3} scalefont setfont\n\
         {px:.3} {:.3} translate {angle:.3} rotate\n",
        page_h - py
    ));
    for (i, line) in text.split('\n').enumerate() {
        out.push_str(&format!("0 {} moveto ({}) show\n", -(i as f64) * font_size * 1.2, ps_escape(line)));
    }
    out.push_str("grestore\n");
}

fn ps_escape(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
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

#[cfg(test)]
mod tests {
    use crate::model::Project;
    use serde_json::json;

    #[test]
    fn exports_eps_header() {
        let project = Project::from_value(json!({
            "artboard": { "w": 300, "h": 200, "color": "#ffffff" },
            "json": { "objects": [
                { "type": "rect", "left": 20, "top": 20, "width": 100, "height": 60, "fill": "#00ff00" },
                { "type": "i-text", "left": 20, "top": 120, "width": 200, "height": 30,
                  "text": "EPS", "fontSize": 24, "fill": "#000000" }
            ]}
        }))
        .unwrap();
        let eps = super::export(&project);
        assert!(eps.starts_with("%!PS-Adobe-3.0 EPSF-3.0"));
        assert!(eps.contains("%%BoundingBox: 0 0 300 200"));
        assert!(eps.contains("EPS"));
        assert!(eps.trim_end().ends_with("%%EOF"));
    }
}
