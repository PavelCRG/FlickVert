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
    Poppler,
}

#[derive(Clone, Copy, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Engines {
    pub ffmpeg: bool,
    pub pandoc: bool,
    pub imagemagick: bool,
    pub libreoffice: bool,
    pub poppler: bool,
}

const AUDIO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &[
        "aac", "aif", "aiff", "caf", "flac", "m4a", "m4b", "mka", "mp3", "oga", "ogg", "opus",
        "wav", "wma",
    ],
    output_extensions: &["aac", "aiff", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma"],
};
const VIDEO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &[
        "3gp", "avi", "flv", "gif", "m2ts", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "mts", "ogv", "ts",
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
    input_extensions: &["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "heic", "heif", "svg", "tif", "tiff"],
    output_extensions: &["png", "jpg", "webp", "bmp", "heic", "tiff", "avif", "pdf"],
};
const OFFICE_PDF: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &[
        "doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "csv", "html",
        "htm", "txt",
    ],
    output_extensions: &["pdf"],
};
const SPREADSHEET: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &["xls", "xlsx", "ods", "csv"],
    output_extensions: &["xlsx", "ods", "csv"],
};
const SLIDE_IMAGES: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &["ppt", "pptx", "odp"],
    output_extensions: &["png", "jpg"],
};
const PDF: Operation = Operation {
    engine: Engine::Poppler,
    input_extensions: &["pdf"],
    output_extensions: &["png", "jpg", "txt", "md"],
};
const PDF_DOCUMENT: Operation = Operation {
    engine: Engine::Poppler,
    input_extensions: &["pdf"],
    output_extensions: &["docx", "epub"],
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
        (engines.libreoffice, vec![&OFFICE_PDF, &SPREADSHEET]),
        (engines.poppler, vec![&PDF]),
        (engines.poppler && engines.pandoc, vec![&PDF_DOCUMENT]),
        (engines.libreoffice && engines.poppler, vec![&SLIDE_IMAGES]),
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
        poppler: find_executable("pdftoppm").is_some() && find_executable("pdftotext").is_some(),
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

pub fn imagemagick_args(
    input: &Path,
    output: &Path,
    quality: u8,
    width: Option<u32>,
    height: Option<u32>,
) -> Vec<OsString> {
    let mut args = vec![OsString::from(format!("{}[0]", input.to_string_lossy()))];
    if width.is_some() || height.is_some() {
        args.extend([
            OsString::from("-resize"),
            OsString::from(format!("{}x{}>", width.unwrap_or(32768), height.unwrap_or(32768))),
        ]);
    }
    if output.extension().and_then(|value| value.to_str()).is_some_and(|ext| ["jpg", "jpeg", "webp", "avif", "heic"].contains(&ext.to_ascii_lowercase().as_str())) {
        args.extend([OsString::from("-quality"), OsString::from(quality.clamp(40, 100).to_string())]);
    }
    args.push(output.as_os_str().to_owned());
    args
}

pub fn libreoffice_args(input: &Path, output_dir: &Path) -> Vec<OsString> {
    libreoffice_convert_args(input, output_dir, "pdf")
}

pub fn libreoffice_convert_args(input: &Path, output_dir: &Path, format: &str) -> Vec<OsString> {
    ["--headless", "--convert-to", format, "--outdir"]
        .into_iter()
        .map(OsString::from)
        .chain([
            output_dir.as_os_str().to_owned(),
            input.as_os_str().to_owned(),
        ])
        .collect()
}

pub fn windows_terminal_args(directory: &Path) -> [OsString; 2] {
    [OsString::from("-d"), directory.as_os_str().to_owned()]
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
        "mute-video" => &["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
        "extract-audio" => &["-vn", "-c:a", "libmp3lame", "-q:a", "3"],
        "video-thumbnail" => &[],
        "compress-audio" => &["-vn", "-c:a", "aac", "-b:a", "128k"],
        "normalize-audio" => &["-af", "loudnorm", "-c:a", "aac", "-b:a", "192k"],
        _ => return None,
    };
    if action == "video-thumbnail" {
        args.extend(["-ss", "00:00:00", "-i"].into_iter().map(OsString::from));
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

    #[test]
    fn image_magick_receives_quality_only_for_lossy_output_formats() {
        let jpeg = imagemagick_args(Path::new("photo.raw"), Path::new("photo.jpg"), 120, Some(1200), None);
        assert_eq!(jpeg[1..3], [OsString::from("-resize"), OsString::from("1200x32768>")]);
        assert_eq!(jpeg[3..5], [OsString::from("-quality"), OsString::from("100")]);
        let png = imagemagick_args(Path::new("photo.raw"), Path::new("photo.png"), 75, None, None);
        assert_eq!(png, [OsString::from("photo.raw[0]"), OsString::from("photo.png")]);
    }

    #[test]
    fn windows_terminal_arguments_preserve_directory_paths_with_spaces() {
        assert_eq!(
            windows_terminal_args(Path::new("C:/My Files")),
            ["-d", "C:/My Files"].map(OsString::from)
        );
    }
}
