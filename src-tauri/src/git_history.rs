use crate::git::{ensure_repo, git, git_with_paths, has_commits};
use crate::paths::safe_join;
use serde::Serialize;
use std::{fs, path::Path};

#[derive(Serialize, Debug, PartialEq)]
pub struct CommitInfo {
    pub hash: String,
    pub short: String,
    pub author: String,
    /// Unix seconds.
    pub time: i64,
    pub summary: String,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct CommitFile {
    pub path: String,
    pub kind: &'static str,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Branch {
    pub name: String,
    pub current: bool,
}

const FIELD: char = '\x1f';
const RECORD: char = '\x1e';

fn ensure_commit_id(id: &str) -> Result<(), String> {
    if (4..=40).contains(&id.len()) && id.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("invalid commit".into())
    }
}

pub fn parse_log(output: &str) -> Vec<CommitInfo> {
    output
        .split(RECORD)
        .filter_map(|record| {
            let mut fields = record.trim_start_matches('\n').split(FIELD);
            Some(CommitInfo {
                hash: fields.next().filter(|h| !h.is_empty())?.to_string(),
                short: fields.next()?.to_string(),
                author: fields.next()?.to_string(),
                time: fields.next()?.parse().ok()?,
                summary: fields.next()?.to_string(),
            })
        })
        .collect()
}

/// Newest first; `path` limits it to the history of one file (following renames).
pub fn log(root: &Path, path: Option<&str>, limit: usize) -> Result<Vec<CommitInfo>, String> {
    ensure_repo(root)?;
    if !has_commits(root) {
        return Ok(Vec::new());
    }
    let limit = limit.to_string();
    let format = format!("--format=%H{FIELD}%h{FIELD}%an{FIELD}%at{FIELD}%s{RECORD}");
    let output = match path {
        Some(path) => git_with_paths(root, &["log", "-n", &limit, &format, "--follow"], &[path.to_string()])?,
        None => git(root, &["log", "-n", &limit, &format])?,
    };
    Ok(parse_log(&output))
}

fn kind_of_letter(letter: &str) -> &'static str {
    match letter.chars().next() {
        Some('A') => "added",
        Some('D') => "deleted",
        Some('R') | Some('C') => "renamed",
        _ => "modified",
    }
}

/// Parse `diff-tree --name-status -z`: `M\0path\0`, and renames/copies `R100\0old\0new\0`.
pub fn parse_name_status(output: &str) -> Vec<CommitFile> {
    let mut parts = output.split('\0').filter(|p| !p.is_empty());
    let mut files = Vec::new();
    while let Some(letter) = parts.next() {
        let kind = kind_of_letter(letter);
        if kind == "renamed" {
            parts.next(); // the original path
        }
        if let Some(path) = parts.next() {
            files.push(CommitFile { path: path.to_string(), kind });
        }
    }
    files
}

pub fn commit_files(root: &Path, commit: &str) -> Result<Vec<CommitFile>, String> {
    ensure_repo(root)?;
    ensure_commit_id(commit)?;
    let out = git(root, &["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", "--root", "-z", commit])?;
    Ok(parse_name_status(&out))
}

/// Unified diff of one file in one commit.
pub fn commit_diff(root: &Path, commit: &str, path: &str) -> Result<String, String> {
    ensure_repo(root)?;
    ensure_commit_id(commit)?;
    git_with_paths(root, &["show", "--format=", "--no-color", "-M", commit], &[path.to_string()])
}

/// A file git has never seen has no diff to ask for, so show all of it as added.
fn untracked_diff(full: &Path) -> Result<String, String> {
    let text = fs::read_to_string(full).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = text.lines().collect();
    let body: String = lines.iter().map(|line| format!("+{line}\n")).collect();
    Ok(format!("@@ -0,0 +1,{} @@\n{body}", lines.len()))
}

/// Unified diff of one file: staged against HEAD, or working tree against the index.
pub fn diff(root: &Path, path: &str, staged: bool, untracked: bool) -> Result<String, String> {
    ensure_repo(root)?;
    let full = safe_join(root, path)?;
    if untracked {
        return untracked_diff(&full);
    }
    let args: &[&str] = if staged { &["diff", "--cached", "--no-color"] } else { &["diff", "--no-color"] };
    git_with_paths(root, args, &[path.to_string()])
}

/// Put one file back to how it was in `commit` (the working tree only; nothing is staged).
pub fn restore_version(root: &Path, commit: &str, path: &str) -> Result<(), String> {
    ensure_repo(root)?;
    ensure_commit_id(commit)?;
    let source = format!("--source={commit}");
    git_with_paths(root, &["restore", &source, "--worktree"], &[path.to_string()]).map(|_| ())
}

