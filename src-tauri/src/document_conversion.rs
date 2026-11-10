use pulldown_cmark::{html, Event, Parser, TagEnd};
use quick_xml::{escape::resolve_predefined_entity, events::Event as XmlEvent, Reader};
use std::{fs, io::Read, path::Path};

const MAX_DOCUMENT_INPUT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_HTML_INPUT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_DOCUMENT_OUTPUT_BYTES: usize = 128 * 1024 * 1024;
const MAX_OFFICE_XML_BYTES: u64 = 64 * 1024 * 1024;
const MAX_EPUB_PACKAGE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_EPUB_CONTENT_BYTES: u64 = 64 * 1024 * 1024;

pub fn convert_document(input: &Path, output: &Path, extension: &str) -> Result<(), String> {
    let size = fs::metadata(input)
        .map_err(|error| error.to_string())?
        .len();
    let source_extension = input
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if matches!(source_extension.as_str(), "html" | "htm") && size > MAX_HTML_INPUT_BYTES {
        return Err("HTML exceeds the 4 MiB input limit".into());
    }
    if size > MAX_DOCUMENT_INPUT_BYTES {
        return Err("document exceeds the 16 MiB input limit".into());
    }
    let converted = if source_extension == "rtf" {
        if !matches!(extension, "txt" | "md" | "markdown") {
            return Err("built-in RTF conversion only extracts text".into());
        }
        rtf_to_text(&fs::read(input).map_err(|error| error.to_string())?)?
    } else if source_extension == "epub" {
        if !matches!(extension, "txt" | "md" | "markdown") {
            return Err("built-in EPUB conversion only extracts text".into());
        }
        epub_to_text(input, extension)?
    } else if matches!(source_extension.as_str(), "docx" | "odt") {
        if !matches!(extension, "txt" | "md" | "markdown") {
            return Err("built-in Office conversion only extracts text".into());
        }
        office_to_text(input, &source_extension)?
    } else {
        let source = fs::read_to_string(input).map_err(|error| error.to_string())?;
        match (source_extension.as_str(), extension) {
            ("md" | "markdown", "md" | "markdown") | ("txt", "txt") => source,
            ("md" | "markdown", "html" | "htm") => {
                let parser = Parser::new(&source).filter_map(|event| match event {
                    Event::Html(_) | Event::InlineHtml(_) => None,
                    event => Some(event),
                });
                let mut html_body = String::with_capacity(source.len().saturating_mul(2));
                html::push_html(&mut html_body, parser);
                format!(
                "<!doctype html>\n<html><head><meta charset=\"utf-8\"></head><body>\n{html_body}</body></html>\n"
            )
            }
            ("md" | "markdown", "txt") => markdown_to_text(&source),
            ("html" | "htm", "txt" | "md" | "markdown") => {
                let markdown = html2text::from_read(source.as_bytes(), 100)
                    .map_err(|error| error.to_string())?;
                if extension == "txt" {
                    markdown_to_text(&markdown)
                } else {
                    markdown
                }
            }
            ("txt", "md" | "markdown") => source,
            ("txt", "html" | "htm") => {
                format!(
                "<!doctype html>\n<html><head><meta charset=\"utf-8\"></head><body><pre>{}</pre></body></html>\n",
                escape_html(&source)?
            )
            }
            _ => return Err("unsupported built-in document conversion".into()),
        }
    };
    if converted.len() > MAX_DOCUMENT_OUTPUT_BYTES {
        return Err("converted document exceeds the 128 MiB output limit".into());
    }
    fs::write(output, converted).map_err(|error| error.to_string())
}

