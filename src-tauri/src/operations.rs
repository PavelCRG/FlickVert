use std::{
    collections::{HashMap, HashSet},
    ffi::OsString,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        OnceLock,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct Operation {
    pub engine: Engine,
    pub input_extensions: &'static [&'static str],
    pub output_extensions: &'static [&'static str],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Engine {
    BuiltIn,
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

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStream {
    pub kind: String,
    pub codec: Option<String>,
    pub language: Option<String>,
    pub track_index: usize,
}

pub fn parse_media_streams(listing: &str) -> Option<Vec<MediaStream>> {
    let root: serde_json::Value = serde_json::from_str(listing).ok()?;
    let streams = root.get("streams")?.as_array()?;
    let mut indices = HashMap::<String, usize>::new();
    Some(streams.iter().filter_map(|stream| {
        let kind = stream.get("codec_type")?.as_str()?;
        if !["video", "audio", "subtitle"].contains(&kind) { return None; }
        let track_index = indices.entry(kind.to_owned()).or_default();
        let current = *track_index;
        *track_index += 1;
        Some(MediaStream {
            kind: kind.to_owned(),
            codec: stream.get("codec_name").and_then(serde_json::Value::as_str).map(str::to_owned),
            language: stream.get("tags").and_then(|tags| tags.get("language")).and_then(serde_json::Value::as_str).map(|value| value.chars().take(32).collect()),
            track_index: current,
        })
    }).collect())
}

pub fn media_streams(input: &Path) -> Option<Vec<MediaStream>> {
    let ffprobe = find_executable("ffprobe")?;
    let args = ["-v", "error", "-show_entries", "stream=codec_type,codec_name:stream_tags=language", "-of", "json"]
        .into_iter().map(OsString::from).chain([input.as_os_str().to_owned()]).collect::<Vec<_>>();
    let output = run(&ffprobe, &args).ok()?;
    output.status.success().then(|| parse_media_streams(&String::from_utf8_lossy(&output.stdout))).flatten()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversionCatalogItem {
    pub category: &'static str,
    pub input_extensions: &'static [&'static str],
    pub output_extensions: &'static [&'static str],
    pub engine: &'static str,
    pub available: bool,
    pub limitation: Option<&'static str>,
}

const AUDIO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &[
        "aac", "aif", "aiff", "caf", "flac", "m4a", "m4b", "mka", "mp3", "oga", "ogg", "opus",
        "wav", "wma",
    ],
    output_extensions: &[
        "aac", "aiff", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma",
    ],
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
    output_extensions: &["ass", "srt", "ssa", "vtt"],
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
    engine: Engine::BuiltIn,
    input_extensions: &[
        "png", "jpg", "jpeg", "webp", "gif", "bmp", "heic", "heif", "tif", "tiff", "svg",
    ],
    output_extensions: &["png", "jpg", "webp", "bmp", "tiff", "avif", "heic", "pdf"],
};
const RASTER_PNG: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &["png", "jpg", "jpeg", "webp", "bmp", "gif"],
    output_extensions: &["png"],
};
const RASTER_JPEG: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &["jpg", "jpeg"],
    output_extensions: &["jpg"],
};
const GIF_VIDEO: Operation = Operation {
    engine: Engine::Ffmpeg,
    input_extensions: &["gif"],
    output_extensions: &["mp4", "webm"],
};
const OFFICE_PDF: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &[
        "doc", "docx", "odt", "rtf", "xls", "xlsx", "ods", "ppt", "pptx", "odp", "csv", "tsv", "html",
        "htm", "txt",
    ],
    output_extensions: &["pdf"],
};
const SPREADSHEET: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &["xls", "xlsx", "ods", "csv", "tsv"],
    output_extensions: &["xlsx", "ods", "csv", "tsv"],
};
const DELIMITED: Operation = Operation {
    engine: Engine::BuiltIn,
    input_extensions: &["csv", "tsv"],
    output_extensions: &["csv", "tsv", "xlsx"],
};
const SPREADSHEET_READ: Operation = Operation {
    engine: Engine::BuiltIn,
    input_extensions: &["xlsx"],
    output_extensions: &["csv", "tsv"],
};
const PDF_TEXT: Operation = Operation {
    engine: Engine::BuiltIn,
    input_extensions: &["pdf"],
    output_extensions: &["txt", "md"],
};
const MARKDOWN: Operation = Operation {
    engine: Engine::BuiltIn,
    input_extensions: &["md", "markdown", "txt"],
    output_extensions: &["md", "markdown", "txt", "html", "htm"],
};
const HTML_TEXT: Operation = Operation {
    engine: Engine::BuiltIn,
    input_extensions: &["html", "htm"],
    output_extensions: &["txt", "md", "markdown"],
};
const SLIDE_IMAGES: Operation = Operation {
    engine: Engine::LibreOffice,
    input_extensions: &["ppt", "pptx", "odp"],
    output_extensions: &["png", "jpg"],
};
const PDF: Operation = Operation {
    engine: Engine::Poppler,
    input_extensions: &["pdf"],
    output_extensions: &["png", "jpg"],
};
const PDF_DOCUMENT: Operation = Operation {
    engine: Engine::Poppler,
    input_extensions: &["pdf"],
    output_extensions: &["docx", "epub"],
};

const QUICK_IMAGE_INPUTS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
const QUICK_IMAGE_OUTPUTS: &[&str] = &["png", "jpg", "webp", "bmp", "tiff", "avif", "heic", "pdf"];

pub fn quick_image_formats(extension: &str) -> Option<Vec<String>> {
    QUICK_IMAGE_INPUTS
        .contains(&extension.to_ascii_lowercase().as_str())
        .then(|| {
            QUICK_IMAGE_OUTPUTS
                .iter()
                .map(|format| (*format).to_owned())
                .collect()
        })
}

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

