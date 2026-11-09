use crate::*;

#[tauri::command(async)]
pub(crate) fn create_zip_archive(
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
pub(crate) fn extract_zip_archive(
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
    archive::extract_zip(
        &input,
        &destination,
        name,
        selected_paths.as_deref(),
        skip_existing.unwrap_or(false),
    )
    .map(|path| {
        path.map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default()
    })
}

#[tauri::command(async)]
pub(crate) fn create_tar_archive(
    app: AppHandle,
    input_paths: Vec<String>,
    destination_folder: Option<String>,
    gzip: bool,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    if input_paths.is_empty() || input_paths.len() > 10_000 {
        return Err("Select between 1 and 10,000 files to archive".into());
    }
    let inputs = input_paths
        .into_iter()
        .map(|path| selected_dropped_path(&path, &dropped))
        .collect::<Result<Vec<_>, _>>()?;
    let stem = if inputs.len() == 1 {
        inputs[0]
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("archive")
    } else {
        "archive"
    };
    let extension = if gzip { "tar.gz" } else { "tar" };
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("archive-work");
    fs::create_dir_all(&work_root).map_err(|error| error.to_string())?;
    let work_dir = work_root.join(format!(
        "{}-{}",
        std::process::id(),
        MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&work_dir).map_err(|error| error.to_string())?;
    let _guard = TemporaryDirectory(work_dir.clone());
    let temporary = work_dir.join(format!("archive.{extension}"));
    archive::create_tar(&inputs, &temporary, gzip)?;
    let destination = destination_for(&inputs[0], destination_folder.as_deref())?;
    files::write_output_file(&destination, &format!("{stem}.{extension}"), &temporary)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(crate) fn create_gzip_archive(
    app: AppHandle,
    input_path: String,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let stem = input
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Input file name not found")?;
    let work_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("archive-work");
    fs::create_dir_all(&work_root).map_err(|error| error.to_string())?;
    let work_dir = work_root.join(format!(
        "{}-{}",
        std::process::id(),
        MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)
    ));
    fs::create_dir(&work_dir).map_err(|error| error.to_string())?;
    let _guard = TemporaryDirectory(work_dir.clone());
    let temporary = work_dir.join("compressed.gz");
    archive::create_gzip(&input, &temporary)?;
    let destination = destination_for(&input, destination_folder.as_deref())?;
    files::write_output_file(&destination, &format!("{stem}.gz"), &temporary)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(crate) fn extract_archive(
    destination_folder: Option<String>,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    let name = input
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Archive file name not found")?;
    let lower = name.to_ascii_lowercase();
    let destination = destination_for(&input, destination_folder.as_deref())?;
    let output = if lower.ends_with(".zip") {
        archive::extract_zip(
            &input,
            &destination,
            input
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("archive"),
            None,
            false,
        )?
        .ok_or("Archive extraction skipped")?
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") || lower.ends_with(".tar") {
        let output_name = if lower.ends_with(".tar.gz") {
            &name[..name.len() - 7]
        } else if lower.ends_with(".tgz") {
            &name[..name.len() - 4]
        } else {
            &name[..name.len() - 4]
        };
        archive::extract_tar(&input, &destination, output_name)?
    } else if lower.ends_with(".gz") {
        let output_name = &name[..name.len() - 3];
        archive::extract_gzip(&input, &destination, output_name)?
    } else {
        return Err("Supported archives are ZIP, TAR, TAR.GZ, TGZ, and GZIP".into());
    };
    Ok(output.to_string_lossy().into_owned())
}

#[tauri::command]
pub(crate) fn preview_zip_archive(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<archive::ZipPreview, String> {
    let input = selected_dropped_file(&input_path, &dropped)?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err("Only ZIP archives can be previewed".into());
    }
    archive::preview_zip(&input)
}
