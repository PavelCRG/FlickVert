#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::Mutex,
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
mod archive;
mod files;
mod input;
mod operations;
mod quick_window;

const QUICK_WIDTH: u32 = 400;
const QUICK_HEIGHT: u32 = 400;
static MEDIA_TEMP_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[derive(Default)]
struct DroppedFiles(Mutex<HashSet<PathBuf>>);

#[derive(Default)]
struct DragTrigger(Mutex<bool>);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFile {
    path: String,
    name: String,
    size: u64,
    extension: String,
    mime: &'static str,
    is_directory: bool,
}

fn file_mime(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "cr2" | "cr3" | "nef" | "arw" | "raf" | "dng" | "orf" | "rw2" => Some("image/x-raw"),
        "mp4" | "m4v" => Some("video/mp4"),
        "mpeg" | "mpg" => Some("video/mpeg"),
        "3gp" => Some("video/3gpp"),
        "flv" => Some("video/x-flv"),
        "m2ts" | "mts" | "ts" => Some("video/mp2t"),
        "mov" => Some("video/quicktime"),
        "mkv" => Some("video/x-matroska"),
        "webm" => Some("video/webm"),
        "avi" => Some("video/x-msvideo"),
        "ogv" => Some("video/ogg"),
        "vob" => Some("video/dvd"),
        "wmv" => Some("video/x-ms-wmv"),
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "aac" => Some("audio/aac"),
        "m4a" | "m4b" => Some("audio/mp4"),
        "aif" | "aiff" => Some("audio/aiff"),
        "caf" => Some("audio/x-caf"),
        "flac" => Some("audio/flac"),
        "oga" | "ogg" | "opus" => Some("audio/ogg"),
        "mka" => Some("audio/x-matroska"),
        "wma" => Some("audio/x-ms-wma"),
        "ass" | "ssa" => Some("text/plain"),
        "srt" => Some("application/x-subrip"),
        "vtt" => Some("text/vtt"),
        "docx" | "doc" | "odt" | "rtf" | "md" | "markdown" | "html" | "htm" | "epub" | "txt"
        | "rst" | "tex" | "xls" | "xlsx" | "ods" | "ppt" | "pptx" | "odp" | "csv" => {
            Some("application/octet-stream")
        }
        _ => None,
    }
}

#[tauri::command]
fn inspect_dropped_files(
    paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Vec<NativeFile> {
    let mut selected = dropped.0.lock().unwrap();
    paths
        .into_iter()
        .filter_map(|path| {
            let path = fs::canonicalize(path).ok()?;
            let metadata = fs::metadata(&path).ok()?;
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let mime = file_mime(&extension).unwrap_or("application/octet-stream");
            if !metadata.is_file() && !metadata.is_dir() {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().into_owned();
            selected.insert(path.clone());
            Some(NativeFile {
                path: path.to_string_lossy().into_owned(),
                name,
                size: metadata.len(),
                extension,
                mime,
                is_directory: metadata.is_dir(),
            })
        })
        .collect()
}

#[tauri::command]
fn engine_status() -> operations::Engines {
    operations::all_engine_status()
}

#[tauri::command]
fn take_drag_trigger(trigger: tauri::State<'_, DragTrigger>) -> bool {
    std::mem::take(&mut *trigger.0.lock().unwrap())
}

#[tauri::command]
fn quick_formats(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<String>, String> {
    let input = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&input) {
        return Err("Select the input file by dropping it into FlickVert".into());
    }
    if input.is_dir() {
        return Ok(Vec::new());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&extension.as_str()) {
        return Ok(["png", "jpg", "webp"].map(str::to_owned).to_vec());
    }
    Ok(operations::output_extensions_for(
        &extension,
        operations::all_engine_status(),
    ))
}

#[tauri::command]
fn read_dropped_file(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<u8>, String> {
    let input = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&input) {
        return Err("Select the input file by dropping it into FlickVert".into());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&extension.as_str()) {
        return Err("Only supported images can be read by the quick converter".into());
    }
    let metadata = fs::metadata(&input).map_err(|error| error.to_string())?;
    if metadata.len() > 128 * 1024 * 1024 {
        return Err("Image is larger than 128 MB".into());
    }
    fs::read(input).map_err(|error| error.to_string())
}

#[tauri::command]
fn convert_file(
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
    let operation = operations::operation_for(
        &extension,
        &output_extension,
        operations::all_engine_status(),
    )
    .ok_or_else(|| "No installed engine supports this input and output format".to_string())?;
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
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted");
        let output_temp = if operation.engine == operations::Engine::LibreOffice {
            work_dir.join(format!("{stem}.{output_extension}"))
        } else {
            work_dir.join(format!("converted.{output_extension}"))
        };
        let (executable, args) = match operation.engine {
            operations::Engine::Ffmpeg => (
                operations::find_executable("ffmpeg").ok_or("FFmpeg is not installed")?,
                operations::ffmpeg_args(&input, &output_temp),
            ),
            operations::Engine::Pandoc => (
                operations::find_executable("pandoc").ok_or("Pandoc is not installed")?,
                operations::pandoc_args(&input, &output_temp),
            ),
            operations::Engine::ImageMagick => (
                operations::find_executable("magick").ok_or("ImageMagick is not installed")?,
                operations::imagemagick_args(&input, &output_temp),
            ),
            operations::Engine::LibreOffice => (
                operations::find_executable("soffice").ok_or("LibreOffice is not installed")?,
                operations::libreoffice_args(&input, &work_dir),
            ),
        };
        let output: Output =
            operations::run(&executable, &args).map_err(|error| error.to_string())?;
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned());
        }
        if !output_temp.is_file()
            || fs::metadata(&output_temp)
                .map_err(|error| error.to_string())?
                .len()
                == 0
        {
            return Err("The conversion engine did not create an output file".into());
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted");
        let name = format!("{stem}.{output_extension}");
        let destination = input.parent().ok_or("Input folder not found")?;
        files::write_output_file(&destination, &name, &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })();
    let _ = fs::remove_dir_all(work_dir);
    result
}

