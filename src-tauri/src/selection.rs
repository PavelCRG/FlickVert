use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
pub fn foreground_window() -> isize {
    unsafe extern "system" {
        fn GetForegroundWindow() -> isize;
    }
    unsafe { GetForegroundWindow() }
}

#[cfg(not(windows))]
pub fn foreground_window() -> isize {
    0
}

#[cfg(windows)]
pub fn selected_paths(foreground: isize) -> Vec<String> {
    // shortcut: PowerShell's Shell.Application COM bridge adds startup latency; use native COM if it becomes noticeable.
    let script = format!(
        "$ErrorActionPreference='Stop'; $paths=New-Object 'System.Collections.Generic.List[string]'; try {{ $shell=New-Object -ComObject Shell.Application; foreach ($window in $shell.Windows()) {{ try {{ if ([long]$window.HWND -eq {foreground}) {{ foreach ($item in $window.Document.SelectedItems()) {{ $paths.Add($item.Path) }}; break }} }} catch {{}} }} }} catch {{}}; if ($paths.Count -eq 0) {{ try {{ foreach ($path in (Get-Clipboard -Format FileDropList)) {{ $paths.Add($path) }} }} catch {{}} }}; $stream=[Console]::OpenStandardOutput(); foreach ($path in $paths) {{ $bytes=[Text.Encoding]::UTF8.GetBytes($path + [char]0); $stream.Write($bytes,0,$bytes.Length) }}"
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Sta", "-Command", &script])
        .creation_flags(0x0800_0000)
        .output();
    output
        .ok()
        .filter(|result| result.status.success())
        .map(|result| {
            result
                .stdout
                .split(|byte| *byte == 0)
                .filter(|bytes| !bytes.is_empty())
                .filter_map(|bytes| String::from_utf8(bytes.to_vec()).ok())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
pub fn selected_paths(_: isize) -> Vec<String> {
    let script = r#"tell application "Finder"
set foundPaths to ""
repeat with selectedItem in selection
set foundPaths to foundPaths & (POSIX path of (selectedItem as alias)) & linefeed
end repeat
return foundPaths
end tell"#;
    let output = Command::new("osascript").args(["-e", script]).output();
    output
        .ok()
        .filter(|result| result.status.success())
        .map(|result| {
            String::from_utf8_lossy(&result.stdout)
                .lines()
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn selected_paths(_: isize) -> Vec<String> {
    Vec::new()
}
