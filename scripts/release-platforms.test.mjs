import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runShell, toBashPath } from './test-helpers.mjs';
import {
  RELEASE_PLATFORMS,
  RELEASE_PLATFORM_KEYS,
  bundleRoot,
  installerDir,
  bundleCleanupDir,
  releaseBinary,
  updaterFragmentUrl,
  resolveBuildPlatform,
  defaultTargetBuildPlatforms
} from './release-platforms.mjs';
import { resolveBundleCleanupPath } from './before-bundle-cleanup.mjs';
import { resolveTargetPlatforms } from './prebuild-check.mjs';

test('grep gate: platform literals live only in release-platforms.mjs', () => {
  const literals = RELEASE_PLATFORMS.flatMap((p) => [
    p.key,
    p.rustTarget
  ]).filter(Boolean);
  const files = [
    'build.sh',
    ...fs
      .readdirSync('scripts')
      .filter(
        (f) =>
          f.endsWith('.mjs') &&
          !f.includes('test') &&
          f !== 'release-platforms.mjs'
      )
      .map((f) => `scripts/${f}`)
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const lit of literals) {
      expect({ file, lit, hit: text.includes(lit) }).toEqual({
        file,
        lit,
        hit: false
      });
    }
  }
});

test.each(RELEASE_PLATFORMS)(
  'build.sh facts for $buildPlatform come from the module',
  (p) => {
    const out = runShell(`
      set -euo pipefail
      source ./build.sh
      printf 'r2key=%s\\n' "$(platform_r2_key ${p.buildPlatform})"
      printf 'bundleroot=%s\\n' "$(bundle_root_for_platform ${p.buildPlatform})"
      printf 'instdir=%s\\n' "$(release_platforms_cli installer-dir ${p.buildPlatform})"
      printf 'glob=%s\\n' "$(release_platforms_cli installer-glob ${p.buildPlatform})"
      printf 'rust=[%s]\\n' "$(required_rust_targets_for_platform ${p.buildPlatform})"
    `);
    expect(out).toContain(`r2key=${p.key}`);
    expect(out).toMatch(new RegExp(`bundleroot=.*/${bundleRoot(p)}\\n`));
    expect(out).toContain(`instdir=${installerDir(p)}`);
    expect(out).toContain(`glob=${p.installerNameGlob}`);
    expect(out).toContain(`rust=[${p.rustTarget ?? ''}]`);
  }
);

test.each(RELEASE_PLATFORMS)(
  'find_installer_artifact locates the $buildPlatform artifact',
  (p) => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'bpp-release-platform-')
    );
    const rootBash = toBashPath(root);
    const dir = path.join(root, ...installerDir(p).split('/'));
    const name = p.installerNameGlob.replace('*', 'Fixture_9.9.9');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), 'x');
    try {
      const out = runShell(`
        set -euo pipefail
        source ./build.sh
        release_platforms_module="$SCRIPT_DIR/scripts/release-platforms.mjs"
        release_platforms_cli() { node "$release_platforms_module" "$@"; }
        SCRIPT_DIR="${rootBash}"
        find_installer_artifact ${p.buildPlatform}
      `);
      expect(out).toContain(name);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

test.each(RELEASE_PLATFORMS)(
  'build_prod $buildPlatform uses derived paths/targets/bundles',
  (p) => {
    const out = runShell(`
      set -euo pipefail
      source ./build.sh
      assert_file() { :; }
      prepare_signed_macos_resource_zip() { :; }
      prepare_signed_macos_resource_binary() { :; }
      invoke_step() { local l="$1"; shift; printf '%s|%s\\n' "$l" "$*"; }
      build_prod ${p.buildPlatform}
    `);
    if (p.rustTarget) expect(out).toContain(`--target ${p.rustTarget}`);
    else expect(out).not.toContain('--target');
    expect(out).toContain(`--bundles ${p.bundleTargets}`);
    expect(out).toMatch(new RegExp(`Binary:\\s+.*/${releaseBinary(p)}\\n`));
    expect(out).toMatch(new RegExp(`Bundle:\\s+.*/${installerDir(p)}\\n`));
  }
);

test.each(RELEASE_PLATFORMS)(
  'before-bundle-cleanup dir for $key matches the module',
  (p) => {
    const expected = path.join('/root', ...bundleCleanupDir(p).split('/'));
    expect(resolveBundleCleanupPath('/root', p.buildPlatform)).toBe(expected);
    expect(resolveBundleCleanupPath('/root', p.nodePlatform)).toBe(expected);
  }
);

test('prebuild-check target platforms derive from the table', () => {
  expect(resolveTargetPlatforms(undefined)).toEqual(
    defaultTargetBuildPlatforms()
  );
  expect(defaultTargetBuildPlatforms()).toEqual(['macos', 'windows']);
  for (const p of RELEASE_PLATFORMS) {
    expect(resolveBuildPlatform(p.nodePlatform)).toBe(p.buildPlatform);
  }
});

test('generate_latest_manifest end-to-end emits every table platform in order', () => {
  const outDir = fs.mkdtempSync(`${process.cwd()}/.bpp-latest-e2e-`);
  const outDirBash = toBashPath(outDir);
  try {
    runShell(`
      set -euo pipefail
      source ./build.sh
      npx() {
        local key="$5" file="$7"
        case "$key" in
          "$R2_BUCKET"/9.9.9/*/updater/platform-manifest.json)
            local pk="\${key#$R2_BUCKET/9.9.9/}"; pk="\${pk%%/*}"
            printf '{"version":"9.9.9","platform":"%s","url":"https://base/9.9.9/%s/updater/a.bin","signature":"sig"}' "$pk" "$pk" > "$file"
            ;;
          *) return 1 ;;
        esac
      }
      upload_r2_object() { cp "$1" "${outDirBash}/uploaded-$2"; }
      generate_latest_manifest 9.9.9
    `);
    const latest = JSON.parse(
      fs.readFileSync(`${outDir}/uploaded-latest.json`, 'utf8')
    );
    expect(Object.keys(latest.platforms)).toEqual(RELEASE_PLATFORM_KEYS);
    for (const key of RELEASE_PLATFORM_KEYS) {
      expect(latest.platforms[key].url).toBe(
        updaterFragmentUrl({
          baseUrl: 'https://base',
          version: '9.9.9',
          platformKey: key,
          updaterFileName: 'a.bin'
        })
      );
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('r2-key unknown platform keeps the exact build.sh error contract', () => {
  const out = runShell(`
    source ./build.sh
    set +e
    platform_r2_key linux 2>&1
    printf 'exit:%s\\n' "$?"
  `);
  expect(out).toContain('Error: Unsupported platform for upload: linux');
  expect(out).toContain('exit:1');
});

test('CLI list flushes full stdout with exit 0; unknown verb exits 1', () => {
  const out = execFileSync(
    process.execPath,
    ['scripts/release-platforms.mjs', 'list'],
    { cwd: process.cwd() }
  );
  expect(out.toString()).toBe(RELEASE_PLATFORM_KEYS.join('\n') + '\n');
  expect(() =>
    execFileSync(process.execPath, ['scripts/release-platforms.mjs', 'bogus'], {
      cwd: process.cwd()
    })
  ).toThrow();
});
