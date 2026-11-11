use crate::*;

fn parse_media_duration_us(output: &[u8]) -> Option<u64> {
    let seconds = std::str::from_utf8(output).ok()?.trim().parse::<f64>().ok()?;
    let microseconds = seconds * 1_000_000.0;
    (seconds > 0.0 && microseconds.is_finite() && microseconds < u64::MAX as f64)
        .then_some(microseconds.round() as u64)
}

pub(crate) fn media_duration_us(input: &Path) -> Option<u64> {
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
    output
        .status
        .success()
        .then(|| parse_media_duration_us(&output.stdout))
        .flatten()
}

#[tauri::command(async)]
pub(crate) fn inspect_media_streams(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<operations::MediaStream>, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    operations::media_streams(&input).ok_or_else(|| operation_error("engine"))
}

pub(crate) fn operation_error(kind: &str) -> String {
    format!("flickvert-error:{kind}")
}

pub(crate) fn error_log_line(kind: &str, timestamp: u64) -> Option<String> {
    matches!(
        kind,
        "input"
            | "unsupported"
            | "engine"
            | "access"
            | "conversion"
            | "protected"
            | "pdfNoText"
            | "write"
            | "cancelled"
    )
    .then(|| format!("{timestamp}\t{kind}"))
}

#[tauri::command]
pub(crate) fn log_operation_error(app: AppHandle, kind: String) -> Result<(), String> {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock is unavailable")?
        .as_secs();
    let line = error_log_line(&kind, timestamp).ok_or("Unsupported error category")?;
    let directory = app
        .path()
        .app_log_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join("operations.log");
    if fs::metadata(&path).is_ok_and(|metadata| metadata.len() > 1024 * 1024) {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    let mut log = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    writeln!(log, "{line}").map_err(|error| error.to_string())
}

pub(crate) fn process_error(error: std::io::Error) -> String {
    operation_error(if error.kind() == std::io::ErrorKind::Interrupted {
        "cancelled"
    } else {
        "engine"
    })
}

#[tauri::command]
pub(crate) fn begin_operation_job(jobs: tauri::State<'_, OperationJobs>) -> String {
    let id = jobs.next.fetch_add(1, Ordering::Relaxed).to_string();
    jobs.active
        .lock()
        .unwrap()
        .insert(id.clone(), Arc::new(AtomicBool::new(false)));
    id
}

#[tauri::command]
pub(crate) fn cancel_operation_job(job_id: String, jobs: tauri::State<'_, OperationJobs>) {
    if let Some(cancelled) = jobs.active.lock().unwrap().get(&job_id) {
        cancelled.store(true, Ordering::Release);
    }
}

#[tauri::command]
pub(crate) fn finish_operation_job(job_id: String, jobs: tauri::State<'_, OperationJobs>) {
    jobs.active.lock().unwrap().remove(&job_id);
}

pub(crate) fn cancel_all_operation_jobs(jobs: &OperationJobs) {
    for cancelled in jobs.active.lock().unwrap().values() {
        cancelled.store(true, Ordering::Release);
    }
}

#[tauri::command]
pub(crate) fn take_startup_files(
    files: tauri::State<'_, StartupFiles>,
    app: AppHandle,
) -> Vec<String> {
    let paths = std::mem::take(&mut *files.0.lock().unwrap());
    if !paths.is_empty() {
        show_quick(&app, true);
    }
    paths
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeFile {
    path: String,
    name: String,
    size: u64,
    extension: String,
    mime: &'static str,
    is_directory: bool,
    has_audio: Option<bool>,
}

pub(crate) fn file_mime(extension: &str) -> Option<&'static str> {
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
        | "rst" | "tex" | "xls" | "xlsx" | "ods" | "ppt" | "pptx" | "odp" | "csv" | "tsv" => {
            Some("application/octet-stream")
        }
        _ => None,
    }
}

#[tauri::command]
pub(crate) fn inspect_dropped_files(
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
pub(crate) fn engine_status() -> operations::Engines {
    operations::all_engine_status()
}

#[tauri::command]
pub(crate) fn video_codecs() -> Vec<&'static str> {
    operations::available_video_codecs()
}

#[tauri::command]
pub(crate) fn audio_formats() -> Vec<&'static str> {
    operations::available_audio_formats()
}

#[tauri::command]
pub(crate) fn pdf_merge_available() -> bool {
    true
}

#[tauri::command]
pub(crate) fn pdf_split_available() -> bool {
    true
}

#[tauri::command]
pub(crate) fn pdf_edit_available() -> bool {
    true
}

pub(crate) fn read_qpdf_page_count(input: &Path) -> Result<u32, String> {
    pdf_conversion::pdf_page_count(input).map_err(|_| operation_error("conversion"))
}

#[tauri::command(async)]
pub(crate) fn pdf_edit_page_count(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<u32, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(operation_error("unsupported"));
    }
    read_qpdf_page_count(&input)
}

