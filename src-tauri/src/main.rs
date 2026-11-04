#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use std::ops::Deref;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Position, Size, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
mod archive;
mod files;
mod file_signatures;
mod input;
mod operations;
mod quick_window;
mod selection;
mod shell_integration;

const QUICK_WIDTH: u32 = 400;
const QUICK_HEIGHT: u32 = 400;
static MEDIA_TEMP_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[cfg(windows)]
fn webview_data_directory(root: &Path) -> std::io::Result<PathBuf> {
    let directory = root
        .join("app.flickvert.desktop.v2")
        .join("webview-main");
    fs::create_dir_all(&directory)?;
    Ok(directory)
}

#[cfg(windows)]
fn windows_webview_data_directory() -> std::io::Result<PathBuf> {
    let root = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    webview_data_directory(&root).or_else(|_| {
        webview_data_directory(&std::env::temp_dir().join("FlickVert-WebView2"))
    })
}

#[derive(Default)]
struct DroppedFiles(Mutex<HashSet<PathBuf>>);

#[derive(Default)]
struct DragTrigger(Mutex<bool>);

#[derive(Default)]
struct RegisteredShortcut(Mutex<Option<String>>);

#[derive(Default)]
struct OperationShortcuts(Mutex<HashMap<String, String>>);

struct ConfirmQuitOnClose(AtomicBool);

struct StartupFiles(Mutex<Vec<String>>);

struct TemporaryDirectory(PathBuf);