fn rtf_to_text(input: &[u8]) -> Result<String, String> {
    if !input.starts_with(b"{\\rtf") {
        return Err("invalid RTF header".into());
    }
    let mut output = Vec::<u16>::new();
    let mut groups = Vec::<bool>::new();
    let (mut index, mut fallback, mut unicode_fallback, mut code_page) = (0, 0, 1, 1252);
    while index < input.len() {
        match input[index] {
            b'{' => {
                if groups.len() == 256 {
                    return Err("RTF nesting exceeds the 256 group limit".into());
                }
                groups.push(groups.last().copied().unwrap_or(false));
                index += 1;
            }
            b'}' => {
                if groups.pop().is_none() {
                    return Err("RTF has an unmatched closing group".into());
                }
                index += 1;
            }
            b'\\' => {
                index += 1;
                let control = *input.get(index).ok_or("truncated RTF control")?;
                if control.is_ascii_alphabetic() {
                    let start = index;
                    while input.get(index).is_some_and(u8::is_ascii_alphabetic) {
                        index += 1;
                    }
                    let word = std::str::from_utf8(&input[start..index])
                        .map_err(|_| "invalid RTF control word")?;
                    let negative = input.get(index) == Some(&b'-');
                    if negative {
                        index += 1;
                    }
                    let number_start = index;
                    while input.get(index).is_some_and(u8::is_ascii_digit) {
                        index += 1;
                    }
                    let parameter = (index > number_start)
                        .then(|| std::str::from_utf8(&input[number_start..index]).ok()?.parse::<i32>().ok())
                        .flatten()
                        .map(|number| if negative { -number } else { number });
                    if input.get(index) == Some(&b' ') {
                        index += 1;
                    }
                    if word == "bin" {
                        let length = parameter
                            .filter(|length| *length >= 0)
                            .ok_or("invalid RTF binary length")? as usize;
                        index = index
                            .checked_add(length)
                            .filter(|end| *end <= input.len())
                            .ok_or("truncated RTF binary data")?;
                        continue;
                    }
                    if fallback > 0 {
                        fallback -= 1;
                        continue;
                    }
                    if ["fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "footer", "footnote", "annotation", "xmlnstbl", "listtable", "listoverridetable", "generator"].contains(&word) {
                        if let Some(skip) = groups.last_mut() { *skip = true; }
                    }
                    if groups.last().copied().unwrap_or(true) {
                        continue;
                    }
                    match word {
                        "ansicpg" => code_page = parameter.filter(|page| [1251, 1252].contains(page)).ok_or("unsupported RTF code page")? as u16,
                        "uc" => unicode_fallback = parameter.filter(|count| (0..=16).contains(count)).ok_or("invalid RTF Unicode fallback count")? as usize,
                        "u" => {
                            let value = parameter
                                .filter(|value| (-32768..=32767).contains(value))
                                .ok_or("invalid RTF Unicode value")?;
                            let unit = value as i16 as u16;
                            output.push(unit);
                            fallback = unicode_fallback;
                        }
                        "par" | "line" | "page" | "row" => push_rtf_newline(&mut output),
                        "tab" | "cell" => output.push('\t' as u16),
                        "emdash" => output.push('—' as u16),
                        "endash" => output.push('–' as u16),
                        "bullet" => output.push('•' as u16),
                        "lquote" => output.push('‘' as u16),
                        "rquote" => output.push('’' as u16),
                        "ldblquote" => output.push('“' as u16),
                        "rdblquote" => output.push('”' as u16),
                        _ => {}
                    }
                } else {
                    index += 1;
                    if fallback > 0 {
                        fallback -= 1;
                        if control == b'\'' { index = index.saturating_add(2); }
                        continue;
                    }
                    if groups.last().copied().unwrap_or(true) { continue; }
                    match control {
                        b'\\' | b'{' | b'}' => output.push(control as u16),
                        b'*' => {
                            if let Some(skip) = groups.last_mut() { *skip = true; }
                        }
                        b'~' => output.push('\u{00a0}' as u16),
                        b'_' => output.push('\u{2011}' as u16),
                        b'-' => {}
                        b'\'' => {
                            let hex = input.get(index..index + 2).ok_or("truncated RTF hex escape")?;
                            let hex = std::str::from_utf8(hex).map_err(|_| "invalid RTF hex escape")?;
                            let byte = u8::from_str_radix(hex, 16).map_err(|_| "invalid RTF hex escape")?;
                            output.push(decode_rtf_byte(byte, code_page) as u16);
                            index += 2;
                        }
                        _ => {}
                    }
                }
            }
            b'\r' | b'\n' => index += 1,
            byte => {
                index += 1;
                if fallback > 0 {
                    fallback -= 1;
                } else if !groups.last().copied().unwrap_or(true) {
                    output.push(decode_rtf_byte(byte, code_page) as u16);
                }
            }
        }
    }
    if !groups.is_empty() {
        return Err("RTF has an unclosed group".into());
    }
    while output
        .last()
        .is_some_and(|unit| *unit == b' ' as u16 || *unit == b'\t' as u16 || *unit == b'\n' as u16)
    {
        output.pop();
    }
    if !output.is_empty() {
        output.push(b'\n' as u16);
    }
    let text = String::from_utf16_lossy(&output);
    if text.len() > MAX_DOCUMENT_OUTPUT_BYTES {
        return Err("converted document exceeds the 128 MiB output limit".into());
    }
    Ok(text)
}

