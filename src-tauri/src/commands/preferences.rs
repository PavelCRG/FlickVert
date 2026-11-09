use crate::*;

pub(crate) fn parse_global_shortcut(
    shortcut: &str,
) -> Result<tauri_plugin_global_shortcut::Shortcut, String> {
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

pub(crate) fn validate_operation_shortcuts(
    shortcuts: &HashMap<String, String>,
    primary: Option<&str>,
) -> Result<(), String> {
    if shortcuts.len() > 64 {
        return Err("Too many operation shortcuts".into());
    }
    let mut used = HashSet::new();
    if let Some(primary) = primary {
        used.insert(primary);
    }
    for (action, shortcut) in shortcuts {
        if !action
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
            || action.is_empty()
            || action.len() > 64
        {
            return Err("Unsupported operation shortcut".into());
        }
        parse_global_shortcut(shortcut).map_err(|_| "Unsupported operation shortcut")?;
        if !used.insert(shortcut.as_str()) {
            return Err("Shortcut is already assigned".into());
        }
    }
    Ok(())
}

pub(crate) fn register_operation_shortcut_handler(
    app: &AppHandle,
    shortcut: &str,
) -> Result<(), String> {
    let parsed = parse_global_shortcut(shortcut)?;
    let shortcut = shortcut.to_owned();
    app.global_shortcut()
        .on_shortcut(parsed, move |handle, _, event| {
            if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                return;
            }
            let Some(action_id) =
                handle
                    .state::<OperationShortcuts>()
                    .0
                    .lock()
                    .ok()
                    .and_then(|shortcuts| {
                        shortcuts.iter().find_map(|(action, value)| {
                            (value == &shortcut).then(|| action.clone())
                        })
                    })
            else {
                return;
            };
            let foreground = selection::foreground_window();
            show_quick(handle, true);
            let handle = handle.clone();
            std::thread::spawn(move || {
                let paths = selection::selected_paths(foreground);
                let _ = handle.emit(
                    "flickvert://operation-shortcut",
                    serde_json::json!({ "actionId": action_id, "paths": paths }),
                );
            });
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn configure_operation_shortcuts(
    app: AppHandle,
    shortcuts: HashMap<String, String>,
) -> Result<(), String> {
    let registered = app.state::<RegisteredShortcut>();
    let current = registered
        .0
        .lock()
        .map_err(|_| "Shortcut state is unavailable")?;
    let operation_shortcuts = app.state::<OperationShortcuts>();
    let mut existing = operation_shortcuts
        .0
        .lock()
        .map_err(|_| "Shortcut state is unavailable")?;
    validate_operation_shortcuts(&shortcuts, current.as_deref())?;
    if *existing == shortcuts {
        return Ok(());
    }
    let old_values: HashSet<_> = existing.values().cloned().collect();
    let new_values: HashSet<_> = shortcuts.values().cloned().collect();
    let mut registered_new: Vec<String> = Vec::new();
    for shortcut in new_values.difference(&old_values) {
        if let Err(error) = register_operation_shortcut_handler(&app, shortcut) {
            for value in registered_new {
                if let Ok(parsed) = parse_global_shortcut(&value) {
                    let _ = app.global_shortcut().unregister(parsed);
                }
            }
            return Err(error);
        }
        registered_new.push(shortcut.clone());
    }
    let mut unregistered_old: Vec<String> = Vec::new();
    for shortcut in old_values.difference(&new_values) {
        let parsed = parse_global_shortcut(shortcut)?;
        if let Err(error) = app.global_shortcut().unregister(parsed) {
            for value in &unregistered_old {
                let _ = register_operation_shortcut_handler(&app, value);
            }
            for value in registered_new {
                if let Ok(parsed) = parse_global_shortcut(&value) {
                    let _ = app.global_shortcut().unregister(parsed);
                }
            }
            return Err(error.to_string());
        }
        unregistered_old.push(shortcut.clone());
    }
    *existing = shortcuts;
    Ok(())
}

#[tauri::command]
pub(crate) fn register_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let parsed = parse_global_shortcut(&shortcut)?;
    let registered = app.state::<RegisteredShortcut>();
    let mut current = registered
        .0
        .lock()
        .map_err(|_| "Shortcut state is unavailable")?;
    if current.as_deref() == Some(shortcut.as_str()) {
        return Ok(());
    }
    if app
        .state::<OperationShortcuts>()
        .0
        .lock()
        .map_err(|_| "Shortcut state is unavailable")?
        .values()
        .any(|value| value == &shortcut)
    {
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
pub(crate) fn configure_drag_modifiers(
    convert: String,
    tools: String,
    actions: String,
) -> Result<(), String> {
    input::configure_modifiers(&convert, &tools, &actions)
}

#[tauri::command]
pub(crate) fn output_directory(app: tauri::AppHandle) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    files::output_directory(&downloads)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
pub(crate) fn set_system_startup(enabled: bool) -> Result<(), String> {
    const KEY: &str = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
    if enabled {
        let executable = std::env::current_exe().map_err(|_| "Could not locate FlickVert")?;
        let output = Command::new("reg.exe")
            .args(["add", KEY, "/v", "FlickVert", "/t", "REG_SZ", "/d"])
            .arg(format!("\"{}\" --background", executable.to_string_lossy()))
            .arg("/f")
            .output()
            .map_err(|_| "Could not update startup settings")?;
        output
            .status
            .success()
            .then_some(())
            .ok_or("Could not update startup settings".into())
    } else {
        let query = Command::new("reg.exe")
            .args(["query", KEY, "/v", "FlickVert"])
            .output()
            .map_err(|_| "Could not update startup settings")?;
        if !query.status.success() {
            return Ok(());
        }
        let output = Command::new("reg.exe")
            .args(["delete", KEY, "/v", "FlickVert", "/f"])
            .output()
            .map_err(|_| "Could not update startup settings")?;
        output
            .status
            .success()
            .then_some(())
            .ok_or("Could not update startup settings".into())
    }
}

#[cfg(target_os = "macos")]
pub(crate) fn set_system_startup(enabled: bool) -> Result<(), String> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or("Home folder is unavailable")?;
    let directory = home.join("Library/LaunchAgents");
    let agent = directory.join("app.flickvert.desktop.v2.plist");
    if enabled {
        let executable = std::env::current_exe().map_err(|_| "Could not locate FlickVert")?;
        fs::create_dir_all(&directory).map_err(|_| "Could not update startup settings")?;
        let plist = format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>Label</key><string>app.flickvert.desktop.v2</string><key>ProgramArguments</key><array><string>{}</string><string>--background</string></array><key>RunAtLoad</key><true/></dict></plist>", xml_escape(&executable.to_string_lossy()));
        fs::write(&agent, plist).map_err(|_| "Could not update startup settings")?;
        let status = Command::new("launchctl")
            .args(["load", "-w"])
            .arg(&agent)
            .status()
            .map_err(|_| "Could not update startup settings")?;
        if !status.success() {
            let _ = fs::remove_file(&agent);
            return Err("Could not update startup settings".into());
        }
    } else if agent.exists() {
        let status = Command::new("launchctl")
            .args(["unload", "-w"])
            .arg(&agent)
            .status()
            .map_err(|_| "Could not update startup settings")?;
        if !status.success() {
            return Err("Could not update startup settings".into());
        }
        fs::remove_file(agent).map_err(|_| "Could not update startup settings")?;
    }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[tauri::command]
pub(crate) fn set_startup_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(any(windows, target_os = "macos"))]
    {
        return set_system_startup(enabled);
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = enabled;
        Err("Startup settings are not supported on this platform".into())
    }
}

#[tauri::command]
pub(crate) fn set_confirm_quit_on_close(
    enabled: bool,
    state: tauri::State<'_, ConfirmQuitOnClose>,
) {
    state.0.store(enabled, Ordering::Release);
}

#[tauri::command]
pub(crate) fn quit_application(app: AppHandle) {
    cancel_all_operation_jobs(&app.state::<OperationJobs>());
    app.exit(0);
}

#[tauri::command(async)]
pub(crate) fn save_output(
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

#[cfg(test)]
mod tests {
    use super::{validate_operation_shortcuts, xml_escape};
    use std::collections::HashMap;

    #[test]
    fn launch_agent_xml_escapes_executable_paths() {
        assert_eq!(
            xml_escape("/Applications/A&B <FlickVert>.app"),
            "/Applications/A&amp;B &lt;FlickVert&gt;.app"
        );
    }

    #[test]
    fn rejects_shortcuts_already_used_by_another_action_or_the_wheel() {
        assert!(validate_operation_shortcuts(
            &HashMap::from([
                ("resize".into(), "CTRL+ALT+R".into()),
                ("rotate".into(), "CTRL+ALT+R".into())
            ]),
            Some("CTRL+ALT+SPACE")
        )
        .is_err());
        assert!(validate_operation_shortcuts(
            &HashMap::from([("resize".into(), "CTRL+ALT+SPACE".into())]),
            Some("CTRL+ALT+SPACE")
        )
        .is_err());
    }

    #[test]
    fn accepts_unique_shortcuts_and_rejects_invalid_actions() {
        assert!(validate_operation_shortcuts(
            &HashMap::from([
                ("resize".into(), "CTRL+ALT+R".into()),
                ("rotate".into(), "CTRL+ALT+O".into())
            ]),
            Some("CTRL+ALT+SPACE")
        )
        .is_ok());
        assert!(validate_operation_shortcuts(
            &HashMap::from([("../resize".into(), "CTRL+ALT+R".into())]),
            None
        )
        .is_err());
        assert!(validate_operation_shortcuts(
            &HashMap::from([("resize".into(), "CTRL+CTRL+R".into())]),
            None
        )
        .is_err());
    }
}