impl Deref for TemporaryDirectory {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn cleanup_stale_workspaces(root: &Path, now: std::time::SystemTime) {
    let Ok(entries) = fs::read_dir(root) else { return };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else { continue };
        if is_stale_workspace(&entry.file_name().to_string_lossy(), metadata.is_dir(), metadata.modified().ok(), now) {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

fn is_stale_workspace(name: &str, is_dir: bool, modified: Option<std::time::SystemTime>, now: std::time::SystemTime) -> bool {
    let Some((pid, counter)) = name.split_once('-') else { return false };
    is_dir && pid.bytes().all(|byte| byte.is_ascii_digit()) && counter.bytes().all(|byte| byte.is_ascii_digit())
        && modified.and_then(|time| now.duration_since(time).ok()).is_some_and(|age| age > std::time::Duration::from_secs(24 * 60 * 60))
}

#[derive(Default)]
struct OperationJobs {
    next: AtomicU64,
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OperationProgress {
    job_id: String,
    progress: u8,
}

fn media_duration_us(input: &Path) -> Option<u64> {
    let ffprobe = operations::find_executable("ffprobe")?;
    let args = [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
    ]
    .into_iter()
    .map(std::ffi::OsString::from)
    .chain([input.as_os_str().to_owned()])
    .collect::<Vec<_>>();
    let output = operations::run(&ffprobe, &args).ok()?;
    if !output.status.success() {
        return None;
    }
    let seconds = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .ok()?;
    (seconds.is_finite() && seconds > 0.0).then_some((seconds * 1_000_000.0) as u64)
}

#[tauri::command(async)]
fn inspect_media_streams(input_path: String, dropped: tauri::State<'_, DroppedFiles>) -> Result<Vec<operations::MediaStream>, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    operations::media_streams(&input).ok_or_else(|| operation_error("engine"))
}

fn operation_error(kind: &str) -> String {
    format!("flickvert-error:{kind}")
}

fn error_log_line(kind: &str, timestamp: u64) -> Option<String> {
    matches!(kind, "input" | "unsupported" | "engine" | "access" | "conversion" | "protected" | "pdfNoText" | "write" | "cancelled")
        .then(|| format!("{timestamp}\t{kind}"))
}

#[tauri::command]
fn log_operation_error(app: AppHandle, kind: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_| "System clock is unavailable")?.as_secs();
    let line = error_log_line(&kind, timestamp).ok_or("Unsupported error category")?;
    let directory = app.path().app_log_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join("operations.log");
    if fs::metadata(&path).is_ok_and(|metadata| metadata.len() > 1024 * 1024) {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    let mut log = fs::OpenOptions::new().create(true).append(true).open(path).map_err(|error| error.to_string())?;
    writeln!(log, "{line}").map_err(|error| error.to_string())
}

fn process_error(error: std::io::Error) -> String {
    operation_error(if error.kind() == std::io::ErrorKind::Interrupted {
        "cancelled"
    } else {
        "engine"
    })
}

#[tauri::command]
fn begin_operation_job(jobs: tauri::State<'_, OperationJobs>) -> String {
    let id = jobs.next.fetch_add(1, Ordering::Relaxed).to_string();
    jobs.active
        .lock()
        .unwrap()
        .insert(id.clone(), Arc::new(AtomicBool::new(false)));
    id
}

#[tauri::command]
fn cancel_operation_job(job_id: String, jobs: tauri::State<'_, OperationJobs>) {
    if let Some(cancelled) = jobs.active.lock().unwrap().get(&job_id) {
        cancelled.store(true, Ordering::Release);
    }
}

#[tauri::command]
fn finish_operation_job(job_id: String, jobs: tauri::State<'_, OperationJobs>) {
    jobs.active.lock().unwrap().remove(&job_id);
}

fn cancel_all_operation_jobs(jobs: &OperationJobs) {
    for cancelled in jobs.active.lock().unwrap().values() {
        cancelled.store(true, Ordering::Release);
    }
}

#[tauri::command]
fn take_startup_files(files: tauri::State<'_, StartupFiles>, app: AppHandle) -> Vec<String> {
    let paths = std::mem::take(&mut *files.0.lock().unwrap());
    if !paths.is_empty() {
        show_quick(&app, true);
    }
    paths
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFile {
    path: String,
    name: String,
    size: u64,
    extension: String,
    mime: &'static str,
    is_directory: bool,
    has_audio: Option<bool>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageEditorRequest {
    input_path: String,
    initial_tool: String,
}

fn file_mime(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
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
        "pdf" => Some("application/pdf"),
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
            let has_audio = (mime.starts_with("video/") && metadata.is_file())
                .then(|| operations::has_audio_stream(&path))
                .flatten();
            dropped.0.lock().unwrap().insert(path.clone());
            Some(NativeFile {
                path: path.to_string_lossy().into_owned(),
                name,
                size: metadata.len(),
                extension,
                mime,
                is_directory: metadata.is_dir(),
                has_audio,
            })
        })
        .collect()
}

#[tauri::command]
fn engine_status() -> operations::Engines {
    operations::all_engine_status()
}

#[tauri::command]
fn video_codecs() -> Vec<&'static str> {
    operations::available_video_codecs()
}

#[tauri::command]
fn audio_formats() -> Vec<&'static str> {
    operations::available_audio_formats()
}

#[tauri::command]
fn pdf_merge_available() -> bool {
    operations::all_engine_status().pdfunite
}

#[tauri::command]
fn pdf_split_available() -> bool {
    operations::all_engine_status().pdfsplit
}

#[tauri::command]
fn pdf_edit_available() -> bool {
    operations::all_engine_status().qpdf
}

fn read_qpdf_page_count(input: &Path) -> Result<u32, String> {
    let qpdf = operations::find_executable("qpdf").ok_or_else(|| operation_error("engine"))?;
    let encryption = operations::run(&qpdf, &[OsString::from("--is-encrypted"), input.as_os_str().to_owned()]).map_err(process_error)?;
    match encryption.status.code().and_then(operations::qpdf_encryption_status) {
        Some(true) => return Err(operation_error("protected")),
        Some(false) => {},
        None => return Err(operation_error("conversion")),
    }
    let output = operations::run(&qpdf, &[OsString::from("--show-npages"), input.as_os_str().to_owned()]).map_err(process_error)?;
    if !output.status.success() { return Err(operation_error("conversion")); }
    operations::parse_qpdf_page_count(&String::from_utf8_lossy(&output.stdout)).ok_or_else(|| operation_error("unsupported"))
}

#[tauri::command(async)]
fn pdf_edit_page_count(input_path: String, dropped: tauri::State<'_, DroppedFiles>) -> Result<u32, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    read_qpdf_page_count(&input)
}

fn read_pdf_page_count(input: &Path) -> Option<u32> {
    let pdfinfo = operations::find_executable("pdfinfo")?;
    let output = operations::run(&pdfinfo, &[input.as_os_str().to_owned()]).ok()?;
    output.status.success().then(|| operations::parse_pdf_page_count(&String::from_utf8_lossy(&output.stdout))).flatten()
}

#[tauri::command(async)]
fn pdf_page_count(input_path: String, dropped: tauri::State<'_, DroppedFiles>) -> Result<u32, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    read_pdf_page_count(&input).ok_or_else(|| operation_error("conversion"))
}

#[tauri::command]
fn video_scaling_available() -> bool {
    operations::video_scaling_available()
}

#[tauri::command]
fn conversion_catalog() -> Vec<operations::ConversionCatalogItem> {
    operations::conversion_catalog(operations::all_engine_status())
}

#[tauri::command]
fn supports_in_app_updates() -> bool {
    #[cfg(windows)]
    {
        supports_windows_update(tauri::utils::platform::bundle_type())
    }
    #[cfg(not(windows))]
    {
        cfg!(target_os = "macos")
    }
}

#[cfg(any(windows, test))]
fn supports_windows_update(bundle: Option<tauri::utils::config::BundleType>) -> bool {
    matches!(
        bundle,
        Some(tauri::utils::config::BundleType::Msi | tauri::utils::config::BundleType::Nsis)
    )
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
        return Err("Select the input file in FlickVert".into());
    }
    if input.is_dir() {
        return Ok(Vec::new());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !file_signatures::file_matches(&extension, &input).map_err(|_| operation_error("access"))? {
        return Err(operation_error("unsupported"));
    }
    if let Some(mut formats) = operations::quick_image_formats(&extension) {
        let engines = operations::all_engine_status();
        for format in operations::output_extensions_for(&extension, engines) {
            if !formats.contains(&format) {
                formats.push(format);
            }
        }
        return Ok(formats);
    }
    Ok(operations::output_extensions_for(
        &extension,
        operations::all_engine_status(),
    ))
}

fn destination_for(input: &Path, selected: Option<&str>) -> Result<PathBuf, String> {
    files::destination_directory(input, selected).map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn read_dropped_file(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<u8>, String> {
    let input = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&input) {
        return Err("Select the input file in FlickVert".into());
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].contains(&extension.as_str()) {
        return Err("Only supported images can be read by the quick converter".into());
    }
    let metadata = fs::metadata(&input).map_err(|error| error.to_string())?;
    if metadata.len() > 128 * 1024 * 1024 {
        return Err("Image is larger than 128 MB".into());
    }
    fs::read(input).map_err(|error| error.to_string())
}

fn clamp_pdf_dpi(dpi: Option<u32>) -> u32 {
    dpi.unwrap_or(300).clamp(72, 600)
}

fn has_pdf_text<R: Read>(reader: &mut R) -> std::io::Result<bool> {
    let mut buffer = [0; 4096];
    loop {
        let length = reader.read(&mut buffer)?;
        if length == 0 {
            return Ok(false);
        }
        if buffer[..length].iter().any(|byte| !byte.is_ascii_whitespace()) {
            return Ok(true);
        }
    }
}

#[tauri::command(async)]
fn convert_file(
    app: AppHandle,
    input_path: String,
    output_extension: String,
    quality: Option<u8>,
    width: Option<u32>,
    height: Option<u32>,
    pdf_dpi: Option<u32>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
    job_id: String,
    jobs: tauri::State<'_, OperationJobs>,
) -> Result<String, String> {
    let cancelled = jobs
        .active
        .lock()
        .unwrap()
        .get(&job_id)
        .cloned()
        .ok_or_else(|| operation_error("cancelled"))?;
    let input = fs::canonicalize(&input_path).map_err(|error| {
        operation_error(if error.kind() == std::io::ErrorKind::NotFound {
            "input"
        } else {
            "access"
        })
    })?;
    if !dropped.0.lock().unwrap().contains(&input) {
        return Err(operation_error("input"));
    }
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !file_signatures::file_matches(&extension, &input).map_err(|_| operation_error("access"))? {
        return Err(operation_error("unsupported"));
    }
    let engines = operations::all_engine_status();
    let operation = operations::operation_for(&extension, &output_extension, engines);
    let Some(operation) = operation else {
        let all_engines = operations::Engines {
            ffmpeg: true,
            pandoc: true,
            imagemagick: true,
            libreoffice: true,
            poppler: true,
            pdfunite: true,
            pdfsplit: true,
            qpdf: true,
        };
        return Err(operation_error(
            if operations::operation_for(&extension, &output_extension, all_engines).is_some() {
                "engine"
            } else {
                "unsupported"
            },
        ));
    };
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| operation_error("access"))?
        .join("media-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!(
            "{}-{}",
            std::process::id(),
            MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        if cancelled.load(Ordering::Acquire) {
            return Err(operation_error("cancelled"));
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted");
        if operation.engine == operations::Engine::Poppler {
            let destination = destination_for(&input, destination_folder.as_deref())
                .map_err(|_| operation_error("access"))?;
            return convert_pdf(
                &input,
                &work_dir,
                &destination,
                stem,
                &output_extension,
                clamp_pdf_dpi(pdf_dpi),
                &cancelled,
            );
        }
        if operation.engine == operations::Engine::LibreOffice
            && ["png", "jpg"].contains(&output_extension.as_str())
        {
            let soffice =
                operations::find_executable("soffice").ok_or_else(|| operation_error("engine"))?;
            let args = operations::libreoffice_args(&input, &work_dir);
            let output =
                operations::run_cancellable(&soffice, &args, &cancelled).map_err(process_error)?;
            if !output.status.success() {
                return Err(operation_error("conversion"));
            }
            let pdf = work_dir.join(format!("{stem}.pdf"));
            if !pdf.is_file() {
                return Err(operation_error("conversion"));
            }
            let destination = destination_for(&input, destination_folder.as_deref())
                .map_err(|_| operation_error("access"))?;
            return convert_pdf(
                &pdf,
                &work_dir,
                &destination,
                stem,
                &output_extension,
                clamp_pdf_dpi(pdf_dpi),
                &cancelled,
            );
        }
        let output_temp = if operation.engine == operations::Engine::LibreOffice {
            work_dir.join(format!("{stem}.{output_extension}"))
        } else {
            work_dir.join(format!("converted.{output_extension}"))
        };
        let (executable, mut args) = match operation.engine {
            operations::Engine::Ffmpeg => (
                operations::find_executable("ffmpeg").ok_or_else(|| operation_error("engine"))?,
                if ["png", "jpg"].contains(&output_extension.as_str()) {
                    operations::ffmpeg_image_args(
                        &input,
                        &output_temp,
                        quality.unwrap_or(88),
                        width,
                        height,
                    )
                } else if operations::is_subtitle_input(&extension) {
                    operations::subtitle_ffmpeg_args(&input, &output_temp, &output_extension)
                        .ok_or_else(|| operation_error("unsupported"))?
                } else {
                    operations::ffmpeg_args(&input, &output_temp)
                },
            ),
            operations::Engine::Pandoc => (
                operations::find_executable("pandoc").ok_or_else(|| operation_error("engine"))?,
                operations::pandoc_args(&input, &output_temp),
            ),
            operations::Engine::ImageMagick => (
                operations::find_executable("magick").ok_or_else(|| operation_error("engine"))?,
                operations::imagemagick_args(
                    &input,
                    &output_temp,
                    quality.unwrap_or(88),
                    width,
                    height,
                ),
            ),
            operations::Engine::LibreOffice => (
                operations::find_executable("soffice").ok_or_else(|| operation_error("engine"))?,
                operations::libreoffice_convert_args(&input, &work_dir, &output_extension),
            ),
            operations::Engine::Poppler => unreachable!(),
        };
        let duration_us = (operation.engine == operations::Engine::Ffmpeg)
            .then(|| media_duration_us(&input))
            .flatten();
        if duration_us.is_some() {
            args.splice(
                0..0,
                ["-progress", "pipe:1", "-nostats"].map(std::ffi::OsString::from),
            );
        }
        let progress_app = app.clone();
        let progress_job = job_id.clone();
        let on_progress = move |progress| {
            let _ = progress_app.emit(
                "flickvert://operation-progress",
                OperationProgress {
                    job_id: progress_job.clone(),
                    progress,
                },
            );
        };
        let output: Output = operations::run_cancellable_with_progress(
            &executable,
            &args,
            &cancelled,
            duration_us,
            on_progress,
        )
        .map_err(process_error)?;
        if !output.status.success() {
            return Err(operation_error("conversion"));
        }
        if !output_temp.is_file()
            || fs::metadata(&output_temp)
                .map_err(|_| operation_error("access"))?
                .len()
                == 0
        {
            return Err(operation_error("conversion"));
        }
        if !file_signatures::file_matches(&output_extension, &output_temp)
            .map_err(|_| operation_error("access"))?
        {
            return Err(operation_error("conversion"));
        }
        if cancelled.load(Ordering::Acquire) {
            return Err(operation_error("cancelled"));
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted");
        let name = format!("{stem}.{output_extension}");
        let destination = destination_for(&input, destination_folder.as_deref())
            .map_err(|_| operation_error("access"))?;
        files::write_output_file(&destination, &name, &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| operation_error("write"))
    })();

    result.map_err(|error| {
        if error.starts_with("flickvert-error:") {
            error
        } else {
            operation_error("conversion")
        }
    })
}

fn convert_pdf(
    input: &Path,
    work_dir: &Path,
    destination: &Path,
    stem: &str,
    extension: &str,
    dpi: u32,
    cancelled: &AtomicBool,
) -> Result<String, String> {
    if ["txt", "md", "docx", "epub"].contains(&extension) {
        let executable =
            operations::find_executable("pdftotext").ok_or_else(|| operation_error("engine"))?;
        let temporary = work_dir.join("result.txt");
        let args = [
            std::ffi::OsString::from("-layout"),
            input.as_os_str().to_owned(),
            temporary.as_os_str().to_owned(),
        ];
        let output =
            operations::run_cancellable(&executable, &args, cancelled).map_err(process_error)?;
        if !output.status.success() {
            return Err(operation_error("conversion"));
        }
        if !temporary.is_file() {
            return Err(operation_error("conversion"));
        }
        if !has_pdf_text(&mut fs::File::open(&temporary).map_err(|_| operation_error("access"))?)
            .map_err(|_| operation_error("access"))?
        {
            return Err(operation_error("pdf-no-text"));
        }
        let source = if ["docx", "epub"].contains(&extension) {
            let pandoc =
                operations::find_executable("pandoc").ok_or_else(|| operation_error("engine"))?;
            let target = work_dir.join(format!("result.{extension}"));
            let args = [
                std::ffi::OsString::from("--output"),
                target.as_os_str().to_owned(),
                temporary.as_os_str().to_owned(),
            ];
            let output =
                operations::run_cancellable(&pandoc, &args, cancelled).map_err(process_error)?;
            if !output.status.success() {
                return Err(operation_error("conversion"));
            }
            target
        } else {
            temporary
        };
        if cancelled.load(Ordering::Acquire) {
            return Err(operation_error("cancelled"));
        }
        return files::write_output_file(destination, &format!("{stem}.{extension}"), &source)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| operation_error("write"));
    }
    let executable =
        operations::find_executable("pdftoppm").ok_or_else(|| operation_error("engine"))?;
    let prefix = work_dir.join("page");
    let args = [
        std::ffi::OsString::from("-r"),
        std::ffi::OsString::from(dpi.to_string()),
        std::ffi::OsString::from(if extension == "png" { "-png" } else { "-jpeg" }),
        input.as_os_str().to_owned(),
        prefix.as_os_str().to_owned(),
    ];
    let output =
        operations::run_cancellable(&executable, &args, cancelled).map_err(process_error)?;
    if !output.status.success() {
        return Err(operation_error("conversion"));
    }
    let image_extension = if extension == "png" { "png" } else { "jpg" };
    let mut pages = fs::read_dir(work_dir)
        .map_err(|_| operation_error("access"))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|value| value.to_str()) == Some(image_extension))
        .collect::<Vec<_>>();
    pages.sort();
    if pages.is_empty() {
        return Err(operation_error("conversion"));
    }
    let folder = loop {
        let candidate =
            files::unique_output_path(destination, &format!("{stem}-{extension}-pages"))
                .map_err(|_| operation_error("write"))?;
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("write")),
        }
    };
    let result = (|| {
        for page in pages {
            if cancelled.load(Ordering::Acquire) {
                return Err(operation_error("cancelled"));
            }
            let name = page
                .file_name()
                .ok_or("PDF page name not found")?
                .to_string_lossy()
                .into_owned();
            files::write_output_file(&folder, &name, &page)
                .map_err(|_| operation_error("write"))?;
        }
        Ok(folder.to_string_lossy().into_owned())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&folder);
    }
    result
}

