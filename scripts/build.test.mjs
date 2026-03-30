import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

function runShell(script) {
  return execFileSync('bash', ['-lc', script], {
    cwd: '/Users/yxinyu/codes/bpp_codes/bazaarplusplus-installer',
    encoding: 'utf8'
  });
}

test('macOS production build targets universal artifacts', () => {
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
    /Building macos app binary\|npm run tauri build -- --no-bundle --config .*src-tauri\/tauri\.macos\.conf\.json --target universal-apple-darwin/
  );
  assert.match(
    output,
    /Bundling macos installer\|npm run tauri bundle -- --bundles dmg --config .*src-tauri\/tauri\.macos\.conf\.json --target universal-apple-darwin/
  );
  assert.match(
    output,
    /Binary:\s+.*src-tauri\/target\/universal-apple-darwin\/release\/bppinstaller/
  );
  assert.match(
    output,
    /Bundle:\s+.*src-tauri\/target\/universal-apple-darwin\/release\/bundle\/dmg/
  );
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
  assert.doesNotMatch(output, /universal-apple-darwin/);
  assert.match(
    output,
    /Binary:\s+.*src-tauri\/target\/release\/bppinstaller\.exe/
  );
  assert.match(output, /Bundle:\s+.*src-tauri\/target\/release\/bundle\/nsis/);
});

test('macOS production build requires both Rust targets for universal output', () => {
  const output = runShell(`
    source ./build.sh
    set +e
    rustup() {
      printf '%s\\n' aarch64-apple-darwin
    }
    ensure_required_rust_targets macos >/tmp/bpp-build-test.out 2>/tmp/bpp-build-test.err
    status="$?"
    cat /tmp/bpp-build-test.out
    cat /tmp/bpp-build-test.err
    printf 'exit:%s\\n' "$status"
  `);

  assert.match(output, /Missing Rust target: x86_64-apple-darwin/);
  assert.match(output, /rustup target add x86_64-apple-darwin/);
  assert.match(output, /exit:1/);
});
