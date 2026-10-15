mod assets;
mod files;
mod git;
mod git_history;
mod paths;
mod scan;
mod search;
mod watcher;

use notify::RecommendedWatcher;
use paths::safe_join;
use scan::{scan, NoteMeta};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{http, AppHandle, Manager, State};

/// The folder that is open: where notes are read from and written to, and its file watcher.
#[derive(Default)]
struct Workspace {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize)]
struct WorkspaceInfo {
    root: String,
    name: String,
    notes: Vec<NoteMeta>,
    folders: Vec<String>,
}

fn current_root(state: &Workspace) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no workspace open".to_string())
}

/// Resolve a workspace-relative path from the front end against the open workspace.
fn resolve(state: &Workspace, rel: &str) -> Result<PathBuf, String> {
    safe_join(&current_root(state)?, rel)
}

/// Where notes live on first launch: `Documents/KnowledgeHub`, seeded with the sample notes.
#[tauri::command]
fn default_workspace(app: AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("KnowledgeHub");
    if !dir.exists() {
        let bundled = app
            .path()
            .resource_dir()
            .map(|d| d.join("examples"))
            .ok()
            .filter(|d| d.is_dir());
        let source =
            bundled.unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../examples"));
        if source.is_dir() {
            files::copy_dir(&source, &dir).map_err(|e| e.to_string())?;
        } else {
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        }
    }
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_workspace(
    app: AppHandle,
    state: State<Workspace>,
    path: String,
) -> Result<WorkspaceInfo, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("NOT_A_DIRECTORY".into());
    }
    let watcher = watcher::start_watcher(&app, &root)?;
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
    *state.root.lock().map_err(|e| e.to_string())? = Some(root.clone());

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let found = scan(&root);
    Ok(WorkspaceInfo {
        root: path,
        name,
        notes: found.notes,
        folders: found.folders,
    })
}

#[tauri::command]
fn scan_workspace(state: State<Workspace>) -> Result<scan::Scan, String> {
    Ok(scan(&current_root(&state)?))
}

#[tauri::command]
fn read_note(state: State<Workspace>, path: String) -> Result<String, String> {
    fs::read_to_string(resolve(&state, &path)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_note(state: State<Workspace>, path: String, text: String) -> Result<(), String> {
    files::write_atomic(&resolve(&state, &path)?, &text)
}

#[tauri::command]
fn create_note(state: State<Workspace>, path: String, content: String) -> Result<(), String> {
    files::create_note(&resolve(&state, &path)?, &path, &content)
}

#[tauri::command]
fn create_folder(state: State<Workspace>, path: String) -> Result<(), String> {
    files::create_folder(&resolve(&state, &path)?, &path)
}

/// Rename a note or folder, or move it to another folder (`to` is its whole new path).
#[tauri::command]
fn rename_entry(state: State<Workspace>, from: String, to: String) -> Result<(), String> {
    files::rename_entry(&resolve(&state, &from)?, &resolve(&state, &to)?, &to)
}

/// Save a pasted or dropped image next to the note. The image bytes are the raw request body;
/// the note path and file name travel in (URI-encoded) headers.
#[tauri::command]
fn save_asset(state: State<Workspace>, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let header = |name: &str| -> Result<String, String> {
        let value = request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("missing {name}"))?;
        urlencoding::decode(value).map(|s| s.into_owned()).map_err(|e| e.to_string())
    };
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw bytes".into());
    };
    assets::store_asset(&current_root(&state)?, &header("x-note-path")?, &header("x-file-name")?, bytes)
}

/// Search the text of every note for `query` (case-insensitive).
#[tauri::command]
fn search_notes(state: State<Workspace>, query: String) -> Result<Vec<search::SearchHit>, String> {
    Ok(search::search(&current_root(&state)?, &query, 50))
}

/// Move a note or folder to the system trash.
#[tauri::command]
fn delete_entry(state: State<Workspace>, path: String) -> Result<(), String> {
    files::trash_entry(&resolve(&state, &path)?)
}

/// Changed files and current branch of the workspace's Git repository.
#[tauri::command]
fn git_status(state: State<Workspace>) -> Result<git::GitStatus, String> {
    git::status(&current_root(&state)?)
}

/// Commit what is staged locally. Nothing is pushed.
#[tauri::command]
fn git_commit(state: State<Workspace>, message: String, amend: bool) -> Result<(), String> {
    git::commit(&current_root(&state)?, &message, amend)
}

#[tauri::command]
fn git_init(state: State<Workspace>) -> Result<(), String> {
    git::init(&current_root(&state)?)
}

#[tauri::command]
fn git_stage(state: State<Workspace>, paths: Vec<String>) -> Result<(), String> {
    git::stage(&current_root(&state)?, &paths)
}

#[tauri::command]
fn git_unstage(state: State<Workspace>, paths: Vec<String>) -> Result<(), String> {
    git::unstage(&current_root(&state)?, &paths)
}

/// Throw away all changes to one file; the front end asks the user first.
#[tauri::command]
fn git_discard(state: State<Workspace>, path: String) -> Result<(), String> {
    git::discard(&current_root(&state)?, &path)
}

#[tauri::command]
fn git_diff(state: State<Workspace>, path: String, staged: bool, untracked: bool) -> Result<String, String> {
    git_history::diff(&current_root(&state)?, &path, staged, untracked)
}

#[tauri::command]
fn git_log(
    state: State<Workspace>,
    path: Option<String>,
    limit: usize,
) -> Result<Vec<git_history::CommitInfo>, String> {
    git_history::log(&current_root(&state)?, path.as_deref(), limit)
}

#[tauri::command]
fn git_commit_files(state: State<Workspace>, commit: String) -> Result<Vec<git_history::CommitFile>, String> {
    git_history::commit_files(&current_root(&state)?, &commit)
}

#[tauri::command]
fn git_commit_diff(state: State<Workspace>, commit: String, path: String) -> Result<String, String> {
    git_history::commit_diff(&current_root(&state)?, &commit, &path)
}

#[tauri::command]
fn git_restore_version(state: State<Workspace>, commit: String, path: String) -> Result<(), String> {
    git_history::restore_version(&current_root(&state)?, &commit, &path)
}

#[tauri::command]
fn git_branches(state: State<Workspace>) -> Result<Vec<git_history::Branch>, String> {
    git_history::branches(&current_root(&state)?)
}

#[tauri::command]
fn git_checkout(state: State<Workspace>, name: String) -> Result<(), String> {
    git_history::checkout(&current_root(&state)?, &name)
}

#[tauri::command]
fn git_create_branch(state: State<Workspace>, name: String) -> Result<(), String> {
    git_history::create_branch(&current_root(&state)?, &name)
}

fn serve_asset(app: &AppHandle, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let root = current_root(&app.state::<Workspace>()).ok();
    let (status, body, mime) = assets::serve(root.as_deref(), request.uri().path());
    http::Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(body)
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Workspace::default())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("kh", |ctx, request| {
            serve_asset(ctx.app_handle(), &request)
        })
        .invoke_handler(tauri::generate_handler![
            default_workspace,
            open_workspace,
            scan_workspace,
            read_note,
            write_note,
            create_note,
            create_folder,
            rename_entry,
            delete_entry,
            search_notes,
            save_asset,
            git_status,
            git_commit,
            git_init,
            git_stage,
            git_unstage,
            git_discard,
            git_diff,
            git_log,
            git_commit_files,
            git_commit_diff,
            git_restore_version,
            git_branches,
            git_checkout,
            git_create_branch
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowledgeHub");
}
