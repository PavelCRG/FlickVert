use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MediaKind {
    Audio,
    Video,
}

#[derive(Clone, Debug)]
pub struct Operation {
    pub id: &'static str,
    pub input_extensions: &'static [&'static str],
    pub output_extensions: &'static [&'static str],
}

const AUDIO: Operation = Operation {
    id: "ffmpeg.audio",
    input_extensions: &["aac", "flac", "m4a", "mp3", "ogg", "opus", "wav"],
    output_extensions: &["aac", "flac", "m4a", "mp3", "ogg", "wav"],
};
const VIDEO: Operation = Operation {
    id: "ffmpeg.video",
    input_extensions: &["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "webm"],
    output_extensions: &["mkv", "mp4", "webm"],
};

pub fn media_kind(extension: &str) -> Option<MediaKind> {
    if AUDIO
        .input_extensions
        .contains(&extension.to_ascii_lowercase().as_str())
    {
        Some(MediaKind::Audio)
    } else if VIDEO
        .input_extensions
        .contains(&extension.to_ascii_lowercase().as_str())
    {
        Some(MediaKind::Video)
    } else {
        None
    }
}

pub fn list_operations(extension: &str, ffmpeg_available: bool) -> Vec<Operation> {
    if !ffmpeg_available {
        return vec![];
    }
    match media_kind(extension) {
        Some(MediaKind::Audio) => vec![AUDIO.clone()],
        Some(MediaKind::Video) => vec![VIDEO.clone()],
        None => vec![],
    }
}

pub fn output_extensions(kind: MediaKind) -> &'static [&'static str] {
    match kind {
        MediaKind::Audio => AUDIO.output_extensions,
        MediaKind::Video => VIDEO.output_extensions,
    }
}

pub fn ffmpeg_args(input: &Path, output: &Path) -> Vec<OsString> {
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i"]
        .into_iter()
        .map(OsString::from)
        .chain([input.as_os_str().to_owned(), output.as_os_str().to_owned()])
        .collect()
}

pub fn find_ffmpeg() -> Option<PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?).find_map(|directory| {
        #[cfg(windows)]
        let candidate = directory.join("ffmpeg.exe");
        #[cfg(not(windows))]
        let candidate = directory.join("ffmpeg");
        candidate.is_file().then_some(candidate)
    })
}

pub fn run(executable: &Path, args: &[OsString]) -> io::Result<Output> {
    Command::new(executable)
        .args(args)
        .stdin(Stdio::null())
        .output()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filters_operations_by_input_and_engine_availability() {
        assert_eq!(list_operations("exe", true).len(), 0);
        assert_eq!(list_operations("mp4", false).len(), 0);
        assert_eq!(list_operations("mp4", true)[0].id, "ffmpeg.video");
        assert_eq!(list_operations("wav", true)[0].id, "ffmpeg.audio");
    }

    #[test]
    fn keeps_paths_with_spaces_as_individual_process_arguments() {
        let args = ffmpeg_args(
            Path::new("C:/My Videos/clip one.mp4"),
            Path::new("C:/My Videos/out file.webm"),
        );
        assert_eq!(args[6], OsString::from("C:/My Videos/clip one.mp4"));
        assert_eq!(args[7], OsString::from("C:/My Videos/out file.webm"));
    }

    #[test]
    fn reports_a_missing_child_executable() {
        let missing = Path::new("flickvert-missing-engine-test.exe");
        assert!(run(missing, &[]).is_err());
    }
}