fn push_rtf_newline(output: &mut Vec<u16>) {
    while output
        .last()
        .is_some_and(|unit| *unit == b' ' as u16 || *unit == b'\t' as u16)
    {
        output.pop();
    }
    output.push(b'\n' as u16);
}

fn decode_rtf_byte(byte: u8, code_page: u16) -> char {
    const CP1252: [u16; 32] = [
        0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
        0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd, 0xfffd, 0x2018, 0x2019, 0x201c,
        0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd,
        0x017e, 0x0178,
    ];
    const CP1251: [u16; 64] = [
        0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021, 0x20ac, 0x2030,
        0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f, 0x0452, 0x2018, 0x2019, 0x201c,
        0x201d, 0x2022, 0x2013, 0x2014, 0xfffd, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c,
        0x045b, 0x045f, 0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7,
        0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407, 0x00b0, 0x00b1,
        0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7, 0x0451, 0x2116, 0x0454, 0x00bb,
        0x0458, 0x0405, 0x0455, 0x0457,
    ];
    let value = if code_page == 1251 && byte >= 0x80 && byte < 0xc0 {
        CP1251[(byte - 0x80) as usize]
    } else if code_page == 1251 && byte >= 0xc0 {
        0x0410 + (byte - 0xc0) as u16
    } else if byte >= 0x80 && byte < 0xa0 {
        CP1252[(byte - 0x80) as usize]
    } else {
        byte as u16
    };
    char::from_u32(value as u32).unwrap_or('\u{fffd}')
}

