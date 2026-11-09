use pulldown_cmark::{Event, Parser, TagEnd, html};
use std::{fs, path::Path};

const MAX_DOCUMENT_INPUT_BYTES: u64 = 16 * 1024 * 1024;
const MAX_HTML_INPUT_BYTES: u64 = 4 * 1024 * 1024;
const MAX_DOCUMENT_OUTPUT_BYTES: usize = 128 * 1024 * 1024;

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
    let source = fs::read_to_string(input).map_err(|error| error.to_string())?;
    let converted = match (source_extension.as_str(), extension) {
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
            let markdown =
                html2text::from_read(source.as_bytes(), 100).map_err(|error| error.to_string())?;
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
    };
    if converted.len() > MAX_DOCUMENT_OUTPUT_BYTES {
        return Err("converted document exceeds the 128 MiB output limit".into());
    }
    fs::write(output, converted).map_err(|error| error.to_string())
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
}
