use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::Mutex,
};
use tauri::{http, AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct Workspace {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize)]
struct NoteMeta {
    path: String,
    title: String,
    folder: String,
}

#[derive(Serialize)]
struct WorkspaceInfo {
    root: String,
    name: String,
    notes: Vec<NoteMeta>,
}

#[derive(Serialize, Clone)]
struct ChangePayload {
    paths: Vec<String>,
}

const TEMP_SUFFIX: &str = ".kh-tmp";
const TITLE_SCAN_BYTES: usize = 4096;

/// Hidden folders, dependency folders and our own temp files never show up as notes.
fn is_ignored(rel: &Path) -> bool {
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

fn to_rel_string(rel: &Path) -> String {
    rel.to_string_lossy().replace('\\', "/")
}

/// Join a workspace-relative path, refusing anything that could escape the root.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
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

fn current_root(state: &Workspace) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no workspace open".to_string())
}

const COLOR_NAMES: [&str; 9] = [
    "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
];

/// Drop the `{red}…{/red}` / `{bg-red}…{/bg-red}` colour tags, keeping the text between them.
fn strip_color_tags(text: &str) -> String {
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
fn heading_title(file: &Path) -> Option<String> {
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

fn walk_notes(dir: &Path, root: &Path, out: &mut Vec<NoteMeta>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let full = entry.path();
        let Ok(rel) = full.strip_prefix(root) else { continue };
        if is_ignored(rel) {
            continue;
        }
        let Ok(file_type) = entry.file_type() else { continue };
        if file_type.is_dir() {
            walk_notes(&full, root, out);
        } else if file_type.is_file()
            && full
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            let path = to_rel_string(rel);
            let fallback = full
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.clone());
            let title = heading_title(&full).unwrap_or(fallback);
            let folder = rel.parent().map(to_rel_string).unwrap_or_default();
            out.push(NoteMeta { path, title, folder });
        }
    }
}

fn scan(root: &Path) -> Vec<NoteMeta> {
    let mut notes = Vec::new();
    walk_notes(root, root, &mut notes);
    notes.sort_by_key(|n| n.path.to_lowercase());
    notes
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
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

fn start_watcher(app: &AppHandle, root: &Path) -> Result<RecommendedWatcher, String> {
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
            copy_dir(&source, &dir).map_err(|e| e.to_string())?;
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
    let watcher = start_watcher(&app, &root)?;
    *state.watcher.lock().map_err(|e| e.to_string())? = Some(watcher);
    *state.root.lock().map_err(|e| e.to_string())? = Some(root.clone());

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    Ok(WorkspaceInfo {
        root: path,
        name,
        notes: scan(&root),
    })
}

#[tauri::command]
fn scan_workspace(state: State<Workspace>) -> Result<Vec<NoteMeta>, String> {
    Ok(scan(&current_root(&state)?))
}

#[tauri::command]
fn read_note(state: State<Workspace>, path: String) -> Result<String, String> {
    let full = safe_join(&current_root(&state)?, &path)?;
    fs::read_to_string(full).map_err(|e| e.to_string())
}

/// Write via a temp file and rename so a crash never leaves a half-written note.
#[tauri::command]
fn write_note(state: State<Workspace>, path: String, text: String) -> Result<(), String> {
    let full = safe_join(&current_root(&state)?, &path)?;
    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut temp = full.clone().into_os_string();
    temp.push(TEMP_SUFFIX);
    let temp = PathBuf::from(temp);
    fs::write(&temp, text).map_err(|e| e.to_string())?;
    fs::rename(&temp, &full).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

fn mime_for(path: &Path) -> &'static str {
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

fn serve_asset(app: &AppHandle, request: &http::Request<Vec<u8>>) -> http::Response<Vec<u8>> {
    let respond = |status: u16, body: Vec<u8>, mime: &str| {
        http::Response::builder()
            .status(status)
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .body(body)
            .unwrap_or_default()
    };

    let state = app.state::<Workspace>();
    let Ok(root) = current_root(&state) else {
        return respond(404, Vec::new(), "text/plain");
    };
    let raw = request.uri().path().trim_start_matches('/');
    let Ok(rel) = urlencoding::decode(raw) else {
        return respond(400, Vec::new(), "text/plain");
    };
    let Ok(full) = safe_join(&root, &rel) else {
        return respond(403, Vec::new(), "text/plain");
    };
    match fs::read(&full) {
        Ok(bytes) => respond(200, bytes, mime_for(&full)),
        Err(_) => respond(404, Vec::new(), "text/plain"),
    }
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
            write_note
        ])
        .run(tauri::generate_context!())
        .expect("error while running KnowledgeHub");
}
