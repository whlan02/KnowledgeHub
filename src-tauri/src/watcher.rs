use crate::paths::{is_ignored, to_rel_string};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct ChangePayload {
    paths: Vec<String>,
}

/// Tell the front end (event `workspace-changed`) which files under `root` change on disk.
pub fn start_watcher(app: &AppHandle, root: &Path) -> Result<RecommendedWatcher, String> {
    let app = app.clone();
    let watched_root = root.to_path_buf();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let paths: Vec<String> = event
            .paths
            .iter()
            .filter_map(|p| p.strip_prefix(&watched_root).ok())
            .filter(|rel| !is_ignored(rel))
            .map(to_rel_string)
            .collect();
        if !paths.is_empty() {
            let _ = app.emit("workspace-changed", ChangePayload { paths });
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(watcher)
}