pub fn is_subtitle_input(extension: &str) -> bool {
    SUBTITLE.input_extensions.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn is_delimited_input(extension: &str) -> bool {
    DELIMITED.input_extensions.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn is_spreadsheet_input(extension: &str) -> bool {
    SPREADSHEET_READ.input_extensions.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn is_pdf_text_conversion(input_extension: &str, output_extension: &str) -> bool {
    PDF_TEXT.input_extensions.contains(&input_extension.to_ascii_lowercase().as_str())
        && PDF_TEXT.output_extensions.contains(&output_extension.to_ascii_lowercase().as_str())
}

pub fn is_native_document_conversion(input_extension: &str, output_extension: &str) -> bool {
    let input = input_extension.to_ascii_lowercase();
    let output = output_extension.to_ascii_lowercase();
    [&MARKDOWN, &HTML_TEXT].iter().any(|operation| {
        operation.input_extensions.contains(&input.as_str())
            && operation.output_extensions.contains(&output.as_str())
    })
}

pub fn operations_for(extension: &str, engines: Engines) -> Vec<Operation> {
    let extension = extension.to_ascii_lowercase();
    catalog_operations(engines)
        .into_iter()
        .filter(|(operation, _, _, available)| {
            *available && operation.input_extensions.contains(&extension.as_str())
        })
        .map(|(operation, _, _, _)| (*operation).clone())
        .collect()
}

fn catalog_operations(
    engines: Engines,
) -> [(&'static Operation, &'static str, &'static str, bool); 19] {
    [
        (&IMAGE, "Images and PDFs", "Built in", true),
        (&DELIMITED, "Documents", "Built in", true),
        (&SPREADSHEET_READ, "Documents", "Built in", true),
        (&PDF_TEXT, "PDF documents", "Built in", true),
        (&MARKDOWN, "Documents", "Built in", true),
        (&HTML_TEXT, "Documents", "Built in", true),
        (&AUDIO, "Audio and video", "FFmpeg", engines.ffmpeg),
        (&VIDEO, "Audio and video", "FFmpeg", engines.ffmpeg),
        (&SUBTITLE, "Audio and video", "FFmpeg", engines.ffmpeg),
        (&RASTER_PNG, "Images and PDFs", "FFmpeg", engines.ffmpeg),
        (&RASTER_JPEG, "Images and PDFs", "FFmpeg", engines.ffmpeg),
        (&GIF_VIDEO, "Images and PDFs", "FFmpeg", engines.ffmpeg),
        (&DOCUMENT, "Documents", "Pandoc", engines.pandoc),
        (&RAW, "Images and PDFs", "ImageMagick", engines.imagemagick),
        (&OFFICE_PDF, "Documents", "LibreOffice", engines.libreoffice),
        (
            &SPREADSHEET,
            "Documents",
            "LibreOffice",
            engines.libreoffice,
        ),
        (
            &SLIDE_IMAGES,
            "Documents",
            "LibreOffice + Poppler",
            engines.libreoffice && engines.poppler,
        ),
        (&PDF, "PDF documents", "Poppler", engines.poppler),
        (
            &PDF_DOCUMENT,
            "PDF documents",
            "Poppler + Pandoc",
            engines.poppler && engines.pandoc,
        ),
    ]
}

pub fn conversion_catalog(engines: Engines) -> Vec<ConversionCatalogItem> {
    let mut items = vec![ConversionCatalogItem {
        category: "Images and PDFs",
        input_extensions: QUICK_IMAGE_INPUTS,
        output_extensions: QUICK_IMAGE_OUTPUTS,
        engine: "Built in",
        available: true,
        limitation: None,
    }];
    items.extend(catalog_operations(engines).into_iter().map(
        |(operation, category, engine, available)| ConversionCatalogItem {
            category,
            input_extensions: operation.input_extensions,
            output_extensions: operation.output_extensions,
            engine,
            available,
            limitation: if std::ptr::eq(operation, &SPREADSHEET_READ) {
                Some("Built-in XLSX only; one sheet, 2,000,000 cells, and 128 MiB maximum.")
            } else if std::ptr::eq(operation, &PDF_TEXT) {
                Some("Extracts selectable text only; 128 MiB and 10,000 pages maximum.")
            } else if std::ptr::eq(operation, &MARKDOWN) || std::ptr::eq(operation, &HTML_TEXT) {
                Some("UTF-8 Markdown/TXT/HTML text conversions; 4 MiB HTML and 16 MiB other input limits; raw HTML and Office layout are not preserved; 128 MiB output limit.")
            } else {
                None
            },
        },
    ));
    items
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

pub fn supported_video_codecs(encoder_listing: &str, muxer_listing: &str) -> Vec<&'static str> {
    let has_encoder = |media, encoder| {
        encoder_listing.lines().any(|line| {
            let mut fields = line.split_whitespace();
            fields.next().is_some_and(|flags| flags.starts_with(media))
                && fields.next() == Some(encoder)
        })
    };
    let has_muxer = |muxer| {
        muxer_listing.lines().any(|line| {
            let mut fields = line.split_whitespace();
            fields.next().is_some_and(|flags| flags.starts_with('E'))
                && fields
                    .next()
                    .is_some_and(|names| names.split(',').any(|name| name == muxer))
        })
    };
    [("h264", "libx264", "mp4"), ("hevc", "libx265", "matroska")]
        .into_iter()
        .filter_map(|(codec, encoder, muxer)| {
            (has_encoder('V', encoder) && has_encoder('A', "aac") && has_muxer(muxer))
                .then_some(codec)
        })
        .collect()
}

pub fn available_video_codecs() -> Vec<&'static str> {
    static CODECS: OnceLock<Vec<&'static str>> = OnceLock::new();
    CODECS
        .get_or_init(|| {
            let Some(ffmpeg) = find_executable("ffmpeg") else {
                return Vec::new();
            };
            let listing = |option| {
                let args = ["-hide_banner", option].map(OsString::from);
                let output = run(&ffmpeg, &args).ok()?;
                output.status.success().then(|| {
                    format!(
                        "{}\n{}",
                        String::from_utf8_lossy(&output.stdout),
                        String::from_utf8_lossy(&output.stderr)
                    )
                })
            };
            let (Some(encoders), Some(muxers)) = (listing("-encoders"), listing("-muxers")) else {
                return Vec::new();
            };
            supported_video_codecs(&encoders, &muxers)
        })
        .clone()
}

pub fn supported_audio_formats(encoder_listing: &str, muxer_listing: &str) -> Vec<&'static str> {
    let has_encoder = |encoder| {
        encoder_listing.lines().any(|line| {
            let mut fields = line.split_whitespace();
            fields.next().is_some_and(|flags| flags.starts_with('A'))
                && fields.next() == Some(encoder)
        })
    };
    let has_muxer = |muxer| {
        muxer_listing.lines().any(|line| {
            let mut fields = line.split_whitespace();
            fields.next().is_some_and(|flags| flags.starts_with('E'))
                && fields.next().is_some_and(|names| names.split(',').any(|name| name == muxer))
        })
    };
    [("mp3", "libmp3lame", "mp3"), ("m4a", "aac", "ipod"), ("opus", "libopus", "opus"), ("flac", "flac", "flac"), ("wav", "pcm_s16le", "wav")]
        .into_iter()
        .filter_map(|(format, encoder, muxer)| (has_encoder(encoder) && has_muxer(muxer)).then_some(format))
        .collect()
}

pub fn available_audio_formats() -> Vec<&'static str> {
    static FORMATS: OnceLock<Vec<&'static str>> = OnceLock::new();
    FORMATS.get_or_init(|| {
        let Some(ffmpeg) = find_executable("ffmpeg") else { return Vec::new() };
        let listing = |option| {
            let output = run(&ffmpeg, &[OsString::from("-hide_banner"), OsString::from(option)]).ok()?;
            output.status.success().then(|| format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr)))
        };
        let (Some(encoders), Some(muxers)) = (listing("-encoders"), listing("-muxers")) else { return Vec::new() };
        supported_audio_formats(&encoders, &muxers)
    }).clone()
}

