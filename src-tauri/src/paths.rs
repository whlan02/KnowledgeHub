use std::path::{Component, Path, PathBuf};

/// Suffix of the temp file used while a note is being written; never shown or watched.
pub const TEMP_SUFFIX: &str = ".kh-tmp";

/// Hidden folders, dependency folders and our own temp files never show up as notes.
pub fn is_ignored(rel: &Path) -> bool {
    if rel.to_string_lossy().ends_with(TEMP_SUFFIX) {
        return true;
    }
    rel.components().any(|c| match c {
        Component::Normal(name) => {
            let name = name.to_string_lossy();
            name.starts_with('.') || name == "node_modules" || name == "dist"
        }
        _ => false,
    })
}

/// A workspace-relative path as the front end sees it: always `/`-separated.
pub fn to_rel_string(rel: &Path) -> String {
    rel.to_string_lossy().replace('\\', "/")
}

/// Join a workspace-relative path, refusing anything that could escape the root.
pub fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let path = Path::new(rel);
    if rel.is_empty() || path.is_absolute() {
        return Err("invalid path".into());
    }
    for component in path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err("invalid path".into());
        }
    }
    Ok(root.join(path))
}

const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Whether `name` (one path segment) can be a file or folder name on Windows, macOS and Linux.
pub fn valid_file_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 200 || name.ends_with('.') || name.ends_with(' ') {
        return false;
    }
    if name.chars().any(|c| c.is_control() || "\\/:*?\"<>|".contains(c)) {
        return false;
    }
    let stem = name.split('.').next().unwrap_or(name).to_uppercase();
    !RESERVED_NAMES.contains(&stem.as_str())
}

/// The last segment of a workspace-relative path.
pub fn file_name_of(rel: &str) -> &str {
    rel.rsplit('/').next().unwrap_or(rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_nested_relative_paths() {
        let root = Path::new("root");
        assert_eq!(safe_join(root, "a.md").unwrap(), root.join("a.md"));
        assert_eq!(safe_join(root, "dir/sub/a.md").unwrap(), root.join("dir/sub/a.md"));
    }

    #[test]
    fn safe_join_rejects_anything_that_could_escape_the_root() {
        let root = Path::new("root");
        for bad in [
            "",
            "..",
            "../secret.md",
            "a/../../b.md",
            "./a.md",
            "/etc/passwd",
            "C:\\Windows\\x",
        ] {
            assert!(safe_join(root, bad).is_err(), "{bad:?} should be rejected");
        }
    }

    #[test]
    fn hidden_and_dependency_folders_are_ignored() {
        for ignored in [
            ".git/config",
            "notes/.obsidian/a.md",
            "node_modules/x/a.md",
            "dist/a.md",
            "a.md.kh-tmp",
        ] {
            assert!(is_ignored(Path::new(ignored)), "{ignored:?} should be ignored");
        }
        for kept in ["a.md", "dir/a.md", "my.notes/a.md"] {
            assert!(!is_ignored(Path::new(kept)), "{kept:?} should be kept");
        }
    }

    #[test]
    fn file_names_must_work_on_every_platform() {
        for good in ["Untitled.md", "第 1 篇.md", "a b", "v1.2", "notes.v2"] {
            assert!(valid_file_name(good), "{good:?} should be valid");
        }
        for bad in [
            "", "a/b", "a\\b", "a:b", "a*b", "a?b", "a\"b", "a<b", "a>b", "a|b", "trailing.",
            "trailing ", "CON", "con.md", "Lpt1.txt", "tab\tname",
        ] {
            assert!(!valid_file_name(bad), "{bad:?} should be invalid");
        }
    }

    #[test]
    fn file_name_of_returns_the_last_segment() {
        assert_eq!(file_name_of("a/b/c.md"), "c.md");
        assert_eq!(file_name_of("c.md"), "c.md");
    }
}
