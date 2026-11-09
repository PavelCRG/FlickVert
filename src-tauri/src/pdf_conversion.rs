use lopdf::{Dictionary, Document, LoadOptions, Object, ObjectId};
use std::collections::HashSet;
use std::{
    fs::File,
    io::Write,
    path::{Path, PathBuf},
};

const MAX_PDF_INPUT_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PDF_PAGES: usize = 10_000;
const MAX_PDF_STREAM_BYTES: usize = 32 * 1024 * 1024;
const MAX_PDF_TEXT_BYTES: usize = 64 * 1024 * 1024;
const MAX_PDF_MERGE_BYTES: u64 = 512 * 1024 * 1024;

fn load_pdf(path: &Path) -> Result<Document, String> {
    if std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_PDF_INPUT_BYTES
    {
        return Err("PDF exceeds the 128 MiB input limit".into());
    }
    let document = Document::load_with_options(
        path,
        LoadOptions::with_max_decompressed_size(MAX_PDF_STREAM_BYTES),
    )
    .map_err(|error| error.to_string())?;
    if document.is_encrypted() {
        return Err("encrypted PDFs are not supported".into());
    }
    if document.get_pages().is_empty() {
        return Err("PDF has no pages".into());
    }
    Ok(document)
}

fn inherited_attribute(
    document: &Document,
    page_id: ObjectId,
    key: &[u8],
) -> lopdf::Result<Option<Object>> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    loop {
        if !visited.insert(current) {
            return Err(lopdf::Error::ReferenceCycle(current));
        }
        let node = document.get_dictionary(current)?;
        if let Ok(value) = node.get(key) {
            match document.dereference(value) {
                Ok((_, Object::Null)) | Err(lopdf::Error::ObjectNotFound(_)) => {}
                Ok(_) => return Ok(Some(value.clone())),
                Err(error) => return Err(error),
            }
        }
        match node.get(b"Parent") {
            Err(_) | Ok(Object::Null) => return Ok(None),
            Ok(parent) => current = parent.as_reference()?,
        }
    }
}

fn materialize_page(document: &Document, page_id: ObjectId) -> Result<Dictionary, String> {
    let mut page = document
        .get_dictionary(page_id)
        .map_err(|error| error.to_string())?
        .clone();
    let media = inherited_attribute(document, page_id, b"MediaBox")
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "PDF page has no MediaBox".to_owned())?;
    let crop = inherited_attribute(document, page_id, b"CropBox")
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| media.clone());
    let resources = inherited_attribute(document, page_id, b"Resources")
        .map_err(|error| error.to_string())?
        .unwrap_or(Object::Dictionary(Dictionary::new()));
    let rotate = inherited_attribute(document, page_id, b"Rotate")
        .map_err(|error| error.to_string())?
        .unwrap_or(Object::Integer(0));
    page.set("MediaBox", media);
    page.set("CropBox", crop);
    page.set("Resources", resources);
    page.set("Rotate", rotate);
    Ok(page)
}

pub fn pdf_page_count(path: &Path) -> Result<u32, String> {
    let document = load_pdf(path)?;
    let count = document.get_pages().len();
    if count > MAX_PDF_PAGES {
        return Err("PDF page count exceeds the 10,000 page limit".into());
    }
    Ok(count as u32)
}

