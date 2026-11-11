use crate::*;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageEditorRequest {
    input_path: String,
    initial_tool: String,
}

pub(crate) fn show_main(app: &AppHandle) {
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

pub(crate) fn show_quick(app: &AppHandle, activate: bool) {
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
    let handle = app.clone();
    std::thread::spawn(move || {
        let paths = selection::dragged_paths(foreground);
        if paths.is_empty() {
            return;
        }
        let _ = handle.clone().run_on_main_thread(move || {
            if !input::drag_wheel_active() {
                return;
            }
            *handle.state::<DragTrigger>().0.lock().unwrap() = true;
            show_quick(&handle, false);
            let _ = handle.emit("flickvert://drag-wheel-open", ());
            let _ = handle.emit("flickvert://shortcut-files", paths);
        });
    });
}

#[tauri::command(async)]
pub(crate) fn choose_files(app: AppHandle) -> Result<(), String> {
    let paths = selection::choose_paths();
    if paths.is_empty() {
        return Ok(());
    }
    show_quick(&app, true);
    app.emit("flickvert://shortcut-files", paths)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn choose_output_folder() -> Option<String> {
    selection::choose_folder()
}

#[tauri::command]
pub(crate) fn quick_action(app: AppHandle, action_id: String) -> Result<(), String> {
    if !["home", "tools", "settings"].contains(&action_id.as_str()) {
        return Err("Unknown quick action".into());
    }
    show_main(&app);
    app.emit("flickvert://quick-action", action_id)
        .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(crate) fn open_image_editor(
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
pub(crate) fn open_video_trim_editor(
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
    if !operations::is_video_input(&extension) {
        return Err(operation_error("unsupported"));
    }
    show_main(&app);
    app.emit(
        "flickvert://video-trim-open",
        input.to_string_lossy().into_owned(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub(crate) fn open_video_export_preview(
    app: AppHandle,
    input_paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    if input_paths.is_empty() {
        return Err(operation_error("input"));
    }
    let mut paths = Vec::with_capacity(input_paths.len());
    for input_path in &input_paths {
        let input =
            selected_dropped_file(input_path, &dropped).map_err(|_| operation_error("input"))?;
        let extension = input
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !operations::is_video_input(&extension) {
            return Err(operation_error("unsupported"));
        }
        paths.push(input.to_string_lossy().into_owned());
    }
    show_main(&app);
    app.emit("flickvert://video-export-preview-open", paths)
        .map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
pub(crate) fn open_pdf_merge_editor(
    app: AppHandle,
    input_paths: Vec<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    if !(2..=1_000).contains(&input_paths.len()) {
        return Err(operation_error("unsupported"));
    }
    if !pdf_merge_available() {
        return Err(operation_error("engine"));
    }
    let mut paths = Vec::with_capacity(input_paths.len());
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
        paths.push(input.to_string_lossy().into_owned());
    }
    show_main(&app);
    app.emit("flickvert://pdf-merge-open", paths)
        .map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
pub(crate) fn open_pdf_split_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
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
    show_main(&app);
    app.emit(
        "flickvert://pdf-split-open",
        input.to_string_lossy().into_owned(),
    )
    .map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
pub(crate) fn open_pdf_pages_editor(
    app: AppHandle,
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
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
    show_main(&app);
    app.emit(
        "flickvert://pdf-pages-open",
        input.to_string_lossy().into_owned(),
    )
    .map_err(|_| operation_error("access"))
}

#[tauri::command(async)]
pub(crate) fn open_video_thumbnail_editor(
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
    if !operations::is_video_input(&extension) {
        return Err(operation_error("unsupported"));
    }
    show_main(&app);
    app.emit(
        "flickvert://video-thumbnail-open",
        input.to_string_lossy().into_owned(),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn media_duration(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<u64, String> {
    let input =
        selected_dropped_file(&input_path, &dropped).map_err(|_| operation_error("input"))?;
    media_duration_us(&input).ok_or_else(|| operation_error("engine"))
}

#[tauri::command]
pub(crate) fn reveal_dropped_file(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    reveal_in_file_manager(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn reveal_output_path(output_path: String) -> Result<(), String> {
    let path = existing_output_path(&output_path)?;
    reveal_in_file_manager(&path).map_err(|error| error.to_string())
}
