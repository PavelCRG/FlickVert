use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io,
    path::{Component, Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};
use unicode_normalization::UnicodeNormalization;

const MAX_ENTRIES: usize = 20_000;
const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;
const MAX_TOTAL_SIZE: u64 = 2 * 1024 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewEntry {
    pub path: String,
    pub size: u64,
    pub directory: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZipPreview {
    pub entries: Vec<PreviewEntry>,
    pub file_count: usize,
    pub total_size: u64,
    pub conflicts: Vec<String>,
}

fn compression_level(level: u32) -> i64 {
    level.clamp(1, 9) as i64
}

fn duplicate_path(path: &str, seen: &mut HashSet<String>) -> bool {
    !seen.insert(path_key(path))
}

pub fn create_zip(inputs: &[PathBuf], output: &Path, level: u32) -> Result<(), String> {
    let file = File::create(output).map_err(|error| error.to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).compression_level(Some(compression_level(level)));
    let mut names = HashSet::new();
    let mut entries = 0;
    let mut total_size = 0;
    for input in inputs {
        let name = input
            .file_name()
            .ok_or("Input file name not found")?
            .to_string_lossy();
        add_to_zip(
            input,
            &name,
            &mut archive,
            options,
            &mut names,
            &mut entries,
            &mut total_size,
        )?;
    }
    archive
        .finish()
        .map_err(|error| error.to_string())?
        .sync_all()
        .map_err(|error| error.to_string())
}

fn add_to_zip(
    path: &Path,
    name: &str,
    archive: &mut ZipWriter<File>,
    options: SimpleFileOptions,
    names: &mut HashSet<String>,
    entries: &mut usize,
    total_size: &mut u64,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() && !metadata.is_dir() {
        return Err("ZIP creation does not include links or special files".into());
    }
    let normalized = safe_entry_path(name)?;
    let key = path_key(&normalized.to_string_lossy());
    if !names.insert(key) {
        return Err("Selected files have duplicate archive names".into());
    }
    *entries += 1;
    if *entries > MAX_ENTRIES {
        return Err("ZIP archive exceeds the 20,000 entry limit".into());
    }
    if metadata.is_dir() {
        let directory = format!("{}/", name.trim_end_matches(['/', '\\']));
        archive
            .add_directory(&directory, options)
            .map_err(|error| error.to_string())?;
        for child in fs::read_dir(path).map_err(|error| error.to_string())? {
            let child = child.map_err(|error| error.to_string())?;
            let child_name = format!(
                "{}/{}",
                name.trim_end_matches(['/', '\\']),
                child.file_name().to_string_lossy()
            );
            add_to_zip(
                &child.path(),
                &child_name,
                archive,
                options,
                names,
                entries,
                total_size,
            )?;
        }
    } else {
        if metadata.len() > MAX_FILE_SIZE {
            return Err("ZIP file exceeds the 512 MB limit".into());
        }
        *total_size = total_size
            .checked_add(metadata.len())
            .filter(|size| *size <= MAX_TOTAL_SIZE)
            .ok_or("ZIP archive exceeds the 2 GB limit")?;
        archive
            .start_file(name, options)
            .map_err(|error| error.to_string())?;
        let mut source = File::open(path).map_err(|error| error.to_string())?;
        io::copy(&mut source, archive).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn extract_zip(input: &Path, downloads: &Path, output_name: &str, selected_paths: Option<&[String]>, skip_existing: bool) -> Result<Option<PathBuf>, String> {
    let file = File::open(input).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() == 0 || archive.len() > MAX_ENTRIES {
        return Err("ZIP archive has an unsupported number of entries".into());
    }

    let mut entries = Vec::with_capacity(archive.len());
    let mut names = HashSet::new();
    let mut total_size = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let relative = safe_entry_path(entry.name())?;
        if duplicate_path(&relative.to_string_lossy(), &mut names) {
            return Err("ZIP archive contains duplicate paths".into());
        }
        if let Some(mode) = entry.unix_mode() {
            let kind = mode & 0o170000;
            if kind != 0 && kind != 0o040000 && kind != 0o100000 {
                return Err("ZIP archive contains a link or special file".into());
            }
        }
        if entry.size() > MAX_FILE_SIZE {
            return Err("ZIP entry exceeds the 512 MB extraction limit".into());
        }
        if entry.size()
            > entry
                .compressed_size()
                .saturating_mul(1000)
                .max(1024 * 1024)
        {
            return Err("ZIP entry has an unsafe compression ratio".into());
        }
        total_size = total_size
            .checked_add(entry.size())
            .filter(|size| *size <= MAX_TOTAL_SIZE)
            .ok_or("ZIP archive exceeds the 2 GB extraction limit")?;
        entries.push((index, relative, entry.is_dir()));
    }

    if let Some(selected_paths) = selected_paths {
        if selected_paths.is_empty() {
            return Err("Select at least one archive item".into());
        }
        let selected = selected_paths.iter().map(|name| safe_entry_path(name).map(|path| path.to_string_lossy().replace('\\', "/"))).collect::<Result<Vec<_>, _>>()?;
        for name in &selected {
            let key = path_key(name);
            if !entries.iter().any(|(_, path, _)| {
                let candidate = path.to_string_lossy().replace('\\', "/");
                let candidate = path_key(&candidate);
                candidate == key || candidate.starts_with(&format!("{key}/"))
            }) {
                return Err("Selected item was not found in the archive".into());
            }
        }
        entries.retain(|(_, path, _)| {
            let candidate = path_key(&path.to_string_lossy().replace('\\', "/"));
            selected.iter().any(|name| {
                let key = path_key(name);
                candidate == key || candidate.starts_with(&format!("{key}/"))
            })
        });
    }
    if entries.is_empty() {
        return Err("No archive items were selected".into());
    }

    fs::create_dir_all(downloads).map_err(|error| error.to_string())?;
    if skip_existing && downloads.join(output_name).exists() {
        return Ok(None);
    }
    let destination = unique_directory(downloads, output_name)?;
    let result = (|| {
        for (index, relative, is_dir) in &entries {
            let path = destination.join(relative);
            if !path.starts_with(&destination) {
                return Err("ZIP path escapes its destination".into());
            }
            if *is_dir {
                fs::create_dir_all(&path).map_err(|error| error.to_string())?;
                continue;
            }
            let parent = path.parent().ok_or("Invalid ZIP entry path")?;
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            let mut entry = archive.by_index(*index).map_err(|error| error.to_string())?;
            let mut output = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|error| error.to_string())?;
            io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
            output.sync_all().map_err(|error| error.to_string())?;
        }
        Ok(destination.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&destination);
    }
    result.map(Some)
}

pub fn preview_zip(input: &Path) -> Result<ZipPreview, String> {
    let file = File::open(input).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() == 0 || archive.len() > MAX_ENTRIES {
        return Err("ZIP archive has an unsupported number of entries".into());
    }
    let mut entries = Vec::with_capacity(archive.len());
    let mut seen = HashSet::new();
    let mut conflicts = Vec::new();
    let mut listed = HashSet::new();
    let mut file_count = 0;
    let mut total_size = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let path = safe_entry_path(entry.name())?;
        let path_string = path.to_string_lossy().replace('\\', "/");
        if duplicate_path(&path_string, &mut seen) && !conflicts.contains(&path_string) {
            conflicts.push(path_string.clone());
        }
        if entry.unix_mode().is_some_and(|mode| {
            let kind = mode & 0o170000;
            kind != 0 && kind != 0o040000 && kind != 0o100000
        }) {
            return Err("ZIP archive contains a link or special file".into());
        }
        if entry.size() > MAX_FILE_SIZE || entry.size() > entry.compressed_size().saturating_mul(1000).max(1024 * 1024) {
            return Err("ZIP entry exceeds a safe extraction limit".into());
        }
        total_size = total_size.checked_add(entry.size()).filter(|size| *size <= MAX_TOTAL_SIZE).ok_or("ZIP archive exceeds the 2 GB limit")?;
        let parts = path_string.split('/').collect::<Vec<_>>();
        for index in 1..parts.len() {
            let parent = parts[..index].join("/");
            if listed.insert(path_key(&parent)) {
                entries.push(PreviewEntry { path: parent, size: 0, directory: true });
            }
        }
        let directory = entry.is_dir();
        if !directory { file_count += 1; }
        if listed.insert(path_key(&path_string)) {
            entries.push(PreviewEntry { path: path_string, size: entry.size(), directory });
        }
    }
    Ok(ZipPreview { entries, file_count, total_size, conflicts })
}

fn safe_entry_path(name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.len() > 4096
        || name.contains('\0')
        || name.starts_with('/')
        || name.starts_with('\\')
        || name
            .split(['/', '\\'])
            .any(|component| component == ".." || component == ".")
        || name
            .split(['/', '\\'])
            .next()
            .is_some_and(|component| component.as_bytes().get(1) == Some(&b':'))
    {
        return Err("ZIP archive contains an unsafe path".into());
    }
    let normalized = name.replace('\\', "/");
    if normalized
        .split('/')
        .filter(|component| !component.is_empty())
        .any(windows_unsafe_component)
    {
        return Err("ZIP archive contains a name unsafe on Windows".into());
    }
    let enclosed = Path::new(&normalized)
        .components()
        .filter(|component| matches!(component, Component::Normal(_)))
        .collect::<PathBuf>();
    if enclosed.as_os_str().is_empty() || enclosed.components().count() == 0 {
        return Err("ZIP archive contains an invalid path".into());
    }
    Ok(enclosed)
}

fn windows_unsafe_component(component: &str) -> bool {
    let name = component.trim_end_matches(['.', ' ']);
    name != component
        || component
            .chars()
            .any(|character| matches!(character, ':' | '<' | '>' | '"' | '|' | '?' | '*'))
        || matches!(
            component
                .split('.')
                .next()
                .unwrap_or("")
                .to_ascii_uppercase()
                .as_str(),
            "CON"
                | "PRN"
                | "AUX"
                | "NUL"
                | "COM1"
                | "COM2"
                | "COM3"
                | "COM4"
                | "COM5"
                | "COM6"
                | "COM7"
                | "COM8"
                | "COM9"
                | "LPT1"
                | "LPT2"
                | "LPT3"
                | "LPT4"
                | "LPT5"
                | "LPT6"
                | "LPT7"
                | "LPT8"
                | "LPT9"
        )
}

fn unique_directory(parent: &Path, name: &str) -> Result<PathBuf, String> {
    for _ in 0..100 {
        let candidate =
            crate::files::unique_output_path(parent, name).map_err(|error| error.to_string())?;
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        }
    }
    Err("Could not allocate a unique extraction folder".into())
}