fn epub_to_text(input: &Path, extension: &str) -> Result<String, String> {
    let file = fs::File::open(input).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() > 10_000 {
        return Err("EPUB contains too many archive entries".into());
    }
    if archive.file_names().next() != Some("mimetype") {
        return Err("EPUB mimetype must be the first archive entry".into());
    }
    if archive
        .by_name("mimetype")
        .map_err(|error| error.to_string())?
        .compression()
        != zip::CompressionMethod::Stored
    {
        return Err("EPUB mimetype must be stored without compression".into());
    }
    if read_epub_member(&mut archive, "mimetype", 64)?.trim() != "application/epub+zip" {
        return Err("EPUB has an invalid mimetype entry".into());
    }
    let container = read_epub_member(
        &mut archive,
        "META-INF/container.xml",
        MAX_EPUB_PACKAGE_BYTES,
    )?;
    let package_path = epub_rootfile(&container)?;
    let package = read_epub_member(&mut archive, &package_path, MAX_EPUB_PACKAGE_BYTES)?;
    let (base, manifest, spine) = epub_package(&package, &package_path)?;
    let mut total_bytes = 0u64;
    let mut output = String::new();
    for id in spine {
        let href = manifest
            .get(&id)
            .ok_or("EPUB spine references a missing item")?;
        let path = resolve_epub_path(&base, href)?;
        let chapter = read_epub_member(
            &mut archive,
            &path,
            MAX_EPUB_CONTENT_BYTES.saturating_sub(total_bytes),
        )?;
        total_bytes = total_bytes.saturating_add(chapter.len() as u64);
        if total_bytes > MAX_EPUB_CONTENT_BYTES {
            return Err("EPUB content exceeds the 64 MiB limit".into());
        }
        let text =
            html2text::from_read(chapter.as_bytes(), 100).map_err(|error| error.to_string())?;
        let text = if extension == "txt" {
            markdown_to_text(&text)
        } else {
            text
        };
        output.push_str(text.trim());
        output.push_str("\n\n");
        if output.len() > MAX_DOCUMENT_OUTPUT_BYTES {
            return Err("converted document exceeds the 128 MiB output limit".into());
        }
    }
    let output = output.trim();
    if output.is_empty() {
        return Err("EPUB contains no extractable text".into());
    }
    Ok(format!("{output}\n"))
}

fn read_epub_member(
    archive: &mut zip::ZipArchive<fs::File>,
    path: &str,
    limit: u64,
) -> Result<String, String> {
    let member = archive.by_name(path).map_err(|error| error.to_string())?;
    if member.size() > limit {
        return Err("EPUB member exceeds its size limit".into());
    }
    let mut bytes = Vec::with_capacity(member.size() as usize);
    member
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > limit {
        return Err("EPUB member exceeds its size limit".into());
    }
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

fn epub_rootfile(xml: &str) -> Result<String, String> {
    let mut reader = Reader::from_str(xml);
    loop {
        match reader.read_event().map_err(|error| error.to_string())? {
            XmlEvent::Start(element) | XmlEvent::Empty(element)
                if local_name(element.name().as_ref()) == b"rootfile" =>
            {
                let mut path = None;
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| error.to_string())?;
                    if local_name(attribute.key.as_ref()) == b"full-path" {
                        path = Some(
                            attribute
                                .unescape_value()
                                .map_err(|error| error.to_string())?
                                .into_owned(),
                        );
                    }
                }
                let path = path.ok_or("EPUB container has no package path")?;
                return resolve_epub_path("", &path);
            }
            XmlEvent::DocType(_) => return Err("EPUB XML document types are not supported".into()),
            XmlEvent::Eof => return Err("EPUB container has no package document".into()),
            _ => {}
        }
    }
}

fn epub_package(
    xml: &str,
    package_path: &str,
) -> Result<
    (
        String,
        std::collections::HashMap<String, String>,
        Vec<String>,
    ),
    String,
> {
    use std::collections::HashMap;

    let mut reader = Reader::from_str(xml);
    let mut manifest = HashMap::new();
    let mut spine = Vec::new();
    loop {
        match reader.read_event().map_err(|error| error.to_string())? {
            XmlEvent::Start(element) | XmlEvent::Empty(element) => {
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref());
                let mut id = None;
                let mut href = None;
                for attribute in element.attributes() {
                    let attribute = attribute.map_err(|error| error.to_string())?;
                    let value = attribute
                        .unescape_value()
                        .map_err(|error| error.to_string())?
                        .into_owned();
                    match local_name(attribute.key.as_ref()) {
                        b"id" => id = Some(value),
                        b"href" => href = Some(value),
                        b"idref" if name == b"itemref" => spine.push(value),
                        _ => {}
                    }
                }
                if name == b"item" {
                    if let (Some(id), Some(href)) = (id, href) {
                        if manifest.insert(id, href).is_some() {
                            return Err("EPUB manifest contains duplicate item IDs".into());
                        }
                    }
                }
            }
            XmlEvent::DocType(_) => return Err("EPUB XML document types are not supported".into()),
            XmlEvent::Eof => break,
            _ => {}
        }
    }
    if spine.is_empty() {
        return Err("EPUB reading order is empty".into());
    }
    let base = package_path
        .rsplit_once('/')
        .map_or("", |(base, _)| base)
        .to_owned();
    Ok((base, manifest, spine))
}