#[tauri::command(async)]
fn process_image_tool(
    app: AppHandle,
    input_path: String,
    action_id: String,
    quality: Option<u8>,
    width: Option<u32>,
    height: Option<u32>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !file_signatures::file_matches(&extension, &input).map_err(|_| operation_error("access"))? {
        return Err(operation_error("unsupported"));
    }
    if !["heic", "heif", "avif", "tif", "tiff", "svg"].contains(&extension.as_str()) {
        return Err(operation_error("unsupported"));
    }
    let mut options = Vec::new();
    match action_id.as_str() {
        "resize" => {
            let width = width.unwrap_or(1920).clamp(1, 32768);
            let height = height.unwrap_or(1920).clamp(1, 32768);
            options.extend([
                std::ffi::OsString::from("-resize"),
                std::ffi::OsString::from(format!("{width}x{height}>")),
            ]);
        }
        "rotate" => options.extend(["-rotate", "90"].map(std::ffi::OsString::from)),
        "flip" => options.push("-flop".into()),
        "grayscale" => options.extend(["-colorspace", "Gray"].map(std::ffi::OsString::from)),
        "compress" => options.extend([
            std::ffi::OsString::from("-quality"),
            std::ffi::OsString::from(quality.unwrap_or(76).clamp(40, 100).to_string()),
        ]),
        "metadata" => options.push("-strip".into()),
        _ => return Err(operation_error("unsupported")),
    }
    let magick = operations::find_executable("magick").ok_or_else(|| operation_error("engine"))?;
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| operation_error("access"))?
        .join("image-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!(
            "{}-{}",
            std::process::id(),
            MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let output_extension = if action_id == "compress" {
            "jpg"
        } else {
            "png"
        };
        let temporary = work_dir.join(format!("result.{output_extension}"));
        let mut args = vec![std::ffi::OsString::from(format!(
            "{}[0]",
            input.to_string_lossy()
        ))];
        args.extend(options);
        args.push(temporary.as_os_str().to_owned());
        let output = operations::run(&magick, &args).map_err(process_error)?;
        if !output.status.success() {
            return Err(operation_error("conversion"));
        }
        if !temporary.is_file()
            || fs::metadata(&temporary)
                .map_err(|_| operation_error("access"))?
                .len()
                == 0
        {
            return Err(operation_error("conversion"));
        }
        if !file_signatures::file_matches(output_extension, &temporary)
            .map_err(|_| operation_error("access"))?
        {
            return Err(operation_error("conversion"));
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let destination = destination_for(&input, destination_folder.as_deref())
            .map_err(|_| operation_error("access"))?;
        files::write_output_file(
            &destination,
            &format!("{stem}-{}.{output_extension}", action_id),
            &temporary,
        )
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|_| operation_error("write"))
    })();

    result.map_err(|error| {
        if error.starts_with("flickvert-error:") {
            error
        } else {
            operation_error("conversion")
        }
    })
}

