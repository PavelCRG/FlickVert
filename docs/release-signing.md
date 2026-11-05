# Release signing

Keep signing material out of Git. `.signing/` is ignored and contains local Windows updater signing files; do not stage it or paste its contents into chat, logs, or issues. CI reads release credentials from the repository's GitHub Actions Secrets.

Windows releases require `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for signed updater artifacts. Apple builds and signing are paused; no Apple credentials are required for the current Windows release workflow.
