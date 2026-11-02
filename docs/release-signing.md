# Release signing

Keep signing material out of Git. `.signing/` is ignored and contains local Windows updater signing files; do not stage it or paste its contents into chat, logs, or issues. CI reads release credentials from the repository's GitHub Actions Secrets.

Required secrets:

- `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` for signed updater artifacts.
- `APPLE_CERTIFICATE` (base64-encoded Developer ID `.p12`) and `APPLE_CERTIFICATE_PASSWORD` for macOS code signing.
- `APPLE_SIGNING_IDENTITY` (the matching Developer ID Application identity), `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password), and `APPLE_TEAM_ID` for macOS notarization.

The tagged macOS workflow fails before bundling if any Apple secret is missing. It verifies the app signature, Gatekeeper assessment, and stapled notarization tickets on both Intel and Apple Silicon runners. Never put certificate or private-key files in release assets.
