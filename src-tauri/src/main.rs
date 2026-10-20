#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashSet, fs, path::PathBuf, process::Output, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
mod files;
mod operations;
mod quick_window;

const QUICK_WIDTH: u32 = 400;
const QUICK_HEIGHT: u32 = 360;
static MEDIA_TEMP_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Default)]
struct DroppedFiles(Mutex<HashSet<PathBuf>>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MediaFile {
    path: String,
    name: String,
    size: u64,
    mime: &'static str,
}

fn media_mime(extension: &str) -> Option<&'static str> {
    match extension {
        "mp4" | "m4v" | "mpeg" => Some("video/mp4"),
        "mov" => Some("video/quicktime"),
        "mkv" => Some("video/x-matroska"),
        "webm" => Some("video/webm"),
        "avi" => Some("video/x-msvideo"),
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "aac" => Some("audio/aac"),
        "m4a" => Some("audio/mp4"),
        "flac" => Some("audio/flac"),
        "ogg" | "opus" => Some("audio/ogg"),
        _ => None,
    }
}

#[tauri::command]
fn inspect_dropped_media(
    paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Vec<MediaFile> {
    let mut selected = dropped.0.lock().unwrap();
    paths
        .into_iter()
        .filter_map(|path| {
            let path = fs::canonicalize(path).ok()?;
            let metadata = fs::metadata(&path).ok()?;
            let extension = path.extension()?.to_str()?.to_ascii_lowercase();
            let mime = media_mime(&extension)?;
            if !metadata.is_file() {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().into_owned();
            selected.insert(path.clone());
            Some(MediaFile {
                path: path.to_string_lossy().into_owned(),
                name,
                size: metadata.len(),
                mime,
            })
        })
        .collect()
}

#[tauri::command]
fn has_ffmpeg() -> bool {
    operations::find_ffmpeg().is_some()
}

#[tauri::command]
fn convert_media(
    app: AppHandle,
    input_path: String,
    output_extension: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = fs::canonicalize(&input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&input) {
        return Err("Select the input file by dropping it into FlickVert".into());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let kind =
        operations::media_kind(&extension).ok_or_else(|| "Unsupported media input".to_string())?;
    if !operations::output_extensions(kind).contains(&output_extension.as_str()) {
        return Err("Unsupported output format".into());
    }
    let ffmpeg = operations::find_ffmpeg().ok_or_else(|| "FFmpeg is not installed".to_string())?;
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("media-work");
    fs::create_dir_all(&work_root).map_err(|error| error.to_string())?;
    let work_dir = loop {
        let candidate = work_root.join(format!(
            "{}-{}",
            std::process::id(),
            MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    };
    let result = (|| {
        let output_temp = work_dir.join(format!("converted.{output_extension}"));
        let args = operations::ffmpeg_args(&input, &output_temp);
        let output: Output = operations::run(&ffmpeg, &args).map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        if !output_temp.is_file()
            || fs::metadata(&output_temp)
                .map_err(|error| error.to_string())?
                .len()
                == 0
        {
            return Err("FFmpeg did not create an output file".into());
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted");
        let name = format!("{stem}.{output_extension}");
        let downloads = app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?;
        let destination = files::output_directory(&downloads).map_err(|error| error.to_string())?;
        files::write_output_file(&destination, &name, &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })();
    let _ = fs::remove_dir_all(work_dir);
    result
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_quick(app: &AppHandle) {
    let window = match app.get_webview_window("quick") {
        Some(window) => window,
        None => match WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html".into()))
            .title("FlickVert Quick Actions")
            .inner_size(QUICK_WIDTH as f64, QUICK_HEIGHT as f64)
            .resizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .build()
        {
            Ok(window) => window,
            Err(error) => {
                eprintln!("Could not open quick actions: {error}");
                return;
            }
        },
    };
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y) {
            let area = monitor.work_area();
            let scale = monitor.scale_factor();
            let physical_size = (
                (QUICK_WIDTH as f64 * scale).ceil() as u32,
                (QUICK_HEIGHT as f64 * scale).ceil() as u32,
            );
            let position = quick_window::clamp_window_position(
                (cursor.x as i32, cursor.y as i32),
                physical_size,
                quick_window::Rect {
                    x: area.position.x,
                    y: area.position.y,
                    width: area.size.width,
                    height: area.size.height,
                },
            );
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(
                position.0, position.1,
            )));
        }
    }
    let _ = window.set_size(Size::Logical(LogicalSize::new(
        QUICK_WIDTH as f64,
        QUICK_HEIGHT as f64,
    )));
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn quick_action(app: AppHandle, action_id: String) -> Result<(), String> {
    if !matches!(action_id.as_str(), "convert" | "resize" | "settings") {
        return Err("Unknown quick action".into());
    }
    show_main(&app);
    app.emit("flickvert://quick-action", action_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let shortcut = match shortcut.as_str() {
        "CTRL+ALT+SPACE" | "CTRL+SHIFT+SPACE" | "ALT+SHIFT+SPACE" => shortcut,
        _ => return Err("Unsupported shortcut".into()),
    };
    let shortcut = shortcut
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|error| error.to_string())?;
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| error.to_string())?;
    app.global_shortcut()
        .on_shortcut(shortcut, |handle, _, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                show_quick(handle);
            }
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn output_directory(app: tauri::AppHandle) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    files::output_directory(&downloads)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_output(app: tauri::AppHandle, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let directory = files::output_directory(&downloads).map_err(|error| error.to_string())?;
    files::write_output(&directory, &file_name, &bytes)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

fn tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "Show FlickVert", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick actions", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Preferences", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&show, &quick, &settings, &quit])
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            output_directory,
            save_output,
            quick_action,
            register_shortcut,
            inspect_dropped_media,
            has_ffmpeg,
            convert_media
        ])
        .setup(|app| {
            app.manage(DroppedFiles::default());
            let tray = tray_menu(app.handle()).and_then(|menu| {
                let icon = app
                    .default_window_icon()
                    .cloned()
                    .ok_or_else(|| tauri::Error::AssetNotFound("icons/icon.png".into()))?;
                TrayIconBuilder::new()
                    .icon(icon)
                    .icon_as_template(true)
                    .tooltip("FlickVert")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main(app),
                        "quick" => show_quick(app),
                        "settings" => {
                            show_main(app);
                            let _ = app.emit("flickvert://quick-action", "settings");
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)
            });
            match tray {
                Ok(tray) => {
                    app.manage(tray);
                }
                Err(error) => {
                    eprintln!("Tray unavailable; keep FlickVert open to access it: {error}")
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("FlickVert failed to start");
}
