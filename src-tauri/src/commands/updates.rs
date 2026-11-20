use crate::*;
use std::{
    collections::HashSet,
    io::{Cursor, Read, Write},
    path::Path,
};

const MAX_UPDATE_BYTES: usize = 1024 * 1024 * 1024;
const UPDATE_TARGET: &str = "windows-x86_64-portable";
const PORTABLE_FILES: &[&str] = &[
    "FlickVert.exe",
    "FlickVertUpdater.exe",
    "INSTALL.txt",
    "README.md",
    "README.ru.md",
    "README.zh-CN.md",
];

fn validate_portable_entry(
    name: &str,
    is_dir: bool,
    found: &mut HashSet<String>,
) -> Result<(), String> {
    if is_dir
        || name.contains('/')
        || name.contains('\\')
        || !PORTABLE_FILES.contains(&name)
        || !found.insert(name.to_owned())
    {
        return Err("Update archive contains an unsafe or unexpected entry".into());
    }
    Ok(())
}

fn write_staged_file(path: &Path, bytes: &[u8], error: &str) -> Result<(), String> {
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| error.to_owned())?;
    if file
        .write_all(bytes)
        .and_then(|()| file.sync_all())
        .is_err()
    {
        drop(file);
        let _ = std::fs::remove_file(path);
        return Err(error.to_owned());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn windows_update_channel() -> &'static str {
    #[cfg(windows)]
    {
        update_channel_for_bundle(tauri::utils::platform::bundle_type())
    }
    #[cfg(not(windows))]
    {
        "unsupported"
    }
}

#[cfg(any(windows, test))]
fn update_channel_for_bundle(bundle: Option<tauri::utils::config::BundleType>) -> &'static str {
    match bundle {
        Some(tauri::utils::config::BundleType::Msi | tauri::utils::config::BundleType::Nsis) => {
            "installer"
        }
        None => "portable",
        _ => "unsupported",
    }
}

