#[cfg(any(windows, test))]
fn windows_entries(executable: &str) -> Vec<(String, String)> {
    let file_command = format!("\"{executable}\" \"%1\"");
    let folder_command = format!("\"{executable}\" \"%1\"");
    let background_command = format!("\"{executable}\" \"%V\"");
    [
        (r"Software\Classes\*\shell\FlickVert.Open", file_command),
        (r"Software\Classes\Directory\shell\FlickVert.Open", folder_command),
        (r"Software\Classes\Directory\Background\shell\FlickVert.Open", background_command),
    ].into_iter().map(|(key, command)| (key.to_owned(), command)).collect()
}

#[cfg(any(target_os = "macos", test))]
fn finder_workflow() -> &'static str {
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>AMApplicationBuild</key><string>523</string><key>AMApplicationVersion</key><string>2.10</string><key>AMDocumentVersion</key><string>2</string>
<key>actions</key><array><dict><key>action</key><dict>
<key>AMAccepts</key><dict><key>Container</key><string>List</string><key>Optional</key><false/><key>Types</key><array><string>com.apple.cocoa.path</string></array></dict>
<key>AMActionVersion</key><string>1.0</string><key>AMApplication</key><array><string>Automator</string></array><key>AMLargeIconName</key><string>RunShellScript</string>
<key>AMParameterProperties</key><dict><key>COMMAND_STRING</key><dict/><key>inputMethod</key><dict/><key>shell</key><dict/><key>source</key><dict/></dict>
<key>AMProvides</key><dict><key>Container</key><string>List</string><key>Types</key><array><string>com.apple.cocoa.path</string></array></dict>
<key>ActionBundlePath</key><string>/System/Library/Automator/Run Shell Script.action</string><key>ActionName</key><string>Run Shell Script</string>
<key>ActionParameters</key><dict><key>COMMAND_STRING</key><string>open -na FlickVert --args "$@"</string><key>CheckedForUserDefaultShell</key><true/><key>inputMethod</key><integer>1</integer><key>shell</key><string>/bin/bash</string><key>source</key><string></string></dict>
<key>BundleIdentifier</key><string>com.apple.RunShellScript</string><key>CFBundleVersion</key><string>1.0</string><key>CanShowSelectedItemsWhenRun</key><false/><key>CanShowWhenRun</key><true/>
<key>Category</key><array><string>AMCategoryUtilities</string></array><key>Class Name</key><string>RunShellScriptAction</string>
<key>InputUUID</key><string>4B4D36AC-CE0E-45FE-A4DF-7DB37D1D10D1</string><key>OutputUUID</key><string>6E333434-9C01-4536-9B33-CDB4E4F7A8F8</string><key>UUID</key><string>3C02AE3B-6B20-47E2-B1CC-EB24819105D3</string>
<key>Keywords</key><array><string>FlickVert</string><string>Files</string></array><key>UnlocalizedApplications</key><array><string>Automator</string></array>
<key>arguments</key><dict/><key>is498</key><true/><key>isViewVisible</key><true/><key>location</key><string>529.000000:620.000000</string><key>nibPath</key><string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
</dict><key>isViewVisible</key><true/></dict></array><key>connectors</key><dict/>
<key>workflowMetaData</key><dict><key>workflowTypeIdentifier</key><string>com.apple.Automator.servicesMenu</string><key>serviceInputTypeIdentifier</key><string>com.apple.Automator.fileSystemObject</string><key>serviceApplicationBundleID</key><string>com.apple.finder</string></dict>
</dict></plist>"#
}

#[cfg(any(target_os = "macos", test))]
fn finder_info_plist() -> &'static str {
    r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleName</key><string>Open with FlickVert</string><key>CFBundleIdentifier</key><string>app.flickvert.desktop.finder-action</string>
