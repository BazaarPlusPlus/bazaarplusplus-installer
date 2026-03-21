#!/usr/bin/env bash
set -euo pipefail

PROD=false
CLEAN_DEPS=false

usage() {
    cat <<'EOF'
Usage:
  ./build.sh
      Start the local Tauri dev app.

  ./build.sh --prod
      Build release artifacts for the current host platform.

  ./build.sh --prod --clean-deps
      Reinstall npm dependencies before building.
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --prod)
            PROD=true
            ;;
        --clean-deps)
            CLEAN_DEPS=true
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            exit 1
            ;;
    esac
    shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_CONFIG="$SCRIPT_DIR/src-tauri/tauri.windows.conf.json"
MACOS_CONFIG="$SCRIPT_DIR/src-tauri/tauri.macos.conf.json"
WINDOWS_ZIP="$SCRIPT_DIR/src-tauri/resources/BepInExSource/windows/BepInEx.zip"
MACOS_ZIP="$SCRIPT_DIR/src-tauri/resources/BepInExSource/macos/BepInEx.zip"
BUNDLE_DIR="$SCRIPT_DIR/src-tauri/target/release/bundle"

assert_command() {
    local name="$1"
    local hint="${2:-}"
    if ! command -v "$name" &>/dev/null; then
        if [ -n "$hint" ]; then
            echo "Error: $name not found. $hint" >&2
        else
            echo "Error: $name not found." >&2
        fi
        exit 1
    fi
}

assert_file() {
    local path="$1"
    local label="$2"
    if [ ! -f "$path" ]; then
        echo "Error: Missing $label: $path" >&2
        exit 1
    fi
}

invoke_step() {
    local label="$1"
    shift
    echo "==> $label"
    "$@"
}

current_platform() {
    case "$(uname -s)" in
        Darwin) echo "macos" ;;
        MINGW*|MSYS*|CYGWIN*|Windows_NT) echo "windows" ;;
        *) echo "unknown" ;;
    esac
}

install_dependencies() {
    if [ "$CLEAN_DEPS" = false ] \
        && [ -d "$SCRIPT_DIR/node_modules" ] \
        && [ -d "$SCRIPT_DIR/node_modules/@tauri-apps/cli" ] \
        && { [ -f "$SCRIPT_DIR/node_modules/.bin/tauri" ] || [ -f "$SCRIPT_DIR/node_modules/.bin/tauri.cmd" ]; }; then
        echo "==> Reusing existing npm dependencies"
        echo "    Remove node_modules or rerun with --clean-deps to force a reinstall."
        return
    fi

    if [ "$CLEAN_DEPS" = true ] && [ -f "$SCRIPT_DIR/package-lock.json" ]; then
        invoke_step "Installing npm dependencies" npm ci
    else
        invoke_step "Installing npm dependencies" npm install
    fi
}

build_prod() {
    local platform="$1"
    local config=""
    local resource_zip=""
    local bundle_target=""
    local bundle_output=""
    local release_binary=""

    case "$platform" in
        windows)
            config="$WINDOWS_CONFIG"
            resource_zip="$WINDOWS_ZIP"
            bundle_target="nsis"
            bundle_output="$BUNDLE_DIR/nsis"
            release_binary="$SCRIPT_DIR/src-tauri/target/release/bppinstaller.exe"
            ;;
        macos)
            config="$MACOS_CONFIG"
            resource_zip="$MACOS_ZIP"
            bundle_target="dmg"
            bundle_output="$BUNDLE_DIR/dmg"
            release_binary="$SCRIPT_DIR/src-tauri/target/release/bppinstaller"
            ;;
        *)
            echo "Error: Unsupported platform: $platform" >&2
            exit 1
            ;;
    esac

    assert_file "$config" "$platform Tauri config"
    assert_file "$resource_zip" "$platform resource zip"

    if [ -d "$bundle_output" ]; then
        invoke_step "Removing stale $platform bundle artifacts" rm -rf "$bundle_output"
    fi

    invoke_step "Building $platform app binary" \
        npm run tauri build -- --no-bundle --config "$config"

    invoke_step "Bundling $platform installer" \
        npm run tauri bundle -- --bundles "$bundle_target" --config "$config"

    echo ""
    echo "Build complete."
    echo "Binary:  $release_binary"
    echo "Bundle:  $bundle_output"
}

cd "$SCRIPT_DIR"

assert_command node "Install Node.js first."
assert_command npm "Install Node.js/npm first."
assert_command cargo "Install Rust toolchain first."
install_dependencies

if [ "$PROD" = false ]; then
    invoke_step "Starting dev server" npm run tauri dev
    exit 0
fi

PLATFORM="$(current_platform)"
if [ "$PLATFORM" = "unknown" ]; then
    echo "Error: Unsupported host platform: $(uname -s)" >&2
    exit 1
fi

build_prod "$PLATFORM"
