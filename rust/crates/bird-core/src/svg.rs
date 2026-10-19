//! Export SVG depuis une scène Fabric/Bird.

use crate::model::Project;
use crate::util::*;
use serde_json::Value;

pub fn export(project: &Project) -> String {
    let w = project.artboard.w;
    let h = project.artboard.h;
    let mut body = String::new();

    let bg = project.background().and_then(normalize_hex);
    if let Some(color) = bg {
        body.push_str(&format!(
            "<rect x=\"0\" y=\"0\" width=\"{w:.3}\" height=\"{h:.3}\" fill=\"{}\"/>",
            xml_escape(&color)
        ));
    }

    let mut defs = String::new();
    let mut gradient_id = 0usize;
    render_objects(
        project.objects(),
        Mat::identity(),
        &mut body,
        &mut defs,
        &mut gradient_id,
    );

    let mut svg = String::with_capacity(body.len() + 512);
    svg.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    svg.push_str(&format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" \
         width=\"{w:.3}\" height=\"{h:.3}\" viewBox=\"0 0 {w:.3} {h:.3}\">\n"
    ));
    if !defs.is_empty() {
        svg.push_str("<defs>");
        svg.push_str(&defs);
        svg.push_str("</defs>\n");
    }
    svg.push_str(&body);
    svg.push_str("\n</svg>\n");
    svg
}

fn render_objects(
    objects: &[Value],
    parent: Mat,
    body: &mut String,
    defs: &mut String,
    gradient_id: &mut usize,
) {
    for object in objects {
        render_object(object, parent, body, defs, gradient_id);
    }
}

fn render_object(
    object: &Value,
    parent: Mat,
    body: &mut String,
    defs: &mut String,
    gradient_id: &mut usize,
) {
    if !boolv(object, "visible", true) {
        return;
    }
    let kind = strv(object, "type").unwrap_or("path");
    let opacity = num(object, "opacity", 1.0);

    match kind {
        "group" | "activeSelection" => {
            let m = parent.mul(object_matrix(object));
            body.push_str(&format!(
                "<g transform=\"{}\"{}>",
                m.to_svg(),
                if opacity < 1.0 {
                    format!(" opacity=\"{:.3}\"", opacity)
                } else {
                    String::new()
                }
            ));
            if let Some(children) = object.get("objects").and_then(Value::as_array) {
                render_objects(children, m, body, defs, gradient_id);
            }
            body.push_str("</g>\n");
        }
        "rect" => {
            let b = object_box(object);
            let m = centered_matrix(object);
            let rx = num(object, "rx", 0.0);
            let ry = num(object, "ry", rx);
            let attrs = paint_attrs(object, defs, gradient_id);
            body.push_str(&format!(
                "<rect x=\"0\" y=\"0\" width=\"{:.3}\" height=\"{:.3}\" rx=\"{:.3}\" ry=\"{:.3}\" \
                 transform=\"{}\" {}/>\n",
                b.w,
                b.h,
                rx,
                ry,
                m.to_svg(),
                attrs
            ));
        }
        "ellipse" | "circle" => {
            let b = object_box(object);
            let m = centered_matrix(object);
            let attrs = paint_attrs(object, defs, gradient_id);
            body.push_str(&format!(
                "<ellipse cx=\"{:.3}\" cy=\"{:.3}\" rx=\"{:.3}\" ry=\"{:.3}\" transform=\"{}\" {}/>\n",
                b.w / 2.0,
                b.h / 2.0,
                b.w / 2.0,
                b.h / 2.0,
                m.to_svg(),
                attrs
            ));
        }
        "line" => {
            let m = parent.mul(object_matrix(object));
            let x1 = num(object, "x1", 0.0);
            let y1 = num(object, "y1", 0.0);
            let x2 = num(object, "x2", num(object, "width", 1.0));
            let y2 = num(object, "y2", 0.0);
            let attrs = paint_attrs(object, defs, gradient_id);
            body.push_str(&format!(
                "<line x1=\"{:.3}\" y1=\"{:.3}\" x2=\"{:.3}\" y2=\"{:.3}\" transform=\"{}\" {}/>\n",
                x1,
                y1,
                x2,
                y2,
                m.to_svg(),
                attrs
            ));
        }
        "polygon" | "triangle" => {
            let m = parent.mul(object_matrix(object));
            let points = polygon_points(object);
            if points.is_empty() {
                return;
            }
            let pts: Vec<String> = points
                .iter()
                .map(|(x, y)| format!("{:.3},{:.3}", x, y))
                .collect();
            let attrs = paint_attrs(object, defs, gradient_id);
            body.push_str(&format!(
                "<polygon points=\"{}\" transform=\"{}\" {}/>\n",
                pts.join(" "),
                m.to_svg(),
                attrs
            ));
        }
        "path" => {
            let cmds = path_commands(object);
            if cmds.is_empty() {
                return;
            }
            let m = parent.mul(object_matrix(object));
            let po_x = object
                .get("pathOffset")
                .map(|p| num(p, "x", 0.0))
                .unwrap_or(0.0);
            let po_y = object
                .get("pathOffset")
                .map(|p| num(p, "y", 0.0))
                .unwrap_or(0.0);
            let pm = m.mul(Mat::translate(-po_x, -po_y));
            let d = path_to_svg(&cmds, Mat::identity());
            let attrs = paint_attrs(object, defs, gradient_id);
            body.push_str(&format!(
                "<path d=\"{}\" transform=\"{}\" {}/>\n",
                d,
                pm.to_svg(),
                attrs
            ));
        }
        "i-text" | "text" | "textbox" => {
            render_text(object, parent, body);
        }
        "image" => {
            let src = strv(object, "src")
                .or_else(|| strv(object, "href"))
                .unwrap_or("");
            if src.is_empty() {
                return;
            }
            let b = object_box(object);
            let m = centered_matrix(object);
            body.push_str(&format!(
                "<image x=\"0\" y=\"0\" width=\"{:.3}\" height=\"{:.3}\" transform=\"{}\" \
                 preserveAspectRatio=\"none\" href=\"{}\"/>\n",
                b.w,
                b.h,
                m.to_svg(),
                xml_escape(src)
            ));
        }
        _ => {}
    }
}

