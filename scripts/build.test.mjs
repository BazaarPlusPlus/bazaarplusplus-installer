import { test, expect } from 'vitest';
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

  expect(output).toMatch(
    /Building macos app binary\|npm run tauri build -- --no-bundle --config .*src-tauri\/tauri\.macos\.conf\.json --target aarch64-apple-darwin/
  );
  expect(output).toMatch(
    /Bundling macos installer\|npm run tauri bundle -- --bundles app,dmg --config .*src-tauri\/tauri\.macos\.conf\.json --target aarch64-apple-darwin/
  );
  expect(output).toMatch(
    /Binary:\s+.*src-tauri\/target\/aarch64-apple-darwin\/release\/bppinstaller/
  );
  expect(output).toMatch(
    /Bundle:\s+.*src-tauri\/target\/aarch64-apple-darwin\/release\/bundle\/dmg/
  );
});

test('macOS production build removes the entire bundle directory before rebundling', () => {
  const bundleDir =
    '/Users/yxinyu/codes/bpp_codes/bazaarplusplus-installer/src-tauri/target/aarch64-apple-darwin/release/bundle';
  const staleDir = `${bundleDir}/macos`;
  const staleFile = `${staleDir}/rw.test.BazaarPlusPlus_2.0.0_aarch64.dmg`;

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

    expect(output).toMatch(
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

  expect(output).toMatch(
    /Building windows app binary\|npm run tauri build -- --no-bundle --config .*src-tauri\/tauri\.windows\.conf\.json/
  );
  expect(output).not.toMatch(/aarch64-apple-darwin|universal-apple-darwin/);
  expect(output).toMatch(
    /Binary:\s+.*src-tauri\/target\/release\/bppinstaller\.exe/
  );
  expect(output).toMatch(
    /Bundle:\s+.*src-tauri\/target\/release\/bundle\/nsis/
  );
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

  expect(output).toMatch(/Missing Rust target: aarch64-apple-darwin/);
  expect(output).toMatch(/rustup target add aarch64-apple-darwin/);
  expect(output).toMatch(/exit:1/);
});

test('Windows upload uses installer and updater R2 paths under the version directory', () => {
  const bundleDir =
    '/Users/yxinyu/codes/bpp_codes/bazaarplusplus-installer/src-tauri/target/release/bundle/nsis';
  const installerFile = `${bundleDir}/BazaarPlusPlus_2.1.0_x64-setup.exe`;
  const signatureFile = `${installerFile}.sig`;

  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(installerFile, 'installer');
  writeFileSync(signatureFile, 'signature');

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
      upload_release_assets windows 2.1.0 windows-x86_64 https://bppinstaller.bazaarplusplus.com
    `);

    expect(output).toMatch(
      /Uploading BazaarPlusPlus_2\.1\.0_x64-setup\.exe to 2\.1\.0\/windows-x86_64\/installer\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe\|npx wrangler r2 object put bppinstaller\/2\.1\.0\/windows-x86_64\/installer\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe --file .*BazaarPlusPlus_2\.1\.0_x64-setup\.exe/
    );
    expect(output).toMatch(
      /Uploading BazaarPlusPlus_2\.1\.0_x64-setup\.exe to 2\.1\.0\/windows-x86_64\/updater\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe\|npx wrangler r2 object put bppinstaller\/2\.1\.0\/windows-x86_64\/updater\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe --file .*BazaarPlusPlus_2\.1\.0_x64-setup\.exe/
    );
    expect(output).toMatch(
      /Uploading BazaarPlusPlus_2\.1\.0_x64-setup\.exe\.sig to 2\.1\.0\/windows-x86_64\/updater\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe\.sig\|npx wrangler r2 object put bppinstaller\/2\.1\.0\/windows-x86_64\/updater\/BazaarPlusPlus_2\.1\.0_x64-setup\.exe\.sig --file .*BazaarPlusPlus_2\.1\.0_x64-setup\.exe\.sig/
    );
  } finally {
    rmSync(bundleDir, { force: true, recursive: true });
  }
});
