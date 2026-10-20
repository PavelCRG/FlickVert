#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;
mod files;
mod quick_window;

const QUICK_WIDTH: u32 = 400;
const QUICK_HEIGHT: u32 = 360;

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
}

fn show_quick(app: &AppHandle) {
    let window = match app.get_webview_window("quick") {
        Some(window) => window,
        None => match WebviewWindowBuilder::new(app, "quick", WebviewUrl::App("index.html".into()))
            .title("FlickVert Quick Actions").inner_size(QUICK_WIDTH as f64, QUICK_HEIGHT as f64)
            .resizable(false).decorations(false).transparent(true).always_on_top(true).skip_taskbar(true).visible(false).build() {
                Ok(window) => window,
                Err(error) => { eprintln!("Could not open quick actions: {error}"); return; }
            },
    };
    if let Ok(cursor) = app.cursor_position() {
        if let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y) {
            let area = monitor.work_area();
            let position = quick_window::clamp_window_position(
                (cursor.x as i32, cursor.y as i32), (QUICK_WIDTH, QUICK_HEIGHT),
                quick_window::Rect { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height },
            );
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(position.0, position.1)));
        }
    }
    let _ = window.set_size(Size::Physical(PhysicalSize::new(QUICK_WIDTH, QUICK_HEIGHT)));
    let _ = window.show();
    let _ = window.set_focus();
}

#[tauri::command]
fn quick_action(app: AppHandle, action_id: String) -> Result<(), String> {
    if !matches!(action_id.as_str(), "convert" | "resize" | "settings") { return Err("Unknown quick action".into()); }
    show_main(&app);
    app.emit("flickvert://quick-action", action_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let shortcut = match shortcut.as_str() {
        "CTRL+ALT+SPACE" | "CTRL+SHIFT+SPACE" | "ALT+SHIFT+SPACE" => shortcut,
        _ => return Err("Unsupported shortcut".into()),
    };
    let shortcut = shortcut.parse::<tauri_plugin_global_shortcut::Shortcut>().map_err(|error| error.to_string())?;
    app.global_shortcut().unregister_all().map_err(|error| error.to_string())?;
    app.global_shortcut().on_shortcut(shortcut, |handle, _, event| {
        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed { show_quick(handle); }
    }).map_err(|error| error.to_string())
}

#[tauri::command]
fn output_directory(app: tauri::AppHandle) -> Result<String, String> {
    let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
    files::output_directory(&downloads).map(|path| path.to_string_lossy().into_owned()).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_output(app: tauri::AppHandle, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    let downloads = app.path().download_dir().map_err(|error| error.to_string())?;
    let directory = files::output_directory(&downloads).map_err(|error| error.to_string())?;
    files::write_output(&directory, &file_name, &bytes).map(|path| path.to_string_lossy().into_owned()).map_err(|error| error.to_string())
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
        .invoke_handler(tauri::generate_handler![output_directory, save_output, quick_action, register_shortcut])
        .setup(|app| {
            let tray = tray_menu(app.handle()).and_then(|menu| {
                let icon = app.default_window_icon().cloned().ok_or_else(|| tauri::Error::AssetNotFound("icons/icon.png".into()))?;
                TrayIconBuilder::new()
                    .icon(icon)
                    .icon_as_template(true)
                    .tooltip("FlickVert")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => show_main(app),
                        "quick" => show_quick(app),
                        "settings" => { show_main(app); let _ = app.emit("flickvert://quick-action", "settings"); },
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .build(app)
            });
            match tray {
                Ok(tray) => { app.manage(tray); }
                Err(error) => eprintln!("Tray unavailable; keep FlickVert open to access it: {error}"),
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