#[tauri::command]
fn process_media_tool(
    app: AppHandle,
    input_path: String,
    action_id: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_video = operations::is_video_input(&extension);
    let is_audio = operations::is_audio_input(&extension);
    let output_extension = match (is_video, is_audio, action_id.as_str()) {
        (true, _, "compress-video") => "mp4",
        (true, _, "mute-video") => &extension,
        (true, _, "extract-audio") => "mp3",
        (true, _, "video-thumbnail") => "jpg",
        (_, true, "compress-audio" | "normalize-audio") => "m4a",
        _ => return Err("This tool is not available for the selected media".into()),
    };
    let ffmpeg = operations::find_executable("ffmpeg").ok_or("FFmpeg is not installed")?;
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
        let output_temp = work_dir.join(format!("result.{output_extension}"));
        let args = operations::ffmpeg_tool_args(&action_id, &input, &output_temp)
            .ok_or("Unknown media tool")?;
        let output = operations::run(&ffmpeg, &args).map_err(|error| error.to_string())?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
            return Err(if message.is_empty() {
                "FFmpeg could not process this file".into()
            } else {
                message
            });
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
            .unwrap_or("media");
        let suffix = match action_id.as_str() {
            "compress-video" | "compress-audio" => "compressed",
            "mute-video" => "muted",
            "extract-audio" => "audio",
            "video-thumbnail" => "thumbnail",
            "normalize-audio" => "normalized",
            _ => return Err("Unknown media tool".into()),
        };
        let name = format!("{stem}-{suffix}.{output_extension}");
        let destination = input.parent().ok_or("Input folder not found")?;
        files::write_output_file(destination, &name, &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })();
    let _ = fs::remove_dir_all(work_dir);
    result
}

#[tauri::command]
fn create_zip_archive(
    app: AppHandle,
    input_paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    if input_paths.is_empty() || input_paths.len() > 10_000 {
        return Err("Select between 1 and 10,000 files to archive".into());
    }
    let mut seen = HashSet::new();
    let mut inputs = Vec::new();
    for input_path in input_paths {
        let path = selected_dropped_path(&input_path, &dropped)?;
        if seen.insert(path.clone()) {
            inputs.push(path);
        }
    }
    let stem = if inputs.len() == 1 {
        inputs[0]
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("archive")
    } else {
        "archive"
    };
    let output_name = format!("{stem}.zip");
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("archive-work");
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
        let temporary = work_dir.join("archive.zip");
        archive::create_zip(&inputs, &temporary)?;
        let downloads = app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?;
        let destination = files::output_directory(&downloads).map_err(|error| error.to_string())?;
        files::write_output_file(&destination, &output_name, &temporary)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })();
    let _ = fs::remove_dir_all(work_dir);
    result
}

#[tauri::command]
fn extract_zip_archive(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err("Only ZIP archives can be extracted".into());
    }
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let destination = files::output_directory(&downloads).map_err(|error| error.to_string())?;
    let name = input
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("archive");
    archive::extract_zip(&input, &destination, name).map(|path| path.to_string_lossy().into_owned())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    #[cfg(windows)]
    show_native_main();
}

