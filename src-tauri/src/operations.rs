use std::{
    ffi::OsString,
    io,
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
};

#[derive(Clone, Debug)]
pub struct Operation {
    pub engine: Engine,
    pub input_extensions: &'static [&'static str],
    pub output_extensions: &'static [&'static str],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Engine {
    Ffmpeg,
    Pandoc,
    ImageMagick,
    LibreOffice,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Engines {
    pub ffmpeg: bool,
    pub pandoc: bool,
    pub imagemagick: bool,
    pub libreoffice: bool,
}

const AUDIO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &[
        "aac", "aif", "aiff", "caf", "flac", "m4a", "m4b", "mka", "mp3", "oga", "ogg", "opus",
        "wav", "wma",
    ],
    output_extensions: &["aac", "aiff", "flac", "m4a", "mp3", "ogg", "wav", "wma"],
};
const VIDEO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &[
        "3gp", "avi", "flv", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "mts", "ogv", "ts",
        "vob", "webm", "wmv",
    ],
    output_extensions: &["avi", "gif", "mkv", "mov", "mp3", "mp4", "webm", "wmv"],
};
const SUBTITLE: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &["ass", "srt", "ssa", "vtt"],
    output_extensions: &["ass", "srt", "vtt"],
};
const DOCUMENT: Operation = Operation {
    engine: Engine::Pandoc,
    input_extensions: &[
        "docx", "odt", "md", "markdown", "html", "htm", "epub", "rtf", "txt", "rst", "tex",
    ],
    output_extensions: &[
        "docx", "odt", "md", "html", "epub", "rtf", "txt", "rst", "tex",
    ],
};
const RAW: Operation = Operation {
    engine: Engine::ImageMagick,
    input_extensions: &["cr2", "cr3", "nef", "arw", "raf", "dng", "orf", "rw2"],
    output_extensions: &["png", "jpg", "tiff"],
};
const IMAGE: Operation = Operation {
    engine: Engine::ImageMagick,
    input_extensions: &["avif", "heic", "heif", "svg", "tif", "tiff"],
    output_extensions: &["png", "jpg", "tiff", "webp"],
};
const OFFICE_PDF: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &[
        "doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "csv", "html",
        "htm", "txt",
    ],
    output_extensions: &["pdf"],
};

pub fn is_audio_input(extension: &str) -> bool {
    AUDIO
        .input_extensions
        .contains(&extension.to_ascii_lowercase().as_str())
}

pub fn is_video_input(extension: &str) -> bool {
    VIDEO
        .input_extensions
        .contains(&extension.to_ascii_lowercase().as_str())
}

pub fn operations_for(extension: &str, engines: Engines) -> Vec<Operation> {
    let extension = extension.to_ascii_lowercase();
    [
        (engines.ffmpeg, [&AUDIO, &VIDEO, &SUBTITLE][..].to_vec()),
        (engines.pandoc, vec![&DOCUMENT]),
        (engines.imagemagick, vec![&RAW, &IMAGE]),
        (engines.libreoffice, vec![&OFFICE_PDF]),
    ]
    .into_iter()
    .filter(|(available, _)| *available)
    .flat_map(|(_, operations)| operations)
    .filter(|operation| operation.input_extensions.contains(&extension.as_str()))
    .map(Clone::clone)
    .collect()
}

pub fn operation_for(
    extension: &str,
    output_extension: &str,
    engines: Engines,
) -> Option<Operation> {
    operations_for(extension, engines)
        .into_iter()
        .find(|operation| operation.output_extensions.contains(&output_extension))
}

pub fn output_extensions_for(extension: &str, engines: Engines) -> Vec<String> {
    let mut outputs = Vec::new();
    for operation in operations_for(extension, engines) {
        for output in operation.output_extensions {
            if !outputs.iter().any(|existing| existing == output) {
                outputs.push((*output).to_owned());
            }
        }
    }
    outputs
}

pub fn all_engine_status() -> Engines {
    Engines {
        ffmpeg: find_executable("ffmpeg").is_some(),
        pandoc: find_executable("pandoc").is_some(),
        imagemagick: find_executable("magick").is_some(),
        libreoffice: find_executable("soffice").is_some(),
    }
}

pub fn find_executable(name: &str) -> Option<PathBuf> {
    let names: &[&str] = if cfg!(windows) { &[".exe", ""] } else { &[""] };
    std::env::split_paths(&std::env::var_os("PATH")?).find_map(|directory| {
        names
            .iter()
            .map(|suffix| directory.join(format!("{name}{suffix}")))
            .find(|candidate| candidate.is_file())
    })
}