pub fn edit_pdf_pages(
    input: &Path,
    page_order: &[u32],
    rotations: &[u16],
    output: &Path,
) -> Result<(), String> {
    let mut document = load_pdf(input)?;
    let original = document.get_pages();
    let count = original.len();
    if count > MAX_PDF_PAGES
        || page_order.len() != count
        || rotations.len() != count
        || rotations
            .iter()
            .any(|angle| ![0, 90, 180, 270].contains(angle))
        || {
            let mut order = page_order.to_vec();
            order.sort_unstable();
            order != (1..=count as u32).collect::<Vec<_>>()
        }
    {
        return Err("invalid PDF page order or rotation".into());
    }
    let root_id = document
        .get_pages()
        .values()
        .next()
        .and_then(|id| document.get_dictionary(*id).ok())
        .and_then(|page| page.get(b"Parent").ok())
        .and_then(|parent| parent.as_reference().ok())
        .ok_or_else(|| "PDF page tree is invalid".to_owned())?;
    let mut kids = Vec::with_capacity(count);
    for source_page in page_order {
        let page_id = *original
            .get(source_page)
            .ok_or_else(|| "invalid PDF page number".to_owned())?;
        let old_rotation = inherited_attribute(&document, page_id, b"Rotate")
            .map_err(|error| error.to_string())?
            .unwrap_or(Object::Integer(0));
        let (_, old_rotation) = document
            .dereference(&old_rotation)
            .map_err(|error| error.to_string())?;
        let old_rotation = old_rotation.as_i64().map_err(|error| error.to_string())?;
        if old_rotation % 90 != 0 {
            return Err("PDF page rotation must be a multiple of 90 degrees".into());
        }
        let mut page = materialize_page(&document, page_id)?;
        page.set("Parent", root_id);
        page.set(
            "Rotate",
            (old_rotation + rotations[*source_page as usize - 1] as i64).rem_euclid(360),
        );
        document.objects.insert(page_id, Object::Dictionary(page));
        kids.push(Object::Reference(page_id));
    }
    let root = document
        .get_dictionary_mut(root_id)
        .map_err(|error| error.to_string())?;
    root.set("Kids", kids);
    root.set("Count", count as u32);
    for key in ["MediaBox", "CropBox", "Resources", "Rotate"] {
        root.remove(key.as_bytes());
    }
    document.save(output).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn merge_pdf_documents(mut sources: Vec<Document>) -> Result<Document, String> {
    if !(2..=1000).contains(&sources.len()) {
        return Err("select between 2 and 1,000 PDFs".into());
    }
    let mut merged = Document::with_version("1.5");
    let mut page_refs = Vec::new();
    let mut next_id = 1;
    let mut roots = None;
    for source in &mut sources {
        let pages = source.get_pages();
        if pages.len() > MAX_PDF_PAGES
            || page_refs.len().saturating_add(pages.len()) > MAX_PDF_PAGES
        {
            return Err("merged PDF exceeds the 10,000 page limit".into());
        }
        for page_id in pages.values() {
            let page = materialize_page(source, *page_id)?;
            source.objects.insert(*page_id, Object::Dictionary(page));
        }
        source.renumber_objects_with(next_id);
        next_id = source.max_id.saturating_add(1);
        let catalog_id = source
            .trailer
            .get(b"Root")
            .and_then(Object::as_reference)
            .map_err(|error| error.to_string())?;
        let pages_root = source
            .get_dictionary(catalog_id)
            .and_then(|catalog| catalog.get(b"Pages"))
            .and_then(Object::as_reference)
            .map_err(|error| error.to_string())?;
        if roots.is_none() {
            roots = Some((catalog_id, pages_root));
        }
        page_refs.extend(source.get_pages().into_values().map(Object::Reference));
        for (id, object) in std::mem::take(&mut source.objects) {
            match object.type_name().unwrap_or(b"") {
                b"Catalog" | b"Pages" | b"Page" | b"Outlines" | b"Outline" => {
                    if id == catalog_id {
                        merged.objects.insert(id, object);
                    } else if id == pages_root {
                        merged.objects.insert(id, object);
                    } else if object.type_name().ok() == Some(b"Page".as_slice()) {
                        merged.objects.insert(id, object);
                    }
                }
                _ => {
                    merged.objects.insert(id, object);
                }
            }
        }
    }
    let (catalog_id, pages_id) = roots.ok_or_else(|| "PDF catalog is missing".to_owned())?;
    for page in &page_refs {
        let id = page.as_reference().map_err(|error| error.to_string())?;
        merged
            .get_dictionary_mut(id)
            .map_err(|error| error.to_string())?
            .set("Parent", pages_id);
    }
    merged
        .get_dictionary_mut(catalog_id)
        .map_err(|error| error.to_string())?
        .remove(b"Outlines");
    let pages = merged
        .get_dictionary_mut(pages_id)
        .map_err(|error| error.to_string())?;
    let page_count = page_refs.len() as u32;
    pages.set("Kids", page_refs);
    pages.set("Count", page_count);
    for key in ["MediaBox", "CropBox", "Resources", "Rotate"] {
        pages.remove(key.as_bytes());
    }
    merged.trailer.set("Root", catalog_id);
    merged.max_id = merged.objects.keys().map(|(id, _)| *id).max().unwrap_or(0);
    merged.renumber_objects();
    Ok(merged)
}

pub fn merge_pdf_files(inputs: &[PathBuf], output: &Path) -> Result<(), String> {
    if inputs.len() < 2 || inputs.len() > 1000 {
        return Err("select between 2 and 1,000 PDFs".into());
    }
    let mut bytes = 0u64;
    let mut documents = Vec::with_capacity(inputs.len());
    for input in inputs {
        bytes = bytes
            .checked_add(
                std::fs::metadata(input)
                    .map_err(|error| error.to_string())?
                    .len(),
            )
            .filter(|size| *size <= MAX_PDF_MERGE_BYTES)
            .ok_or_else(|| "PDF inputs exceed the 512 MiB merge limit".to_owned())?;
        documents.push(load_pdf(input)?);
    }
    merge_pdf_documents(documents)?
        .save(output)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn split_pdf_page(input: &Path, page_number: u32, output: &Path) -> Result<(), String> {
    let mut document = load_pdf(input)?;
    let pages = document.get_pages();
    if pages.len() > MAX_PDF_PAGES || page_number == 0 || page_number as usize > pages.len() {
        return Err("invalid PDF page number".into());
    }
    let remove = (1..=pages.len() as u32)
        .filter(|page| *page != page_number)
        .collect::<Vec<_>>();
    document.delete_pages(&remove);
    document.prune_objects();
    document
        .save(output)
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn pdf_to_text(input: &Path, output: &Path, extension: &str) -> Result<(), String> {
    if !matches!(extension, "txt" | "md") {
        return Err("unsupported PDF text output format".into());
    }
    if std::fs::metadata(input)
        .map_err(|error| error.to_string())?
        .len()
        > MAX_PDF_INPUT_BYTES
    {
        return Err("PDF exceeds the 128 MiB input limit".into());
    }
    let document = Document::load_with_options(
        input,
        LoadOptions::with_max_decompressed_size(MAX_PDF_STREAM_BYTES),
    )
    .map_err(|error| error.to_string())?;
    if document.is_encrypted() {
        return Err("encrypted PDFs are not supported".into());
    }
    let pages = document.get_pages();
    if pages.is_empty() || pages.len() > MAX_PDF_PAGES {
        return Err("PDF page count is outside the supported limit".into());
    }
    let mut file = File::create(output).map_err(|error| error.to_string())?;
    let mut total_bytes = 0usize;
    for (index, page) in pages.keys().enumerate() {
        if index > 0 {
            file.write_all(b"\n\n").map_err(|error| error.to_string())?;
            total_bytes += 2;
        }
        let text = document
            .extract_text_with_limit(&[*page], MAX_PDF_STREAM_BYTES)
            .map_err(|error| error.to_string())?;
        total_bytes = total_bytes
            .checked_add(text.len())
            .filter(|size| *size <= MAX_PDF_TEXT_BYTES)
            .ok_or_else(|| "extracted PDF text exceeds the 64 MiB output limit".to_owned())?;
        file.write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
    }
    file.sync_all().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use lopdf::{
        Document, Object, Stream,
        content::{Content, Operation},
        dictionary,
    };
    use std::{
        fs,
        path::Path,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEMP_ID: AtomicU64 = AtomicU64::new(0);

    fn make_document(texts: &[&str]) -> Document {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font", "Subtype" => "Type1", "BaseFont" => "Helvetica",
        });
        let resources_id = document.add_object(dictionary! {
            "Font" => dictionary! { "F1" => font_id },
        });
        let page_ids = texts
            .iter()
            .map(|text| {
                let content = Content {
                    operations: vec![
                        Operation::new("BT", vec![]),
                        Operation::new("Tf", vec![Object::Name(b"F1".to_vec()), 12.into()]),
                        Operation::new("Td", vec![72.into(), 100.into()]),
                        Operation::new("Tj", vec![Object::string_literal(*text)]),
                        Operation::new("ET", vec![]),
                    ],
                };
                let content_id =
                    document.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
                document.add_object(dictionary! {
                    "Type" => "Page", "Parent" => pages_id, "Contents" => content_id,
                })
            })
            .collect::<Vec<_>>();
        document.objects.insert(pages_id, Object::Dictionary(dictionary! {
            "Type" => "Pages", "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(), "Count" => page_ids.len() as u32,
            "Resources" => resources_id, "MediaBox" => vec![0.into(), 0.into(), 595.into(), 842.into()],
        }));
        let catalog_id =
            document.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
        document.trailer.set("Root", catalog_id);
        document
    }

    fn make_pdf(path: &Path, text: &str) {
        let mut document = make_document(&[text]);
        document.save(path).unwrap();
    }

    fn temp_pdf() -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "flickvert-pdf-{}-{}.pdf",
            std::process::id(),
            TEMP_ID.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn extracts_selectable_pdf_text_without_external_tools() {
        let input = temp_pdf();
        let output = input.with_extension("txt");
        make_pdf(&input, "Hello local PDF");

        super::pdf_to_text(&input, &output, "txt").unwrap();

        assert_eq!(fs::read_to_string(&output).unwrap(), "Hello local PDF\n");
        fs::remove_file(input).unwrap();
        fs::remove_file(output).unwrap();
    }

    #[test]
    fn merges_pdfs_and_materializes_inherited_page_attributes() {
        let merged = super::merge_pdf_documents(vec![
            make_document(&["First"]),
            make_document(&["Second", "Third"]),
        ])
        .unwrap();
        let pages = merged.get_pages();
        assert_eq!(pages.len(), 3);
        assert_eq!(
            merged.extract_text(&[1, 2, 3]).unwrap(),
            "First\nSecond\nThird\n"
        );
        for page_id in pages.into_values() {
            let page = merged.get_dictionary(page_id).unwrap();
            assert!(page.get(b"MediaBox").is_ok());
            assert!(page.get(b"Resources").is_ok());
        }
    }

    #[test]
    fn reorders_pages_and_sets_absolute_rotations() {
        let input = temp_pdf();
        let output = input.with_file_name("edited.pdf");
        make_document(&["First", "Second"]).save(&input).unwrap();

        super::edit_pdf_pages(&input, &[2, 1], &[90, 270], &output).unwrap();

        let edited = Document::load(&output).unwrap();
        assert_eq!(edited.extract_text(&[1, 2]).unwrap(), "Second\nFirst\n");
        for (index, page_id) in edited.get_pages().into_values().enumerate() {
            assert_eq!(
                edited
                    .get_dictionary(page_id)
                    .unwrap()
                    .get(b"Rotate")
                    .unwrap()
                    .as_i64()
                    .unwrap(),
                [270, 90][index]
            );
        }
        fs::remove_file(input).unwrap();
        fs::remove_file(output).unwrap();
    }

    #[test]
    fn splits_one_page_and_keeps_its_inherited_resources() {
        let input = temp_pdf();
        let output = input.with_file_name("split-page.pdf");
        make_document(&["First", "Second"]).save(&input).unwrap();
        super::split_pdf_page(&input, 2, &output).unwrap();
        let split = Document::load(&output).unwrap();
        assert_eq!(split.get_pages().len(), 1);
        assert_eq!(split.extract_text(&[1]).unwrap(), "Second\n");
        fs::remove_file(input).unwrap();
        fs::remove_file(output).unwrap();
    }

    #[test]
    fn keeps_existing_pdf_rotation_when_no_rotation_is_requested() {
        let input = temp_pdf();
        let output = input.with_file_name("kept-rotation.pdf");
        let mut document = make_document(&["First", "Second"]);
        let pages_root = document
            .get_pages()
            .values()
            .next()
            .and_then(|id| {
                document
                    .get_dictionary(*id)
                    .unwrap()
                    .get(b"Parent")
                    .unwrap()
                    .as_reference()
                    .ok()
            })
            .unwrap();
        document
            .get_dictionary_mut(pages_root)
            .unwrap()
            .set("Rotate", 90);
        document.save(&input).unwrap();

        super::edit_pdf_pages(&input, &[2, 1], &[0, 0], &output).unwrap();

        let edited = Document::load(&output).unwrap();
        for page_id in edited.get_pages().into_values() {
            assert_eq!(
                edited
                    .get_dictionary(page_id)
                    .unwrap()
                    .get(b"Rotate")
                    .unwrap()
                    .as_i64()
                    .unwrap(),
                90
            );
        }
        fs::remove_file(input).unwrap();
        fs::remove_file(output).unwrap();
    }
}
