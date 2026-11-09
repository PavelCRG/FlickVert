use std::{
    collections::{HashMap, HashSet},
    fs,
    ops::Deref,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64},
        Arc, Mutex,
    },
};

#[derive(Default)]
pub(crate) struct DroppedFiles(pub(crate) Mutex<HashSet<PathBuf>>);

#[derive(Default)]
pub(crate) struct DragTrigger(pub(crate) Mutex<bool>);

#[derive(Default)]
pub(crate) struct RegisteredShortcut(pub(crate) Mutex<Option<String>>);

#[derive(Default)]
pub(crate) struct OperationShortcuts(pub(crate) Mutex<HashMap<String, String>>);

pub(crate) struct ConfirmQuitOnClose(pub(crate) AtomicBool);

pub(crate) struct StartupFiles(pub(crate) Mutex<Vec<String>>);

pub(crate) struct TemporaryDirectory(pub(crate) PathBuf);

impl Deref for TemporaryDirectory {
    type Target = Path;

    fn deref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TemporaryDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(crate) struct OperationJobs {
    pub(crate) next: AtomicU64,
    pub(crate) active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Default for OperationJobs {
    fn default() -> Self {
        Self {
            next: AtomicU64::new(0),
            active: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationProgress {
    pub(crate) job_id: String,
    pub(crate) progress: u8,
}

pub(crate) static MEDIA_TEMP_ID: AtomicU64 = AtomicU64::new(0);

#[cfg(test)]
mod tests {
    use super::TemporaryDirectory;
    use std::fs;

    #[test]
    fn temporary_work_directory_is_removed_on_drop() {
        let path =
            std::env::temp_dir().join(format!("flickvert-cleanup-test-{}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("partial"), b"partial output").unwrap();
        drop(TemporaryDirectory(path.clone()));
        assert!(!path.exists());
    }
}
