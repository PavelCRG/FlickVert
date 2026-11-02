#!/usr/bin/env bash
set -uo pipefail

target=${1:?usage: build-macos.sh <rust-target> [tauri-config]}
config=${2:-}
log=$(mktemp)
trap 'rm -f "$log"' EXIT
command=(npm run tauri -- build --target "$target")
if [[ -n "$config" ]]; then command+=(--config "$config"); fi

if "${command[@]}" >"$log" 2>&1; then
  cat "$log"
  exit 0
else
  status=$?
fi
cat "$log"
if ! grep -Eiq 'resource busy|device busy|already mounted' "$log"; then
  echo 'DMG build failed for a reason other than a busy mounted image; not retrying.' >&2
  exit "$status"
fi

echo 'DMG build hit a busy mounted image. Inspecting mounted images before a single retry.' >&2
hdiutil info
bundle_dir="${FLICKVERT_TAURI_TARGET_DIR:-src-tauri/target}/$target/release/bundle/dmg"
if [[ ! -d "$bundle_dir" ]]; then
  echo "DMG output directory is missing: $bundle_dir" >&2
  exit "$status"
fi
images=()
while IFS= read -r image_path; do images+=("$image_path"); done < <(find "$bundle_dir" -maxdepth 1 -type f -name '*.dmg' -print)
if [[ ${#images[@]} -ne 1 ]]; then
  echo "Expected one DMG to inspect in $bundle_dir; found ${#images[@]}. Refusing to detach an unrelated image." >&2
  exit "$status"
fi
image=$(cd "$(dirname "${images[0]}")" && pwd)/$(basename "${images[0]}")
devices=$(hdiutil info -plist | swift scripts/find-mounted-dmg-device.swift "$image")
if [[ -z "$devices" ]]; then
  echo "No mounted image matches the generated DMG: $image. Refusing broad cleanup." >&2
  exit "$status"
fi
while IFS= read -r device; do
  echo "Detaching only $device mounted from $image." >&2
  hdiutil detach "$device" || { echo 'Could not detach the matching mounted DMG; retry stopped.' >&2; exit 1; }
done <<< "$devices"

if "${command[@]}"; then
  exit 0
else
  status=$?
  echo 'DMG build still failed after cleanup; retry error is returned unchanged.' >&2
  exit "$status"
fi