fn path_key(path: &str) -> String {
    let normalized = path.nfc().collect::<String>();
    #[cfg(any(windows, target_os = "macos"))]
    return normalized.to_lowercase();
    #[cfg(not(any(windows, target_os = "macos")))]
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn compression_level_is_bounded() {
        assert_eq!(compression_level(0), 1);
        assert_eq!(compression_level(5), 5);
        assert_eq!(compression_level(20), 9);
    }

    #[test]
    fn archive_path_keys_normalize_unicode_composition() {
        assert_eq!(path_key("caf\u{00e9}.txt"), path_key("cafe\u{0301}.txt"));
    }

    #[test]
    fn rejects_zip_slip_and_absolute_paths() {
        for path in ["../outside.txt", "/outside.txt", "C:\\outside.txt", "\\\\server\\share\\file"] {
            assert!(safe_entry_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn rejects_duplicate_archive_paths() {
        let mut seen = HashSet::new();
        assert!(!duplicate_path("same.txt", &mut seen));
        assert!(duplicate_path("same.txt", &mut seen));
    }

    #[test]
    fn rejects_symlink_entries() {
        let root = std::env::temp_dir().join(format!("flickvert-symlink-zip-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        zip.add_symlink("link", "target", SimpleFileOptions::default()).unwrap();
        zip.finish().unwrap();
        assert!(preview_zip(&archive_path).is_err());
        assert!(extract_zip(&archive_path, &root, "out", None, false).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unicode_equivalent_duplicate_paths() {
        let root = std::env::temp_dir().join(format!("flickvert-unicode-zip-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        for path in ["caf\u{00e9}.txt", "cafe\u{0301}.txt"] {
            zip.start_file(path, SimpleFileOptions::default()).unwrap();
            io::Write::write_all(&mut zip, b"x").unwrap();
        }
        zip.finish().unwrap();
        assert!(extract_zip(&archive_path, &root, "out", None, false).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn previews_archive_entries_and_uncompressed_size() {
        let root = std::env::temp_dir().join(format!("flickvert-zip-preview-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        zip.start_file("folder/photo.jpg", SimpleFileOptions::default()).unwrap();
        io::Write::write_all(&mut zip, b"photo").unwrap();
        zip.finish().unwrap();
        let preview = preview_zip(&archive_path).unwrap();
        assert_eq!(preview.total_size, 5);
        assert_eq!(preview.file_count, 1);
        assert!(preview.entries.iter().any(|entry| entry.path == "folder/photo.jpg"));
        assert!(preview.entries.iter().any(|entry| entry.path == "folder" && entry.directory));
        assert!(preview.conflicts.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn extracts_only_the_selected_file_or_folder() {
        let root = std::env::temp_dir().join(format!("flickvert-selective-zip-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        zip.start_file("keep.txt", SimpleFileOptions::default()).unwrap();
        io::Write::write_all(&mut zip, b"keep").unwrap();
        zip.start_file("folder/item.txt", SimpleFileOptions::default()).unwrap();
        io::Write::write_all(&mut zip, b"item").unwrap();
        zip.finish().unwrap();
        let selected = ["folder".to_owned()];
        let output = extract_zip(&archive_path, &root, "out", Some(&selected), false).unwrap().unwrap();
        assert!(output.join("folder/item.txt").is_file());
        assert!(!output.join("keep.txt").exists());
        let selected = ["keep.txt".to_owned()];
        let output = extract_zip(&archive_path, &root, "out", Some(&selected), false).unwrap().unwrap();
        assert!(output.join("keep.txt").is_file());
        assert!(!output.join("folder/item.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn extraction_uses_a_new_name_without_overwriting_existing_files() {
        let root = std::env::temp_dir().join(format!("flickvert-existing-zip-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let existing = root.join("out");
        fs::create_dir_all(&existing).unwrap();
        fs::write(existing.join("keep.txt"), b"keep").unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        zip.start_file("keep.txt", SimpleFileOptions::default()).unwrap();
        io::Write::write_all(&mut zip, b"archive").unwrap();
        zip.finish().unwrap();

        let extracted = extract_zip(&archive_path, &root, "out", None, false).unwrap().unwrap();
        assert_ne!(extracted, existing);
        assert_eq!(fs::read(existing.join("keep.txt")).unwrap(), b"keep");
        assert_eq!(fs::read(extracted.join("keep.txt")).unwrap(), b"archive");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn extraction_can_skip_an_existing_archive_folder() {
        let root = std::env::temp_dir().join(format!("flickvert-skip-existing-zip-{}", std::process::id()));
        fs::create_dir_all(root.join("out")).unwrap();
        let archive_path = root.join("sample.zip");
        let mut zip = ZipWriter::new(File::create(&archive_path).unwrap());
        zip.start_file("file.txt", SimpleFileOptions::default()).unwrap();
        io::Write::write_all(&mut zip, b"archive").unwrap();
        zip.finish().unwrap();
        assert!(extract_zip(&archive_path, &root, "out", None, true).unwrap().is_none());
        assert!(!root.join("out/file.txt").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn zips_folder_contents_with_the_folder_name() {
        let root = std::env::temp_dir().join(format!(
            "flickvert-archive-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let folder = root.join("photos");
        fs::create_dir_all(folder.join("nested")).unwrap();
        fs::write(folder.join("nested/photo.jpg"), b"photo").unwrap();
        let output = root.join("photos.zip");

        create_zip(&[folder], &output, 6).unwrap();

        let mut zip = ZipArchive::new(File::open(&output).unwrap()).unwrap();
        let mut photo = zip.by_name("photos/nested/photo.jpg").unwrap();
        let mut contents = String::new();
        io::Read::read_to_string(&mut photo, &mut contents).unwrap();
        assert_eq!(contents, "photo");
        drop(photo);
        drop(zip);
        fs::remove_dir_all(root).unwrap();
    }
}
