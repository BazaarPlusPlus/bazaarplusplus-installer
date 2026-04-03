import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

function runShell(script) {
  return execFileSync('bash', ['-lc', script], {
    cwd: '/Users/yxinyu/codes/bpp_codes/bazaarplusplus-installer',
    encoding: 'utf8'
  });
}

test('macOS production build targets arm64 artifacts', () => {
  const output = runShell(`
    set -euo pipefail
    source ./build.sh
    assert_file() { :; }
    invoke_step() {
      local label="$1"
      shift
      printf '%s|%s\\n' "$label" "$*"
    }
    build_prod macos
  `);

  assert.match(
    output,
    /Building macos app binary\|npm run tauri build -- --no-bundle --config .*src-tauri\/tauri\.macos\.conf\.json --target aarch64-apple-darwin/
  );
  assert.match(
    output,
    /Bundling macos installer\|npm run tauri bundle -- --bundles dmg --config .*src-tauri\/tauri\.macos\.conf\.json --target aarch64-apple-darwin/
  );
  assert.match(
    output,
    /Binary:\s+.*src-tauri\/target\/aarch64-apple-darwin\/release\/bppinstaller/
  );
  assert.match(
    output,
    /Bundle:\s+.*src-tauri\/target\/aarch64-apple-darwin\/release\/bundle\/dmg/
  );
});

test('macOS production build removes the entire bundle directory before rebundling', () => {
  const bundleDir = '/Users/yxinyu/codes/bpp_codes/bazaarplusplus-installer/src-tauri/target/aarch64-apple-darwin/release/bundle';
  const staleDir = `${bundleDir}/macos`;
  const staleFile = `${staleDir}/rw.test.BazaarPlusPlus Installer_2.0.0_aarch64.dmg`;

  mkdirSync(staleDir, { recursive: true });
  writeFileSync(staleFile, 'stale dmg');

  try {
    const output = runShell(`
      set -euo pipefail
      source ./build.sh
      assert_file() { :; }
      invoke_step() {
        local label="$1"
        shift
        printf '%s|%s\\n' "$label" "$*"
      }
      build_prod macos
    `);

    assert.match(
      output,
      /Removing stale macos bundle artifacts\|rm -rf .*src-tauri\/target\/aarch64-apple-darwin\/release\/bundle\n/
    );
  } finally {
    rmSync(bundleDir, { force: true, recursive: true });
  }
});

test('Windows production build keeps the default target layout', () => {
  const output = runShell(`
    set -euo pipefail
    source ./build.sh
    assert_file() { :; }
    invoke_step() {
      local label="$1"
      shift
      printf '%s|%s\\n' "$label" "$*"
    }
    build_prod windows
  `);

  assert.match(
    output,
    /Building windows app binary\|npm run tauri build -- --no-bundle --config .*src-tauri\/tauri\.windows\.conf\.json/
  );
  assert.doesNotMatch(output, /aarch64-apple-darwin|universal-apple-darwin/);
  assert.match(
    output,
    /Binary:\s+.*src-tauri\/target\/release\/bppinstaller\.exe/
  );
  assert.match(output, /Bundle:\s+.*src-tauri\/target\/release\/bundle\/nsis/);
});

test('macOS production build requires the arm64 Rust target', () => {
  const output = runShell(`
    source ./build.sh
    set +e
    rustup() {
      printf '%s\\n' x86_64-apple-darwin
    }
    ensure_required_rust_targets macos >/tmp/bpp-build-test.out 2>/tmp/bpp-build-test.err
    status="$?"
    cat /tmp/bpp-build-test.out
    cat /tmp/bpp-build-test.err
    printf 'exit:%s\\n' "$status"
  `);

  assert.match(output, /Missing Rust target: aarch64-apple-darwin/);
  assert.match(output, /rustup target add aarch64-apple-darwin/);
  assert.match(output, /exit:1/);
});