pub(crate) fn read_pdf_page_count(input: &Path) -> Option<u32> {
    pdf_conversion::pdf_page_count(input).ok()
}

#[tauri::command(async)]
pub(crate) fn pdf_page_count(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<u32, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(operation_error("unsupported"));
    }
    read_pdf_page_count(&input).ok_or_else(|| operation_error("conversion"))
}

#[tauri::command]
pub(crate) fn video_scaling_available() -> bool {
    operations::video_scaling_available()
}

#[tauri::command]
pub(crate) fn conversion_catalog() -> Vec<operations::ConversionCatalogItem> {
    operations::conversion_catalog(operations::all_engine_status())
}

#[tauri::command]
pub(crate) fn supports_in_app_updates() -> bool {
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
pub(crate) fn supports_windows_update(bundle: Option<tauri::utils::config::BundleType>) -> bool {
    matches!(
        bundle,
        Some(tauri::utils::config::BundleType::Msi | tauri::utils::config::BundleType::Nsis)
    )
}

#[tauri::command]
pub(crate) fn take_drag_trigger(trigger: tauri::State<'_, DragTrigger>) -> bool {
    std::mem::take(&mut *trigger.0.lock().unwrap())
}

#[tauri::command]
pub(crate) fn quick_formats(
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

pub(crate) fn destination_for(input: &Path, selected: Option<&str>) -> Result<PathBuf, String> {
    files::destination_directory(input, selected).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(crate) fn read_dropped_file(
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

pub(crate) fn clamp_pdf_dpi(dpi: Option<u32>) -> u32 {
    dpi.unwrap_or(300).clamp(72, 600)
}

pub(crate) fn has_pdf_text<R: Read>(reader: &mut R) -> std::io::Result<bool> {
    let mut buffer = [0; 4096];
    loop {
        let length = reader.read(&mut buffer)?;
        if length == 0 {
            return Ok(false);
        }
        if buffer[..length]
            .iter()
            .any(|byte| !byte.is_ascii_whitespace())
        {
            return Ok(true);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        cancel_all_operation_jobs, clamp_pdf_dpi, error_log_line, file_mime, has_pdf_text,
        parse_media_duration_us, supports_windows_update, OperationJobs,
    };
    use std::{
        io::Cursor,
        sync::atomic::{AtomicBool, Ordering},
        sync::Arc,
    };

    #[test]
    fn updater_accepts_installed_windows_bundles_but_not_portable_builds() {
        use tauri::utils::config::BundleType;
        assert!(supports_windows_update(Some(BundleType::Msi)));
        assert!(supports_windows_update(Some(BundleType::Nsis)));
        assert!(!supports_windows_update(None));
    }

    #[test]
    fn parses_ffprobe_duration_as_positive_microseconds() {
        assert_eq!(parse_media_duration_us(b"12.345678\n"), Some(12_345_678));
        assert_eq!(parse_media_duration_us(b"N/A\n"), None);
        assert_eq!(parse_media_duration_us(b"0\n"), None);
        assert_eq!(parse_media_duration_us(b"inf\n"), None);
        assert_eq!(parse_media_duration_us(b"1e308\n"), None);
    }

    #[test]
    fn recognizes_document_and_raw_inputs_without_claiming_unknown_files() {
        assert_eq!(file_mime("docx"), Some("application/octet-stream"));
        assert_eq!(file_mime("cr3"), Some("image/x-raw"));
        assert_eq!(file_mime("svg"), Some("image/svg+xml"));
        assert_eq!(file_mime("exe"), None);
    }

    #[test]
    fn app_exit_cancels_all_active_jobs() {
        let jobs = OperationJobs::default();
        let flag = Arc::new(AtomicBool::new(false));
        jobs.active
            .lock()
            .unwrap()
            .insert("test".into(), flag.clone());
        cancel_all_operation_jobs(&jobs);
        assert!(flag.load(Ordering::Acquire));
    }

    #[test]
    fn local_error_log_only_accepts_categories_not_user_content() {
        assert_eq!(
            error_log_line("conversion", 123),
            Some("123\tconversion".into())
        );
        assert_eq!(error_log_line("C:/Users/Pavel/private.docx", 123), None);
    }

    #[test]
    fn uses_default_and_clamps_pdf_raster_resolution() {
        assert_eq!(clamp_pdf_dpi(None), 300);
        assert_eq!(clamp_pdf_dpi(Some(10)), 72);
        assert_eq!(clamp_pdf_dpi(Some(450)), 450);
        assert_eq!(clamp_pdf_dpi(Some(900)), 600);
    }

    #[test]
    fn detects_selectable_text() {
        assert!(!has_pdf_text(&mut Cursor::new(b" \n\t\r")).unwrap());
        assert!(has_pdf_text(&mut Cursor::new(b" \npage text")).unwrap());
    }
}
