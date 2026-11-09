pub(crate) fn cleanup_stale_workspaces(root: &std::path::Path, now: std::time::SystemTime) {
    let Ok(entries) = std::fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if is_stale_workspace(
            &entry.file_name().to_string_lossy(),
            metadata.is_dir(),
            metadata.modified().ok(),
            now,
        ) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

fn is_stale_workspace(
    name: &str,
    is_dir: bool,
    modified: Option<std::time::SystemTime>,
    now: std::time::SystemTime,
) -> bool {
    let Some((pid, counter)) = name.split_once('-') else {
        return false;
    };
    is_dir
        && pid.bytes().all(|byte| byte.is_ascii_digit())
        && counter.bytes().all(|byte| byte.is_ascii_digit())
        && modified
            .and_then(|time| now.duration_since(time).ok())
            .is_some_and(|age| age > std::time::Duration::from_secs(24 * 60 * 60))
}

#[cfg(test)]
mod tests {
    use super::is_stale_workspace;

    #[test]
    fn stale_cleanup_only_matches_old_generated_workspace_directories() {
        let now = std::time::SystemTime::now();
        let old = now - std::time::Duration::from_secs(2 * 24 * 60 * 60);
        assert!(is_stale_workspace("123-4", true, Some(old), now));
        assert!(!is_stale_workspace("user-files", true, Some(old), now));
        assert!(!is_stale_workspace("123-4", false, Some(old), now));
        assert!(!is_stale_workspace("123-4", true, Some(now), now));
    }
}
