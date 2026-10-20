use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::atomic::{AtomicU64, Ordering}};

#[derive(Debug)]
pub enum FileError { Io(std::io::Error), InvalidName }

impl From<std::io::Error> for FileError { fn from(value: std::io::Error) -> Self { Self::Io(value) } }
impl std::fmt::Display for FileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self { Self::Io(error) => write!(f, "{error}"), Self::InvalidName => f.write_str("Invalid output filename") }
    }
}

static TEMP_ID: AtomicU64 = AtomicU64::new(0);

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && Path::new(name).file_name().is_some_and(|part| part == name)
}

fn exists_case_aware(directory: &Path, candidate: &str) -> Result<bool, FileError> {
    for entry in fs::read_dir(directory)? {
        let name = entry?.file_name().to_string_lossy().into_owned();
        #[cfg(windows)]
        let matches = name.eq_ignore_ascii_case(candidate);
        #[cfg(not(windows))]
        let matches = name == candidate;
        if matches { return Ok(true); }
    }
    Ok(false)
}

pub fn unique_output_path(directory: &Path, file_name: &str) -> Result<PathBuf, FileError> {
    if !valid_name(file_name) { return Err(FileError::InvalidName); }
    let (stem, extension) = file_name.rsplit_once('.').filter(|(stem, _)| !stem.is_empty()).unwrap_or((file_name, ""));
    for index in 1u32.. {
        let candidate = if index == 1 { file_name.to_owned() } else if extension.is_empty() { format!("{stem} ({index})") } else { format!("{stem} ({index}).{extension}") };
        if !exists_case_aware(directory, &candidate)? { return Ok(directory.join(candidate)); }
    }
    unreachable!()
}

pub fn write_output(directory: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, FileError> {
    if !valid_name(file_name) { return Err(FileError::InvalidName); }
    fs::create_dir_all(directory)?;
    let mut temporary = None;
    for _ in 0..32 {
        let path = directory.join(format!(".flickvert-{}-{}.tmp", std::process::id(), TEMP_ID.fetch_add(1, Ordering::Relaxed)));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                let written = file.write_all(bytes).and_then(|_| file.sync_all());
                drop(file);
                if let Err(error) = written { let _ = fs::remove_file(&path); return Err(error.into()); }
                temporary = Some(path); break;
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    let temporary = temporary.ok_or_else(|| std::io::Error::new(std::io::ErrorKind::AlreadyExists, "could not allocate temporary output"))?;
    let result = (|| {
        for _ in 0..100 {
            let target = unique_output_path(directory, file_name)?;
            match fs::hard_link(&temporary, &target) {
                Ok(()) => return Ok(target),
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(FileError::Io(error)),
            }
        }
        Err(FileError::Io(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "too many output name collisions")))
    })();
    let _ = fs::remove_file(temporary);
    result
}

pub fn output_directory(downloads: &Path) -> Result<PathBuf, FileError> {
    let directory = downloads.join("FlickVert");
    fs::create_dir_all(&directory)?;
    Ok(directory)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    fn dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!("flickvert-test-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&path).unwrap(); path
    }

    #[test]
    fn chooses_original_then_incrementing_names() {
        let root = dir();
        assert_eq!(unique_output_path(&root, "photo.webp").unwrap(), root.join("photo.webp"));
        fs::write(root.join("photo.webp"), b"first").unwrap();
        assert_eq!(unique_output_path(&root, "photo.webp").unwrap(), root.join("photo (2).webp"));
        fs::write(root.join("photo (2).webp"), b"second").unwrap();
        assert_eq!(unique_output_path(&root, "photo.webp").unwrap(), root.join("photo (3).webp"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_case_insensitive_windows_collisions() {
        let root = dir();
        fs::write(root.join("Photo.webp"), b"keep").unwrap();
        assert_eq!(unique_output_path(&root, "photo.webp").unwrap(), root.join("photo (2).webp"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_complete_bytes_without_replacing_existing_output() {
        let root = dir();
        fs::write(root.join("photo.webp"), b"old").unwrap();
        let output = write_output(&root, "photo.webp", b"new complete bytes").unwrap();
        assert_eq!(fs::read(root.join("photo.webp")).unwrap(), b"old");
        assert_eq!(fs::read(output).unwrap(), b"new complete bytes");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_write_leaves_no_partial_target() {
        let root = dir();
        assert!(write_output(&root, "missing/photo.webp", b"data").is_err());
        assert!(!root.join("missing").exists());
        let _ = fs::remove_dir_all(root);
    }
}