#[cfg(windows)]
fn show_native_main() {
    use std::{ffi::c_void, slice};
    type Hwnd = *mut c_void;
    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(
            callback: Option<unsafe extern "system" fn(Hwnd, isize) -> i32>,
            data: isize,
        ) -> i32;
        fn GetWindowThreadProcessId(hwnd: Hwnd, process_id: *mut u32) -> u32;
        fn GetClassNameW(hwnd: Hwnd, class_name: *mut u16, max_count: i32) -> i32;
        fn ShowWindow(hwnd: Hwnd, command: i32) -> i32;
        fn SetForegroundWindow(hwnd: Hwnd) -> i32;
        fn SetWindowPos(
            hwnd: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
    }
    unsafe extern "system" fn visit(hwnd: Hwnd, data: isize) -> i32 {
        let target_id = unsafe { *(data as *const u32) };
        let mut process_id = 0;
        unsafe { GetWindowThreadProcessId(hwnd, &mut process_id) };
        if process_id == target_id {
            let mut class_name = [0u16; 64];
            let length =
                unsafe { GetClassNameW(hwnd, class_name.as_mut_ptr(), class_name.len() as i32) };
            // shortcut: targets Tao's Windows class; update if Tauri changes its window backend.
            if String::from_utf16_lossy(unsafe {
                slice::from_raw_parts(class_name.as_ptr(), length as usize)
            }) == "global_hotkey_app"
            {
                unsafe {
                    ShowWindow(hwnd, 9);
                    SetWindowPos(hwnd, (-1isize) as _, 0, 0, 0, 0, 0x0043);
                    if SetForegroundWindow(hwnd) != 0 {
                        SetWindowPos(hwnd, (-2isize) as _, 0, 0, 0, 0, 0x0043);
                    }
                }
            }
        }
        1
    }
    let process_id = std::process::id();
    unsafe {
        EnumWindows(Some(visit), &process_id as *const u32 as isize);
    }
}

#[cfg(windows)]
fn remove_native_topmost(hwnd: *mut std::ffi::c_void) {
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowPos(
            hwnd: *mut std::ffi::c_void,
            after: *mut std::ffi::c_void,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            flags: u32,
        ) -> i32;
    }
    unsafe {
        SetWindowPos(hwnd, (-2isize) as _, 0, 0, 0, 0, 0x0043);
    }
}

fn show_quick(app: &AppHandle, activate: bool) {
    let Some(window) = app.get_webview_window("quick") else {
        return;
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
                (
                    cursor.x as i32 - physical_size.0 as i32 / 2,
                    cursor.y as i32 - physical_size.1 as i32 / 2,
                ),
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
    let _ = window.set_focusable(activate);
    let _ = window.show();
    if activate {
        let _ = window.set_focus();
    }
}

pub(crate) fn show_drag_quick(app: &AppHandle) {
    *app.state::<DragTrigger>().0.lock().unwrap() = true;
    show_quick(app, false);
    let _ = app.emit("flickvert://drag-wheel-open", ());
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
fn reveal_dropped_file(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    reveal_in_file_manager(&path).map_err(|error| error.to_string())
}

fn selected_dropped_path(input_path: &str, dropped: &DroppedFiles) -> Result<PathBuf, String> {
    let path = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&path) || !path.is_file() && !path.is_dir() {
        return Err("Select a file or folder by dropping it into FlickVert".into());
    }
    Ok(path)
}

fn selected_dropped_file(input_path: &str, dropped: &DroppedFiles) -> Result<PathBuf, String> {
    let path = selected_dropped_path(input_path, dropped)?;
    if !path.is_file() {
        return Err("Select a file by dropping it into FlickVert".into());
    }
    Ok(path)
}

#[cfg(target_os = "windows")]
fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
    let mut command = Command::new("explorer.exe");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg("/select,").arg(path);
    }
    command.spawn().map(|_| ())
}

#[cfg(target_os = "macos")]
fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
    let mut command = Command::new("open");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg("-R").arg(path);
    }
    command.spawn().map(|_| ())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("xdg-open")
        .arg(if path.is_dir() {
            path
        } else {
            path.parent().unwrap_or(path)
        })
        .spawn()
        .map(|_| ())
}

#[tauri::command]
fn copy_dropped_file_path(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    copy_path_to_clipboard(&path.to_string_lossy())
}

