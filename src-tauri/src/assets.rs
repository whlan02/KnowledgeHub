use crate::paths::{safe_join, to_rel_string};
use std::{fs, path::Path};

use crate::files::{FILE_TOO_LARGE, UNSUPPORTED_FILE};

/// Largest image accepted when pasting or dropping one into a note.
const MAX_ASSET_BYTES: usize = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"];
/// Folder next to a note that holds its images.
pub const ASSET_FOLDER: &str = "assets";

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

/// A file name that is safe on every platform: odd characters become `-`.
fn clean_stem(stem: &str) -> String {
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || " -_.()".contains(c) { c } else { '-' })
        .collect();
    let cleaned = cleaned.trim_matches(|c: char| c == '-' || c == '.' || c.is_whitespace());
    let short: String = cleaned.chars().take(80).collect();
    if short.is_empty() { "image".to_string() } else { short }
}

/// Save an image next to `note_rel`, in its `assets` folder, and return the path relative to the
/// note (`assets/name.png`), ready to be used as a Markdown image link.
pub fn store_asset(root: &Path, note_rel: &str, file_name: &str, bytes: &[u8]) -> Result<String, String> {
    let note_full = safe_join(root, note_rel)?;
    let extension = Path::new(file_name)
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(UNSUPPORTED_FILE.into());
    }
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(FILE_TOO_LARGE.into());
    }
    let dir = note_full
        .parent()
        .ok_or_else(|| "invalid path".to_string())?
        .join(ASSET_FOLDER);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stem = clean_stem(&Path::new(file_name).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default());
    let mut name = format!("{stem}.{extension}");
    for n in 2.. {
        if !dir.join(&name).exists() {
            break;
        }
        name = format!("{stem}-{n}.{extension}");
    }
    fs::write(dir.join(&name), bytes).map_err(|e| e.to_string())?;
    Ok(to_rel_string(&Path::new(ASSET_FOLDER).join(name)))
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
    fn stores_an_image_in_the_assets_folder_next_to_the_note() {
        let dir = Scratch::new("asset-store");
        dir.file("guides/note.md", "# n");
        let rel = store_asset(&dir.0, "guides/note.md", "Photo 1.PNG", b"png-bytes").unwrap();
        assert_eq!(rel, "assets/Photo 1.png");
        assert_eq!(fs::read(dir.0.join("guides/assets/Photo 1.png")).unwrap(), b"png-bytes");
    }

    #[test]
    fn a_second_image_with_the_same_name_gets_a_number() {
        let dir = Scratch::new("asset-unique");
        dir.file("n.md", "# n");
        assert_eq!(store_asset(&dir.0, "n.md", "a.png", b"1").unwrap(), "assets/a.png");
        assert_eq!(store_asset(&dir.0, "n.md", "a.png", b"2").unwrap(), "assets/a-2.png");
        assert_eq!(store_asset(&dir.0, "n.md", "a.png", b"3").unwrap(), "assets/a-3.png");
        assert_eq!(fs::read(dir.0.join("assets/a.png")).unwrap(), b"1");
    }

    #[test]
    fn rejects_files_that_are_not_images() {
        let dir = Scratch::new("asset-type");
        dir.file("n.md", "# n");
        for name in ["run.exe", "notes.md", "noextension", "script.png.js"] {
            assert_eq!(store_asset(&dir.0, "n.md", name, b"x"), Err(UNSUPPORTED_FILE.into()), "{name}");
        }
        assert!(!dir.0.join("assets").exists());
    }

    #[test]
    fn rejects_oversized_images() {
        let dir = Scratch::new("asset-big");
        dir.file("n.md", "# n");
        let big = vec![0u8; MAX_ASSET_BYTES + 1];
        assert_eq!(store_asset(&dir.0, "n.md", "big.png", &big), Err(FILE_TOO_LARGE.into()));
    }

    #[test]
    fn cleans_odd_file_names_and_cannot_escape_the_assets_folder() {
        let dir = Scratch::new("asset-clean");
        dir.file("n.md", "# n");
        let rel = store_asset(&dir.0, "n.md", "../../evil:name?.png", b"x").unwrap();
        assert!(rel.starts_with("assets/"));
        assert!(!rel.contains(".."));
        assert!(dir.0.join(&rel).is_file());
        assert_eq!(clean_stem("???"), "image");
        assert_eq!(clean_stem("日本語 画像"), "日本語 画像");
    }

    #[test]
    fn a_note_path_outside_the_workspace_is_refused() {
        let dir = Scratch::new("asset-escape");
        assert!(store_asset(&dir.0, "../n.md", "a.png", b"x").is_err());
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
