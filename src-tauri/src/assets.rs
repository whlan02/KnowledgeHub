use crate::paths::safe_join;
use std::{fs, path::Path};

pub fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("avif") => "image/avif",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Answer a `kh://` request for a file inside the workspace: status, body and content type.
pub fn serve(root: Option<&Path>, uri_path: &str) -> (u16, Vec<u8>, &'static str) {
    let Some(root) = root else {
        return (404, Vec::new(), "text/plain");
    };
    let Ok(rel) = urlencoding::decode(uri_path.trim_start_matches('/')) else {
        return (400, Vec::new(), "text/plain");
    };
    let Ok(full) = safe_join(root, &rel) else {
        return (403, Vec::new(), "text/plain");
    };
    match fs::read(&full) {
        Ok(bytes) => (200, bytes, mime_for(&full)),
        Err(_) => (404, Vec::new(), "text/plain"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scan::tests::Scratch;

    #[test]
    fn mime_types_follow_the_extension() {
        assert_eq!(mime_for(Path::new("a.PNG")), "image/png");
        assert_eq!(mime_for(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(mime_for(Path::new("a.bin")), "application/octet-stream");
    }

    #[test]
    fn serves_a_file_with_percent_encoded_name() {
        let dir = Scratch::new("serve");
        dir.file("img/my pic.png", "bytes");
        let (status, body, mime) = serve(Some(&dir.0), "/img%2Fmy%20pic.png");
        assert_eq!((status, body.as_slice(), mime), (200, b"bytes".as_slice(), "image/png"));
    }

    #[test]
    fn refuses_paths_outside_the_workspace() {
        let dir = Scratch::new("serve-escape");
        dir.file("a.png", "x");
        assert_eq!(serve(Some(&dir.0), "/..%2Fsecret.txt").0, 403);
        assert_eq!(serve(Some(&dir.0), "/%2Fetc%2Fpasswd").0, 403);
    }

    #[test]
    fn reports_missing_files_and_no_workspace() {
        let dir = Scratch::new("serve-missing");
        assert_eq!(serve(Some(&dir.0), "/nope.png").0, 404);
        assert_eq!(serve(None, "/a.png").0, 404);
    }
}
