use crate::*;

#[cfg(windows)]
fn webview_data_directory(root: &std::path::Path) -> std::io::Result<std::path::PathBuf> {
    let directory = root.join("app.flickvert.desktop.v2").join("webview-main");
    std::fs::create_dir_all(&directory)?;
    Ok(directory)
}

#[cfg(windows)]
fn windows_webview_data_directory() -> std::io::Result<std::path::PathBuf> {
    let root = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    webview_data_directory(&root)
        .or_else(|_| webview_data_directory(&std::env::temp_dir().join("FlickVert-WebView2")))
}

#[cfg(all(test, windows))]
mod tests {
    use super::webview_data_directory;

    #[test]
    fn webview_windows_reuse_the_main_profile() {
        let root =
            std::env::temp_dir().join(format!("flickvert-profile-test-{}", std::process::id()));
        let quick = webview_data_directory(&root).unwrap();
        let main = webview_data_directory(&root).unwrap();
        assert_eq!(quick, main);
        assert!(quick.ends_with("webview-main"));
        std::fs::remove_dir_all(root).unwrap();
    }
}

pub(crate) fn tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "Show FlickVert", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick", "Quick actions", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Preferences", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    Menu::with_items(app, &[&show, &quick, &settings, &quit])
}

pub(super) fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
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
            output_file_size,
            preview_batch_rename,
            rename_batch_files,
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
            create_tar_archive,
            create_gzip_archive,
            extract_archive,
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
                        "quit" => {
                            cancel_all_operation_jobs(&app.state::<OperationJobs>());
                            app.exit(0)
                        }
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
                if window
                    .state::<ConfirmQuitOnClose>()
                    .0
                    .load(Ordering::Acquire)
                {
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
