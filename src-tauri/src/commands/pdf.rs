use crate::*;

#[tauri::command(async)]
pub(crate) fn split_pdf_pages(
    app: AppHandle,
    input_path: String,
    page_numbers: Vec<u32>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<Vec<String>, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(operation_error("unsupported"));
    }
    if !pdf_split_available() {
        return Err(operation_error("engine"));
    }
    let page_count = read_pdf_page_count(&input).ok_or_else(|| operation_error("conversion"))?;
    if !operations::valid_pdf_page_numbers(&page_numbers, page_count) {
        return Err(operation_error("unsupported"));
    }
    let pdfseparate =
        operations::find_executable("pdfseparate").ok_or_else(|| operation_error("engine"))?;
    let destination = destination_for(&input, destination_folder.as_deref())
        .map_err(|_| operation_error("access"))?;
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
            MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
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
                if last.1.checked_add(1) == Some(*page) {
                    last.1 = *page;
                    continue;
                }
            }
            ranges.push((*page, *page));
        }
        for (start, end) in ranges {
            let args = operations::pdf_split_args(&input, start, end, &pattern)
                .ok_or_else(|| operation_error("unsupported"))?;
            let output = operations::run(&pdfseparate, &args).map_err(process_error)?;
            if !output.status.success() {
                return Err(
                    if String::from_utf8_lossy(&output.stderr)
                        .to_ascii_lowercase()
                        .contains("encrypt")
                    {
                        operation_error("protected")
                    } else {
                        operation_error("conversion")
                    },
                );
            }
        }
        for page in &page_numbers {
            let extracted = work_dir.join(format!("page-{page}.pdf"));
            if !extracted.is_file()
                || fs::metadata(&extracted)
                    .map_err(|_| operation_error("access"))?
                    .len()
                    == 0
            {
                return Err(operation_error("conversion"));
            }
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("document");
        let mut written = Vec::with_capacity(page_numbers.len());
        for page in &page_numbers {
            let extracted = work_dir.join(format!("page-{page}.pdf"));
            match files::write_output_file(
                &destination,
                &format!("{stem}-page-{page}.pdf"),
                &extracted,
            ) {
                Ok(path) => written.push(path),
                Err(_) => {
                    for path in written {
                        let _ = fs::remove_file(path);
                    }
                    return Err(operation_error("write"));
                }
            }
        }
        Ok(written
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect())
    })();

    result
}

#[tauri::command(async)]
pub(crate) fn edit_pdf_pages(
    app: AppHandle,
    input_path: String,
    page_order: Vec<u32>,
    rotations: Vec<u16>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    if !input
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        return Err(operation_error("unsupported"));
    }
    if !pdf_edit_available() {
        return Err(operation_error("engine"));
    }
    let page_count = read_qpdf_page_count(&input)?;
    if !operations::valid_pdf_page_order(&page_order, page_count)
        || rotations.len() != page_count as usize
        || rotations
            .iter()
            .any(|angle| ![0, 90, 180, 270].contains(angle))
    {
        return Err(operation_error("unsupported"));
    }
    let qpdf = operations::find_executable("qpdf").ok_or_else(|| operation_error("engine"))?;
    let destination = destination_for(&input, destination_folder.as_deref())
        .map_err(|_| operation_error("access"))?;
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
            MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let rotations = rotations
            .iter()
            .enumerate()
            .map(|(index, angle)| (index as u32 + 1, *angle))
            .collect::<Vec<_>>();
        let rotated = work_dir.join("rotated.pdf");
        let ordered = work_dir.join("edited.pdf");
        let source = if rotations.iter().any(|(_, angle)| *angle != 0) {
            let args = operations::pdf_rotate_args(&input, &rotated, &rotations, page_count)
                .ok_or_else(|| operation_error("unsupported"))?;
            let output = operations::run(&qpdf, &args).map_err(process_error)?;
            if !output.status.success() {
                return Err(
                    if String::from_utf8_lossy(&output.stderr)
                        .to_ascii_lowercase()
                        .contains("encrypt")
                    {
                        operation_error("protected")
                    } else {
                        operation_error("conversion")
                    },
                );
            }
            rotated.as_path()
        } else {
            input.as_path()
        };
        let args = operations::pdf_page_order_args(source, &ordered, &page_order, page_count)
            .ok_or_else(|| operation_error("unsupported"))?;
        let output = operations::run(&qpdf, &args).map_err(process_error)?;
        if !output.status.success() {
            return Err(
                if String::from_utf8_lossy(&output.stderr)
                    .to_ascii_lowercase()
                    .contains("encrypt")
                {
                    operation_error("protected")
                } else {
                    operation_error("conversion")
                },
            );
        }
        if !ordered.is_file()
            || fs::metadata(&ordered)
                .map_err(|_| operation_error("access"))?
                .len()
                == 0
        {
            return Err(operation_error("conversion"));
        }
        let stem = input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("document");
        files::write_output_file(&destination, &format!("{stem}-edited.pdf"), &ordered)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| operation_error("write"))
    })();

    result
}

#[tauri::command(async)]
pub(crate) fn merge_pdf_files(
    app: AppHandle,
    input_paths: Vec<String>,
    destination_folder: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<String, String> {
    if !(2..=1_000).contains(&input_paths.len()) {
        return Err(operation_error("unsupported"));
    }
    let mut inputs = Vec::with_capacity(input_paths.len());
    for input_path in input_paths {
        let input =
            selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
        if !input
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
        {
            return Err(operation_error("unsupported"));
        }
        inputs.push(input);
    }
    let pdfunite =
        operations::find_executable("pdfunite").ok_or_else(|| operation_error("engine"))?;
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
            MEDIA_TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => break candidate,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(operation_error("access")),
        }
    };
    let work_dir = TemporaryDirectory(work_dir);
    let result = (|| {
        let output_temp = work_dir.join("merged.pdf");
        let args = operations::pdf_merge_args(&inputs, &output_temp)
            .ok_or_else(|| operation_error("unsupported"))?;
        let output = operations::run(&pdfunite, &args).map_err(process_error)?;
        if !output.status.success() {
            return Err(
                if String::from_utf8_lossy(&output.stderr)
                    .to_ascii_lowercase()
                    .contains("encrypt")
                {
                    operation_error("protected")
                } else {
                    operation_error("conversion")
                },
            );
        }
        if !output_temp.is_file()
            || fs::metadata(&output_temp)
                .map_err(|_| operation_error("access"))?
                .len()
                == 0
        {
            return Err(operation_error("conversion"));
        }
        let stem = inputs[0]
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("document");
        let destination = destination_for(&inputs[0], destination_folder.as_deref())
            .map_err(|_| operation_error("access"))?;
        files::write_output_file(&destination, &format!("{stem}-merged.pdf"), &output_temp)
            .map(|path| path.to_string_lossy().into_owned())
            .map_err(|_| operation_error("write"))
    })();

    result
}
