#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT
mock_bin="$root/bin"
target_dir="$root/target"
target=x86_64-apple-darwin
mkdir -p "$mock_bin"
if command -v swiftc >/dev/null 2>&1; then swiftc -parse scripts/find-mounted-dmg-device.swift; fi
export FLICKVERT_TEST_ROOT="$root" FLICKVERT_TAURI_TARGET_DIR="$target_dir"
export PATH="$mock_bin:$PATH"

cat > "$mock_bin/npm" <<'MOCK'
#!/bin/sh
count=0
[[ -f "$FLICKVERT_TEST_ROOT/count" ]] && count=$(cat "$FLICKVERT_TEST_ROOT/count")
count=$((count + 1))
printf '%s' "$count" > "$FLICKVERT_TEST_ROOT/count"
case "$FLICKVERT_TEST_MODE:$count" in
  nonbusy:*) echo 'packaging failed'; exit 17 ;;
  busy:1) mkdir -p "$FLICKVERT_TAURI_TARGET_DIR/$FLICKVERT_TEST_TARGET/release/bundle/macos"; touch "$FLICKVERT_TEST_IMAGE"; echo 'hdiutil: Resource busy'; exit 17 ;;
  busy:*) exit 0 ;;
esac
MOCK
cat > "$mock_bin/hdiutil" <<'MOCK'
#!/bin/sh
if [[ "$1" == info ]]; then
  if [[ "$2" == -plist ]]; then printf 'mock plist'; else printf 'mounted image diagnostics\n'; fi
elif [[ "$1" == detach && "$2" == /dev/disk42 ]]; then
  printf '%s' "$2" > "$FLICKVERT_TEST_ROOT/detached"
else
  echo "Unexpected hdiutil arguments: $*" >&2
  exit 3
fi
MOCK
cat > "$mock_bin/swift" <<'MOCK'
#!/bin/sh
cat >/dev/null
[[ "$2" == "$FLICKVERT_TEST_IMAGE" ]] && printf '/dev/disk42\n'
MOCK
chmod +x "$mock_bin/npm" "$mock_bin/hdiutil" "$mock_bin/swift"

export FLICKVERT_TEST_MODE=nonbusy FLICKVERT_TEST_TARGET="$target" FLICKVERT_TEST_IMAGE="$root/nonbusy.dmg"
set +e
bash scripts/build-macos.sh "$target" > "$root/nonbusy.log" 2>&1
status=$?
set -e
[[ $status -eq 17 && $(cat "$root/count") -eq 1 ]] || { cat "$root/nonbusy.log"; echo 'Non-busy failure was retried or masked.' >&2; exit 1; }

rm -f "$root/count" "$root/detached"
version=$(node -p "require('./package.json').version")
export FLICKVERT_TEST_MODE=busy FLICKVERT_TEST_IMAGE="$target_dir/$target/release/bundle/macos/rw.17070.FlickVert_${version}_x64.dmg"
bash scripts/build-macos.sh "$target" > "$root/busy.log" 2>&1 || { cat "$root/busy.log"; exit 1; }
[[ $(cat "$root/count") -eq 2 && $(cat "$root/detached") == /dev/disk42 ]] || { cat "$root/busy.log"; echo 'Busy-disk retry did not detach only its matching image and retry once.' >&2; exit 1; }

rm -f "$root/count" "$root/detached"
arm_target=aarch64-apple-darwin
export FLICKVERT_TEST_MODE=busy FLICKVERT_TEST_TARGET="$arm_target" FLICKVERT_TEST_IMAGE="$target_dir/$arm_target/release/bundle/macos/rw.17070.FlickVert_${version}_aarch64.dmg"
bash scripts/build-macos.sh "$arm_target" > "$root/arm.log" 2>&1 || { cat "$root/arm.log"; exit 1; }
[[ $(cat "$root/detached") == /dev/disk42 ]] || { cat "$root/arm.log"; echo 'Apple Silicon DMG retry did not match its architecture-specific image.' >&2; exit 1; }

rm -f "$root/count" "$root/detached"
export FLICKVERT_TEST_MODE=busy FLICKVERT_TEST_TARGET="$target" FLICKVERT_TEST_IMAGE="$target_dir/$target/release/bundle/macos/rw.17070.FlickVert_0.1.2_x64.dmg"
set +e
bash scripts/build-macos.sh "$target" > "$root/unrelated.log" 2>&1
status=$?
set -e
[[ $status -eq 17 && $(cat "$root/count") -eq 1 && ! -f "$root/detached" ]] || { cat "$root/unrelated.log"; echo 'Unrelated mounted images must not be detached or retried.' >&2; exit 1; }
echo 'macOS DMG retry tests passed.'
