# Release signing

Keep signing material out of Git. `.signing/` is ignored and contains local Windows updater signing files; do not stage it or paste its contents into chat, logs, or issues. CI reads release credentials from the repository's GitHub Actions Secrets.

Windows releases require `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for signed updater artifacts. Apple builds and signing are paused; no Apple credentials are required for the current Windows release workflow.

The updater signature is separate from Windows Authenticode signing. The current Setup EXE and MSI do not carry an Authenticode publisher signature, so Windows SmartScreen may warn about an unrecognized download. GitHub release attestations verify which repository workflow produced the EXE, MSI, and portable ZIP; they are provenance records, not antivirus verdicts. See [download verification](download-verification.md).
