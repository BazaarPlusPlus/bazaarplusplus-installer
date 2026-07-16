#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLS_ROOT="/Users/timel/Code/Mod/ModA/.tools"

export PATH="$TOOLS_ROOT/cargo/bin:$TOOLS_ROOT/dotnet:$PATH"
export CARGO_HOME="$TOOLS_ROOT/cargo"
export RUSTUP_HOME="$TOOLS_ROOT/rustup"
export DOTNET_ROOT="$TOOLS_ROOT/dotnet"

cd "$SCRIPT_DIR"

if [ ! -x node_modules/.bin/tauri ]; then
    echo "==> Installing npm dependencies"
    npm install
fi

exec npm run tauri dev -- "$@"