pub fn pandoc_args(input: &Path, output: &Path) -> Vec<OsString> {
    [
        OsString::from("--output"),
        output.as_os_str().to_owned(),
        input.as_os_str().to_owned(),
    ]
    .to_vec()
}

pub fn imagemagick_args(input: &Path, output: &Path) -> Vec<OsString> {
    [input.as_os_str().to_owned(), output.as_os_str().to_owned()].to_vec()
}

pub fn libreoffice_args(input: &Path, output_dir: &Path) -> Vec<OsString> {
    ["--headless", "--convert-to", "pdf", "--outdir"]
        .into_iter()
        .map(OsString::from)
        .chain([
            output_dir.as_os_str().to_owned(),
            input.as_os_str().to_owned(),
        ])
        .collect()
}

pub fn ffmpeg_args(input: &Path, output: &Path) -> Vec<OsString> {
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i"]
        .into_iter()
        .map(OsString::from)
        .chain([input.as_os_str().to_owned(), output.as_os_str().to_owned()])
        .collect()
}

pub fn ffmpeg_tool_args(action: &str, input: &Path, output: &Path) -> Option<Vec<OsString>> {
    let mut args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
        .into_iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    let options: &[&str] = match action {
        "compress-video" => &[
            "-c:v", "libx264", "-crf", "28", "-preset", "medium", "-c:a", "aac", "-b:a", "128k",
        ],
        "mute-video" => &["-c:v", "copy", "-an"],
        "extract-audio" => &["-vn", "-c:a", "libmp3lame", "-q:a", "3"],
        "video-thumbnail" => &[],
        "compress-audio" => &["-vn", "-c:a", "aac", "-b:a", "128k"],
        "normalize-audio" => &["-af", "loudnorm", "-c:a", "aac", "-b:a", "192k"],
        _ => return None,
    };
    if action == "video-thumbnail" {
        args.extend(["-ss", "00:00:01", "-i"].into_iter().map(OsString::from));
        args.push(input.as_os_str().to_owned());
        args.extend(["-frames:v", "1"].into_iter().map(OsString::from));
    } else {
        args.push(OsString::from("-i"));
        args.push(input.as_os_str().to_owned());
        args.extend(options.iter().map(OsString::from));
    }
    args.push(output.as_os_str().to_owned());
    Some(args)
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
        let engines = Engines {
            ffmpeg: true,
            ..Engines::default()
        };
        assert!(operation_for("exe", "mp4", engines).is_none());
        assert!(operation_for("mp4", "mp4", Engines::default()).is_none());
        assert_eq!(
            operation_for("mp4", "webm", engines).unwrap().engine,
            Engine::Ffmpeg
        );
        assert_eq!(
            operation_for("wav", "mp3", engines).unwrap().engine,
            Engine::Ffmpeg
        );
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

    #[test]
    fn exposes_only_operations_with_their_required_engine() {
        let engines = Engines {
            pandoc: true,
            ..Engines::default()
        };
        assert_eq!(
            operation_for("DOCX", "md", engines).unwrap().engine,
            Engine::Pandoc
        );
        assert!(operation_for("docx", "md", Engines::default()).is_none());
        assert_eq!(
            operation_for(
                "cr3",
                "png",
                Engines {
                    imagemagick: true,
                    ..Engines::default()
                }
            )
            .unwrap()
            .engine,
            Engine::ImageMagick
        );
        assert!(operation_for("exe", "md", engines).is_none());
    }

    #[test]
    fn pandoc_arguments_keep_input_and_output_paths_separate() {
        let args = pandoc_args(
            Path::new("C:/My Docs/input file.docx"),
            Path::new("C:/My Docs/out file.odt"),
        );
        assert_eq!(
            args,
            [
                "--output",
                "C:/My Docs/out file.odt",
                "C:/My Docs/input file.docx"
            ]
            .map(OsString::from)
        );
    }

    #[test]
    fn offers_office_to_pdf_only_when_libreoffice_is_available() {
        let engines = Engines {
            libreoffice: true,
            ..Engines::default()
        };
        let operation = operation_for("xlsx", "pdf", engines).unwrap();
        assert_eq!(operation.engine, Engine::LibreOffice);
        assert_eq!(operation.output_extensions, ["pdf"]);
        assert!(operation_for("xlsx", "pdf", Engines::default()).is_none());
    }

    #[test]
    fn libreoffice_arguments_keep_input_and_output_directory_separate() {
        let args = libreoffice_args(
            Path::new("C:/My Docs/book one.xlsx"),
            Path::new("C:/cache/job 1"),
        );
        assert_eq!(
            args,
            [
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                "C:/cache/job 1",
                "C:/My Docs/book one.xlsx"
            ]
            .map(OsString::from)
            .to_vec()
        );
    }
}