#[tauri::command(async)]
fn process_media_tool(
    app: AppHandle,
    input_path: String,
    action_id: String,
    video_preset: Option<String>,
    video_codec: Option<String>,
    video_height: Option<u32>,
    trim_start_us: Option<u64>,
    trim_end_us: Option<u64>,
    thumbnail_time_us: Option<u64>,
    audio_target_lufs: Option<i8>,
    audio_true_peak_db: Option<i8>,
    audio_extraction_format: Option<String>,
    video_stream_index: Option<usize>,
    audio_stream_index: Option<usize>,
    subtitle_stream_index: Option<usize>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !file_signatures::file_matches(&extension, &input).map_err(|_| operation_error("access"))? {
        return Err(operation_error("unsupported"));
    }
    let is_video = operations::is_video_input(&extension);
    let is_audio = operations::is_audio_input(&extension);
    let selected_video_codec = video_codec.as_deref().unwrap_or("h264");
    let selected_audio_format = audio_extraction_format.as_deref().unwrap_or("mp3");
    if action_id == "trim-video" && (video_stream_index.is_some() || audio_stream_index.is_some() || subtitle_stream_index.is_some()) {
        let streams = operations::media_streams(&input).ok_or_else(|| operation_error("engine"))?;
        if video_stream_index.is_some_and(|index| !streams.iter().any(|stream| stream.kind == "video" && stream.track_index == index))
            || audio_stream_index.is_some_and(|index| !streams.iter().any(|stream| stream.kind == "audio" && stream.track_index == index))
            || subtitle_stream_index.is_some_and(|index| !streams.iter().any(|stream| stream.kind == "subtitle" && stream.track_index == index)) {
            return Err(operation_error("unsupported"));
        }
    }
    let audio_normalization = if action_id == "normalize-audio" {
        let values = (audio_target_lufs.unwrap_or(-16), audio_true_peak_db.unwrap_or(-1));
        if !operations::valid_audio_normalization(values.0, values.1) {
            return Err(operation_error("unsupported"));
        }
        Some(values)
    } else {
        None
    };
    if action_id == "mute-video" {
        if !operations::available_video_codecs().contains(&"h264") {
            return Err(operation_error("engine"));
        }
        match operations::has_audio_stream(&input) {
            Some(true) => {}
            Some(false) => return Err(operation_error("unsupported")),
            None => return Err(operation_error("engine")),
        }
    }
    if action_id == "extract-audio" {
        if !operations::available_audio_formats().contains(&selected_audio_format) {
            return Err(operation_error("engine"));
        }
        match operations::has_audio_stream(&input) {
            Some(true) => {}
            Some(false) => return Err(operation_error("unsupported")),
            None => return Err(operation_error("engine")),
        }
    }
    let output_extension = match (is_video, is_audio, action_id.as_str()) {
        (true, _, "compress-video") => match selected_video_codec {
            "h264" => "mp4",
            "hevc" => "mkv",
            _ => return Err(operation_error("unsupported")),
        },
        (true, _, "trim-video") => match selected_video_codec {
            "h264" => "mp4",
            "hevc" => "mkv",
            _ => return Err(operation_error("unsupported")),
        },
        (true, _, "mute-video") => "mp4",
        (true, _, "extract-audio") => match selected_audio_format {
            "mp3" => "mp3",
            "m4a" => "m4a",
            "opus" => "opus",
            "flac" => "flac",
            "wav" => "wav",
            _ => return Err(operation_error("unsupported")),
        },
        (true, _, "video-thumbnail") => "jpg",
        (_, true, "compress-audio" | "normalize-audio") => "m4a",
        _ => return Err(operation_error("unsupported")),
    };
    let ffmpeg = operations::find_executable("ffmpeg").ok_or_else(|| operation_error("engine"))?;
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|_| operation_error("access"))?
        .join("media-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!(
            "{}-{}",
            std::process::id(),
            MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let output_temp = work_dir.join(format!("result.{output_extension}"));
        let trim_range = if action_id == "trim-video" {
            let start = trim_start_us.ok_or_else(|| operation_error("unsupported"))?;
            let end = trim_end_us.ok_or_else(|| operation_error("unsupported"))?;
            let duration = media_duration_us(&input).ok_or_else(|| operation_error("engine"))?;
            operations::trim_duration_us(start, end, duration)
                .ok_or_else(|| operation_error("unsupported"))?;
            if !operations::available_video_codecs().contains(&selected_video_codec) {
                return Err(operation_error("engine"));
            }
            Some((start, end))
        } else {
            None
        };
        let thumbnail_time = if action_id == "video-thumbnail" {
            let time = thumbnail_time_us.ok_or_else(|| operation_error("unsupported"))?;
            let duration = media_duration_us(&input).ok_or_else(|| operation_error("engine"))?;
            Some(operations::valid_video_frame_time_us(time, duration).ok_or_else(|| operation_error("unsupported"))?)
        } else {
            None
        };
        if action_id == "compress-video" && !operations::available_video_codecs().contains(&selected_video_codec) {
            return Err(operation_error("engine"));
        }
        if action_id == "compress-video" && video_height.is_some() && !operations::video_scaling_available() {
            return Err(operation_error("unsupported"));
        }
        let args = operations::ffmpeg_tool_args_with_streams(video_preset.as_deref().unwrap_or("balanced"), selected_video_codec, video_height, trim_range, thumbnail_time, audio_normalization, (action_id == "extract-audio").then_some(selected_audio_format), &action_id, &input, &output_temp, (action_id == "trim-video").then_some(video_stream_index).flatten(), (action_id == "trim-video").then_some(audio_stream_index).flatten(), (action_id == "trim-video").then_some(subtitle_stream_index).flatten())
            .ok_or_else(|| operation_error("unsupported"))?;
        let output = operations::run(&ffmpeg, &args).map_err(process_error)?;
        if !output.status.success() {
            return Err(operation_error("conversion"));
        }
        if !output_temp.is_file()
            || fs::metadata(&output_temp)
                .map_err(|_| operation_error("access"))?
                .len()
                == 0
        {
            return Err(operation_error("conversion"));
        }
        if !file_signatures::file_matches(&output_extension, &output_temp)
            .map_err(|_| operation_error("access"))?
        {
            return Err(operation_error("conversion"));
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
            "trim-video" => "trimmed",
            "normalize-audio" => "normalized",
            _ => return Err(operation_error("unsupported")),
        };
        let name = format!("{stem}-{suffix}.{output_extension}");
        let destination = destination_for(&input, destination_folder.as_deref())
            .map_err(|_| operation_error("access"))?;
        files::write_output_file(&destination, &name, &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| operation_error("write"))
    })();

    result.map_err(|error| {
        if error.starts_with("flickvert-error:") {
            error
        } else {
            operation_error("conversion")
        }
    })
}

#[tauri::command(async)]
fn split_pdf_pages(
    app: AppHandle,
    input_path: String,
    page_numbers: Vec<u32>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<String>, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    if !pdf_split_available() { return Err(operation_error("engine")); }
    let page_count = read_pdf_page_count(&input).ok_or_else(|| operation_error("conversion"))?;
    if !operations::valid_pdf_page_numbers(&page_numbers, page_count) { return Err(operation_error("unsupported")); }
    let pdfseparate = operations::find_executable("pdfseparate").ok_or_else(|| operation_error("engine"))?;
    let destination = destination_for(&input, destination_folder.as_deref()).map_err(|_| operation_error("access"))?;
    let work_root = app.path().app_cache_dir().map_err(|_| operation_error("access"))?.join("media-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!("{}-{}", std::process::id(), MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let pattern = work_dir.join("page-%d.pdf");
        let mut ranges = Vec::<(u32, u32)>::new();
        for page in &page_numbers {
            if let Some(last) = ranges.last_mut() {
                if last.1.checked_add(1) == Some(*page) { last.1 = *page; continue; }
            }
            ranges.push((*page, *page));
        }
        for (start, end) in ranges {
            let args = operations::pdf_split_args(&input, start, end, &pattern).ok_or_else(|| operation_error("unsupported"))?;
            let output = operations::run(&pdfseparate, &args).map_err(process_error)?;
            if !output.status.success() {
                return Err(if String::from_utf8_lossy(&output.stderr).to_ascii_lowercase().contains("encrypt") { operation_error("protected") } else { operation_error("conversion") });
            }
        }
        for page in &page_numbers {
            let extracted = work_dir.join(format!("page-{page}.pdf"));
            if !extracted.is_file() || fs::metadata(&extracted).map_err(|_| operation_error("access"))?.len() == 0 {
                return Err(operation_error("conversion"));
            }
        }
        let stem = input.file_stem().and_then(|value| value.to_str()).unwrap_or("document");
        let mut written = Vec::with_capacity(page_numbers.len());
        for page in &page_numbers {
            let extracted = work_dir.join(format!("page-{page}.pdf"));
            match files::write_output_file(&destination, &format!("{stem}-page-{page}.pdf"), &extracted) {
                Ok(path) => written.push(path),
                Err(_) => {
                    for path in written { let _ = fs::remove_file(path); }
                    return Err(operation_error("write"));
                }
            }
        }
        Ok(written.into_iter().map(|path| path.to_string_lossy().into_owned()).collect())
    })();

    result
}