pub fn supports_video_scaling(filter_listing: &str) -> bool {
    filter_listing.lines().any(|line| {
        let mut fields = line.split_whitespace();
        fields.next();
        fields.next() == Some("scale") && fields.next() == Some("V->V")
    })
}

pub fn video_scaling_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    *AVAILABLE.get_or_init(|| {
        let Some(ffmpeg) = find_executable("ffmpeg") else {
            return false;
        };
        let args = ["-hide_banner", "-filters"].map(OsString::from);
        let Ok(output) = run(&ffmpeg, &args) else {
            return false;
        };
        if !output.status.success() {
            return false;
        }
        let listing = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        supports_video_scaling(&listing)
    })
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

pub fn has_audio_stream(input: &Path) -> Option<bool> {
    let ffprobe = find_executable("ffprobe")?;
    let args = ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0"]
        .into_iter()
        .map(OsString::from)
        .chain([input.as_os_str().to_owned()])
        .collect::<Vec<_>>();
    let result = run(&ffprobe, &args).ok()?;
    result.status.success().then(|| has_audio_stream_in_listing(&String::from_utf8_lossy(&result.stdout)))
}

fn has_audio_stream_in_listing(listing: &str) -> bool {
    listing.lines().any(|line| line.trim().eq_ignore_ascii_case("audio"))
}

pub fn pandoc_args(input: &Path, output: &Path) -> Vec<OsString> {
    [
        OsString::from("--output"),
        output.as_os_str().to_owned(),
        input.as_os_str().to_owned(),
    ]
    .to_vec()
}

const MAX_PDF_SPLIT_PAGES: usize = 10_000;

pub fn valid_pdf_page_numbers(pages: &[u32], page_count: u32) -> bool {
    page_count > 0 && !pages.is_empty() && pages.len() <= MAX_PDF_SPLIT_PAGES && pages.iter().all(|page| *page > 0 && *page <= page_count) && pages.iter().copied().collect::<HashSet<_>>().len() == pages.len()
}

