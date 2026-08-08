import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from 'vitest';

import {
  checkCitationBounds,
  checkCodeCitations,
  checkFrontmatterCompleteness,
  checkLastVerifiedHash,
  checkLastVerifiedHashes,
  checkMarkdownLinks,
  checkPathExistence,
  extractBacktickReferences,
  extractMarkdownLinks,
  findMissingFrontmatterKeys,
  listMarkdownFiles,
  resolveAncestryRef
} from './docs-check.mjs';

function writeFile(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bpp-docs-check-'));
}

function writeRootDocFiles(rootDir) {
  writeFile(rootDir, 'CLAUDE.md', '# Claude\n');
  writeFile(rootDir, 'CONTEXT.md', '# Context\n');
  writeFile(rootDir, 'README.md', '# Readme\n');
}

const FRONTMATTER = (extra = '') =>
  `---\nstatus: truth\ntopic: sample\nlast-verified: deadbeef\n${extra}---\n`;

// ---------- extraction ----------

test('extractBacktickReferences finds a path:N-M citation and ignores an IP:port span', () => {
  const content =
    'See `src/lib.rs:3-8` for details. The overlay binds `127.0.0.1:17654`.';
  const references = extractBacktickReferences(content);

  expect(references).toHaveLength(1);
  expect(references[0]).toMatchObject({
    path: 'src/lib.rs',
    start: 3,
    end: 8
  });
});

test('extractBacktickReferences captures a bare path with no line suffix', () => {
  const content =
    'Generated bindings live in `src/types/generated/commands.ts`.';
  const references = extractBacktickReferences(content);

  expect(references).toHaveLength(1);
  expect(references[0]).toMatchObject({
    path: 'src/types/generated/commands.ts',
    start: undefined,
    end: undefined
  });
});

test('extractBacktickReferences ignores a dotted symbol citation', () => {
  const content =
    'The window config is `app.windows`, set via `DefaultStreamWorkflow.deriveSnapshot`.';
  expect(extractBacktickReferences(content)).toEqual([]);
});

test('extractBacktickReferences ignores an external path with a slash but no citable extension', () => {
  const content = 'Steam detection reads `steamapps/libraryfolders.vdf`.';
  expect(extractBacktickReferences(content)).toEqual([]);
});

test('extractBacktickReferences accepts a bare root file when it carries a line suffix', () => {
  const content = 'Upload happens in `build.sh:43`.';
  const references = extractBacktickReferences(content);

  expect(references).toHaveLength(1);
  expect(references[0]).toMatchObject({ path: 'build.sh', start: 43, end: 43 });
});

test('extractBacktickReferences still ignores a bare symbol span even with a colon-shaped extension guard', () => {
  const content = 'Config lives at `scripts.build`.';
  expect(extractBacktickReferences(content)).toEqual([]);
});

// ---------- assertion 1: frontmatter completeness ----------

test('findMissingFrontmatterKeys catches a missing key', () => {
  const content = '---\nstatus: truth\nlast-verified: deadbeef\n---\n# Doc\n';
  expect(
    findMissingFrontmatterKeys(content, ['status', 'topic', 'last-verified'])
  ).toEqual(['topic']);
});

test('findMissingFrontmatterKeys passes when all keys are present', () => {
  expect(
    findMissingFrontmatterKeys(FRONTMATTER(), [
      'status',
      'topic',
      'last-verified'
    ])
  ).toEqual([]);
});

test('checkFrontmatterCompleteness reports the offending file and key', () => {
  const rootDir = createFixtureRoot();
  writeFile(rootDir, 'CONTEXT.md', FRONTMATTER());
  writeFile(
    rootDir,
    'docs/truth/architecture.md',
    '---\nstatus: truth\n---\n# Architecture\n'
  );

  const result = checkFrontmatterCompleteness(rootDir);

  expect(result.failures).toHaveLength(2);
  expect(result.failures).toContainEqual({
    file: 'docs/truth/architecture.md',
    line: 1,
    message: 'missing frontmatter key `topic`'
  });
  expect(result.failures).toContainEqual({
    file: 'docs/truth/architecture.md',
    line: 1,
    message: 'missing frontmatter key `last-verified`'
  });
});

// ---------- assertion 2: last-verified hash ancestry ----------

test('checkLastVerifiedHash fails a hash that does not exist in the repository', () => {
  const execFileSyncImpl = (_command, args) => {
    if (args[0] === 'cat-file') throw new Error('unknown revision');
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };

  const result = checkLastVerifiedHash('0000000', {
    execFileSyncImpl,
    ref: 'origin/master'
  });

  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/not a known Git object/);
});

test('checkLastVerifiedHash fails a hash that exists but is not an ancestor', () => {
  const execFileSyncImpl = (_command, args) => {
    if (args[0] === 'cat-file') return '';
    if (args[0] === 'merge-base') throw new Error('not an ancestor');
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };

  const result = checkLastVerifiedHash('abc1234', {
    execFileSyncImpl,
    ref: 'origin/master'
  });

  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/not an ancestor of origin\/master/);
});

test('checkLastVerifiedHash skips instead of failing when no ancestry ref is available', () => {
  const execFileSyncImpl = (_command, args) => {
    if (args[0] === 'cat-file') return '';
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };

  const result = checkLastVerifiedHash('abc1234', {
    execFileSyncImpl,
    ref: null
  });

  expect(result.ok).toBe(true);
  expect(result.skipped).toBe(true);
});