#[tauri::command(async)]
fn edit_pdf_pages(
    app: AppHandle,
    input_path: String,
    page_order: Vec<u32>,
    rotations: Vec<u16>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    if !pdf_edit_available() { return Err(operation_error("engine")); }
    let page_count = read_qpdf_page_count(&input)?;
    if !operations::valid_pdf_page_order(&page_order, page_count) || rotations.len() != page_count as usize || rotations.iter().any(|angle| ![0, 90, 180, 270].contains(angle)) { return Err(operation_error("unsupported")); }
    let qpdf = operations::find_executable("qpdf").ok_or_else(|| operation_error("engine"))?;
    let destination = destination_for(&input, destination_folder.as_deref()).map_err(|_| operation_error("access"))?;
    let work_root = app.path().app_cache_dir().map_err(|_| operation_error("access"))?.join("media-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!("{}-{}", std::process::id(), MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let rotations = rotations.iter().enumerate().map(|(index, angle)| (index as u32 + 1, *angle)).collect::<Vec<_>>();
        let rotated = work_dir.join("rotated.pdf");
        let ordered = work_dir.join("edited.pdf");
        let source = if rotations.iter().any(|(_, angle)| *angle != 0) {
            let args = operations::pdf_rotate_args(&input, &rotated, &rotations, page_count).ok_or_else(|| operation_error("unsupported"))?;
            let output = operations::run(&qpdf, &args).map_err(process_error)?;
            if !output.status.success() { return Err(if String::from_utf8_lossy(&output.stderr).to_ascii_lowercase().contains("encrypt") { operation_error("protected") } else { operation_error("conversion") }); }
            rotated.as_path()
        } else { input.as_path() };
        let args = operations::pdf_page_order_args(source, &ordered, &page_order, page_count).ok_or_else(|| operation_error("unsupported"))?;
        let output = operations::run(&qpdf, &args).map_err(process_error)?;
        if !output.status.success() { return Err(if String::from_utf8_lossy(&output.stderr).to_ascii_lowercase().contains("encrypt") { operation_error("protected") } else { operation_error("conversion") }); }
        if !ordered.is_file() || fs::metadata(&ordered).map_err(|_| operation_error("access"))?.len() == 0 { return Err(operation_error("conversion")); }
        let stem = input.file_stem().and_then(|value| value.to_str()).unwrap_or("document");
        files::write_output_file(&destination, &format!("{stem}-edited.pdf"), &ordered).map(|path| path.to_string_lossy().into_owned()).map_err(|_| operation_error("write"))
    })();

    result
}

#[tauri::command(async)]
fn merge_pdf_files(
    app: AppHandle,
    input_paths: Vec<String>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    if !(2..=1_000).contains(&input_paths.len()) { return Err(operation_error("unsupported")); }
    let mut inputs = Vec::with_capacity(input_paths.len());
    for input_path in input_paths {
        let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
        if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) {
            return Err(operation_error("unsupported"));
        }
        inputs.push(input);
    }
    let pdfunite = operations::find_executable("pdfunite").ok_or_else(|| operation_error("engine"))?;
    let work_root = app.path().app_cache_dir().map_err(|_| operation_error("access"))?.join("media-work");
    fs::create_dir_all(&work_root).map_err(|_| operation_error("access"))?;
    let work_dir = loop {
        let candidate = work_root.join(format!("{}-{}", std::process::id(), MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let output_temp = work_dir.join("merged.pdf");
        let args = operations::pdf_merge_args(&inputs, &output_temp).ok_or_else(|| operation_error("unsupported"))?;
        let output = operations::run(&pdfunite, &args).map_err(process_error)?;
        if !output.status.success() {
            return Err(if String::from_utf8_lossy(&output.stderr).to_ascii_lowercase().contains("encrypt") {
                operation_error("protected")
            } else {
                operation_error("conversion")
            });
        }
        if !output_temp.is_file() || fs::metadata(&output_temp).map_err(|_| operation_error("access"))?.len() == 0 {
            return Err(operation_error("conversion"));
        }
        let stem = inputs[0].file_stem().and_then(|value| value.to_str()).unwrap_or("document");
        let destination = destination_for(&inputs[0], destination_folder.as_deref()).map_err(|_| operation_error("access"))?;
        files::write_output_file(&destination, &format!("{stem}-merged.pdf"), &output_temp)
            .map(|path| path.to_string_lossy().into_owned()).map_err(|_| operation_error("write"))
    })();

    result
}

#[tauri::command(async)]
fn create_zip_archive(
    app: AppHandle,
    input_paths: Vec<String>,
    destination_folder: Option<String>,
    compression_level: Option<u32>,
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
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let temporary = work_dir.join("archive.zip");
        archive::create_zip(&inputs, &temporary, compression_level.unwrap_or(6))?;
        let destination = destination_for(&inputs[0], destination_folder.as_deref())?;
        files::write_output_file(&destination, &output_name, &temporary)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|error| error.to_string())
    })();

    result
}

#[tauri::command(async)]
fn extract_zip_archive(
    destination_folder: Option<String>,
    input_path: String,
    selected_paths: Option<Vec<String>>,
    skip_existing: Option<bool>,
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
    let destination = destination_for(&input, destination_folder.as_deref())?;
    let name = input
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("archive");
    archive::extract_zip(&input, &destination, name, selected_paths.as_deref(), skip_existing.unwrap_or(false))
        .map(|path| path.map(|path| path.to_string_lossy().into_owned()).unwrap_or_default())
}

#[tauri::command]
fn preview_zip_archive(input_path: String, dropped: tauri::State<'_, DroppedFiles>) -> Result<archive::ZipPreview, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case("zip")) {
        return Err("Only ZIP archives can be previewed".into());
    }
    archive::preview_zip(&input)
}

fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        eprintln!(
            "Main webview is missing; registered windows: {:?}",
            app.webview_windows().keys()
        );
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("Could not show the main window: {error}");
    }
    if let Err(error) = window.unminimize() {
        eprintln!("Could not restore the main window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("Could not focus the main window: {error}");
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
                    cursor.x as i32,
                    cursor.y as i32 - (physical_size.1 as f64 * 0.03).round() as i32,
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
    let foreground = selection::foreground_window();
    *app.state::<DragTrigger>().0.lock().unwrap() = true;
    show_quick(app, false);
    let _ = app.emit("flickvert://drag-wheel-open", ());
    let handle = app.clone();
    std::thread::spawn(move || {
        let paths = selection::selected_paths(foreground);
        let _ = handle.emit("flickvert://shortcut-files", paths);
    });
}

#[tauri::command(async)]
fn choose_files(app: AppHandle) -> Result<(), String> {
    let paths = selection::choose_paths();
    if paths.is_empty() {
        return Ok(());
    }
    show_quick(&app, true);
    app.emit("flickvert://shortcut-files", paths)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn choose_output_folder() -> Option<String> {
    selection::choose_folder()
}

#[tauri::command]
fn quick_action(app: AppHandle, action_id: String) -> Result<(), String> {
    if !["home", "tools", "settings"].contains(&action_id.as_str()) {
        return Err("Unknown quick action".into());
    }
    show_main(&app);
    app.emit("flickvert://quick-action", action_id)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn open_image_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !["png", "jpg", "jpeg", "webp", "gif", "bmp"].contains(&extension.as_str()) {
        return Err("The built-in editor supports PNG, JPEG, WebP, GIF, and BMP images".into());
    }
    show_main(&app);
    app.emit(
        "flickvert://image-editor-open",
        ImageEditorRequest {
            input_path: input.to_string_lossy().into_owned(),
            initial_tool: "adjust".into(),
        },
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn open_video_trim_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let extension = input.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !operations::is_video_input(&extension) {
        return Err(operation_error("unsupported"));
    }
    show_main(&app);
    app.emit("flickvert://video-trim-open", input.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
fn open_video_export_preview(
    app: AppHandle,
    input_paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    if input_paths.is_empty() { return Err(operation_error("input")); }
    let mut paths = Vec::with_capacity(input_paths.len());
    for input_path in &input_paths {
        let input = selected_dropped_file(input_path, &dropped).map_err(|_| operation_error("input"))?;
        let extension = input.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
        if !operations::is_video_input(&extension) { return Err(operation_error("unsupported")); }
        paths.push(input.to_string_lossy().into_owned());
    }
    show_main(&app);
    app.emit("flickvert://video-export-preview-open", paths).map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
fn open_pdf_merge_editor(
    app: AppHandle,
    input_paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    if !(2..=1_000).contains(&input_paths.len()) {
        return Err(operation_error("unsupported"));
    }
    if !pdf_merge_available() { return Err(operation_error("engine")); }
    let mut paths = Vec::with_capacity(input_paths.len());
    for input_path in input_paths {
        let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
        if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) {
            return Err(operation_error("unsupported"));
        }
        paths.push(input.to_string_lossy().into_owned());
    }
    show_main(&app);
    app.emit("flickvert://pdf-merge-open", paths).map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
fn open_pdf_split_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    if !pdf_split_available() { return Err(operation_error("engine")); }
    show_main(&app);
    app.emit("flickvert://pdf-split-open", input.to_string_lossy().into_owned()).map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
fn open_pdf_pages_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input.extension().and_then(|value| value.to_str()).is_some_and(|value| value.eq_ignore_ascii_case("pdf")) { return Err(operation_error("unsupported")); }
    if !pdf_edit_available() { return Err(operation_error("engine")); }
    show_main(&app);
    app.emit("flickvert://pdf-pages-open", input.to_string_lossy().into_owned()).map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
fn open_video_thumbnail_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let extension = input.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !operations::is_video_input(&extension) {
        return Err(operation_error("unsupported"));
    }
    show_main(&app);
    app.emit("flickvert://video-thumbnail-open", input.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn media_duration(input_path: String, dropped: tauri::State<'_, DroppedFiles>) -> Result<u64, String> {
    let input = selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    media_duration_us(&input).ok_or_else(|| operation_error("engine"))
}

#[tauri::command]
fn reveal_dropped_file(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    reveal_in_file_manager(&path).map_err(|error| error.to_string())
}

#[tauri::command]
fn reveal_output_path(output_path: String) -> Result<(), String> {
    let path = existing_output_path(&output_path)?;
    reveal_in_file_manager(&path).map_err(|error| error.to_string())
}

fn existing_output_path(output_path: &str) -> Result<PathBuf, String> {
    let path = fs::canonicalize(output_path).map_err(|_| "Output is unavailable")?;
    if path.is_file() || path.is_dir() {
        Ok(path)
    } else {
        Err("Output is unavailable".into())
    }
}

fn selected_dropped_path(input_path: &str, dropped: &DroppedFiles) -> Result<PathBuf, String> {
    let path = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&path) || !path.is_file() && !path.is_dir() {
        return Err("Select a file or folder in FlickVert".into());
    }
    Ok(path)
}

fn selected_dropped_file(input_path: &str, dropped: &DroppedFiles) -> Result<PathBuf, String> {
    let path = selected_dropped_path(input_path, dropped)?;
    if !path.is_file() {
        return Err("Select a file in FlickVert".into());
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
fn copy_powershell_path(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    #[cfg(windows)]
    {
        copy_path_to_clipboard(&operations::powershell_path_literal(
            &path.to_string_lossy(),
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("PowerShell paths are available only on Windows".into())
    }
}

#[tauri::command]
fn open_terminal(
    input_path: String,
    terminal_preference: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    let directory = if path.is_dir() {
        path.as_path()
    } else {
        path.parent().ok_or("File has no parent folder")?
    };
    if !directory.is_dir() {
        return Err("The selected folder no longer exists".into());
    }

    #[cfg(target_os = "windows")]
    {
        let use_powershell = terminal_preference.as_deref() == Some("powershell");
        let launch = |powershell: bool| {
            if powershell {
                Command::new("powershell.exe").args(["-NoExit"]).current_dir(directory).spawn()
            } else {
                Command::new("wt.exe").args(["-w", "0", "new-tab"]).args(operations::windows_terminal_args(directory)).args(["powershell.exe", "-NoExit"]).spawn()
            }
        };
        match launch(use_powershell) {
            Ok(_) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => launch(!use_powershell).map(|_| ()).map_err(|fallback| fallback.to_string()),
            Err(error) => Err(error.to_string()),
        }
    }

    #[cfg(target_os = "macos")]
    {
        const SCRIPT: &str = r#"on run argv
 tell application "Terminal" to do script "cd " & quoted form of (POSIX path of (item 1 of argv))
 activate
end run"#;
        Command::new("osascript")
            .arg("-e")
            .arg(SCRIPT)
            .arg(directory)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("Terminal action is available only on Windows and macOS".into())
    }
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

fn parse_global_shortcut(shortcut: &str) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
    let mut parts: Vec<_> = shortcut.split('+').collect();
    let key = parts.pop().ok_or("Shortcut has no key")?;
    let valid_key = key == "SPACE"
        || (key.len() == 1 && key.as_bytes()[0].is_ascii_alphanumeric())
        || (key
            .strip_prefix('F')
            .and_then(|n| n.parse::<u8>().ok())
            .is_some_and(|n| (1..=12).contains(&n)));
    if !valid_key
        || parts.is_empty()
        || parts.iter().enumerate().any(|(index, modifier)| {
            !["CTRL", "ALT", "SHIFT"].contains(modifier) || parts[..index].contains(modifier)
        })
    {
        return Err("Unsupported shortcut".into());
    }
    shortcut
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|error| error.to_string())
}

fn validate_operation_shortcuts(shortcuts: &HashMap<String, String>, primary: Option<&str>) -> Result<(), String> {
    if shortcuts.len() > 64 { return Err("Too many operation shortcuts".into()); }
    let mut used = HashSet::new();
    if let Some(primary) = primary { used.insert(primary); }
    for (action, shortcut) in shortcuts {
        if !action.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-') || action.is_empty() || action.len() > 64 {
            return Err("Unsupported operation shortcut".into());
        }
        parse_global_shortcut(shortcut).map_err(|_| "Unsupported operation shortcut")?;
        if !used.insert(shortcut.as_str()) { return Err("Shortcut is already assigned".into()); }
    }
    Ok(())
}

fn register_operation_shortcut_handler(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let parsed = parse_global_shortcut(shortcut)?;
    let shortcut = shortcut.to_owned();
    app.global_shortcut().on_shortcut(parsed, move |handle, _, event| {
        if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed { return; }
        let Some(action_id) = handle.state::<OperationShortcuts>().0.lock().ok().and_then(|shortcuts| shortcuts.iter().find_map(|(action, value)| (value == &shortcut).then(|| action.clone()))) else { return; };
        let foreground = selection::foreground_window();
        show_quick(handle, true);
        let handle = handle.clone();
        std::thread::spawn(move || {
            let paths = selection::selected_paths(foreground);
            let _ = handle.emit("flickvert://operation-shortcut", serde_json::json!({ "actionId": action_id, "paths": paths }));
        });
    }).map_err(|error| error.to_string())
}

#[tauri::command]
fn configure_operation_shortcuts(app: AppHandle, shortcuts: HashMap<String, String>) -> Result<(), String> {
    let registered = app.state::<RegisteredShortcut>();
    let current = registered.0.lock().map_err(|_| "Shortcut state is unavailable")?;
    let operation_shortcuts = app.state::<OperationShortcuts>();
    let mut existing = operation_shortcuts.0.lock().map_err(|_| "Shortcut state is unavailable")?;
    validate_operation_shortcuts(&shortcuts, current.as_deref())?;
    if *existing == shortcuts { return Ok(()); }
    let old_values: HashSet<_> = existing.values().cloned().collect();
    let new_values: HashSet<_> = shortcuts.values().cloned().collect();
    let mut registered_new: Vec<String> = Vec::new();
    for shortcut in new_values.difference(&old_values) {
        if let Err(error) = register_operation_shortcut_handler(&app, shortcut) {
            for value in registered_new { if let Ok(parsed) = parse_global_shortcut(&value) { let _ = app.global_shortcut().unregister(parsed); } }
            return Err(error);
        }
        registered_new.push(shortcut.clone());
    }
    let mut unregistered_old: Vec<String> = Vec::new();
    for shortcut in old_values.difference(&new_values) {
        let parsed = parse_global_shortcut(shortcut)?;
        if let Err(error) = app.global_shortcut().unregister(parsed) {
            for value in &unregistered_old { let _ = register_operation_shortcut_handler(&app, value); }
            for value in registered_new { if let Ok(parsed) = parse_global_shortcut(&value) { let _ = app.global_shortcut().unregister(parsed); } }
            return Err(error.to_string());
        }
        unregistered_old.push(shortcut.clone());
    }
    *existing = shortcuts;
    Ok(())
}

#[tauri::command]
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let parsed = parse_global_shortcut(&shortcut)?;
    let registered = app.state::<RegisteredShortcut>();
    let mut current = registered.0.lock().map_err(|_| "Shortcut state is unavailable")?;
    if current.as_deref() == Some(shortcut.as_str()) {
        return Ok(());
    }
    if app.state::<OperationShortcuts>().0.lock().map_err(|_| "Shortcut state is unavailable")?.values().any(|value| value == &shortcut) {
        return Err("Shortcut is already assigned".into());
    }
    app.global_shortcut()
        .on_shortcut(parsed, |handle, _, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                let foreground = selection::foreground_window();
                show_quick(handle, true);
                let _ = handle.emit("flickvert://shortcut-files", Vec::<String>::new());
                let handle = handle.clone();
                std::thread::spawn(move || {
                    let paths = selection::selected_paths(foreground);
                    let _ = handle.emit("flickvert://shortcut-files", paths);
                });
            }
        })
        .map_err(|error| error.to_string())?;
    if let Some(old) = current.as_deref() {
        if let Ok(old) = old.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            if let Err(error) = app.global_shortcut().unregister(old) {
                let _ = app.global_shortcut().unregister(parsed);
                return Err(error.to_string());
            }
        }
    }
    *current = Some(shortcut);
    Ok(())
}

#[tauri::command]
fn configure_drag_modifiers(convert: String, tools: String, actions: String) -> Result<(), String> {
    input::configure_modifiers(&convert, &tools, &actions)
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

#[cfg(windows)]
fn set_system_startup(enabled: bool) -> Result<(), String> {
    const KEY: &str = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    if enabled {
        let executable = std::env::current_exe().map_err(|_| "Could not locate FlickVert")?;
        let output = Command::new("reg.exe").args(["add", KEY, "/v", "FlickVert", "/t", "REG_SZ", "/d"]).arg(format!("\"{}\" --background", executable.to_string_lossy())).arg("/f").output().map_err(|_| "Could not update startup settings")?;
        output.status.success().then_some(()).ok_or("Could not update startup settings".into())
    } else {
        let query = Command::new("reg.exe").args(["query", KEY, "/v", "FlickVert"]).output().map_err(|_| "Could not update startup settings")?;
        if !query.status.success() { return Ok(()); }
        let output = Command::new("reg.exe").args(["delete", KEY, "/v", "FlickVert", "/f"]).output().map_err(|_| "Could not update startup settings")?;
        output.status.success().then_some(()).ok_or("Could not update startup settings".into())
    }
}

#[cfg(target_os = "macos")]
fn set_system_startup(enabled: bool) -> Result<(), String> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("Home folder is unavailable")?;
    let directory = home.join("Library/LaunchAgents");
    let agent = directory.join("app.flickvert.desktop.v2.plist");
    if enabled {
        let executable = std::env::current_exe().map_err(|_| "Could not locate FlickVert")?;
        fs::create_dir_all(&directory).map_err(|_| "Could not update startup settings")?;
        let plist = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>Label</key><string>app.flickvert.desktop.v2</string><key>ProgramArguments</key><array><string>{}</string><string>--background</string></array><key>RunAtLoad</key><true/></dict></plist>", xml_escape(&executable.to_string_lossy()));
        fs::write(&agent, plist).map_err(|_| "Could not update startup settings")?;
        let status = Command::new("launchctl").args(["load", "-w"]).arg(&agent).status().map_err(|_| "Could not update startup settings")?;
        if !status.success() { let _ = fs::remove_file(&agent); return Err("Could not update startup settings".into()); }
    } else if agent.exists() {
        let status = Command::new("launchctl").args(["unload", "-w"]).arg(&agent).status().map_err(|_| "Could not update startup settings")?;
        if !status.success() { return Err("Could not update startup settings".into()); }
        fs::remove_file(agent).map_err(|_| "Could not update startup settings")?;
    }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn xml_escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

#[tauri::command]
fn set_startup_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(any(windows, target_os = "macos"))]
    { return set_system_startup(enabled); }
    #[cfg(not(any(windows, target_os = "macos")))]
    { let _ = enabled; Err("Startup settings are not supported on this platform".into()) }
}

#[tauri::command]
fn set_confirm_quit_on_close(enabled: bool, state: tauri::State<'_, ConfirmQuitOnClose>) {
    state.0.store(enabled, Ordering::Release);
}

#[tauri::command]
fn quit_application(app: AppHandle) {
    cancel_all_operation_jobs(&app.state::<OperationJobs>());
    app.exit(0);
}

#[tauri::command(async)]
fn save_output(
    app: tauri::AppHandle,
    file_name: String,
    bytes: Vec<u8>,
    input_path: Option<String>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let directory = if let Some(path) = input_path {
        let input = fs::canonicalize(path).map_err(|error| error.to_string())?;
        if !dropped.0.lock().unwrap().contains(&input) {
            return Err("Select the input file by dropping it into FlickVert".into());
        }
        destination_for(&input, destination_folder.as_deref())?
    } else if let Some(path) = destination_folder.as_deref() {
        files::destination_directory(Path::new("."), Some(path))
            .map_err(|error| error.to_string())?
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            begin_operation_job,
            cancel_operation_job,
            finish_operation_job,
            output_directory,
            save_output,
            quick_action,
            open_image_editor,
            open_video_trim_editor,
            open_video_export_preview,
            open_pdf_merge_editor,
            open_pdf_split_editor,
            open_pdf_pages_editor,
            open_video_thumbnail_editor,
            media_duration,
            inspect_media_streams,
            reveal_dropped_file,
            reveal_output_path,
            copy_dropped_file_path,
            copy_powershell_path,
            open_terminal,
            copy_to_flickvert_folder,
            move_to_flickvert_folder,
            register_shortcut,
            configure_operation_shortcuts,
            configure_drag_modifiers,
            choose_files,
            choose_output_folder,
            set_startup_enabled,
            set_confirm_quit_on_close,
            quit_application,
            shell_integration::set_context_menu_enabled,
            take_drag_trigger,
            take_startup_files,
            quick_formats,
            read_dropped_file,
            inspect_dropped_files,
            log_operation_error,
            engine_status,
            video_codecs,
            audio_formats,
            pdf_merge_available,
            pdf_split_available,
            pdf_edit_available,
            pdf_edit_page_count,
            pdf_page_count,
            video_scaling_available,
            conversion_catalog,
            supports_in_app_updates,
            convert_file,
            process_image_tool,
            process_media_tool,
            create_zip_archive,
            merge_pdf_files,
            split_pdf_pages,
            edit_pdf_pages,
            extract_zip_archive,
            preview_zip_archive
        ])
        .setup(|app| {
            if let Ok(cache) = app.path().app_cache_dir() {
                let now = std::time::SystemTime::now();
                for workspace in ["media-work", "image-work", "archive-work"] {
                    cleanup_stale_workspaces(&cache.join(workspace), now);
                }
            }
            app.manage(RegisteredShortcut::default());
            app.manage(OperationShortcuts::default());
            app.manage(ConfirmQuitOnClose(AtomicBool::new(false)));
            if let Err(error) = register_shortcut(app.handle().clone(), "CTRL+ALT+SPACE".into()) {
                eprintln!("Could not register the default shortcut: {error}");
            }
            app.manage(DroppedFiles::default());
            app.manage(OperationJobs::default());
            app.manage(DragTrigger::default());
            app.manage(StartupFiles(Mutex::new(
                std::env::args_os()
                    .skip(1)
                    .filter_map(|arg| {
                        let path = PathBuf::from(arg);
                        if path.is_file() || path.is_dir() {
                            Some(path.to_string_lossy().into_owned())
                        } else {
                            None
                        }
                    })
                    .collect(),
            )));
            let quick_window =
                WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html".into()));
            #[cfg(windows)]
            let quick_window = match windows_webview_data_directory() {
                Ok(directory) => quick_window.data_directory(directory),
                Err(error) => {
                    eprintln!("Could not prepare quick actions profile: {error}");
                    quick_window
                }
            };
            match quick_window
                .title("FlickVert Quick Actions")
                .inner_size(QUICK_WIDTH as f64, QUICK_HEIGHT as f64)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .shadow(false)
                .always_on_top(true)
                .skip_taskbar(true)
                .focused(false)
                .focusable(false)
                .visible(true)
                .build()
            {
                Ok(window) => {
                    if let Err(error) = window.hide() {
                        eprintln!("Could not hide the prepared quick actions window: {error}");
                    }
                }
                Err(error) => eprintln!("Could not prepare quick actions: {error}"),
            }
            let tray = tray_menu(app.handle()).and_then(|menu| {
                let icon = app
                    .default_window_icon()
                    .cloned()
                    .ok_or_else(|| tauri::Error::AssetNotFound("icons/icon.png".into()))?;
                TrayIconBuilder::new()
                    .icon(icon)
                    .icon_as_template(false)
                    .tooltip("FlickVert")
                    .menu(&menu)
                    .show_menu_on_left_click(true)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main(app),
                        "quick" => show_quick(app, true),
                        "settings" => {
                            show_main(app);
                            let _ = app.emit("flickvert://quick-action", "settings");
                        }
                        "quit" => { cancel_all_operation_jobs(&app.state::<OperationJobs>()); app.exit(0) },
                        _ => {}
                    })
                    .build(app)
            });
            match tray {
                Ok(tray) => {
                    app.manage(tray);
                }
                Err(error) => {
                    eprintln!("Tray unavailable; keep FlickVert open to access it: {error}");
                }
            }
            input::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.state::<ConfirmQuitOnClose>().0.load(Ordering::Acquire) {
                    let _ = window.emit("flickvert://confirm-quit", ());
                } else {
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("FlickVert failed to start")
        .run(|app, event| {
            let launch_in_background = std::env::args_os()
                .any(|argument| argument == std::ffi::OsStr::new("--background"));
            if matches!(event, tauri::RunEvent::Ready) && app.get_webview_window("main").is_none() {
                let handle = app.clone();
                if let Err(error) = app.run_on_main_thread(move || {
                    let window = WebviewWindowBuilder::new(
                        &handle,
                        "main",
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("FlickVert")
                    .inner_size(900.0, 720.0)
                    .min_inner_size(760.0, 600.0)
                    .resizable(true)
                    .decorations(false)
                    .center();
                    #[cfg(windows)]
                    let window = match windows_webview_data_directory() {
                        Ok(directory) => window.data_directory(directory),
                        Err(error) => {
                            eprintln!("Could not prepare main window profile: {error}");
                            window
                        }
                    };
                    if let Err(error) = window
                        .visible(!launch_in_background)
                        .focused(!launch_in_background)
                        .build()
                    {
                        eprintln!("Could not create the main window: {error}");
                        handle.exit(1);
                    }
                }) {
                    eprintln!("Could not schedule main window creation: {error}");
                }
            }
        });
}

#[cfg(test)]
mod file_type_tests {
    use super::file_mime;

    #[cfg(windows)]
    #[test]
    fn webview_windows_reuse_the_main_profile() {
        let root =
            std::env::temp_dir().join(format!("flickvert-profile-test-{}", std::process::id()));
        let quick = super::webview_data_directory(&root).unwrap();
        let main = super::webview_data_directory(&root).unwrap();
        assert_eq!(quick, main);
        assert!(quick.ends_with("webview-main"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn updater_accepts_installed_windows_bundles_but_not_portable_builds() {
        use tauri::utils::config::BundleType;
        assert!(super::supports_windows_update(Some(BundleType::Msi)));
        assert!(super::supports_windows_update(Some(BundleType::Nsis)));
        assert!(!super::supports_windows_update(None));
    }

    #[test]
    fn recognizes_document_and_raw_inputs_without_claiming_unknown_files() {
        assert_eq!(file_mime("docx"), Some("application/octet-stream"));
        assert_eq!(file_mime("cr3"), Some("image/x-raw"));
        assert_eq!(file_mime("svg"), Some("image/svg+xml"));
        assert_eq!(file_mime("exe"), None);
    }
}

#[cfg(test)]
mod output_path_tests {
    use super::existing_output_path;

    #[test]
    fn accepts_existing_output_files_and_rejects_missing_paths() {
        let directory = std::env::temp_dir().join(format!(
            "flickvert-output-path-{}-{}",
            std::process::id(),
            super::MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).unwrap();
        let file = directory.join("result.txt");
        std::fs::write(&file, "result").unwrap();

        assert_eq!(
            existing_output_path(file.to_str().unwrap()).unwrap(),
            std::fs::canonicalize(&file).unwrap()
        );
        assert!(existing_output_path(directory.join("missing.txt").to_str().unwrap()).is_err());

        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[cfg(test)]
mod temporary_directory_tests {
    use super::{cancel_all_operation_jobs, error_log_line, is_stale_workspace, OperationJobs, TemporaryDirectory};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::fs;

    #[test]
    fn temporary_work_directory_is_removed_on_drop() {
        let path = std::env::temp_dir().join(format!("flickvert-cleanup-test-{}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("partial"), b"partial output").unwrap();
        drop(TemporaryDirectory(path.clone()));
        assert!(!path.exists());
    }

    #[test]
    fn stale_cleanup_only_matches_old_generated_workspace_directories() {
        let now = std::time::SystemTime::now();
        let old = now - std::time::Duration::from_secs(2 * 24 * 60 * 60);
        assert!(is_stale_workspace("123-4", true, Some(old), now));
        assert!(!is_stale_workspace("user-files", true, Some(old), now));
        assert!(!is_stale_workspace("123-4", false, Some(old), now));
        assert!(!is_stale_workspace("123-4", true, Some(now), now));
    }

    #[test]
    fn app_exit_cancels_all_active_jobs() {
        let jobs = OperationJobs::default();
        let flag = std::sync::Arc::new(AtomicBool::new(false));
        jobs.active.lock().unwrap().insert("test".into(), flag.clone());
        cancel_all_operation_jobs(&jobs);
        assert!(flag.load(Ordering::Acquire));
    }

    #[test]
    fn local_error_log_only_accepts_categories_not_user_content() {
        assert_eq!(error_log_line("conversion", 123), Some("123\tconversion".into()));
        assert_eq!(error_log_line("C:/Users/Pavel/private.docx", 123), None);
    }

    #[test]
    fn launch_agent_xml_escapes_executable_paths() {
        assert_eq!(super::xml_escape("/Applications/A&B <FlickVert>.app"), "/Applications/A&amp;B &lt;FlickVert&gt;.app");
    }
}

#[cfg(test)]
mod pdf_dpi_tests {
    use super::clamp_pdf_dpi;

    #[test]
    fn uses_default_and_clamps_pdf_raster_resolution() {
        assert_eq!(clamp_pdf_dpi(None), 300);
        assert_eq!(clamp_pdf_dpi(Some(10)), 72);
        assert_eq!(clamp_pdf_dpi(Some(450)), 450);
        assert_eq!(clamp_pdf_dpi(Some(900)), 600);
    }
}

#[cfg(test)]
mod operation_shortcut_tests {
    use super::validate_operation_shortcuts;
    use std::collections::HashMap;

    #[test]
    fn rejects_shortcuts_already_used_by_another_action_or_the_wheel() {
        assert!(validate_operation_shortcuts(&HashMap::from([("resize".into(), "CTRL+ALT+R".into()), ("rotate".into(), "CTRL+ALT+R".into())]), Some("CTRL+ALT+SPACE")).is_err());
        assert!(validate_operation_shortcuts(&HashMap::from([("resize".into(), "CTRL+ALT+SPACE".into())]), Some("CTRL+ALT+SPACE")).is_err());
    }

    #[test]
    fn accepts_unique_operation_shortcuts_and_rejects_invalid_actions() {
        assert!(validate_operation_shortcuts(&HashMap::from([("resize".into(), "CTRL+ALT+R".into()), ("rotate".into(), "CTRL+ALT+O".into())]), Some("CTRL+ALT+SPACE")).is_ok());
        assert!(validate_operation_shortcuts(&HashMap::from([("../resize".into(), "CTRL+ALT+R".into())]), None).is_err());
        assert!(validate_operation_shortcuts(&HashMap::from([("resize".into(), "CTRL+CTRL+R".into())]), None).is_err());
    }
}

#[cfg(test)]
mod pdf_text_tests {
    use super::has_pdf_text;
    use std::io::Cursor;

    #[test]
    fn detects_selectable_text() {
        assert!(!has_pdf_text(&mut Cursor::new(b" \n\t\r")).unwrap());
        assert!(has_pdf_text(&mut Cursor::new(b" \npage text")).unwrap());
    }
}
