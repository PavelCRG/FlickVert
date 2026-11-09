use crate::*;

pub(crate) fn existing_output_path(output_path: &str) -> Result<PathBuf, String> {
    let path = fs::canonicalize(output_path).map_err(|_| "Output is unavailable")?;
    if path.is_file() || path.is_dir() {
        Ok(path)
    } else {
        Err("Output is unavailable".into())
    }
}

pub(crate) fn selected_dropped_path(
    input_path: &str,
    dropped: &DroppedFiles,
) -> Result<PathBuf, String> {
    let path = fs::canonicalize(input_path).map_err(|error| error.to_string())?;
    if !dropped.0.lock().unwrap().contains(&path) || !path.is_file() && !path.is_dir() {
        return Err("Select a file or folder in FlickVert".into());
    }
    Ok(path)
}

pub(crate) fn selected_dropped_file(
    input_path: &str,
    dropped: &DroppedFiles,
) -> Result<PathBuf, String> {
    let path = selected_dropped_path(input_path, dropped)?;
    if !path.is_file() {
        return Err("Select a file in FlickVert".into());
    }
    Ok(path)
}

#[cfg(target_os = "windows")]
pub(crate) fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
    let mut command = Command::new("explorer.exe");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg("/select,").arg(path);
    }
    command.spawn().map(|_| ())
}

#[cfg(target_os = "macos")]
pub(crate) fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
    let mut command = Command::new("open");
    if path.is_dir() {
        command.arg(path);
    } else {
        command.arg("-R").arg(path);
    }
    command.spawn().map(|_| ())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub(crate) fn reveal_in_file_manager(path: &Path) -> std::io::Result<()> {
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
pub(crate) fn copy_dropped_file_path(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    copy_path_to_clipboard(&path.to_string_lossy())
}

#[tauri::command]
pub(crate) fn copy_powershell_path(
    input_path: String,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    let directory =
        operations::selected_item_directory(&path).ok_or("File has no parent folder")?;
    if !directory.is_dir() {
        return Err("The selected folder no longer exists".into());
    }
    #[cfg(windows)]
    {
        copy_path_to_clipboard(&operations::powershell_location_command(
            &directory.to_string_lossy(),
        ))
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("PowerShell paths are available only on Windows".into())
    }
}

#[tauri::command]
pub(crate) fn open_terminal(
    input_path: String,
    terminal_preference: Option<String>,
    dropped: tauri::State<'_, DroppedFiles>,
) -> Result<(), String> {
    let path = selected_dropped_path(&input_path, &dropped)?;
    let directory =
        operations::selected_item_directory(&path).ok_or("File has no parent folder")?;
    if !directory.is_dir() {
        return Err("The selected folder no longer exists".into());
    }

    #[cfg(target_os = "windows")]
    {
        let use_powershell = terminal_preference.as_deref() == Some("powershell");
        let launch = |powershell: bool| {
            if powershell {
                Command::new("powershell.exe")
                    .args(["-NoExit"])
                    .current_dir(directory)
                    .spawn()
            } else {
                Command::new("wt.exe")
                    .args(["-w", "0", "new-tab"])
                    .args(operations::windows_terminal_args(directory))
                    .args(["powershell.exe", "-NoExit"])
                    .spawn()
            }
        };
        match launch(use_powershell) {
            Ok(_) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => launch(!use_powershell)
                .map(|_| ())
                .map_err(|fallback| fallback.to_string()),
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
pub(crate) fn copy_to_flickvert_folder(
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
pub(crate) fn move_to_flickvert_folder(
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
pub(crate) fn copy_path_to_clipboard(path: &str) -> Result<(), String> {
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
pub(crate) fn copy_path_to_clipboard(path: &str) -> Result<(), String> {
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
pub(crate) fn copy_path_to_clipboard(_: &str) -> Result<(), String> {
    Err("Clipboard access is not supported on this platform".into())
}

#[cfg(test)]
mod tests {
    use super::existing_output_path;
    use crate::MEDIA_TEMP_ID;

    #[test]
    fn accepts_existing_output_files_and_rejects_missing_paths() {
        let directory = std::env::temp_dir().join(format!(
            "flickvert-output-path-{}-{}",
            std::process::id(),
            MEDIA_TEMP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
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