fn resolve_epub_path(base: &str, href: &str) -> Result<String, String> {
    let href = href.split(['#', '?']).next().unwrap_or("");
    let href = percent_decode_epub_path(href)?;
    if href.is_empty() || href.starts_with('/') || href.contains(['\\', ':', '\0']) {
        return Err("EPUB contains an unsafe or unsupported member path".into());
    }
    let mut parts = base
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    for part in href.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err("EPUB contains an unsafe member path".into());
        }
        parts.push(part);
    }
    Ok(parts.join("/"))
}

fn percent_decode_epub_path(path: &str) -> Result<String, String> {
    let bytes = path.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes
                .get(index + 1..index + 3)
                .ok_or("EPUB path has invalid percent encoding")?;
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            };
            let high = digit(hex[0]).ok_or("EPUB path has invalid percent encoding")?;
            let low = digit(hex[1]).ok_or("EPUB path has invalid percent encoding")?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|error| error.to_string())
}

fn office_to_text(input: &Path, extension: &str) -> Result<String, String> {
    let file = fs::File::open(input).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let (member, word_xml) = if extension == "docx" {
        ("word/document.xml", true)
    } else {
        ("content.xml", false)
    };
    let xml = archive.by_name(member).map_err(|error| error.to_string())?;
    if xml.size() > MAX_OFFICE_XML_BYTES {
        return Err("Office document XML exceeds the 64 MiB limit".into());
    }
    let mut bytes = Vec::with_capacity(xml.size() as usize);
    xml.take(MAX_OFFICE_XML_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_OFFICE_XML_BYTES {
        return Err("Office document XML exceeds the 64 MiB limit".into());
    }

    let mut reader = Reader::from_reader(bytes.as_slice());
    reader.config_mut().trim_text(false);
    let mut buffer = Vec::new();
    let mut text_depth = 0usize;
    let mut paragraph_depth = 0usize;
    let mut output = String::new();
    loop {
        match reader
            .read_event_into(&mut buffer)
            .map_err(|error| error.to_string())?
        {
            XmlEvent::Start(element) => {
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref());
                if word_xml && name == b"t" {
                    text_depth += 1;
                }
                if name == b"p" || !word_xml && name == b"h" {
                    paragraph_depth += 1;
                }
                if matches!(name, b"tab" | b"line-break" | b"br" | b"cr") && paragraph_depth > 0 {
                    output.push(if name == b"tab" { '\t' } else { '\n' });
                }
            }
            XmlEvent::Empty(element) => {
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref());
                if matches!(name, b"tab" | b"line-break" | b"br" | b"cr") && paragraph_depth > 0 {
                    output.push(if name == b"tab" { '\t' } else { '\n' });
                } else if !word_xml && name == b"s" && paragraph_depth > 0 {
                    let count = element
                        .attributes()
                        .with_checks(false)
                        .filter_map(Result::ok)
                        .find(|attribute| local_name(attribute.key.as_ref()) == b"c")
                        .and_then(|attribute| {
                            attribute.unescape_value().ok()?.parse::<usize>().ok()
                        })
                        .unwrap_or(1)
                        .clamp(1, 4096);
                    output.extend(std::iter::repeat(' ').take(count));
                }
            }
            XmlEvent::End(element) => {
                let qualified_name = element.name();
                let name = local_name(qualified_name.as_ref());
                if word_xml && name == b"t" {
                    text_depth = text_depth.saturating_sub(1);
                }
                if name == b"p" || !word_xml && name == b"h" {
                    paragraph_depth = paragraph_depth.saturating_sub(1);
                    if !output.ends_with('\n') {
                        output.push('\n');
                    }
                }
            }
            XmlEvent::Text(event)
                if word_xml && text_depth > 0 || !word_xml && paragraph_depth > 0 =>
            {
                output.push_str(&event.decode().map_err(|error| error.to_string())?);
            }
            XmlEvent::GeneralRef(reference)
                if word_xml && text_depth > 0 || !word_xml && paragraph_depth > 0 =>
            {
                let reference_name = reference.decode().map_err(|error| error.to_string())?;
                if let Some(character) = reference
                    .resolve_char_ref()
                    .map_err(|error| error.to_string())?
                {
                    output.push(character);
                } else if let Some(value) = resolve_predefined_entity(&reference_name) {
                    output.push_str(value);
                } else {
                    return Err("Office XML contains an unsupported entity reference".into());
                }
            }
            XmlEvent::DocType(_) => {
                return Err("Office XML document types are not supported".into())
            }
            XmlEvent::Eof => break,
            _ => {}
        }
        if output.len() > MAX_DOCUMENT_OUTPUT_BYTES {
            return Err("converted document exceeds the 128 MiB output limit".into());
        }
        buffer.clear();
    }
    let text = output.trim_end();
    if text.is_empty() {
        return Err("Office document contains no extractable text".into());
    }
    Ok(format!("{text}\n"))
}

