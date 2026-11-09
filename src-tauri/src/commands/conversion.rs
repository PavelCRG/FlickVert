use crate::*;

#[tauri::command(async)]
pub(crate) fn convert_file(
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
                operations::spreadsheet_convert_args(&input, &work_dir, &output_extension),
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

pub(crate) fn convert_pdf(
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
pub(crate) fn process_image_tool(
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
pub(crate) fn process_media_tool(
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
    if action_id == "trim-video"
        && (video_stream_index.is_some()
            || audio_stream_index.is_some()
            || subtitle_stream_index.is_some())
    {
        let streams = operations::media_streams(&input).ok_or_else(|| operation_error("engine"))?;
        if video_stream_index.is_some_and(|index| {
            !streams
                .iter()
                .any(|stream| stream.kind == "video" && stream.track_index == index)
        }) || audio_stream_index.is_some_and(|index| {
            !streams
                .iter()
                .any(|stream| stream.kind == "audio" && stream.track_index == index)
        }) || subtitle_stream_index.is_some_and(|index| {
            !streams
                .iter()
                .any(|stream| stream.kind == "subtitle" && stream.track_index == index)
        }) {
            return Err(operation_error("unsupported"));
        }
    }
    let audio_normalization = if action_id == "normalize-audio" {
        let values = (
            audio_target_lufs.unwrap_or(-16),
            audio_true_peak_db.unwrap_or(-1),
        );
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
            Some(
                operations::valid_video_frame_time_us(time, duration)
                    .ok_or_else(|| operation_error("unsupported"))?,
            )
        } else {
            None
        };
        if action_id == "compress-video"
            && !operations::available_video_codecs().contains(&selected_video_codec)
        {
            return Err(operation_error("engine"));
        }
        if action_id == "compress-video"
            && video_height.is_some()
            && !operations::video_scaling_available()
        {
            return Err(operation_error("unsupported"));
        }
        let args = operations::ffmpeg_tool_args_with_streams(
            video_preset.as_deref().unwrap_or("balanced"),
            selected_video_codec,
            video_height,
            trim_range,
            thumbnail_time,
            audio_normalization,
            (action_id == "extract-audio").then_some(selected_audio_format),
            &action_id,
            &input,
            &output_temp,
            (action_id == "trim-video")
                .then_some(video_stream_index)
                .flatten(),
            (action_id == "trim-video")
                .then_some(audio_stream_index)
                .flatten(),
            (action_id == "trim-video")
                .then_some(subtitle_stream_index)
                .flatten(),
        )
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