pub fn valid_pdf_page_order(pages: &[u32], page_count: u32) -> bool {
    page_count > 0 && page_count as usize <= MAX_PDF_SPLIT_PAGES && pages.len() == page_count as usize
        && pages.iter().all(|page| *page > 0 && *page <= page_count)
        && pages.iter().copied().collect::<HashSet<_>>().len() == pages.len()
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
            OsString::from(format!(
                "{}x{}>",
                width.unwrap_or(32768),
                height.unwrap_or(32768)
            )),
        ]);
    }
    if output
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|ext| {
            ["jpg", "jpeg", "webp", "avif", "heic"].contains(&ext.to_ascii_lowercase().as_str())
        })
    {
        args.extend([
            OsString::from("-quality"),
            OsString::from(quality.clamp(40, 100).to_string()),
        ]);
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

pub fn spreadsheet_convert_args(input: &Path, output_dir: &Path, format: &str) -> Vec<OsString> {
    let format = if format == "tsv" { "tsv:Text - txt - csv (StarCalc):9,34,76,1" } else { format };
    libreoffice_convert_args(input, output_dir, format)
}

pub fn windows_terminal_args(directory: &Path) -> [OsString; 2] {
    [OsString::from("-d"), directory.as_os_str().to_owned()]
}

pub fn selected_item_directory(path: &Path) -> Option<&Path> {
    if path.is_dir() { Some(path) } else { path.parent() }
}

pub fn powershell_path_literal(path: &str) -> String {
    format!("'{}'", path.replace('\'', "''"))
}

pub fn powershell_location_command(path: &str) -> String {
    format!("Set-Location -LiteralPath {}", powershell_path_literal(path))
}

pub fn ffmpeg_args(input: &Path, output: &Path) -> Vec<OsString> {
    ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i"]
        .into_iter()
        .map(OsString::from)
        .chain([input.as_os_str().to_owned(), output.as_os_str().to_owned()])
        .collect()
}

pub fn subtitle_ffmpeg_args(input: &Path, output: &Path, output_extension: &str) -> Option<Vec<OsString>> {
    if !is_subtitle_input(input.extension()?.to_str()?)
        || !output.extension()?.to_str()?.eq_ignore_ascii_case(output_extension) {
        return None;
    }
    let encoder = match output_extension.to_ascii_lowercase().as_str() {
        "ass" | "ssa" => "ass",
        "srt" => "subrip",
        "vtt" => "webvtt",
        _ => return None,
    };
    let mut args = ffmpeg_args(input, output);
    let output = args.pop()?;
    args.extend([OsString::from("-map"), OsString::from("0:s:0"), OsString::from("-c:s"), OsString::from(encoder), output]);
    Some(args)
}

pub fn ffmpeg_image_args(
    input: &Path,
    output: &Path,
    quality: u8,
    width: Option<u32>,
    height: Option<u32>,
) -> Vec<OsString> {
    let mut args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i"]
        .into_iter()
        .map(OsString::from)
        .chain([input.as_os_str().to_owned()])
        .collect::<Vec<_>>();
    args.extend([OsString::from("-frames:v"), OsString::from("1")]);
    if width.is_some() || height.is_some() {
        let width = width.unwrap_or(32768).clamp(1, 32768);
        let height = height.unwrap_or(32768).clamp(1, 32768);
        args.extend([
            OsString::from("-vf"),
            OsString::from(format!(
                "scale=w='min(iw,{width})':h='min(ih,{height})':force_original_aspect_ratio=decrease"
            )),
        ]);
    }
    match output.extension().and_then(|value| value.to_str()) {
        Some("jpg") => {
            let quality = quality.clamp(40, 100);
            let qscale = 2 + (u16::from(100 - quality) * 18 / 60) as u8;
            args.extend([OsString::from("-q:v"), OsString::from(qscale.to_string())]);
        }
        Some("png") => args.extend([OsString::from("-compression_level"), OsString::from("6")]),
        _ => {}
    }
    args.push(output.as_os_str().to_owned());
    args
}

pub fn ffmpeg_tool_args(
    video_preset: &str,
    video_codec: &str,
    video_height: Option<u32>,
    trim_range: Option<(u64, u64)>,
    thumbnail_time_us: Option<u64>,
    audio_normalization: Option<(i8, i8)>,
    audio_extraction_format: Option<&str>,
    action: &str,
    input: &Path,
    output: &Path,
) -> Option<Vec<OsString>> {
    ffmpeg_tool_args_with_streams(video_preset, video_codec, video_height, trim_range, thumbnail_time_us, audio_normalization, audio_extraction_format, action, input, output, None, None, None)
}

pub fn ffmpeg_tool_args_with_streams(
    video_preset: &str,
    video_codec: &str,
    video_height: Option<u32>,
    trim_range: Option<(u64, u64)>,
    thumbnail_time_us: Option<u64>,
    audio_normalization: Option<(i8, i8)>,
    audio_extraction_format: Option<&str>,
    action: &str,
    input: &Path,
    output: &Path,
    video_stream_index: Option<usize>,
    audio_stream_index: Option<usize>,
    subtitle_stream_index: Option<usize>,
) -> Option<Vec<OsString>> {
    let mut args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
        .into_iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    let options: &[&str] = match action {
        "compress-video" | "trim-video" => &[],
        "mute-video" => &["-an", "-c:v", "libx264", "-pix_fmt", "yuv420p"],
        "extract-audio" => &[],
        "video-thumbnail" => &[],
        "compress-audio" => &["-vn", "-c:a", "aac", "-b:a", "128k"],
        "normalize-audio" => &["-vn", "-c:a", "aac", "-b:a", "192k"],
        _ => return None,
    };
    if action == "video-thumbnail" {
        args.extend([OsString::from("-ss"), OsString::from(format_seconds(thumbnail_time_us?)), OsString::from("-i")]);
        args.push(input.as_os_str().to_owned());
        args.extend(["-frames:v", "1"].into_iter().map(OsString::from));
    } else {
        if action == "trim-video" {
            let (start_us, end_us) = trim_range?;
            let duration_us = trim_duration_us(start_us, end_us, end_us)?;
            args.extend([OsString::from("-ss"), OsString::from(format_seconds(start_us))]);
            args.push(OsString::from("-i"));
            args.push(input.as_os_str().to_owned());
            args.extend([OsString::from("-map"), OsString::from(format!("0:v:{}", video_stream_index.unwrap_or(0)))]);
            args.extend([OsString::from("-map"), OsString::from(format!("0:a:{}?", audio_stream_index.unwrap_or(0)))]);
            if let Some(index) = subtitle_stream_index {
                args.extend([OsString::from("-map"), OsString::from(format!("0:s:{index}?")), OsString::from("-c:s"), OsString::from("mov_text")]);
            }
            args.extend([OsString::from("-t"), OsString::from(format_seconds(duration_us))]);
            let encoder = match video_codec {
                "h264" => "libx264",
                "hevc" => "libx265",
                _ => return None,
            };
            let (crf, speed, audio_bitrate) = match video_preset {
                "small" => ("32", "medium", "96k"),
                "balanced" => ("28", "medium", "128k"),
                "high" => ("22", "slow", "192k"),
                _ => return None,
            };
            args.extend(["-c:v", encoder, "-crf", crf, "-preset", speed, "-c:a", "aac", "-b:a", audio_bitrate].map(OsString::from));
            args.push(output.as_os_str().to_owned());
            return Some(args);
        }
        args.push(OsString::from("-i"));
        args.push(input.as_os_str().to_owned());
        if action == "normalize-audio" {
            let (target_lufs, true_peak_db) = audio_normalization?;
            if !valid_audio_normalization(target_lufs, true_peak_db) {
                return None;
            }
            args.extend([
                OsString::from("-af"),
                OsString::from(format!("loudnorm=I={target_lufs}:TP={true_peak_db}:LRA=11")),
            ]);
        }
        if action == "extract-audio" {
            args.push(OsString::from("-vn"));
            let options: &[&str] = match audio_extraction_format? {
                "mp3" => &["-c:a", "libmp3lame", "-q:a", "3"],
                "m4a" => &["-c:a", "aac", "-b:a", "192k"],
                "opus" => &["-c:a", "libopus", "-b:a", "128k"],
                "flac" => &["-c:a", "flac"],
                "wav" => &["-c:a", "pcm_s16le"],
                _ => return None,
            };
            args.extend(options.iter().map(OsString::from));
        }
        if action == "compress-video" {
            let encoder = match video_codec {
                "h264" => "libx264",
                "hevc" => "libx265",
                _ => return None,
            };
            let (crf, speed) = match video_preset {
                "small" => ("32", "medium"),
                "balanced" => ("28", "medium"),
                "high" => ("22", "slow"),
                _ => return None,
            };
            args.extend(
                [
                    "-c:v",
                    encoder,
                    "-crf",
                    crf,
                    "-preset",
                    speed,
                    "-c:a",
                    "aac",
                    "-b:a",
                    if video_preset == "small" {
                        "96k"
                    } else if video_preset == "high" {
                        "192k"
                    } else {
                        "128k"
                    },
                ]
                .map(OsString::from),
            );
            if let Some(height) = video_height {
                if ![480, 720, 1080].contains(&height) {
                    return None;
                }
                args.extend([
                    OsString::from("-vf"),
                    OsString::from(format!("scale=-2:min(ih\\,{height})")),
                ]);
            }
        } else if action != "extract-audio" {
            args.extend(options.iter().map(OsString::from));
        }
    }
    args.push(output.as_os_str().to_owned());
    Some(args)
}

pub fn trim_duration_us(start_us: u64, end_us: u64, source_duration_us: u64) -> Option<u64> {
    (start_us < end_us && end_us <= source_duration_us).then(|| end_us - start_us)
}

pub fn valid_video_frame_time_us(time_us: u64, source_duration_us: u64) -> Option<u64> {
    (source_duration_us > 0 && time_us < source_duration_us).then_some(time_us)
}

pub fn valid_audio_normalization(target_lufs: i8, true_peak_db: i8) -> bool {
    (-24..=-14).contains(&target_lufs) && (-9..=-1).contains(&true_peak_db)
}

fn format_seconds(microseconds: u64) -> String {
    format!("{}.{:06}", microseconds / 1_000_000, microseconds % 1_000_000)
}

pub fn run(executable: &Path, args: &[OsString]) -> io::Result<Output> {
    hidden_command(executable)
        .args(args)
        .stdin(Stdio::null())
        .output()
}

pub fn run_cancellable(
    executable: &Path,
    args: &[OsString],
    cancelled: &AtomicBool,
) -> io::Result<Output> {
    run_cancellable_with_progress(executable, args, cancelled, None, |_| {})
}

pub fn run_cancellable_with_progress(
    executable: &Path,
    args: &[OsString],
    cancelled: &AtomicBool,
    duration_us: Option<u64>,
    on_progress: impl FnMut(u8),
) -> io::Result<Output> {
    run_cancellable_with_timeout(executable, args, cancelled, duration_us, Duration::from_secs(6 * 60 * 60), on_progress)
}

fn run_cancellable_with_timeout(
    executable: &Path,
    args: &[OsString],
    cancelled: &AtomicBool,
    duration_us: Option<u64>,
    timeout: Duration,
    mut on_progress: impl FnMut(u8),
) -> io::Result<Output> {
    let mut child = hidden_command(executable)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let (progress_tx, progress_rx) = std::sync::mpsc::channel();
    let stdout_reader = thread::spawn(move || match duration_us {
        Some(duration_us) => read_progress(stdout, duration_us, progress_tx),
        None => read_bounded(stdout),
    });
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    let started = Instant::now();
    let status = loop {
        while let Ok(progress) = progress_rx.try_recv() {
            on_progress(progress);
        }
        if cancelled.load(Ordering::Acquire) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(io::Error::new(
                io::ErrorKind::Interrupted,
                "Operation cancelled",
            ));
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(io::Error::new(io::ErrorKind::TimedOut, "Operation timed out"));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(error);
            }
        }
    };
    let stdout = stdout_reader.join().unwrap_or_default();
    while let Ok(progress) = progress_rx.try_recv() {
        on_progress(progress);
    }
    Ok(Output {
        status,
        stdout,
        stderr: stderr_reader.join().unwrap_or_default(),
    })
}