fn extract_portable_update(
    bytes: &[u8],
    app_stage: &Path,
    helper_stage: &Path,
) -> Result<(), String> {
    if bytes.len() > MAX_UPDATE_BYTES {
        return Err("Update archive exceeds the size limit".into());
    }
    let mut archive =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| "Invalid update archive")?;
    let mut found = HashSet::new();
    let mut total = 0u64;
    let mut app_exe = None;
    let mut helper_exe = None;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|_| "Invalid update archive")?;
        let name = file.name().to_owned();
        validate_portable_entry(&name, file.is_dir(), &mut found)?;
        total = total
            .checked_add(file.size())
            .ok_or("Invalid update archive size")?;
        if total > MAX_UPDATE_BYTES as u64 {
            return Err("Update archive exceeds the size limit".into());
        }
        if name == "FlickVert.exe" || name == "FlickVertUpdater.exe" {
            let mut contents =
                Vec::with_capacity(file.size().min(MAX_UPDATE_BYTES as u64) as usize);
            file.read_to_end(&mut contents)
                .map_err(|_| "Could not read update archive")?;
            if name == "FlickVert.exe" {
                app_exe = Some(contents);
            } else {
                helper_exe = Some(contents);
            }
        }
    }
    let app_exe = app_exe.ok_or("Update archive is missing FlickVert.exe")?;
    let helper_exe = helper_exe.ok_or("Update archive is missing FlickVertUpdater.exe")?;
    write_staged_file(
        app_stage,
        &app_exe,
        "Could not stage the application update",
    )?;
    if let Err(error) = write_staged_file(helper_stage, &helper_exe, "Could not stage the updater")
    {
        let _ = std::fs::remove_file(app_stage);
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn install_portable_update(app: AppHandle) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = app;
        return Err("Portable updates are supported on Windows only".into());
    }
    #[cfg(windows)]
    {
        use tauri_plugin_updater::UpdaterExt;
        if tauri::utils::platform::bundle_type().is_some() {
            return Err("This build uses a Windows installer".into());
        }
        let updater = app
            .updater_builder()
            .target(UPDATE_TARGET)
            .build()
            .map_err(|e| e.to_string())?;
        let update = updater
            .check()
            .await
            .map_err(|e| e.to_string())?
            .ok_or("No update is available")?;
        let progress_app = app.clone();
        let bytes = update
            .download(
                move |chunk, total| {
                    let _ = progress_app.emit("flickvert://update-progress", (chunk, total));
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        let current = std::env::current_exe().map_err(|e| e.to_string())?;
        if !current
            .file_name()
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("FlickVert.exe"))
        {
            return Err("Could not identify the portable application folder".into());
        }
        let directory = current
            .parent()
            .ok_or("Could not identify the portable application folder")?;
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos();
        let app_stage = directory.join(format!(
            "FlickVert-{}-{nonce}.update.exe",
            std::process::id()
        ));
        let cache_root = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("portable-updates");
        std::fs::create_dir_all(&cache_root)
            .map_err(|_| "Could not create update staging folder")?;
        let cache = cache_root.join(format!("{}-{nonce}", std::process::id()));
        std::fs::create_dir(&cache).map_err(|_| "Could not create update staging folder")?;
        let helper_stage = cache.join("FlickVertUpdater.exe");
        if let Err(error) = extract_portable_update(&bytes, &app_stage, &helper_stage) {
            let _ = std::fs::remove_dir_all(&cache);
            return Err(error);
        }
        std::process::Command::new(&helper_stage)
            .arg(std::process::id().to_string())
            .arg(directory)
            .arg(&app_stage)
            .spawn()
            .map_err(|e| {
                let _ = std::fs::remove_file(&app_stage);
                let _ = std::fs::remove_dir_all(&cache);
                format!("Could not start the update helper: {e}")
            })?;
        app.exit(0);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{extract_portable_update, validate_portable_entry};
    use std::{io::Write, path::PathBuf};
    use zip::{write::SimpleFileOptions, ZipWriter};

    #[test]
    fn detects_installer_and_portable_update_channels() {
        use tauri::utils::config::BundleType;
        assert_eq!(
            super::update_channel_for_bundle(Some(BundleType::Msi)),
            "installer"
        );
        assert_eq!(
            super::update_channel_for_bundle(Some(BundleType::Nsis)),
            "installer"
        );
        assert_eq!(super::update_channel_for_bundle(None), "portable");
    }

    fn archive(entries: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, bytes) in entries {
            writer
                .start_file(name, SimpleFileOptions::default())
                .unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    fn paths() -> (PathBuf, PathBuf) {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "flickvert-update-test-{}-{nonce}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        (
            root.join("FlickVert.update.exe"),
            root.join("FlickVertUpdater.exe"),
        )
    }

    #[test]
    fn rejects_paths_duplicates_missing_files_and_unexpected_payloads_before_staging() {
        for entries in [
            vec![
                ("../FlickVert.exe", b"app".as_slice()),
                ("FlickVertUpdater.exe", b"helper"),
            ],
            vec![("FlickVertUpdater.exe", b"helper".as_slice())],
            vec![
                ("FlickVert.exe", b"app".as_slice()),
                ("FlickVertUpdater.exe", b"helper"),
                ("other.exe", b"extra"),
            ],
        ] {
            let (app, helper) = paths();
            assert!(extract_portable_update(&archive(&entries), &app, &helper).is_err());
            assert!(!app.exists() && !helper.exists());
            let _ = std::fs::remove_dir_all(app.parent().unwrap());
        }
        let mut found = std::collections::HashSet::new();
        assert!(validate_portable_entry("FlickVert.exe", false, &mut found).is_ok());
        assert!(validate_portable_entry("FlickVert.exe", false, &mut found).is_err());
    }

    #[test]
    fn stages_only_the_two_expected_executables() {
        let (app, helper) = paths();
        let bytes = archive(&[
            ("FlickVert.exe", b"app"),
            ("FlickVertUpdater.exe", b"helper"),
            ("INSTALL.txt", b"readme"),
        ]);
        extract_portable_update(&bytes, &app, &helper).unwrap();
        assert_eq!(std::fs::read(&app).unwrap(), b"app");
        assert_eq!(std::fs::read(&helper).unwrap(), b"helper");
        let _ = std::fs::remove_dir_all(app.parent().unwrap());
    }

    #[test]
    fn never_overwrites_preexisting_staging_paths() {
        let (app, helper) = paths();
        std::fs::write(&app, b"keep app").unwrap();
        std::fs::write(&helper, b"keep helper").unwrap();
        let bytes = archive(&[
            ("FlickVert.exe", b"app"),
            ("FlickVertUpdater.exe", b"helper"),
        ]);
        assert!(extract_portable_update(&bytes, &app, &helper).is_err());
        assert_eq!(std::fs::read(&app).unwrap(), b"keep app");
        assert_eq!(std::fs::read(&helper).unwrap(), b"keep helper");
        let _ = std::fs::remove_dir_all(app.parent().unwrap());
    }
}
