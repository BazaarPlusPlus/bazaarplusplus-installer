import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function parseVersion(value) {
  const match = String(value)
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) throw new Error(`Invalid tool version: ${value}`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function assertSupportedVersion(name, actualValue, range) {
  const actual = parseVersion(actualValue);
  const constraints = range.trim().split(/\s+/);
  const supported = constraints.every((constraint) => {
    const match = constraint.match(/^(>=|<=|>|<|=)?(.+)$/);
    const operator = match[1] ?? '=';
    const comparison = compareVersions(actual, parseVersion(match[2]));
    if (operator === '>=') return comparison >= 0;
    if (operator === '<=') return comparison <= 0;
    if (operator === '>') return comparison > 0;
    if (operator === '<') return comparison < 0;
    return comparison === 0;
  });
  if (!supported) {
    throw new Error(
      `${name} ${String(actualValue).replace(/^v/, '')} is unsupported; package.json requires ${range}`
    );
  }
}

function main(args) {
  if (args.length !== 2) {
    throw new Error('Usage: check-toolchain.mjs <node-version> <npm-version>');
  }
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const [nodeVersion, npmVersion] = args;
  console.log(
    `Toolchain: Node ${nodeVersion.replace(/^v/, '')}, npm ${npmVersion}`
  );
  assertSupportedVersion('node', nodeVersion, packageJson.engines.node);
  assertSupportedVersion('npm', npmVersion, packageJson.engines.npm);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
