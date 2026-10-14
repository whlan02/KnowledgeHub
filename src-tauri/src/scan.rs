use crate::paths::{is_ignored, to_rel_string};
use serde::Serialize;
use std::{fs, path::Path};

const TITLE_SCAN_BYTES: usize = 4096;

#[derive(Serialize)]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub folder: String,
}

/// What is in a workspace: its notes and every folder, including empty ones.
#[derive(Serialize)]
pub struct Scan {
    pub notes: Vec<NoteMeta>,
    pub folders: Vec<String>,
}

const COLOR_NAMES: [&str; 9] = [
    "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
];

/// Drop the `{red}…{/red}` / `{bg-red}…{/bg-red}` colour tags, keeping the text between them.
pub fn strip_color_tags(text: &str) -> String {
    let mut out = text.to_string();
    for name in COLOR_NAMES {
        for tag in [
            format!("{{{name}}}"),
            format!("{{/{name}}}"),
            format!("{{bg-{name}}}"),
            format!("{{/bg-{name}}}"),
        ] {
            out = out.replace(&tag, "");
        }
    }
    out
}

/// First `# Heading` near the top of the file, which is how notes are titled in the sidebar.
pub fn heading_title(file: &Path) -> Option<String> {
    use std::io::Read;
    let mut head = Vec::with_capacity(TITLE_SCAN_BYTES);
    fs::File::open(file)
        .ok()?
        .take(TITLE_SCAN_BYTES as u64)
        .read_to_end(&mut head)
        .ok()?;
    String::from_utf8_lossy(&head)
        .lines()
        .find_map(|line| line.strip_prefix("# "))
        .map(|title| strip_color_tags(title).trim().to_string())
        .filter(|title| !title.is_empty())
}

fn note_meta(full: &Path, rel: &Path) -> NoteMeta {
    let path = to_rel_string(rel);
    let fallback = full
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    NoteMeta {
        title: heading_title(full).unwrap_or(fallback),
        folder: rel.parent().map(to_rel_string).unwrap_or_default(),
        path,
    }
}

fn walk(dir: &Path, root: &Path, out: &mut Scan) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let full = entry.path();
        let Ok(rel) = full.strip_prefix(root) else { continue };
        if is_ignored(rel) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            out.folders.push(to_rel_string(rel));
            walk(&full, root, out);
        } else if file_type.is_file()
            && full
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            out.notes.push(note_meta(&full, rel));
        }
    }
}

pub fn scan(root: &Path) -> Scan {
    let mut result = Scan {
        notes: Vec::new(),
        folders: Vec::new(),
    };
    walk(root, root, &mut result);
    result.notes.sort_by_key(|n| n.path.to_lowercase());
    result.folders.sort_by_key(|f| f.to_lowercase());
    result
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::path::PathBuf;

    /// A scratch workspace under the system temp dir, removed when dropped.
    pub struct Scratch(pub PathBuf);

    impl Scratch {
        pub fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("kh-test-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            fs::create_dir_all(&dir).unwrap();
            Scratch(dir)
        }

        pub fn file(&self, rel: &str, text: &str) {
            let full = self.0.join(rel);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, text).unwrap();
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn color_tags_are_removed_but_text_stays() {
        assert_eq!(strip_color_tags("{red}Hot{/red} {bg-blue}topic{/bg-blue}"), "Hot topic");
        assert_eq!(strip_color_tags("{braces} stay"), "{braces} stay");
    }

    #[test]
    fn title_is_the_first_level_one_heading() {
        let dir = Scratch::new("title");
        dir.file("a.md", "intro\n\n# {red}Plan{/red}\n\n## Not this");
        dir.file("b.md", "no heading at all");
        dir.file("c.md", "## only a subheading");
        assert_eq!(heading_title(&dir.0.join("a.md")).as_deref(), Some("Plan"));
        assert_eq!(heading_title(&dir.0.join("b.md")), None);
        assert_eq!(heading_title(&dir.0.join("c.md")), None);
    }

    #[test]
    fn scan_lists_markdown_notes_sorted_and_skips_the_rest() {
        let dir = Scratch::new("scan");
        dir.file("b.md", "# Bee");
        dir.file("A.md", "# Ay");
        dir.file("guides/z.md", "# Zed");
        dir.file("guides/pic.png", "not a note");
        dir.file(".git/hooks.md", "# hidden");
        dir.file("node_modules/pkg/readme.md", "# dependency");
        dir.file("upper.MD", "# Upper");

        let found = scan(&dir.0);
        let paths: Vec<&str> = found.notes.iter().map(|n| n.path.as_str()).collect();
        assert_eq!(paths, ["A.md", "b.md", "guides/z.md", "upper.MD"]);
        assert_eq!(found.notes[2].folder, "guides");
        assert_eq!(found.notes[2].title, "Zed");
        assert_eq!(found.notes[0].folder, "");
    }

    #[test]
    fn scan_lists_every_folder_even_empty_ones_but_not_hidden_ones() {
        let dir = Scratch::new("folders");
        fs::create_dir_all(dir.0.join("empty/deeper")).unwrap();
        fs::create_dir_all(dir.0.join(".git")).unwrap();
        dir.file("full/a.md", "# A");
        assert_eq!(scan(&dir.0).folders, ["empty", "empty/deeper", "full"]);
    }

    #[test]
    fn note_without_a_heading_is_titled_by_its_file_name() {
        let dir = Scratch::new("stem");
        dir.file("plain note.md", "just text");
        assert_eq!(scan(&dir.0).notes[0].title, "plain note");
    }
}
