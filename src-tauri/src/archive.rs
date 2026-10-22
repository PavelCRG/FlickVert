use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io,
    path::{Component, Path, PathBuf},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const MAX_ENTRIES: usize = 20_000;
const MAX_FILE_SIZE: u64 = 512 * 1024 * 1024;
const MAX_TOTAL_SIZE: u64 = 2 * 1024 * 1024 * 1024;

pub fn create_zip(inputs: &[PathBuf], output: &Path) -> Result<(), String> {
    let file = File::create(output).map_err(|error| error.to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut names = HashSet::new();
    for input in inputs {
        let name = input
            .file_name()
            .ok_or("Input file name not found")?
            .to_string_lossy()
            .replace('\\', "/");
        if name.is_empty() || !names.insert(path_key(&name)) {
            return Err("Selected files have duplicate archive names".into());
        }
        archive
            .start_file(name, options)
            .map_err(|error| error.to_string())?;
        let mut source = File::open(input).map_err(|error| error.to_string())?;
        io::copy(&mut source, &mut archive).map_err(|error| error.to_string())?;
    }
    archive
        .finish()
        .map_err(|error| error.to_string())?
        .sync_all()
        .map_err(|error| error.to_string())
}

pub fn extract_zip(input: &Path, downloads: &Path, output_name: &str) -> Result<PathBuf, String> {
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
        let key = path_key(&relative.to_string_lossy());
        if !names.insert(key) {
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
        entries.push((relative, entry.is_dir()));
    }

    fs::create_dir_all(downloads).map_err(|error| error.to_string())?;
    let destination = unique_directory(downloads, output_name)?;
    let result = (|| {
        for (index, (relative, is_dir)) in entries.iter().enumerate() {
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
            let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
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
    result
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
    #[cfg(any(windows, target_os = "macos"))]
    return path.to_lowercase();
    #[cfg(not(any(windows, target_os = "macos")))]
    path.to_owned()
}
