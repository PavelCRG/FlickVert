#![cfg_attr(windows, windows_subsystem = "windows")]

use std::{env, path::PathBuf, process::Command, thread, time::Duration};

fn update(parent_pid: u32, directory: PathBuf, staged: PathBuf) -> Result<(), String> {
    let directory = directory.canonicalize().map_err(|e| e.to_string())?;
    let staged = staged.canonicalize().map_err(|e| e.to_string())?;
    let stage_name = staged
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    if staged.parent() != Some(directory.as_path())
        || !stage_name.starts_with(&format!("FlickVert-{parent_pid}-"))
        || !stage_name.ends_with(".update.exe")
    {
        return Err("Invalid staged update path".into());
    }
    let executable = directory.join("FlickVert.exe");
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let backup = directory.join(format!("FlickVert-{parent_pid}-{suffix}.previous.exe"));
    for _ in 0..120 {
        match std::fs::rename(&executable, &backup) {
            Ok(()) => break,
            Err(_) => thread::sleep(Duration::from_millis(250)),
        }
    }
    if !backup.exists() {
        return Err("FlickVert is still running; the update was not applied".into());
    }
    if let Err(error) = std::fs::rename(&staged, &executable) {
        let _ = std::fs::rename(&backup, &executable);
        return Err(format!("Could not replace FlickVert.exe: {error}"));
    }
    if let Err(error) = Command::new(&executable).current_dir(&directory).spawn() {
        let failed = directory.join(format!("FlickVert-{parent_pid}-{suffix}.failed.exe"));
        if std::fs::rename(&executable, &failed).is_ok() {
            let _ = std::fs::rename(&backup, &executable);
        }
        return Err(format!("Could not restart FlickVert: {error}"));
    }
    let _ = std::fs::remove_file(backup);
    Ok(())
}

fn main() {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() != 3 {
        eprintln!("Invalid updater arguments");
        std::process::exit(2);
    }
    let Ok(parent_pid) = args[0].to_string_lossy().parse::<u32>() else {
        eprintln!("Invalid parent process id");
        std::process::exit(2);
    };
    let directory = PathBuf::from(&args[1]);
    let staged = PathBuf::from(&args[2]);
    if let Err(error) = update(parent_pid, directory, staged) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
