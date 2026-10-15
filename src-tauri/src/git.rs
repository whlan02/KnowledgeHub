use crate::paths::safe_join;
use serde::Serialize;
use std::{path::Path, process::Command};

/// Error code when the workspace folder is not a Git repository.
pub const NOT_A_REPO: &str = "NOT_A_REPO";

#[derive(Serialize, Debug, PartialEq)]
pub struct Change {
    /// Path relative to the workspace, `/`-separated.
    pub path: String,
    /// Overall kind: `added`, `modified`, `deleted`, `renamed` or `untracked`.
    pub kind: &'static str,
    /// What is staged for the next commit, if anything.
    pub staged: Option<&'static str>,
    /// What changed in the working tree since staging, if anything (`untracked` included).
    pub unstaged: Option<&'static str>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitStatus {
    /// Current branch; `None` when HEAD is detached.
    pub branch: Option<String>,
    pub changes: Vec<Change>,
}

/// Only a repository rooted at the workspace counts, not one that merely contains it.
pub fn ensure_repo(root: &Path) -> Result<(), String> {
    if root.join(".git").exists() {
        Ok(())
    } else {
        Err(NOT_A_REPO.into())
    }
}

pub fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(root)
        .args(["--no-optional-locks", "--literal-pathspecs", "-c", "core.quotepath=off"])
        .args(args);
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

/// Run git with `args`, then `--` and the (validated) workspace-relative `paths`.
pub fn git_with_paths(root: &Path, args: &[&str], paths: &[String]) -> Result<String, String> {
    for path in paths {
        safe_join(root, path)?;
    }
    let mut all: Vec<&str> = args.to_vec();
    all.push("--");
    all.extend(paths.iter().map(String::as_str));
    git(root, &all)
}

fn kind_of_column(c: char) -> Option<&'static str> {
    match c {
        'A' => Some("added"),
        'D' => Some("deleted"),
        'R' | 'C' => Some("renamed"),
        ' ' | '?' | '!' => None,
        _ => Some("modified"),
    }
}

fn overall_kind(staged: Option<&str>, unstaged: Option<&str>) -> &'static str {
    let has = |kind: &str| staged == Some(kind) || unstaged == Some(kind);
    if has("untracked") {
        "untracked"
    } else if has("renamed") {
        "renamed"
    } else if has("deleted") {
        "deleted"
    } else if staged == Some("added") {
        "added"
    } else {
        "modified"
    }
}

/// The branch from the `## ` header of `status --branch`; `None` for a detached HEAD.
fn parse_branch_header(header: &str) -> Option<String> {
    let name = header.strip_prefix("No commits yet on ").unwrap_or(header);
    if name.starts_with("HEAD (no branch)") {
        return None;
    }
    let name = name.split("...").next().unwrap_or(name);
    Some(name.split(' ').next().unwrap_or(name).to_string()).filter(|n| !n.is_empty())
}

/// Parse `git status --porcelain=v1 -z --branch`: a `## branch` entry, then `XY path\0`;
/// renames add `\0original path`.
pub fn parse_porcelain(output: &str) -> (Option<String>, Vec<Change>) {
    let mut entries = output.split('\0').filter(|e| !e.is_empty());
    let mut branch = None;
    let mut changes = Vec::new();
    while let Some(entry) = entries.next() {
        if let Some(header) = entry.strip_prefix("## ") {
            branch = parse_branch_header(header);
            continue;
        }
        let mut chars = entry.chars();
        let (Some(x), Some(y)) = (chars.next(), chars.next()) else { continue };
        let path = entry.get(3..).unwrap_or_default().to_string();
        if x == 'R' || x == 'C' {
            entries.next(); // the original path
        }
        let (staged, unstaged) = if (x, y) == ('?', '?') {
            (None, Some("untracked"))
        } else {
            (kind_of_column(x), kind_of_column(y))
        };
        changes.push(Change { path, kind: overall_kind(staged, unstaged), staged, unstaged });
    }
    (branch, changes)
}

pub fn status(root: &Path) -> Result<GitStatus, String> {
    ensure_repo(root)?;
    let porcelain = git(root, &["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all"])?;
    let (branch, changes) = parse_porcelain(&porcelain);
    Ok(GitStatus { branch, changes })
}

pub fn init(root: &Path) -> Result<(), String> {
    git(root, &["init", "-q"]).map(|_| ())
}

pub fn stage(root: &Path, paths: &[String]) -> Result<(), String> {
    ensure_repo(root)?;
    git_with_paths(root, &["add"], paths).map(|_| ())
}

pub fn has_commits(root: &Path) -> bool {
    git(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok()
}

pub fn unstage(root: &Path, paths: &[String]) -> Result<(), String> {
    ensure_repo(root)?;
    if has_commits(root) {
        git_with_paths(root, &["restore", "--staged"], paths).map(|_| ())
    } else {
        git_with_paths(root, &["rm", "--cached", "-r", "-q"], paths).map(|_| ())
    }
}

/// Commit what is staged (or rewrite the last commit). Never pushes.
pub fn commit(root: &Path, message: &str, amend: bool) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("EMPTY_MESSAGE".into());
    }
    ensure_repo(root)?;
    let mut args = vec!["commit", "-m", message];
    if amend {
        args.push("--amend");
    }
    git(root, &args).map(|_| ())
}

