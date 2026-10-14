use serde::Serialize;
use std::{path::Path, process::Command};

/// Error code when the workspace folder is not a Git repository.
pub const NOT_A_REPO: &str = "NOT_A_REPO";

#[derive(Serialize, Debug, PartialEq)]
pub struct Change {
    /// Path relative to the workspace, `/`-separated.
    pub path: String,
    /// `added`, `modified`, `deleted`, `renamed` or `untracked`.
    pub kind: &'static str,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitStatus {
    /// Current branch; `None` when HEAD is detached.
    pub branch: Option<String>,
    pub changes: Vec<Change>,
}

/// Only a repository rooted at the workspace counts, not one that merely contains it.
fn ensure_repo(root: &Path) -> Result<(), String> {
    if root.join(".git").exists() {
        Ok(())
    } else {
        Err(NOT_A_REPO.into())
    }
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(root).args(["--no-optional-locks", "-c", "core.quotepath=off"]).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("not a git repository") {
        return Err(NOT_A_REPO.into());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Err(format!("{}{}", stderr.trim(), stdout.trim()))
}

fn kind_of(x: char, y: char) -> &'static str {
    match (x, y) {
        ('?', '?') => "untracked",
        ('R', _) | (_, 'R') | ('C', _) => "renamed",
        ('D', _) | (_, 'D') => "deleted",
        ('A', _) => "added",
        _ => "modified",
    }
}

/// Parse `git status --porcelain=v1 -z`: `XY path\0`, and renames add `\0original path`.
pub fn parse_porcelain(output: &str) -> Vec<Change> {
    let mut entries = output.split('\0').filter(|e| !e.is_empty());
    let mut changes = Vec::new();
    while let Some(entry) = entries.next() {
        let mut chars = entry.chars();
        let (Some(x), Some(y)) = (chars.next(), chars.next()) else { continue };
        let path = entry.get(3..).unwrap_or_default().to_string();
        if x == 'R' || x == 'C' {
            entries.next(); // the original path
        }
        changes.push(Change { path, kind: kind_of(x, y) });
    }
    changes
}

pub fn status(root: &Path) -> Result<GitStatus, String> {
    ensure_repo(root)?;
    let porcelain = git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    let branch = git(root, &["symbolic-ref", "--short", "-q", "HEAD"]).ok().map(|b| b.trim().to_string());
    Ok(GitStatus { branch: branch.filter(|b| !b.is_empty()), changes: parse_porcelain(&porcelain) })
}

/// Stage everything and commit it locally. Never pushes.
pub fn commit_all(root: &Path, message: &str) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("EMPTY_MESSAGE".into());
    }
    ensure_repo(root)?;
    git(root, &["add", "-A"])?;
    git(root, &["commit", "-m", message]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_each_kind_of_change() {
        let out = " M notes/a.md\0A  b.md\0?? c.md\0 D d.md\0";
        let kinds: Vec<_> = parse_porcelain(out).iter().map(|c| (c.path.clone(), c.kind)).collect();
        assert_eq!(
            kinds,
            vec![
                ("notes/a.md".to_string(), "modified"),
                ("b.md".to_string(), "added"),
                ("c.md".to_string(), "untracked"),
                ("d.md".to_string(), "deleted"),
            ]
        );
    }

    #[test]
    fn a_rename_is_one_change_and_skips_the_original_path() {
        let changes = parse_porcelain("R  new.md\0old.md\0 M x.md\0");
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0], Change { path: "new.md".into(), kind: "renamed" });
        assert_eq!(changes[1].path, "x.md");
    }

    #[test]
    fn keeps_unicode_paths() {
        assert_eq!(parse_porcelain("?? 笔记/图.md\0")[0].path, "笔记/图.md");
    }

    #[test]
    fn empty_output_means_no_changes() {
        assert!(parse_porcelain("").is_empty());
    }

    #[test]
    fn status_then_commit_in_a_real_repository() {
        use crate::scan::tests::Scratch;
        for (key, value) in [
            ("GIT_AUTHOR_NAME", "t"),
            ("GIT_AUTHOR_EMAIL", "t@t"),
            ("GIT_COMMITTER_NAME", "t"),
            ("GIT_COMMITTER_EMAIL", "t@t"),
        ] {
            std::env::set_var(key, value);
        }
        let dir = Scratch::new("git");
        assert_eq!(status(&dir.0).unwrap_err(), NOT_A_REPO);
        git(&dir.0, &["init", "-q"]).unwrap();
        dir.file("a.md", "# A");
        assert_eq!(status(&dir.0).unwrap().changes, vec![Change { path: "a.md".into(), kind: "untracked" }]);
        assert!(commit_all(&dir.0, "  ").is_err());
        commit_all(&dir.0, "first").unwrap();
        assert!(status(&dir.0).unwrap().changes.is_empty());
    }
}