test('resolveAncestryRef falls back to local master when origin/master is unavailable', () => {
  const execFileSyncImpl = (_command, args) => {
    if (args.includes('origin/master')) throw new Error('unknown ref');
    if (args.includes('master')) return '';
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };

  expect(resolveAncestryRef({ execFileSyncImpl })).toBe('master');
});

test('checkLastVerifiedHashes reports a dangling hash by file', () => {
  const rootDir = createFixtureRoot();
  writeFile(rootDir, 'CONTEXT.md', FRONTMATTER());
  const execFileSyncImpl = (_command, args) => {
    if (args[0] === 'rev-parse') return '';
    if (args[0] === 'cat-file') throw new Error('unknown revision');
    throw new Error(`unexpected git invocation: ${args.join(' ')}`);
  };

  const result = checkLastVerifiedHashes(rootDir, { execFileSyncImpl });

  expect(result.failures).toHaveLength(1);
  expect(result.failures[0].file).toBe('CONTEXT.md');
  expect(result.failures[0].message).toMatch(/deadbeef/);
});

// ---------- assertion 3: code citation line ranges ----------

test('checkCitationBounds catches an out-of-bounds range', () => {
  const citation = {
    path: 'src/lib.rs',
    raw: 'src/lib.rs:1-20',
    start: 1,
    end: 20
  };
  const result = checkCitationBounds(citation, 10);

  expect(result.ok).toBe(false);
  expect(result.reason).toMatch(/past src\/lib\.rs's last line \(10\)/);
});

test('checkCitationBounds passes an in-bounds range', () => {
  const citation = {
    path: 'src/lib.rs',
    raw: 'src/lib.rs:1-10',
    start: 1,
    end: 10
  };
  expect(checkCitationBounds(citation, 10).ok).toBe(true);
});

test('checkCodeCitations catches an out-of-bounds citation against a real fixture file', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(rootDir, 'src/lib.rs', 'a\nb\nc\n');
  writeFile(
    rootDir,
    'CLAUDE.md',
    'See `src/lib.rs:1-20` for the entry point.\n'
  );

  const result = checkCodeCitations(rootDir);

  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toMatchObject({ file: 'CLAUDE.md', line: 1 });
  expect(result.failures[0].message).toMatch(/src\/lib\.rs:1-20/);
});

test('checkCodeCitations passes an in-bounds citation against a real fixture file', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(rootDir, 'src/lib.rs', 'a\nb\nc\n');
  writeFile(
    rootDir,
    'CLAUDE.md',
    'See `src/lib.rs:1-3` for the entry point.\n'
  );

  const result = checkCodeCitations(rootDir);

  expect(result.failures).toEqual([]);
  expect(result.checked).toBe(1);
});

// ---------- assertion 4: backticked path existence ----------

test('checkPathExistence catches a ghost path', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(rootDir, 'CLAUDE.md', 'See `src/does-not-exist.rs` for details.\n');

  const result = checkPathExistence(rootDir);

  expect(result.failures).toHaveLength(1);
  expect(result.failures[0]).toMatchObject({ file: 'CLAUDE.md', line: 1 });
  expect(result.failures[0].message).toMatch(/src\/does-not-exist\.rs/);
});

test('checkPathExistence exempts docs/adr/ from ghost-path failures', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(
    rootDir,
    'docs/adr/006-steam-only-launch.md',
    'It worked through `services/tempo.rs`, which no longer exists.\n'
  );

  const result = checkPathExistence(rootDir);

  expect(result.failures).toEqual([]);
});

// ---------- assertion 5: relative markdown links ----------

test('extractMarkdownLinks ignores absolute URLs and pure anchors', () => {
  const content =
    '[site](https://example.com) and [here](#section) and [doc](other.md)';
  const links = extractMarkdownLinks(content);

  expect(links).toHaveLength(1);
  expect(links[0].target).toBe('other.md');
});

test('checkMarkdownLinks catches a dead relative link', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(
    rootDir,
    'docs/adr/001-example.md',
    'See [missing decision](002-does-not-exist.md) for context.\n'
  );

  const result = checkMarkdownLinks(rootDir);

  expect(result.failures).toContainEqual({
    file: 'docs/adr/001-example.md',
    line: 1,
    message: 'link to `002-does-not-exist.md` does not resolve'
  });
});

test('checkMarkdownLinks resolves a link relative to the linking file and passes', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);
  writeFile(
    rootDir,
    'docs/adr/001-example.md',
    'See [decision two](002-example.md).\n'
  );
  writeFile(rootDir, 'docs/adr/002-example.md', '# Two\n');

  const result = checkMarkdownLinks(rootDir);

  expect(result.failures).toEqual([]);
  expect(result.checked).toBe(1);
});

// ---------- missing/empty directory handling ----------

test('listMarkdownFiles returns an empty list for a missing directory without throwing', () => {
  const rootDir = createFixtureRoot();
  expect(() => listMarkdownFiles(rootDir, 'docs/plans')).not.toThrow();
  expect(listMarkdownFiles(rootDir, 'docs/plans')).toEqual([]);
});

test('listMarkdownFiles returns an empty list for an empty directory without throwing', () => {
  const rootDir = createFixtureRoot();
  fs.mkdirSync(path.join(rootDir, 'docs', 'plans'), { recursive: true });
  expect(() => listMarkdownFiles(rootDir, 'docs/plans')).not.toThrow();
  expect(listMarkdownFiles(rootDir, 'docs/plans')).toEqual([]);
});

test('checkCodeCitations does not throw when docs/plans is missing', () => {
  const rootDir = createFixtureRoot();
  writeRootDocFiles(rootDir);

  expect(() => checkCodeCitations(rootDir)).not.toThrow();
});