fn local_name(qualified: &[u8]) -> &[u8] {
    qualified
        .rsplit(|byte| *byte == b':')
        .next()
        .unwrap_or(qualified)
}

fn markdown_to_text(source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    for event in Parser::new(source) {
        match event {
            Event::Text(text) | Event::Code(text) => output.push_str(&text),
            Event::SoftBreak | Event::HardBreak => output.push('\n'),
            Event::Rule => output.push_str("\n---\n"),
            Event::TaskListMarker(checked) => {
                output.push_str(if checked { "[x] " } else { "[ ] " })
            }
            Event::Html(_) | Event::InlineHtml(_) => {}
            Event::End(
                TagEnd::Paragraph
                | TagEnd::Heading(_)
                | TagEnd::BlockQuote(_)
                | TagEnd::CodeBlock
                | TagEnd::Item
                | TagEnd::TableRow
                | TagEnd::TableCell,
            ) => output.push('\n'),
            _ => {}
        }
    }
    let mut normalized = String::with_capacity(output.len());
    let mut newlines = 0;
    for character in output.chars() {
        if character == '\n' {
            newlines += 1;
            if newlines <= 2 {
                normalized.push(character);
            }
        } else {
            newlines = 0;
            normalized.push(character);
        }
    }
    normalized.trim_end().to_owned() + "\n"
}

