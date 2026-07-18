#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if [ ! -x node_modules/.bin/tauri ]; then
    echo "==> Installing npm dependencies"
    npm install
fi

exec npm run tauri dev -- "$@"
