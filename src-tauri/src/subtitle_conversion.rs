use std::{fs, path::Path};

const MAX_SUBTITLE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 32 * 1024 * 1024;

pub fn convert_subtitle(input: &Path, output: &Path, output_extension: &str) -> Result<(), String> {
    let size = fs::metadata(input)
        .map_err(|error| error.to_string())?
        .len();
    if size > MAX_SUBTITLE_BYTES {
        return Err("subtitle exceeds the 16 MiB input limit".into());
    }
    let source = fs::read_to_string(input).map_err(|error| error.to_string())?;
    let source = source
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let converted = match output_extension {
        "vtt" => srt_to_vtt(&source)?,
        "srt" => vtt_to_srt(&source)?,
        _ => return Err("unsupported subtitle output".into()),
    };
    if converted.len() > MAX_OUTPUT_BYTES {
        return Err("converted subtitle exceeds the 32 MiB output limit".into());
    }
    fs::write(output, converted).map_err(|error| error.to_string())
}

fn blocks(source: &str) -> Vec<Vec<&str>> {
    let mut result = Vec::new();
    let mut current = Vec::new();
    for line in source.lines() {
        if line.trim().is_empty() {
            if !current.is_empty() {
                result.push(std::mem::take(&mut current));
            }
        } else {
            current.push(line);
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    result
}

fn srt_to_vtt(source: &str) -> Result<String, String> {
    let mut output = String::from("WEBVTT\n\n");
    let mut cue_count = 0;
    for mut cue in blocks(source) {
        if cue
            .first()
            .is_some_and(|line| line.trim().parse::<u32>().is_ok())
        {
            cue.remove(0);
        }
        if cue.is_empty() {
            continue;
        }
        let timing = convert_timing(cue[0], '.', true)?;
        output.push_str(&timing);
        output.push('\n');
        for line in &cue[1..] {
            output.push_str(line);
            output.push('\n');
        }
        output.push('\n');
        cue_count += 1;
    }
    if cue_count == 0 {
        return Err("SRT contains no valid subtitle cues".into());
    }
    Ok(output)
}

fn vtt_to_srt(source: &str) -> Result<String, String> {
    let mut lines = source.lines();
    let header = lines
        .next()
        .unwrap_or_default()
        .trim_start_matches('\u{feff}');
    if !header.starts_with("WEBVTT") {
        return Err("VTT header is missing".into());
    }
    let mut body = Vec::new();
    let mut in_header = true;
    for line in lines {
        if in_header && line.trim().is_empty() {
            in_header = false;
            continue;
        }
        if !in_header {
            body.push(line);
        }
    }
    if in_header {
        return Err("VTT header is incomplete".into());
    }

    let mut output = String::new();
    let mut cue_number = 1;
    for cue in blocks(&body.join("\n")) {
        if matches!(cue[0].trim(), "NOTE" | "STYLE" | "REGION")
            || cue[0].trim_start().starts_with("NOTE ")
        {
            continue;
        }
        let timing_index = if cue[0].contains("-->") { 0 } else { 1 };
        if cue
            .get(timing_index)
            .map_or(true, |line| !line.contains("-->"))
        {
            return Err("VTT cue has no timing line".into());
        }
        let timing = convert_timing(cue[timing_index], ',', false)?;
        output.push_str(&cue_number.to_string());
        output.push('\n');
        output.push_str(&timing);
        output.push('\n');
        for line in &cue[timing_index + 1..] {
            output.push_str(line);
            output.push('\n');
        }
        output.push('\n');
        cue_number += 1;
    }
    if cue_number == 1 {
        return Err("VTT contains no valid subtitle cues".into());
    }
    Ok(output)
}

fn convert_timing(line: &str, separator: char, keep_settings: bool) -> Result<String, String> {
    let (start, end) = line
        .split_once("-->")
        .ok_or("subtitle cue has invalid timing")?;
    let start = parse_timestamp(start.trim())?;
    let end_parts = end.split_whitespace().collect::<Vec<_>>();
    let end = parse_timestamp(end_parts.first().copied().unwrap_or_default())?;
    if end < start {
        return Err("subtitle cue ends before it starts".into());
    }
    let settings = if keep_settings && end_parts.len() > 1 {
        format!(" {}", end_parts[1..].join(" "))
    } else {
        String::new()
    };
    Ok(format!(
        "{} --> {}{}",
        format_timestamp(start, separator),
        format_timestamp(end, separator),
        settings
    ))
}

fn parse_timestamp(value: &str) -> Result<u64, String> {
    let mut time_and_fraction = value.split(['.', ',']);
    let time = time_and_fraction.next().unwrap_or_default();
    let fraction = time_and_fraction
        .next()
        .ok_or("subtitle timestamp has no milliseconds")?;
    if time_and_fraction.next().is_some()
        || fraction.len() != 3
        || !fraction.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("subtitle timestamp is invalid".into());
    }
    let parts = time.split(':').collect::<Vec<_>>();
    let (hours, minutes, seconds) = match parts.as_slice() {
        [minutes, seconds] => (0, parse_number(minutes)?, parse_number(seconds)?),
        [hours, minutes, seconds] => (
            parse_number(hours)?,
            parse_number(minutes)?,
            parse_number(seconds)?,
        ),
        _ => return Err("subtitle timestamp is invalid".into()),
    };
    if minutes > 59 || seconds > 59 {
        return Err("subtitle timestamp is out of range".into());
    }
    let millis = parse_number(fraction)?;
    hours
        .checked_mul(3600)
        .and_then(|total| total.checked_add(minutes * 60 + seconds))
        .and_then(|total| total.checked_mul(1000))
        .and_then(|total| total.checked_add(millis))
        .ok_or_else(|| "subtitle timestamp is out of range".into())
}

fn parse_number(value: &str) -> Result<u64, String> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("subtitle timestamp is invalid".into());
    }
    value
        .parse()
        .map_err(|_| "subtitle timestamp is out of range".into())
}