fn escape_html(text: &str) -> Result<String, String> {
    let mut escaped = String::with_capacity(text.len());
    for character in text.chars() {
        let fragment = match character {
            '&' => "&amp;",
            '<' => "&lt;",
            '>' => "&gt;",
            '"' => "&quot;",
            '\'' => "&#39;",
            _ => {
                escaped.push(character);
                if escaped.len() > MAX_DOCUMENT_OUTPUT_BYTES {
                    return Err("converted document exceeds the 128 MiB output limit".into());
                }
                continue;
            }
        };
        escaped.push_str(fragment);
        if escaped.len() > MAX_DOCUMENT_OUTPUT_BYTES {
            return Err("converted document exceeds the 128 MiB output limit".into());
        }
    }
    Ok(escaped)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "flickvert-document-{}-{}",
            std::process::id(),
            TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn markdown_converts_to_html_without_executing_raw_html() {
        let dir = temp_dir();
        let input = dir.join("input.md");
        let output = dir.join("output.html");
        fs::write(&input, "# Title\n\n**bold** <script>alert(1)</script>").unwrap();

        super::convert_document(&input, &output, "html").unwrap();

        let html = fs::read_to_string(output).unwrap();
        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(!html.contains("<script>"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn markdown_converts_to_plain_text_without_markup() {
        let dir = temp_dir();
        let input = dir.join("input.md");
        let output = dir.join("output.txt");
        fs::write(
            &input,
            "# Title\n\n**bold** and [link](https://example.test)\n",
        )
        .unwrap();

        super::convert_document(&input, &output, "txt").unwrap();

        let text = fs::read_to_string(output).unwrap();
        assert!(text.contains("Title"));
        assert!(text.contains("bold and link"));
        assert!(!text.contains("**"));
        assert!(!text.contains("https://"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn html_converts_to_text_by_decoding_entities_and_removing_tags() {
        let dir = temp_dir();
        let input = dir.join("input.html");
        let output = dir.join("output.txt");
        fs::write(
            &input,
            "<h1>Title</h1><p>Hello <strong>local</strong> &amp; ready.</p>",
        )
        .unwrap();

        super::convert_document(&input, &output, "txt").unwrap();

        let text = fs::read_to_string(output).unwrap();
        assert!(text.contains("Title"));
        assert!(text.contains("Hello local & ready."), "{text:?}");
        assert!(!text.contains("<strong>"));
        let markdown = dir.join("output.md");
        super::convert_document(&input, &markdown, "md").unwrap();
        let markdown = fs::read_to_string(markdown).unwrap();
        assert!(markdown.contains("# Title"));
        assert!(markdown.contains("**local**"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn plain_text_converts_to_html_with_escaped_markup() {
        let dir = temp_dir();
        let input = dir.join("input.txt");
        let output = dir.join("output.html");
        fs::write(&input, "<script>& data").unwrap();

        super::convert_document(&input, &output, "html").unwrap();

        let html = fs::read_to_string(output).unwrap();
        assert!(html.contains("&lt;script&gt;&amp; data"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_oversized_html_before_parsing() {
        let dir = temp_dir();
        let input = dir.join("large.html");
        let output = dir.join("output.txt");
        let file = fs::File::create(&input).unwrap();
        file.set_len(4 * 1024 * 1024 + 1).unwrap();

        assert!(super::convert_document(&input, &output, "txt").is_err());
        assert!(!output.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn extracts_text_from_docx_and_odt_without_pandoc() {
        use std::io::Write;

        let dir = temp_dir();
        for (extension, member, xml, expected) in [
            (
                "docx",
                "word/document.xml",
                r#"<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Hello &amp; </w:t></w:r><w:r><w:b><w:t>friends</w:t></w:b></w:r><w:r><w:tab/></w:r><w:r><w:t>today</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph.</w:t></w:r></w:p></w:body></w:document>"#,
                "Hello & friends\ttoday",
            ),
            (
                "odt",
                "content.xml",
                r#"<office:document xmlns:office="urn:o" xmlns:text="urn:t"><office:body><text:p>Hello <text:span>friends</text:span><text:tab/>today</text:p><text:h>Second paragraph.</text:h></office:body></office:document>"#,
                "Hello friends\ttoday",
            ),
        ] {
            let input = dir.join(format!("input.{extension}"));
            let archive_file = fs::File::create(&input).unwrap();
            let mut archive = zip::ZipWriter::new(archive_file);
            archive
                .start_file(member, zip::write::SimpleFileOptions::default())
                .unwrap();
            archive.write_all(xml.as_bytes()).unwrap();
            archive.finish().unwrap();
            let output = dir.join(format!("output-{extension}.txt"));

            super::convert_document(&input, &output, "txt").unwrap();

            let text = fs::read_to_string(output).unwrap();
            assert!(text.contains(expected), "{extension}: {text:?}");
            assert!(text.contains("Second paragraph."), "{extension}: {text:?}");
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn converts_rtf_text_and_unicode_without_pandoc() {
        let dir = temp_dir();
        let input = dir.join("note.rtf");
        let output = dir.join("note.txt");
        fs::write(
            &input,
            r#"{\rtf1\ansi{\fonttbl{\f0 Arial;}}Hello \b bold\b0\par \u1055?\u1088?\u1080?\u1074?\u1077?\u1090? \{safe\} {\*\generator hidden;}}"#,
        )
        .unwrap();

        super::convert_document(&input, &output, "txt").unwrap();

        assert_eq!(fs::read_to_string(output).unwrap(), "Hello bold\nПривет {safe}\n");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn extracts_epub_text_in_spine_order_without_pandoc() {
        use std::io::Write;

        let dir = temp_dir();
        let input = dir.join("book.epub");
        let archive_file = fs::File::create(&input).unwrap();
        let mut archive = zip::ZipWriter::new(archive_file);
        for (name, contents) in [
            ("mimetype", "application/epub+zip"),
            (
                "META-INF/container.xml",
                r#"<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#,
            ),
            (
                "OPS/book.opf",
                r#"<package><manifest><item id="second" href="chapter-2.xhtml"/><item id="first" href="chapter%2D1.xhtml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>"#,
            ),
            (
                "OPS/chapter-1.xhtml",
                "<h1>First</h1><p>Hello &amp; welcome.</p>",
            ),
            ("OPS/chapter-2.xhtml", "<h1>Second</h1><p>Last chapter.</p>"),
        ] {
            let options = if name == "mimetype" {
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored)
            } else {
                zip::write::SimpleFileOptions::default()
            };
            archive.start_file(name, options).unwrap();
            archive.write_all(contents.as_bytes()).unwrap();
        }
        archive.finish().unwrap();

        let output = dir.join("book.txt");
        super::convert_document(&input, &output, "txt").unwrap();
        let text = fs::read_to_string(output).unwrap();
        assert!(text.find("First").unwrap() < text.find("Second").unwrap());
        assert!(text.contains("Hello & welcome."));
        assert!(text.contains("Last chapter."));

        let markdown = dir.join("book.md");
        super::convert_document(&input, &markdown, "md").unwrap();
        let markdown = fs::read_to_string(markdown).unwrap();
        assert!(markdown.contains("# First"));
        assert!(markdown.contains("# Second"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_epub_paths_that_escape_the_archive_root() {
        use std::io::Write;

        let dir = temp_dir();
        let input = dir.join("unsafe.epub");
        let mut archive = zip::ZipWriter::new(fs::File::create(&input).unwrap());
        archive
            .start_file(
                "mimetype",
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .unwrap();
        archive.write_all(b"application/epub+zip").unwrap();
        archive
            .start_file(
                "META-INF/container.xml",
                zip::write::SimpleFileOptions::default(),
            )
            .unwrap();
        archive
            .write_all(br#"<container><rootfile full-path="%2e%2e/book.opf"/></container>"#)
            .unwrap();
        archive.finish().unwrap();

        let output = dir.join("unsafe.txt");
        assert!(super::convert_document(&input, &output, "txt").is_err());
        assert!(!output.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_zip_files_without_the_epub_mimetype() {
        use std::io::Write;

        let dir = temp_dir();
        let input = dir.join("not-an-epub.epub");
        let mut archive = zip::ZipWriter::new(fs::File::create(&input).unwrap());
        archive
            .start_file(
                "mimetype",
                zip::write::SimpleFileOptions::default()
                    .compression_method(zip::CompressionMethod::Stored),
            )
            .unwrap();
        archive.write_all(b"application/zip").unwrap();
        archive.finish().unwrap();

        let output = dir.join("output.txt");
        assert!(super::convert_document(&input, &output, "txt").is_err());
        assert!(!output.exists());
        fs::remove_dir_all(dir).unwrap();
    }
}
