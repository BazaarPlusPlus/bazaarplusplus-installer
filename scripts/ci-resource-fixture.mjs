import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildZipBuffer } from './payload-zip.mjs';
import { RELEASE_PLATFORMS } from './release-platforms.mjs';

const markerName = 'CI_FIXTURE_ONLY_DO_NOT_RELEASE.txt';
const markerContent =
  'This is a source-verification fixture, not a release payload.\n';

export function writeCiResourceFixtures(rootDir) {
  const buffer = buildZipBuffer([
    { name: markerName, data: Buffer.from(markerContent), mode: 0o644 }
  ]);
  return RELEASE_PLATFORMS.map((platform) => {
    const outputPath = path.join(rootDir, platform.resourceZip);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  for (const output of writeCiResourceFixtures(rootDir)) {
    console.log(`prepare:ci-resources: wrote non-release fixture ${output}`);
  }
}