pub fn branches(root: &Path) -> Result<Vec<Branch>, String> {
    ensure_repo(root)?;
    let out = git(root, &["branch", "--format=%(HEAD)%(refname:short)"])?;
    Ok(out
        .lines()
        .filter_map(|line| {
            let current = line.starts_with('*');
            let name = line.get(1..)?.trim();
            (!name.is_empty() && !name.starts_with('(')).then(|| Branch { name: name.to_string(), current })
        })
        .collect())
}

fn ensure_branch_name(root: &Path, name: &str) -> Result<(), String> {
    if name.starts_with('-') {
        return Err("invalid branch name".into());
    }
    git(root, &["check-ref-format", "--branch", name])
        .map(|_| ())
        .map_err(|_| "invalid branch name".to_string())
}

pub fn checkout(root: &Path, name: &str) -> Result<(), String> {
    ensure_repo(root)?;
    ensure_branch_name(root, name)?;
    git(root, &["switch", name]).map(|_| ())
}

pub fn create_branch(root: &Path, name: &str) -> Result<(), String> {
    ensure_repo(root)?;
    ensure_branch_name(root, name)?;
    git(root, &["switch", "-c", name]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::{commit, stage, tests::repo};
    use crate::scan::tests::Scratch;

    fn commit_file(dir: &Scratch, path: &str, text: &str, message: &str) {
        dir.file(path, text);
        stage(&dir.0, &[path.to_string()]).unwrap();
        commit(&dir.0, message, false).unwrap();
    }

    #[test]
    fn log_of_an_empty_repository_is_empty() {
        let dir = repo("hist-empty");
        assert!(log(&dir.0, None, 10).unwrap().is_empty());
        assert!(branches(&dir.0).unwrap().is_empty());
    }

    #[test]
    fn log_lists_newest_first_and_can_follow_one_file() {
        let dir = repo("hist-log");
        commit_file(&dir, "a.md", "1", "add a");
        commit_file(&dir, "b.md", "1", "add b");
        let all = log(&dir.0, None, 10).unwrap();
        assert_eq!(all.iter().map(|c| c.summary.as_str()).collect::<Vec<_>>(), ["add b", "add a"]);
        let only_a = log(&dir.0, Some("a.md"), 10).unwrap();
        assert_eq!(only_a.len(), 1);
        assert_eq!(only_a[0].summary, "add a");
        assert_eq!(log(&dir.0, None, 1).unwrap().len(), 1);
    }

    #[test]
    fn a_commit_lists_its_files_and_their_diff() {
        let dir = repo("hist-show");
        commit_file(&dir, "a.md", "one\n", "add a");
        commit_file(&dir, "a.md", "one\ntwo\n", "edit a");
        let head = &log(&dir.0, None, 1).unwrap()[0].hash;
        assert_eq!(commit_files(&dir.0, head).unwrap(), vec![CommitFile { path: "a.md".into(), kind: "modified" }]);
        assert!(commit_diff(&dir.0, head, "a.md").unwrap().contains("+two"));
        assert!(commit_files(&dir.0, "--help").is_err());
    }

    #[test]
    fn diff_covers_staged_unstaged_and_untracked_files() {
        let dir = repo("hist-diff");
        commit_file(&dir, "a.md", "one\n", "add a");
        dir.file("a.md", "one\ntwo\n");
        assert!(diff(&dir.0, "a.md", false, false).unwrap().contains("+two"));
        assert!(diff(&dir.0, "a.md", true, false).unwrap().is_empty());
        stage(&dir.0, &["a.md".into()]).unwrap();
        assert!(diff(&dir.0, "a.md", true, false).unwrap().contains("+two"));
        dir.file("n.md", "x\ny\n");
        assert_eq!(diff(&dir.0, "n.md", false, true).unwrap(), "@@ -0,0 +1,2 @@\n+x\n+y\n");
    }

    #[test]
    fn restoring_a_version_rewrites_the_file_only() {
        let dir = repo("hist-restore");
        commit_file(&dir, "a.md", "old\n", "v1");
        commit_file(&dir, "a.md", "new\n", "v2");
        let first = &log(&dir.0, None, 10).unwrap()[1].hash;
        restore_version(&dir.0, first, "a.md").unwrap();
        assert_eq!(std::fs::read_to_string(dir.0.join("a.md")).unwrap(), "old\n");
        assert!(restore_version(&dir.0, "-x", "a.md").is_err());
    }

    #[test]
    fn branches_can_be_created_and_switched() {
        let dir = repo("hist-branch");
        commit_file(&dir, "a.md", "1", "add a");
        create_branch(&dir.0, "draft").unwrap();
        let current: Vec<_> = branches(&dir.0).unwrap().into_iter().filter(|b| b.current).collect();
        assert_eq!(current[0].name, "draft");
        let other = branches(&dir.0).unwrap().into_iter().find(|b| !b.current).unwrap().name;
        checkout(&dir.0, &other).unwrap();
        assert!(create_branch(&dir.0, "bad name").is_err());
        assert!(checkout(&dir.0, "-f").is_err());
    }
}