#[tauri::command]
fn copy_to_flickvert_folder(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let source = selected_dropped_path(&input_path, &dropped)?;
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let destination = files::output_directory(&downloads).map_err(|error| error.to_string())?;
    let name = source
        .file_name()
        .ok_or("File name not found")?
        .to_string_lossy();
    let output = if source.is_dir() {
        files::copy_directory(&source, &destination).map_err(|error| error.to_string())?
    } else {
        files::write_output_file(&destination, &name, &source).map_err(|error| error.to_string())?
    };
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
fn move_to_flickvert_folder(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let source = selected_dropped_path(&input_path, &dropped)?;
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let destination = files::output_directory(&downloads).map_err(|error| error.to_string())?;
    let name = source
        .file_name()
        .ok_or("File name not found")?
        .to_string_lossy();
    let output = if source.is_dir() {
        let output =
            files::copy_directory(&source, &destination).map_err(|error| error.to_string())?;
        fs::remove_dir_all(&source).map_err(|error| error.to_string())?;
        output
    } else {
        let output = files::write_output_file(&destination, &name, &source)
            .map_err(|error| error.to_string())?;
        if let Err(error) = fs::remove_file(&source) {
            let _ = fs::remove_file(&output);
            return Err(error.to_string());
        }
        output
    };
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn copy_path_to_clipboard(path: &str) -> Result<(), String> {
    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; $s = [Console]::In.ReadToEnd(); Set-Clipboard -Value $s",
        ])
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    child
        .stdin
        .take()
        .ok_or("Could not access the clipboard process")?
        .write_all(path.as_bytes())
        .map_err(|error| error.to_string())?;
    child
        .wait()
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "Could not copy the path to the clipboard".into())
}

#[cfg(target_os = "macos")]
fn copy_path_to_clipboard(path: &str) -> Result<(), String> {
    let mut child = Command::new("pbcopy")
        .stdin(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    child
        .stdin
        .take()
        .ok_or("Could not access the clipboard process")?
        .write_all(path.as_bytes())
        .map_err(|error| error.to_string())?;
    child
        .wait()
        .map_err(|error| error.to_string())?
        .success()
        .then_some(())
        .ok_or_else(|| "Could not copy the path to the clipboard".into())
}

#[cfg(not(any(windows, target_os = "macos")))]
fn copy_path_to_clipboard(_: &str) -> Result<(), String> {
    Err("Clipboard access is not supported on this platform".into())
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
                show_quick(handle, true);
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
fn save_output(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
    input_path: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let directory = if let Some(path) = input_path {
        let input = fs::canonicalize(path).map_err(|error| error.to_string())?;
        if !dropped.0.lock().unwrap().contains(&input) {
            return Err("Select the input file by dropping it into FlickVert".into());
        }
        input
            .parent()
            .ok_or("Input folder not found")?
            .to_path_buf()
    } else {
        let downloads = app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?;
        files::output_directory(&downloads).map_err(|error| error.to_string())?
    };
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
            reveal_dropped_file,
            copy_dropped_file_path,
            copy_to_flickvert_folder,
            move_to_flickvert_folder,
            register_shortcut,
            take_drag_trigger,
            quick_formats,
            read_dropped_file,
            inspect_dropped_files,
            engine_status,
            convert_file,
            process_media_tool,
            create_zip_archive,
            extract_zip_archive
        ])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("FlickVert")
                .inner_size(1120.0, 760.0)
                .min_inner_size(760.0, 600.0)
                .resizable(true)
                .center()
                .visible(true)
                .build()?;
            #[cfg(windows)]
            show_native_main();
            app.manage(DroppedFiles::default());
            app.manage(DragTrigger::default());
            match WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html".into()))
                .title("FlickVert Quick Actions")
                .inner_size(QUICK_WIDTH as f64, QUICK_HEIGHT as f64)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .focusable(false)
                .visible(false)
                .build()
            {
                Ok(_) => {}
                Err(error) => eprintln!("Could not prepare quick actions: {error}"),
            }
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
                        "quick" => show_quick(app, true),
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
            input::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(windows)]
            if matches!(event, tauri::WindowEvent::Focused(true)) {
                if let Ok(hwnd) = window.hwnd() {
                    remove_native_topmost(hwnd.0);
                }
            }
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && payload.event() == PageLoadEvent::Finished {
                let window = webview.window();
                let _ = window.show();
                let _ = window.set_focus();
                #[cfg(windows)]
                show_native_main();
            }
        })
        .build(tauri::generate_context!())
        .expect("FlickVert failed to start")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::Ready) {
                show_main(app);
            }
        });
}

#[cfg(test)]
mod file_type_tests {
    use super::file_mime;

    #[test]
    fn recognizes_document_and_raw_inputs_without_claiming_unknown_files() {
        assert_eq!(file_mime("docx"), Some("application/octet-stream"));
        assert_eq!(file_mime("cr3"), Some("image/x-raw"));
        assert_eq!(file_mime("exe"), None);
    }
}