fn format_timestamp(milliseconds: u64, separator: char) -> String {
    let hours = milliseconds / 3_600_000;
    let minutes = milliseconds / 60_000 % 60;
    let seconds = milliseconds / 1_000 % 60;
    let millis = milliseconds % 1_000;
    format!("{hours:02}:{minutes:02}:{seconds:02}{separator}{millis:03}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "flickvert-subtitle-{}-{}",
            std::process::id(),
            TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn converts_srt_to_vtt_and_back_preserving_cues_and_text() {
        let dir = temp_dir();
        let srt = dir.join("input.srt");
        let vtt = dir.join("output.vtt");
        fs::write(&srt, "1\r\n00:00:01,250 --> 00:00:02,750\r\nHello\r\nworld\r\n\r\n2\r\n00:01:00,000 --> 00:01:01,000\r\nBye\r\n").unwrap();
        convert_subtitle(&srt, &vtt, "vtt").unwrap();
        let vtt_text = fs::read_to_string(&vtt).unwrap();
        assert!(vtt_text.starts_with("WEBVTT\n\n"));
        assert!(vtt_text.contains("00:00:01.250 --> 00:00:02.750\nHello\nworld"));
        let roundtrip = dir.join("roundtrip.srt");
        convert_subtitle(&vtt, &roundtrip, "srt").unwrap();
        let roundtrip_text = fs::read_to_string(roundtrip).unwrap();
        assert!(roundtrip_text.contains("1\n00:00:01,250 --> 00:00:02,750\nHello\nworld"));
        assert!(roundtrip_text.contains("2\n00:01:00,000 --> 00:01:01,000\nBye"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_invalid_timing_instead_of_emitting_a_corrupt_subtitle() {
        let dir = temp_dir();
        let input = dir.join("input.srt");
        let output = dir.join("output.vtt");
        fs::write(&input, "1\n00:00:03,000 --> 00:00:02,000\nBad cue\n").unwrap();
        assert!(convert_subtitle(&input, &output, "vtt").is_err());
        assert!(!output.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn converts_vtt_headers_identifiers_and_settings_safely() {
        let dir = temp_dir();
        let input = dir.join("input.vtt");
        let output = dir.join("output.srt");
        fs::write(
            &input,
            "WEBVTT - captions\nKind: captions\n\nNOTE generated file\nignored\n\nintro\n00:00:01.500 --> 00:00:02.500 position:10%\nHello\n",
        )
        .unwrap();

        convert_subtitle(&input, &output, "srt").unwrap();

        assert_eq!(
            fs::read_to_string(output).unwrap(),
            "1\n00:00:01,500 --> 00:00:02,500\nHello\n\n"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