fn is_tracked_in_head(root: &Path, path: &str) -> bool {
    git(root, &["cat-file", "-e", &format!("HEAD:{path}")]).is_ok()
}

/// Throw away every change to one file. A file git has never committed goes to the system
/// trash instead of being deleted, so nothing is lost for good.
pub fn discard(root: &Path, path: &str) -> Result<(), String> {
    ensure_repo(root)?;
    let full = safe_join(root, path)?;
    let paths = [path.to_string()];
    if is_tracked_in_head(root, path) {
        return git_with_paths(root, &["restore", "--source=HEAD", "--staged", "--worktree"], &paths).map(|_| ());
    }
    let _ = unstage(root, &paths);
    if full.exists() {
        crate::files::trash_entry(&full)
    } else {
        Ok(())
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::scan::tests::Scratch;

    fn change(path: &str, kind: &'static str, staged: Option<&'static str>, unstaged: Option<&'static str>) -> Change {
        Change { path: path.into(), kind, staged, unstaged }
    }

    /// A scratch directory that is already a repository with an identity set.
    pub fn repo(name: &str) -> Scratch {
        let dir = Scratch::new(name);
        init(&dir.0).unwrap();
        git(&dir.0, &["config", "user.name", "t"]).unwrap();
        git(&dir.0, &["config", "user.email", "t@t"]).unwrap();
        dir
    }

    #[test]
    fn parses_each_kind_of_change() {
        let (_, changes) = parse_porcelain(" M notes/a.md\0A  b.md\0?? c.md\0 D d.md\0MM e.md\0");
        assert_eq!(
            changes,
            vec![
                change("notes/a.md", "modified", None, Some("modified")),
                change("b.md", "added", Some("added"), None),
                change("c.md", "untracked", None, Some("untracked")),
                change("d.md", "deleted", None, Some("deleted")),
                change("e.md", "modified", Some("modified"), Some("modified")),
            ]
        );
    }

    #[test]
    fn a_rename_is_one_change_and_skips_the_original_path() {
        let (_, changes) = parse_porcelain("R  new.md\0old.md\0 M x.md\0");
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[0], change("new.md", "renamed", Some("renamed"), None));
        assert_eq!(changes[1].path, "x.md");
    }

    #[test]
    fn keeps_unicode_paths() {
        assert_eq!(parse_porcelain("?? 笔记/图.md\0").1[0].path, "笔记/图.md");
    }

    #[test]
    fn empty_output_means_no_changes() {
        assert!(parse_porcelain("").1.is_empty());
    }

    #[test]
    fn reads_the_branch_from_the_header() {
        assert_eq!(parse_porcelain("## main...origin/main [ahead 1]\0").0.as_deref(), Some("main"));
        assert_eq!(parse_porcelain("## No commits yet on master\0").0.as_deref(), Some("master"));
        assert_eq!(parse_porcelain("## HEAD (no branch)\0").0, None);
    }

    #[test]
    fn status_stage_and_commit_in_a_real_repository() {
        let dir = Scratch::new("git");
        assert_eq!(status(&dir.0).unwrap_err(), NOT_A_REPO);
        let dir = repo("git-flow");
        dir.file("a.md", "# A");
        assert_eq!(status(&dir.0).unwrap().changes, vec![change("a.md", "untracked", None, Some("untracked"))]);
        assert!(commit(&dir.0, "  ", false).is_err());
        stage(&dir.0, &["a.md".into()]).unwrap();
        assert_eq!(status(&dir.0).unwrap().changes[0].staged, Some("added"));
        unstage(&dir.0, &["a.md".into()]).unwrap();
        assert_eq!(status(&dir.0).unwrap().changes[0].staged, None);
        stage(&dir.0, &["a.md".into()]).unwrap();
        commit(&dir.0, "first", false).unwrap();
        assert!(status(&dir.0).unwrap().changes.is_empty());
        commit(&dir.0, "renamed first", true).unwrap();
    }

    #[test]
    fn commit_takes_only_what_is_staged() {
        let dir = repo("git-partial");
        dir.file("a.md", "a");
        dir.file("b.md", "b");
        stage(&dir.0, &["a.md".into()]).unwrap();
        commit(&dir.0, "just a", false).unwrap();
        assert_eq!(status(&dir.0).unwrap().changes, vec![change("b.md", "untracked", None, Some("untracked"))]);
    }

    #[test]
    fn staging_refuses_paths_outside_the_workspace() {
        let dir = repo("git-escape");
        assert!(stage(&dir.0, &["../x.md".into()]).is_err());
        assert!(stage(&dir.0, &["/etc/passwd".into()]).is_err());
    }

    #[test]
    fn discard_restores_tracked_files_and_trashes_new_ones() {
        let dir = repo("git-discard");
        dir.file("a.md", "old");
        stage(&dir.0, &["a.md".into()]).unwrap();
        commit(&dir.0, "first", false).unwrap();
        dir.file("a.md", "new");
        dir.file("fresh.md", "x");
        discard(&dir.0, "a.md").unwrap();
        assert_eq!(std::fs::read_to_string(dir.0.join("a.md")).unwrap(), "old");
        discard(&dir.0, "fresh.md").unwrap();
        assert!(!dir.0.join("fresh.md").exists());
        assert!(status(&dir.0).unwrap().changes.is_empty());
    }
}