<key>NSServices</key><array><dict><key>NSMenuItem</key><dict><key>default</key><string>Open with FlickVert</string></dict><key>NSMessage</key><string>runWorkflowAsService</string>
<key>NSSendFileTypes</key><array><string>public.item</string><string>public.folder</string></array></dict></array></dict></plist>"#
}

fn system_error() -> String { "Could not update context menu integration".into() }

#[cfg(windows)]
fn set_windows(enabled: bool) -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|_| "Could not locate FlickVert")?;
    for (key, command) in windows_entries(&executable.to_string_lossy()) {
        if enabled {
            for (suffix, value) in [("", "Open with FlickVert".to_owned()), (r"\command", command)] {
                let output = std::process::Command::new("reg.exe").args(["add", &format!(r"HKCU\{key}{suffix}"), "/ve", "/d", &value, "/f"]).output().map_err(|_| system_error())?;
                if !output.status.success() { return Err(system_error()); }
            }
        } else {
            let registry_key = format!(r"HKCU\{key}");
            if !std::process::Command::new("reg.exe").args(["query", &registry_key]).status().map_err(|_| system_error())?.success() { continue; }
            if !std::process::Command::new("reg.exe").args(["delete", &registry_key, "/f"]).status().map_err(|_| system_error())?.success() { return Err(system_error()); }
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_macos(enabled: bool) -> Result<(), String> {
    use std::{fs, path::PathBuf, process::Command};
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(system_error)?;
    let workflow = home.join("Library/Services/Open with FlickVert.workflow");
    let contents = workflow.join("Contents");
    if enabled {
        if workflow.exists() && !fs::read_to_string(contents.join("Info.plist")).map_err(|_| system_error())?.contains("app.flickvert.desktop.finder-action") { return Err(system_error()); }
        fs::create_dir_all(&contents).map_err(|_| system_error())?;
        fs::write(contents.join("document.wflow"), finder_workflow()).map_err(|_| system_error())?;
        fs::write(contents.join("Info.plist"), finder_info_plist()).map_err(|_| system_error())?;
    } else if workflow.exists() {
        let info = fs::read_to_string(contents.join("Info.plist")).map_err(|_| system_error())?;
        if !info.contains("app.flickvert.desktop.finder-action") { return Err(system_error()); }
        fs::remove_dir_all(&workflow).map_err(|_| system_error())?;
    }
    let status = Command::new("/System/Library/CoreServices/pbs").arg("-update").status().map_err(|_| system_error())?;
    status.success().then_some(()).ok_or_else(system_error)
}

#[tauri::command]
pub fn set_context_menu_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(windows)] { return set_windows(enabled); }
    #[cfg(target_os = "macos")] { return set_macos(enabled); }
    #[cfg(not(any(windows, target_os = "macos")))] { let _ = enabled; Err(system_error()) }
}

#[cfg(test)]
mod tests {
    use super::{finder_info_plist, finder_workflow, windows_entries};

    #[test]
    fn windows_context_commands_open_selected_files_and_directories() {
        let entries = windows_entries(r#"C:\Apps\FlickVert.exe"#);
        assert_eq!(entries.len(), 3);
        assert!(entries.iter().any(|(key, command)| key.contains("\\*\\shell\\FlickVert.Open") && command.contains("%1")));
        assert!(entries.iter().any(|(key, command)| key.contains("\\Directory\\shell\\FlickVert.Open") && command.contains("%1")));
        assert!(entries.iter().any(|(key, command)| key.contains("\\Directory\\Background\\shell\\FlickVert.Open") && command.contains("%V")));
        assert!(entries.iter().all(|(_, command)| command.starts_with('"')));
    }

    #[test]
    fn macos_quick_action_receives_finder_paths_and_can_be_removed_by_name() {
        assert!(finder_workflow().contains("open -na FlickVert --args \"$@\""));
        assert!(finder_workflow().contains("com.apple.Automator.servicesMenu"));
        assert!(finder_info_plist().contains("runWorkflowAsService"));
        assert!(finder_info_plist().contains("app.flickvert.desktop.finder-action"));
    }
}