fn hidden_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

fn progress_percent(out_time_us: u64, duration_us: u64) -> u8 {
    ((out_time_us.saturating_mul(100) / duration_us.max(1)).min(99)) as u8
}

fn read_progress(
    mut reader: impl Read,
    duration_us: u64,
    sender: std::sync::mpsc::Sender<u8>,
) -> Vec<u8> {
    let mut output = Vec::new();
    let mut buffer = [0; 8192];
    let mut line = Vec::with_capacity(32);
    while let Ok(length) = reader.read(&mut buffer) {
        if length == 0 {
            break;
        }
        let remaining = (16_usize * 1024 * 1024).saturating_sub(output.len());
        output.extend_from_slice(&buffer[..length.min(remaining)]);
        for byte in &buffer[..length] {
            if *byte == b'\n' {
                if let Some(value) = line.strip_prefix(b"out_time_us=") {
                    if let Ok(time) = std::str::from_utf8(value).unwrap_or("").trim().parse() {
                        let _ = sender.send(progress_percent(time, duration_us));
                    }
                }
                line.clear();
            } else if line.len() < 64 {
                line.push(*byte);
            }
        }
    }
    output
}

fn read_bounded(mut reader: impl Read) -> Vec<u8> {
    let mut output = Vec::new();
    let mut buffer = [0; 8192];
    while let Ok(length) = reader.read(&mut buffer) {
        if length == 0 {
            break;
        }
        let remaining = (16_usize * 1024 * 1024).saturating_sub(output.len());
        output.extend_from_slice(&buffer[..length.min(remaining)]);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn video_compression_presets_set_codec_resolution_crf_and_aac_bitrate() {
        for (preset, crf, bitrate) in [
            ("small", "32", "96k"),
            ("balanced", "28", "128k"),
            ("high", "22", "192k"),
        ] {
            let args = ffmpeg_tool_args(
                preset,
                "hevc",
                Some(720),
                None,
                None,
                None,
                None,
                "compress-video",
                Path::new("clip.mp4"),
                Path::new("out.mkv"),
            )
            .unwrap();
            assert!(args
                .windows(2)
                .any(|pair| pair == [OsString::from("-crf"), OsString::from(crf)]));
            assert!(args
                .windows(2)
                .any(|pair| pair == [OsString::from("-b:a"), OsString::from(bitrate)]));
            assert!(args
                .windows(2)
                .any(|pair| pair == [OsString::from("-c:v"), OsString::from("libx265")]));
            assert!(args.windows(2).any(|pair| pair
                == [
                    OsString::from("-vf"),
                    OsString::from("scale=-2:min(ih\\,720)")
                ]));
        }
        assert!(ffmpeg_tool_args(
            "balanced",
            "unknown",
            Some(720),
            None,
            None,
            None,
            None,
            "compress-video",
            Path::new("clip.mp4"),
            Path::new("out.mkv")
        )
        .is_none());
        assert!(ffmpeg_tool_args(
            "balanced",
            "h264",
            Some(72000),
            None,
            None,
            None,
            None,
            "compress-video",
            Path::new("clip.mp4"),
            Path::new("out.mp4")
        )
        .is_none());
    }

    #[test]
    fn lists_only_supported_software_video_encoders() {
        let encoders = " V..... libx264 H.264\n A..... libx265 audio-name\n V..... libx265 HEVC\n V..... h264_nvenc NVIDIA hardware\n A..... aac AAC audio\n";
        assert_eq!(supported_video_codecs(encoders, " E mp4 MP4\n"), ["h264"]);
        assert_eq!(
            supported_video_codecs(encoders, " E mp4 MP4\n E matroska,webm Matroska\n"),
            ["h264", "hevc"]
        );
        assert!(supported_video_codecs(
            " V..... h264_nvenc hardware only\n A..... aac AAC audio\n",
            " E mp4 MP4\n"
        )
        .is_empty());
        assert_eq!(
            supported_video_codecs(encoders, " E matroska,webm Matroska\n"),
            ["hevc"]
        );
    }

    #[test]
    fn lists_audio_outputs_only_when_encoder_and_muxer_are_available() {
        let encoders = " A..... libmp3lame MP3\n A..... aac AAC\n A..... libopus Opus\n A..... flac FLAC\n A..... pcm_s16le PCM\n";
        let muxers = " E mp3 MP3\n E ipod iPod MP4\n E opus Ogg Opus\n E flac FLAC\n E wav WAV\n";
        assert_eq!(supported_audio_formats(encoders, muxers), ["mp3", "m4a", "opus", "flac", "wav"]);
        assert_eq!(supported_audio_formats(" A..... aac AAC\n", " E ipod iPod MP4\n"), ["m4a"]);
        assert!(supported_audio_formats(" A..... aac AAC\n", "").is_empty());
    }

    #[test]
    fn exposes_resolution_limits_only_when_scale_filter_is_available() {
        assert!(supports_video_scaling(
            " ..C scale V->V Scale the input video\n"
        ));
        assert!(!supports_video_scaling(
            " ..C aresample A->A Audio resampling\n"
        ));
        assert!(!supports_video_scaling(
            " ..C scale A->A Audio-only filter\n"
        ));
    }

    #[test]
    fn validates_video_trim_against_source_duration() {
        assert_eq!(trim_duration_us(1_000_000, 3_500_000, 3_500_000), Some(2_500_000));
        assert_eq!(trim_duration_us(0, 0, 10_000_000), None);
        assert_eq!(trim_duration_us(4, 3, 10), None);
        assert_eq!(trim_duration_us(0, 11, 10), None);
    }

    #[test]
    fn video_trim_ffmpeg_args_seek_to_start_and_stop_at_validated_duration() {
        let args = ffmpeg_tool_args(
            "balanced",
            "h264",
            None,
            Some((1_250_000, 4_000_000)),
            None,
            None,
            None,
            "trim-video",
            Path::new("clip.mp4"),
            Path::new("trimmed.mp4"),
        )
        .unwrap();
        let strings = args.iter().map(|value| value.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert!(strings.windows(3).any(|values| values == ["-ss", "1.250000", "-i"]));
        assert!(strings.windows(2).any(|values| values == ["-t", "2.750000"]));
        assert_eq!(strings.last().map(String::as_str), Some("trimmed.mp4"));
        assert!(ffmpeg_tool_args("balanced", "h264", None, None, None, None, None, "trim-video", Path::new("clip.mp4"), Path::new("trimmed.mp4")).is_none());
    }

    #[test]
    fn thumbnail_timestamp_must_be_inside_video_duration() {
        assert_eq!(valid_video_frame_time_us(0, 2_000_000), Some(0));
        assert_eq!(valid_video_frame_time_us(1_999_999, 2_000_000), Some(1_999_999));
        assert_eq!(valid_video_frame_time_us(2_000_000, 2_000_000), None);
        assert_eq!(valid_video_frame_time_us(2_000_001, 2_000_000), None);
    }

    #[test]
    fn ffprobe_audio_stream_output_detects_audio_without_matching_video_streams() {
        assert!(has_audio_stream_in_listing("video\naudio\n"));
        assert!(!has_audio_stream_in_listing("video\n"));
        assert!(!has_audio_stream_in_listing("\n"));
    }

    #[test]
    fn ffprobe_stream_listing_keeps_type_codec_language_and_track_order() {
        let listing = r#"{"streams":[{"index":0,"codec_type":"video","codec_name":"h264"},{"index":1,"codec_type":"audio","codec_name":"aac","tags":{"language":"eng"}},{"index":2,"codec_type":"subtitle","codec_name":"subrip","tags":{"language":"rus"}}]}"#;
        let streams = parse_media_streams(listing).unwrap();
        assert_eq!(streams.len(), 3);
        assert_eq!(streams[1].track_index, 0);
        assert_eq!(streams[1].language.as_deref(), Some("eng"));
        assert_eq!(streams[2].track_index, 0);
        assert_eq!(streams[2].codec.as_deref(), Some("subrip"));
    }

    #[test]
    fn video_trim_maps_only_selected_optional_audio_and_subtitle_streams() {
        let args = ffmpeg_tool_args_with_streams("balanced", "h264", None, Some((0, 2_000_000)), None, None, None, "trim-video", Path::new("clip.mkv"), Path::new("trimmed.mp4"), Some(1), Some(1), Some(0)).unwrap();
        let args = args.iter().map(|value| value.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:v:1"]));
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:a:1?"]));
        assert!(args.windows(2).any(|pair| pair == ["-map", "0:s:0?"]));
        assert!(args.windows(2).any(|pair| pair == ["-c:s", "mov_text"]));
    }

    #[test]
    fn subtitle_conversion_supports_all_four_formats_in_batches() {
        let engines = Engines { ffmpeg: true, ..Engines::default() };
        for input in ["ass", "srt", "ssa", "vtt"] {
            assert_eq!(output_extensions_for(input, engines), ["ass", "srt", "ssa", "vtt"]);
        }
        assert!(operation_for("srt", "ssa", engines).is_some());
        assert!(operation_for("ssa", "srt", engines).is_some());
        assert!(operation_for("vtt", "ass", engines).is_some());
    }

    #[test]
    fn subtitle_conversion_selects_the_text_stream_and_matching_encoder() {
        for (extension, encoder) in [("ass", "ass"), ("ssa", "ass"), ("srt", "subrip"), ("vtt", "webvtt")] {
            let input = Path::new("captions source.srt");
            let output = PathBuf::from(format!("captions output.{extension}"));
            let args = subtitle_ffmpeg_args(input, &output, extension).unwrap();
            assert!(args.windows(2).any(|pair| pair == [OsString::from("-map"), OsString::from("0:s:0")]));
            assert!(args.windows(2).any(|pair| pair == [OsString::from("-c:s"), OsString::from(encoder)]));
            assert_eq!(args.last().map(|value| value.to_string_lossy().into_owned()), Some(output.to_string_lossy().into_owned()));
        }
        assert!(subtitle_ffmpeg_args(Path::new("in.srt"), Path::new("out.mp4"), "mp4").is_none());
    }

    #[test]
    fn pdf_split_page_numbers_are_bounded_unique_and_inside_the_document() {
        assert!(valid_pdf_page_numbers(&[1, 4, 7], 7));
        assert!(!valid_pdf_page_numbers(&[], 7));
        assert!(!valid_pdf_page_numbers(&[0], 7));
        assert!(!valid_pdf_page_numbers(&[8], 7));
        assert!(!valid_pdf_page_numbers(&[2, 2], 7));
        assert!(!valid_pdf_page_numbers(&vec![1; MAX_PDF_SPLIT_PAGES + 1], 1));
    }

    #[test]
    fn video_thumbnail_args_seek_to_requested_frame_time() {
        let args = ffmpeg_tool_args("balanced", "h264", None, None, Some(1_250_000), None, None, "video-thumbnail", Path::new("clip.mp4"), Path::new("frame.jpg")).unwrap();
        let strings = args.iter().map(|value| value.to_string_lossy().into_owned()).collect::<Vec<_>>();
        assert!(strings.windows(3).any(|values| values == ["-ss", "1.250000", "-i"]));
        assert!(strings.windows(2).any(|values| values == ["-frames:v", "1"]));
        assert!(ffmpeg_tool_args("balanced", "h264", None, None, None, None, None, "video-thumbnail", Path::new("clip.mp4"), Path::new("frame.jpg")).is_none());
    }

    #[test]
    fn audio_normalization_uses_bounded_target_loudness_and_true_peak() {
        let args = ffmpeg_tool_args("balanced", "h264", None, None, None, Some((-16, -1)), None, "normalize-audio", Path::new("voice.wav"), Path::new("normalized.m4a")).unwrap();
        assert!(args.windows(2).any(|pair| pair == [OsString::from("-af"), OsString::from("loudnorm=I=-16:TP=-1:LRA=11")]));
        assert!(ffmpeg_tool_args("balanced", "h264", None, None, None, Some((-30, -1)), None, "normalize-audio", Path::new("voice.wav"), Path::new("normalized.m4a")).is_none());
        assert!(ffmpeg_tool_args("balanced", "h264", None, None, None, None, None, "normalize-audio", Path::new("voice.wav"), Path::new("normalized.m4a")).is_none());
    }

    #[test]
    fn extraction_args_follow_selected_audio_format() {
        for (format, encoder, output) in [("mp3", "libmp3lame", "track.mp3"), ("m4a", "aac", "track.m4a"), ("opus", "libopus", "track.opus"), ("flac", "flac", "track.flac"), ("wav", "pcm_s16le", "track.wav")] {
            let args = ffmpeg_tool_args("balanced", "h264", None, None, None, None, Some(format), "extract-audio", Path::new("clip.mp4"), Path::new(output)).unwrap();
            assert!(args.windows(2).any(|pair| pair == [OsString::from("-c:a"), OsString::from(encoder)]));
            assert_eq!(args.last().map(|arg| arg.to_string_lossy().into_owned()), Some(output.to_owned()));
        }
        assert!(ffmpeg_tool_args("balanced", "h264", None, None, None, None, Some("avi"), "extract-audio", Path::new("clip.mp4"), Path::new("track.avi")).is_none());
    }

    #[test]
    fn ffmpeg_progress_is_clamped_until_the_process_succeeds() {
        assert_eq!(progress_percent(0, 10_000_000), 0);
        assert_eq!(progress_percent(5_000_000, 10_000_000), 50);
        assert_eq!(progress_percent(20_000_000, 10_000_000), 99);
        assert_eq!(progress_percent(u64::MAX, 1), 99);
    }

    #[test]
    fn powershell_path_literal_quotes_special_characters_as_one_argument() {
        assert_eq!(
            powershell_path_literal("C:\\Users\\Павел\\It's (work) & done\\clip.mp4"),
            "'C:\\Users\\Павел\\It''s (work) & done\\clip.mp4'"
        );
    }

    #[test]
    fn powershell_location_command_is_directly_runnable_for_complex_paths() {
        assert_eq!(
            powershell_location_command("D:\\desktop app\\O'Brien & Сын"),
            "Set-Location -LiteralPath 'D:\\desktop app\\O''Brien & Сын'"
        );
    }

    #[test]
    fn csv_tsv_conversion_is_native_while_office_spreadsheets_need_libreoffice() {
        let engines = Engines { libreoffice: true, ..Engines::default() };
        assert!(operation_for("tsv", "xlsx", engines).is_some());
        assert_eq!(operation_for("tsv", "xlsx", engines).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("xlsx", "tsv", engines).unwrap().engine, Engine::BuiltIn);
        assert!(operation_for("xls", "csv", Engines::default()).is_none());
        assert!(operation_for("ods", "tsv", Engines::default()).is_none());
        assert_eq!(operation_for("tsv", "csv", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("csv", "tsv", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("tsv", "xlsx", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert!(operation_for("xlsx", "ods", Engines::default()).is_none());
        assert_eq!(spreadsheet_convert_args(Path::new("input.xlsx"), Path::new("out"), "tsv")[2], "tsv:Text - txt - csv (StarCalc):9,34,76,1");
    }

    #[test]
    fn plain_text_and_markdown_conversions_are_built_in() {
        assert_eq!(operation_for("md", "html", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("markdown", "txt", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("txt", "html", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("html", "txt", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("html", "md", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("md", "docx", Engines { pandoc: true, ..Engines::default() }).unwrap().engine, Engine::Pandoc);
    }

    #[test]
    fn selectable_pdf_text_extraction_is_native_while_rasterization_uses_poppler() {
        assert_eq!(operation_for("pdf", "txt", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("pdf", "md", Engines::default()).unwrap().engine, Engine::BuiltIn);
        assert_eq!(
            operation_for("pdf", "png", Engines { poppler: true, ..Engines::default() }).unwrap().engine,
            Engine::Poppler,
        );
        assert!(is_pdf_text_conversion("PDF", "TXT"));
        assert!(!is_pdf_text_conversion("pdf", "png"));
    }

    #[test]
    fn selected_directory_uses_itself_and_selected_file_uses_its_parent() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("FlickVert PowerShell {} {unique} &", std::process::id()));
        let directory = root.join("folder with spaces");
        std::fs::create_dir_all(&directory).unwrap();
        let file = directory.join("clip.txt");
        std::fs::write(&file, b"file").unwrap();

        assert_eq!(selected_item_directory(&directory), Some(directory.as_path()));
        assert_eq!(selected_item_directory(&file), Some(directory.as_path()));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn parses_ffmpeg_progress_updates_from_stdout() {
        let bytes = b"frame=12\nout_time_us=2500000\nprogress=continue\nout_time_us=7500000\n";
        let (sender, receiver) = std::sync::mpsc::channel();
        assert_eq!(
            read_progress(&bytes[..], 10_000_000, sender),
            bytes.to_vec()
        );
        assert_eq!(receiver.try_iter().collect::<Vec<_>>(), [25_u8, 75]);
    }

    #[cfg(windows)]
    #[test]
    fn cancellable_runner_delivers_progress_from_a_child_process() {
        let executable = PathBuf::from(std::env::var_os("COMSPEC").unwrap());
        let args = [
            OsString::from("/C"),
            OsString::from("echo out_time_us=5000000"),
        ];
        let mut updates = Vec::new();
        let output = run_cancellable_with_progress(
            &executable,
            &args,
            &AtomicBool::new(false),
            Some(10_000_000),
            |progress| updates.push(progress),
        )
        .unwrap();
        assert!(output.status.success());
        assert_eq!(updates, [50]);
    }

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
    fn ffmpeg_image_args_keep_paths_separate_and_apply_quality_and_resize() {
        let args = ffmpeg_image_args(
            Path::new("C:/Photos/input image.jpg"),
            Path::new("C:/Photos/output image.jpg"),
            90,
            Some(1600),
            Some(1200),
        );
        assert!(args.contains(&OsString::from("-vf")));
        assert!(args
            .iter()
            .any(|arg| arg.to_string_lossy().contains("min(iw,1600)")));
        assert!(args.contains(&OsString::from("-q:v")));
        assert!(args.contains(&OsString::from("5")));
        assert_eq!(args[6], OsString::from("C:/Photos/input image.jpg"));
        assert_eq!(
            args.last().unwrap(),
            &OsString::from("C:/Photos/output image.jpg")
        );
    }

    #[test]
    fn built_in_image_conversions_do_not_depend_on_external_tools() {
        let engines = Engines {
            ..Engines::default()
        };
        assert_eq!(
            operation_for("jpg", "jpg", engines).unwrap().engine,
            Engine::BuiltIn
        );
        assert_eq!(
            operation_for("png", "png", engines).unwrap().engine,
            Engine::BuiltIn
        );
        assert_eq!(operation_for("png", "jpg", engines).unwrap().engine, Engine::BuiltIn);
        assert_eq!(operation_for("svg", "png", engines).unwrap().engine, Engine::BuiltIn);
    }

    #[test]
    fn svg_rasterization_is_built_in_without_image_magick() {
        for output in ["png", "jpg", "webp", "tiff", "bmp", "pdf"] {
            assert_eq!(
                operation_for("svg", output, Engines::default()).unwrap().engine,
                Engine::BuiltIn,
                "{output}"
            );
        }
    }

    #[test]
    fn reports_a_missing_child_executable() {
        let missing = Path::new("flickvert-missing-engine-test.exe");
        assert!(run(missing, &[]).is_err());
    }

    #[test]
    fn cancellable_child_stops_when_the_cancel_flag_is_set() {
        use std::{
            sync::{
                atomic::{AtomicBool, Ordering},
                Arc,
            },
            thread,
            time::{Duration, Instant},
        };

        #[cfg(windows)]
        let (executable, args) = (
            PathBuf::from("powershell.exe"),
            vec![
                OsString::from("-NoProfile"),
                OsString::from("-Command"),
                OsString::from("Start-Sleep -Seconds 30"),
            ],
        );
        #[cfg(not(windows))]
        let (executable, args) = (
            PathBuf::from("sh"),
            vec![OsString::from("-c"), OsString::from("sleep 30")],
        );

        let cancelled = Arc::new(AtomicBool::new(false));
        let signal = Arc::clone(&cancelled);
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(100));
            signal.store(true, Ordering::Release);
        });
        let started = Instant::now();
        let result = run_cancellable(&executable, &args, &cancelled);

        assert!(matches!(result, Err(error) if error.kind() == io::ErrorKind::Interrupted));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn cancellable_child_stops_when_the_timeout_expires() {
        use std::{sync::atomic::AtomicBool, time::Instant};

        #[cfg(windows)]
        let (executable, args) = (
            PathBuf::from("powershell.exe"),
            vec![OsString::from("-NoProfile"), OsString::from("-Command"), OsString::from("Start-Sleep -Seconds 30")],
        );
        #[cfg(not(windows))]
        let (executable, args) = (PathBuf::from("sh"), vec![OsString::from("-c"), OsString::from("sleep 30")]);

        let started = Instant::now();
        let result = run_cancellable_with_timeout(&executable, &args, &AtomicBool::new(false), None, Duration::from_millis(100), |_| {});
        assert!(matches!(result, Err(error) if error.kind() == io::ErrorKind::TimedOut));
        assert!(started.elapsed() < Duration::from_secs(5));
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
        for extension in ["doc", "docx", "xls", "xlsx", "ods", "ppt", "pptx", "odp"] {
            assert_eq!(operation_for(extension, "pdf", engines).unwrap().engine, Engine::LibreOffice, "{extension}");
        }
    }

    #[test]
    fn conversion_catalog_uses_the_same_engine_requirements_as_conversion() {
        let empty = conversion_catalog(Engines::default());
        let pdf_documents = empty
            .iter()
            .find(|item| {
                item.input_extensions.contains(&"pdf") && item.output_extensions.contains(&"docx")
            })
            .unwrap();
        assert!(!pdf_documents.available);
        assert_eq!(pdf_documents.engine, "Poppler + Pandoc");

        let engines = Engines {
            poppler: true,
            pandoc: true,
            ..Engines::default()
        };
        let available = conversion_catalog(engines);
        let pdf_documents = available
            .iter()
            .find(|item| {
                item.input_extensions.contains(&"pdf") && item.output_extensions.contains(&"docx")
            })
            .unwrap();
        assert!(pdf_documents.available);
        assert_eq!(
            operation_for("pdf", "docx", engines).unwrap().engine,
            Engine::Poppler
        );
    }

    #[test]
    fn built_in_image_formats_match_the_quick_converter_catalog() {
        let formats = quick_image_formats("JPEG").unwrap();
        let item = conversion_catalog(Engines::default())
            .into_iter()
            .find(|item| item.engine == "Built in")
            .unwrap();
        assert_eq!(item.input_extensions, QUICK_IMAGE_INPUTS);
        assert_eq!(item.output_extensions, QUICK_IMAGE_OUTPUTS);
        assert_eq!(
            formats,
            QUICK_IMAGE_OUTPUTS
                .iter()
                .map(|format| (*format).to_owned())
                .collect::<Vec<_>>()
        );
        assert!(quick_image_formats("exe").is_none());
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
        let jpeg = imagemagick_args(
            Path::new("photo.raw"),
            Path::new("photo.jpg"),
            120,
            Some(1200),
            None,
        );
        assert_eq!(
            jpeg[1..3],
            [OsString::from("-resize"), OsString::from("1200x32768>")]
        );
        assert_eq!(
            jpeg[3..5],
            [OsString::from("-quality"), OsString::from("100")]
        );
        let png = imagemagick_args(
            Path::new("photo.raw"),
            Path::new("photo.png"),
            75,
            None,
            None,
        );
        assert_eq!(
            png,
            [OsString::from("photo.raw[0]"), OsString::from("photo.png")]
        );
    }

    #[test]
    fn windows_terminal_arguments_preserve_directory_paths_with_spaces() {
        assert_eq!(
            windows_terminal_args(Path::new("C:/My Files")),
            ["-d", "C:/My Files"].map(OsString::from)
        );
    }
}
