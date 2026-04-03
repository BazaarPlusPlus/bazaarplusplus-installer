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
      On macOS this produces an arm64 app bundle.

  ./build.sh --prod --clean-deps
      Reinstall npm dependencies before building.
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WINDOWS_CONFIG="$SCRIPT_DIR/src-tauri/tauri.windows.conf.json"
MACOS_CONFIG="$SCRIPT_DIR/src-tauri/tauri.macos.conf.json"
WINDOWS_ZIP="$SCRIPT_DIR/src-tauri/resources/BepInExSource/windows/BepInEx.zip"
MACOS_ZIP="$SCRIPT_DIR/src-tauri/resources/BepInExSource/macos/BepInEx.zip"

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

required_rust_targets_for_platform() {
    local platform="$1"

    case "$platform" in
        macos)
            printf '%s\n' aarch64-apple-darwin
            ;;
        *)
            ;;
    esac
}

ensure_required_rust_targets() {
    local platform="$1"
    local installed_targets=""
    local required_target=""

    installed_targets="$(rustup target list --installed)"
    while IFS= read -r required_target; do
        [ -n "$required_target" ] || continue
        if ! grep -Fxq "$required_target" <<<"$installed_targets"; then
            echo "Error: Missing Rust target: $required_target" >&2
            echo "Run: rustup target add $required_target" >&2
            return 1
        fi
    done < <(required_rust_targets_for_platform "$platform")
}

build_prod() {
    local platform="$1"
    local config=""
    local resource_zip=""
    local bundle_target=""
    local bundle_output=""
    local bundle_cleanup_path=""
    local release_binary=""
    local tauri_target=""
    local -a build_command
    local -a bundle_command

    case "$platform" in
        windows)
            config="$WINDOWS_CONFIG"
            resource_zip="$WINDOWS_ZIP"
            bundle_target="nsis"
            bundle_output="$SCRIPT_DIR/src-tauri/target/release/bundle/nsis"
            bundle_cleanup_path="$bundle_output"
            release_binary="$SCRIPT_DIR/src-tauri/target/release/bppinstaller.exe"
            ;;
        macos)
            config="$MACOS_CONFIG"
            resource_zip="$MACOS_ZIP"
            bundle_target="dmg"
            bundle_output="$SCRIPT_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg"
            bundle_cleanup_path="$SCRIPT_DIR/src-tauri/target/aarch64-apple-darwin/release/bundle"
            release_binary="$SCRIPT_DIR/src-tauri/target/aarch64-apple-darwin/release/bppinstaller"
            tauri_target="aarch64-apple-darwin"
            ;;
        *)
            echo "Error: Unsupported platform: $platform" >&2
            exit 1
            ;;
    esac

    assert_file "$config" "$platform Tauri config"
    assert_file "$resource_zip" "$platform resource zip"

    if [ -d "$bundle_cleanup_path" ]; then
        invoke_step "Removing stale $platform bundle artifacts" rm -rf "$bundle_cleanup_path"
    fi

    build_command=(
        npm run tauri build -- --no-bundle --config "$config"
    )
    bundle_command=(
        npm run tauri bundle -- --bundles "$bundle_target" --config "$config"
    )

    if [ -n "$tauri_target" ]; then
        build_command+=(--target "$tauri_target")
        bundle_command+=(--target "$tauri_target")
    fi

    invoke_step "Building $platform app binary" "${build_command[@]}"

    invoke_step "Bundling $platform installer" "${bundle_command[@]}"

    echo
    echo "Build complete."
    echo "Binary:  $release_binary"
    echo "Bundle:  $bundle_output"
}

parse_args() {
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
}

main() {
    parse_args "$@"

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

    if [ "$PLATFORM" = "macos" ]; then
        assert_command rustup "Install rustup first so the macOS Rust target can be managed."
    fi
    ensure_required_rust_targets "$PLATFORM"

    build_prod "$PLATFORM"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