fn render_text(object: &Value, parent: Mat, body: &mut String) {
    let text = strv(object, "text").unwrap_or("");
    if text.is_empty() {
        return;
    }
    let b = object_box(object);
    let m = parent.mul(object_matrix(object));
    let font_size = num(object, "fontSize", 16.0);
    let family = strv(object, "fontFamily").unwrap_or("Helvetica, Arial, sans-serif");
    let fill = fill_color(object).unwrap_or_else(|| "#000000".to_string());
    let weight = strv(object, "fontWeight").unwrap_or("normal");
    let style = strv(object, "fontStyle").unwrap_or("normal");
    let align = strv(object, "textAlign").unwrap_or("left");
    let anchor = match align {
        "center" => "middle",
        "right" => "end",
        _ => "start",
    };
    let x = match align {
        "center" => 0.0,
        "right" => b.w / 2.0,
        _ => -b.w / 2.0,
    };
    let y = -b.h / 2.0 + font_size;
    let lock = if boolv(object, "underline", false) {
        " text-decoration=\"underline\""
    } else if boolv(object, "linethrough", false) {
        " text-decoration=\"line-through\""
    } else {
        ""
    };
    body.push_str(&format!(
        "<g transform=\"{}\"><text x=\"{:.3}\" y=\"{:.3}\" font-family=\"{}\" font-size=\"{:.3}\" \
         font-weight=\"{}\" font-style=\"{}\" text-anchor=\"{}\" fill=\"{}\"{}>",
        m.to_svg(),
        x,
        y,
        xml_escape(family),
        font_size,
        xml_escape(weight),
        xml_escape(style),
        anchor,
        xml_escape(&fill),
        lock
    ));
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            body.push_str(&format!("<tspan x=\"{:.3}\" dy=\"{:.3}\">", x, font_size * 1.2));
            body.push_str(&xml_escape(line));
            body.push_str("</tspan>");
        } else {
            body.push_str(&xml_escape(line));
        }
    }
    body.push_str("</text></g>\n");
}

fn paint_attrs(object: &Value, _defs: &mut String, _gradient_id: &mut usize) -> String {
    let mut attrs = String::new();
    match fill_color(object) {
        Some(color) => attrs.push_str(&format!("fill=\"{}\"", xml_escape(&color))),
        None => attrs.push_str("fill=\"none\""),
    }
    if let Some(stroke) = stroke_color(object) {
        attrs.push_str(&format!(
            " stroke=\"{}\" stroke-width=\"{:.3}\"",
            xml_escape(&stroke),
            num(object, "strokeWidth", 1.0)
        ));
        let dash = dash_array(object);
        if !dash.is_empty() {
            let d: Vec<String> = dash.iter().map(|v| format!("{:.3}", v)).collect();
            attrs.push_str(&format!(" stroke-dasharray=\"{}\"", d.join(" ")));
        }
        if let Some(cap) = strv(object, "strokeLineCap") {
            attrs.push_str(&format!(" stroke-linecap=\"{}\"", xml_escape(cap)));
        }
        if let Some(join) = strv(object, "strokeLineJoin") {
            attrs.push_str(&format!(" stroke-linejoin=\"{}\"", xml_escape(join)));
        }
    }
    let opacity = num(object, "opacity", 1.0);
    if opacity < 1.0 {
        attrs.push_str(&format!(" opacity=\"{:.3}\"", opacity));
    }
    attrs
}

#[cfg(test)]
mod tests {
    use crate::model::Project;
    use serde_json::json;

    #[test]
    fn exports_rect_and_text() {
        let project = Project::from_value(json!({
            "artboard": { "w": 400, "h": 300, "color": "#ffffff" },
            "json": { "objects": [
                { "type": "rect", "left": 20, "top": 30, "width": 100, "height": 50, "fill": "#ff0000" },
                { "type": "i-text", "left": 10, "top": 200, "width": 200, "height": 40,
                  "text": "Bird", "fontSize": 32, "fill": "#000000" }
            ]}
        }))
        .unwrap();
        let svg = super::export(&project);
        assert!(svg.contains("<svg"));
        assert!(svg.contains("<rect"));
        assert!(svg.contains("Bird"));
        assert!(svg.contains("#ff0000"));
    }
}
