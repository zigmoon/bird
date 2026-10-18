//! Serveur statique minimal (std uniquement) pour servir l'éditeur Bird.
//!
//! Sécurité : les chemins sont décodés puis canonicalisés ; toute requête qui
//! sort de la racine est refusée. Aucun listing de répertoire n'est exposé.

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::thread;

pub fn serve(root: &Path, host: &str, port: u16) -> Result<(), String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("Racine invalide {} : {e}", root.display()))?;
    let addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&addr).map_err(|e| format!("Écoute impossible sur {addr} : {e}"))?;
    println!("Bird Rust — éditeur servi sur http://{addr}/");
    println!("Racine : {}", root.display());
    println!("Ctrl+C pour arrêter.");

    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                let root = root.clone();
                thread::spawn(move || {
                    if let Err(err) = handle(stream, &root) {
                        eprintln!("[bird] requête échouée : {err}");
                    }
                });
            }
            Err(err) => eprintln!("[bird] connexion échouée : {err}"),
        }
    }
    Ok(())
}

fn handle(mut stream: TcpStream, root: &Path) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;
    if request_line.trim().is_empty() {
        return Ok(());
    }
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let target = parts.next().unwrap_or("/");

    // Consommer les en-têtes.
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 || line == "\r\n" || line == "\n" {
            break;
        }
    }

    if method != "GET" && method != "HEAD" {
        return respond(&mut stream, 405, "text/plain; charset=utf-8", b"Method Not Allowed", method == "HEAD");
    }

    let path = target.split('?').next().unwrap_or("/");
    let path = percent_decode(path);
    let Some(file) = safe_path(root, &path) else {
        return respond(&mut stream, 403, "text/plain; charset=utf-8", b"Forbidden", method == "HEAD");
    };

    match fs::read(&file) {
        Ok(bytes) => {
            let mime = mime_for(&file);
            respond(&mut stream, 200, mime, &bytes, method == "HEAD")
        }
        Err(_) => respond(&mut stream, 404, "text/plain; charset=utf-8", b"Not Found", method == "HEAD"),
    }
}

fn respond(
    stream: &mut TcpStream,
    status: u16,
    mime: &str,
    body: &[u8],
    head_only: bool,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Error",
    };
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: {mime}\r\n\
         Content-Length: {}\r\n\
         Cache-Control: {}\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Connection: close\r\n\r\n",
        body.len(),
        if mime.starts_with("text/html") { "no-cache" } else { "public, max-age=3600" }
    );
    stream.write_all(header.as_bytes())?;
    if !head_only {
        stream.write_all(body)?;
    }
    stream.flush()
}

/// Convertit une URL en chemin sûr sous `root`.
/// Refuse `..`, les chemins absolus et les composants Windows.
pub fn safe_path(root: &Path, url_path: &str) -> Option<PathBuf> {
    let decoded = url_path.replace('\\', "/");
    let mut relative = PathBuf::new();
    for component in Path::new(decoded.trim_start_matches('/')).components() {
        match component {
            Component::Normal(part) => relative.push(part),
            Component::CurDir => {}
            _ => return None,
        }
    }
    let mut candidate = root.join(relative);
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    let canonical = candidate.canonicalize().ok()?;
    if canonical.starts_with(root) {
        Some(canonical)
    } else {
        None
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "webmanifest" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "pdf" => "application/pdf",
        "eps" | "ai" => "application/postscript",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "wasm" => "application/wasm",
        "txt" | "md" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        let root = std::env::temp_dir();
        assert!(safe_path(&root, "/../secret").is_none());
        assert!(safe_path(&root, "..\\secret").is_none());
    }

    #[test]
    fn decodes_percent() {
        assert_eq!(percent_decode("a%20b%2Fc"), "a b/c");
    }

    #[test]
    fn mime_types() {
        assert_eq!(mime_for(Path::new("x.svg")), "image/svg+xml");
        assert_eq!(mime_for(Path::new("x.woff2")), "font/woff2");
    }
}
