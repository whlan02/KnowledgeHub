use crate::paths::{file_name_of, valid_file_name, TEMP_SUFFIX};
use std::{
    fs,
    path::{Path, PathBuf},
};

/// Error codes the front end maps to messages.
pub const ALREADY_EXISTS: &str = "ALREADY_EXISTS";
pub const INVALID_NAME: &str = "INVALID_NAME";
pub const NOT_FOUND: &str = "NOT_FOUND";
pub const INVALID_TARGET: &str = "INVALID_TARGET";
pub const UNSUPPORTED_FILE: &str = "UNSUPPORTED_FILE";
pub const FILE_TOO_LARGE: &str = "FILE_TOO_LARGE";

/// Write via a temp file and rename so a crash never leaves a half-written note.
pub fn write_atomic(full: &Path, text: &str) -> Result<(), String> {
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut temp = full.to_path_buf().into_os_string();
    temp.push(TEMP_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::write(&temp, text).map_err(|e| e.to_string())?;
    fs::rename(&temp, full).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

fn check_name(rel: &str) -> Result<(), String> {
    if valid_file_name(file_name_of(rel)) {
        Ok(())
    } else {
        Err(INVALID_NAME.into())
    }
}

/// Create a new note that does not exist yet; its first line is the title.
pub fn create_note(full: &Path, rel: &str, content: &str) -> Result<(), String> {
    check_name(rel)?;
    if full.exists() {
        return Err(ALREADY_EXISTS.into());
    }
    write_atomic(full, content)
}

pub fn create_folder(full: &Path, rel: &str) -> Result<(), String> {
    check_name(rel)?;
    if full.exists() {
        return Err(ALREADY_EXISTS.into());
    }
    fs::create_dir_all(full).map_err(|e| e.to_string())
}

/// Rename or move a note or folder. Refuses to overwrite and to move a folder into itself.
pub fn rename_entry(from: &Path, to: &Path, to_rel: &str) -> Result<(), String> {
    check_name(to_rel)?;
    if !from.exists() {
        return Err(NOT_FOUND.into());
    }
    if from.is_dir() && to.starts_with(from) && to != from {
        return Err(INVALID_TARGET.into());
    }
    // `a.md` -> `A.md` names the same file on a case-insensitive disk; that is a legitimate rename.
    let same_file = from.to_string_lossy().eq_ignore_ascii_case(&to.to_string_lossy());
    if to.exists() && !same_file {
        return Err(ALREADY_EXISTS.into());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(from, to).map_err(|e| e.to_string())
}

/// Move to the system trash instead of deleting, so a mistake can be undone.
pub fn trash_entry(full: &Path) -> Result<(), String> {
    if !full.exists() {
        return Err(NOT_FOUND.into());
    }
    trash::delete(full).map_err(|e| e.to_string())
}

pub fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scan::tests::Scratch;

    #[test]
    fn atomic_write_replaces_the_file_and_leaves_no_temp_file() {
        let dir = Scratch::new("write");
        dir.file("a.md", "old");
        write_atomic(&dir.0.join("a.md"), "new text").unwrap();
        assert_eq!(fs::read_to_string(dir.0.join("a.md")).unwrap(), "new text");
        let leftovers: Vec<_> = fs::read_dir(&dir.0)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().ends_with(TEMP_SUFFIX))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn atomic_write_creates_missing_folders() {
        let dir = Scratch::new("mkdir");
        write_atomic(&dir.0.join("new/deep/a.md"), "hi").unwrap();
        assert_eq!(fs::read_to_string(dir.0.join("new/deep/a.md")).unwrap(), "hi");
    }

    #[test]
    fn creating_a_note_writes_its_content_and_refuses_to_overwrite() {
        let dir = Scratch::new("create");
        let full = dir.0.join("sub/Idea.md");
        create_note(&full, "sub/Idea.md", "# Idea\n").unwrap();
        assert_eq!(fs::read_to_string(&full).unwrap(), "# Idea\n");
        assert_eq!(create_note(&full, "sub/Idea.md", "other"), Err(ALREADY_EXISTS.into()));
        assert_eq!(fs::read_to_string(&full).unwrap(), "# Idea\n");
    }

    #[test]
    fn creating_with_a_bad_name_is_refused() {
        let dir = Scratch::new("badname");
        assert_eq!(
            create_note(&dir.0.join("a:b.md"), "a:b.md", ""),
            Err(INVALID_NAME.into())
        );
        assert_eq!(create_folder(&dir.0.join("CON"), "CON"), Err(INVALID_NAME.into()));
    }

    #[test]
    fn creating_a_folder_and_a_duplicate() {
        let dir = Scratch::new("folder");
        create_folder(&dir.0.join("Ideas"), "Ideas").unwrap();
        assert!(dir.0.join("Ideas").is_dir());
        assert_eq!(create_folder(&dir.0.join("Ideas"), "Ideas"), Err(ALREADY_EXISTS.into()));
    }

    #[test]
    fn renaming_moves_the_file_and_keeps_its_content() {
        let dir = Scratch::new("rename");
        dir.file("a.md", "# A");
        rename_entry(&dir.0.join("a.md"), &dir.0.join("b.md"), "b.md").unwrap();
        assert!(!dir.0.join("a.md").exists());
        assert_eq!(fs::read_to_string(dir.0.join("b.md")).unwrap(), "# A");
    }

    #[test]
    fn renaming_into_another_folder_creates_it() {
        let dir = Scratch::new("move");
        dir.file("a.md", "# A");
        rename_entry(&dir.0.join("a.md"), &dir.0.join("x/y/a.md"), "x/y/a.md").unwrap();
        assert!(dir.0.join("x/y/a.md").is_file());
    }

    #[test]
    fn renaming_never_overwrites_another_note() {
        let dir = Scratch::new("clash");
        dir.file("a.md", "mine");
        dir.file("b.md", "theirs");
        assert_eq!(
            rename_entry(&dir.0.join("a.md"), &dir.0.join("b.md"), "b.md"),
            Err(ALREADY_EXISTS.into())
        );
        assert_eq!(fs::read_to_string(dir.0.join("b.md")).unwrap(), "theirs");
        assert!(dir.0.join("a.md").exists());
    }

    #[test]
    fn renaming_only_the_letter_case_is_allowed() {
        let dir = Scratch::new("case");
        dir.file("a.md", "x");
        rename_entry(&dir.0.join("a.md"), &dir.0.join("A.md"), "A.md").unwrap();
        let names: Vec<String> = fs::read_dir(&dir.0)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, ["A.md"]);
    }

    #[test]
    fn a_folder_cannot_be_moved_into_itself() {
        let dir = Scratch::new("self");
        fs::create_dir_all(dir.0.join("a/b")).unwrap();
        assert_eq!(
            rename_entry(&dir.0.join("a"), &dir.0.join("a/b/a"), "a/b/a"),
            Err(INVALID_TARGET.into())
        );
    }

    #[test]
    fn renaming_something_that_is_gone_reports_not_found() {
        let dir = Scratch::new("gone");
        assert_eq!(
            rename_entry(&dir.0.join("nope.md"), &dir.0.join("x.md"), "x.md"),
            Err(NOT_FOUND.into())
        );
    }

    #[test]
    fn trashing_something_that_is_gone_reports_not_found() {
        let dir = Scratch::new("trash-gone");
        assert_eq!(trash_entry(&dir.0.join("nope.md")), Err(NOT_FOUND.into()));
    }

    #[test]
    fn copy_dir_copies_nested_files() {
        let src = Scratch::new("copy-src");
        src.file("a.md", "one");
        src.file("sub/b.md", "two");
        let dst = std::env::temp_dir().join(format!("kh-test-copy-dst-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dst);
        copy_dir(&src.0, &dst).unwrap();
        assert_eq!(fs::read_to_string(dst.join("sub/b.md")).unwrap(), "two");
        let _ = fs::remove_dir_all(&dst);
    }
}
