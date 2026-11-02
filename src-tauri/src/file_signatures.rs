// shortcut: validates common binary signatures only; add detectors when new binary formats are supported.
pub fn extension_matches(extension: &str, bytes: &[u8]) -> bool {
    let accepted = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        &["png"][..]
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        &["jpg", "jpeg"][..]
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        &["gif"][..]
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12).is_some_and(|part| part == b"WEBP") {
        &["webp"][..]
    } else if bytes.starts_with(b"%PDF-") {
        &["pdf"][..]
    } else if bytes.starts_with(b"BM") {
        &["bmp"][..]
    } else if bytes.starts_with(b"fLaC") {
        &["flac"][..]
    } else if bytes.starts_with(b"OggS") {
        &["ogg", "oga", "opus"][..]
    } else if bytes.starts_with(b"ID3") || bytes.first().is_some_and(|byte| byte & 0xe0 == 0xe0) {
        &["mp3"][..]
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12).is_some_and(|part| part == b"WAVE") {
        &["wav"][..]
    } else if bytes.starts_with(b"PK\x03\x04") {
        &["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "epub"][..]
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        &["mp4", "m4v", "mov", "m4a", "m4b", "heic", "heif", "avif"][..]
    } else if bytes.starts_with(b"II*\0") || bytes.starts_with(b"MM\0*") {
        &["tif", "tiff"][..]
    } else if bytes.starts_with(b"\x1aE\xdf\xa3") {
        &["mkv", "webm", "mka"][..]
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12).is_some_and(|part| part == b"AVI ") {
        &["avi"][..]
    } else {
        return true;
    };
    accepted.contains(&extension.to_ascii_lowercase().as_str())
}

pub fn file_matches(extension: &str, path: &std::path::Path) -> std::io::Result<bool> {
    use std::io::Read;
    let mut bytes = [0; 16];
    let count = std::fs::File::open(path)?.read(&mut bytes)?;
    Ok(extension_matches(extension, &bytes[..count]))
}

#[cfg(test)]
mod tests {
    use super::extension_matches;

    #[test]
    fn rejects_known_signature_extension_mismatches() {
        assert!(!extension_matches("png", b"%PDF-1.7"));
        assert!(extension_matches("pdf", b"%PDF-1.7"));
        assert!(!extension_matches("jpg", b"\x89PNG\r\n\x1a\n"));
    }
}
