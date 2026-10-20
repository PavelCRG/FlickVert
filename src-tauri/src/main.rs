#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
mod files;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![output_directory, save_output])
        .run(tauri::generate_context!())
        .expect("FlickVert failed to start");
}
