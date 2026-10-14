use crate::scan::scan;
use serde::Serialize;
use std::{fs, path::Path};

/// Most matches reported for one note, so a note that repeats a word cannot crowd out the rest.
const HITS_PER_NOTE: usize = 2;
/// Characters of context kept on each side of the match in a snippet.
const SNIPPET_CONTEXT: usize = 60;

#[derive(Serialize, Debug, PartialEq)]
pub struct SearchHit {
    pub path: String,
    pub title: String,
    /// 1-based line number of the match.
    pub line: usize,
    pub snippet: String,
}

/// A short piece of `line` around the first match of `needle` (already lower-cased).
fn snippet_around(line: &str, needle: &str) -> String {
    let lower = line.to_lowercase();
    let Some(byte_start) = lower.find(needle) else {
        return line.trim().chars().take(SNIPPET_CONTEXT * 2).collect();
    };
    // `to_lowercase` can change lengths for some scripts; count in chars to stay on boundaries.
    let match_start = lower[..byte_start].chars().count();
    let chars: Vec<char> = line.chars().collect();
    let from = match_start.saturating_sub(SNIPPET_CONTEXT);
    let to = (match_start + needle.chars().count() + SNIPPET_CONTEXT).min(chars.len());
    let mut text: String = chars[from.min(chars.len())..to].iter().collect();
    text = text.trim().to_string();
    if from > 0 {
        text.insert(0, '…');
    }
    if to < chars.len() {
        text.push('…');
    }
    text
}

/// Case-insensitive search of every note's text. Stops after `limit` hits.
pub fn search(root: &Path, query: &str, limit: usize) -> Vec<SearchHit> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }
    let mut hits = Vec::new();
    for note in scan(root).notes {
        let Ok(text) = fs::read_to_string(root.join(&note.path)) else { continue };
        let mut in_note = 0;
        for (index, line) in text.lines().enumerate() {
            if !line.to_lowercase().contains(&needle) {
                continue;
            }
            hits.push(SearchHit {
                path: note.path.clone(),
                title: note.title.clone(),
                line: index + 1,
                snippet: snippet_around(line, &needle),
            });
            in_note += 1;
            if hits.len() >= limit {
                return hits;
            }
            if in_note >= HITS_PER_NOTE {
                break;
            }
        }
    }
    hits
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scan::tests::Scratch;

    #[test]
    fn finds_text_ignoring_case_with_its_line_number() {
        let dir = Scratch::new("search-basic");
        dir.file("a.md", "# Alpha\n\nsome Rust code\n");
        dir.file("b.md", "# Bravo\n\nnothing here\n");
        let hits = search(&dir.0, "rust", 10);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].path, "a.md");
        assert_eq!(hits[0].title, "Alpha");
        assert_eq!(hits[0].line, 3);
        assert_eq!(hits[0].snippet, "some Rust code");
    }

    #[test]
    fn an_empty_query_finds_nothing() {
        let dir = Scratch::new("search-empty");
        dir.file("a.md", "text");
        assert!(search(&dir.0, "   ", 10).is_empty());
    }

    #[test]
    fn limits_matches_per_note_and_overall() {
        let dir = Scratch::new("search-limit");
        dir.file("a.md", "x one\nx two\nx three\n");
        dir.file("b.md", "x four\n");
        dir.file("c.md", "x five\n");
        let hits = search(&dir.0, "x", 10);
        let per_note: Vec<usize> = ["a.md", "b.md", "c.md"]
            .iter()
            .map(|p| hits.iter().filter(|h| h.path == *p).count())
            .collect();
        assert_eq!(per_note, [2, 1, 1]);
        assert_eq!(search(&dir.0, "x", 2).len(), 2);
    }

    #[test]
    fn skips_hidden_folders_and_non_notes() {
        let dir = Scratch::new("search-skip");
        dir.file(".git/a.md", "secret word");
        dir.file("pic.txt", "secret word");
        dir.file("ok.md", "secret word");
        let paths: Vec<String> = search(&dir.0, "secret", 10).into_iter().map(|h| h.path).collect();
        assert_eq!(paths, ["ok.md"]);
    }

    #[test]
    fn snippets_are_trimmed_around_the_match_on_char_boundaries() {
        let long = format!("{}needle{}", "字".repeat(100), "尾".repeat(100));
        let snippet = snippet_around(&long, "needle");
        assert!(snippet.starts_with('…') && snippet.ends_with('…'));
        assert!(snippet.contains("needle"));
        assert!(snippet.chars().count() < 160);
    }

    #[test]
    fn matches_non_ascii_text() {
        let dir = Scratch::new("search-cjk");
        dir.file("a.md", "今天学习了 Rust 的所有权\n");
        assert_eq!(search(&dir.0, "所有权", 5)[0].line, 1);
    }
}
