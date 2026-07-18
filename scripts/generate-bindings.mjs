import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATED_COMMANDS_FILE = 'commands.ts';

export function replaceDirectoryWithBackup(targetDir, sourceDir) {
  const parentDir = path.dirname(targetDir);
  const baseName = path.basename(targetDir);
  const suffix = `${process.pid}.${Date.now()}`;
  const stagingDir = path.join(parentDir, `.${baseName}.next.${suffix}`);
  const backupDir = path.join(parentDir, `.${baseName}.backup.${suffix}`);
  let backupCreated = false;

  mkdirSync(parentDir, { recursive: true });
  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(backupDir, { recursive: true, force: true });
  cpSync(sourceDir, stagingDir, { recursive: true });

  try {
    if (existsSync(targetDir)) {
      renameSync(targetDir, backupDir);
      backupCreated = true;
    }

    renameSync(stagingDir, targetDir);
    rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    rmSync(targetDir, { recursive: true, force: true });
    if (backupCreated) {
      renameSync(backupDir, targetDir);
    }
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export function normalizeGeneratedLineEndings(directory) {
  for (const entry of readdirSync(directory)) {
    const entryPath = path.join(directory, entry);
    if (statSync(entryPath).isDirectory()) {
      normalizeGeneratedLineEndings(entryPath);
      continue;
    }
    if (!entry.endsWith('.ts')) continue;

    const content = readFileSync(entryPath, 'utf8');
    const normalized = content.replace(/\r\n?/g, '\n').replace(/\n*$/, '\n');
    if (normalized !== content) writeFileSync(entryPath, normalized, 'utf8');
  }
}

export function validateGeneratedBindings(directory) {
  const commandsPath = path.join(directory, GENERATED_COMMANDS_FILE);
  if (!existsSync(commandsPath)) {
    throw new Error(
      `Generated bindings did not contain ${GENERATED_COMMANDS_FILE}`
    );
  }

  const source = readFileSync(commandsPath, 'utf8');
  if (source.trim().length === 0 || !source.includes('export const commands')) {
    throw new Error(`${GENERATED_COMMANDS_FILE} was empty or malformed`);
  }
}

export function commitGeneratedBindings({ generatedDir, tempGeneratedDir }) {
  normalizeGeneratedLineEndings(tempGeneratedDir);
  validateGeneratedBindings(tempGeneratedDir);
  replaceDirectoryWithBackup(generatedDir, tempGeneratedDir);
}

export function runGenerateBindings(projectRoot) {
  const generatedDir = path.join(projectRoot, 'src/types/generated');
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'bpp-bindings-'));
  const tempGeneratedDir = path.join(tempRoot, 'generated');
  const exportPath = path.join(tempGeneratedDir, GENERATED_COMMANDS_FILE);

  mkdirSync(tempGeneratedDir, { recursive: true });

  try {
    execFileSync(
      'cargo',
      [
        'test',
        'export_bindings',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '--',
        '--nocapture'
      ],
      {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
          ...process.env,
          BPP_SPECTA_EXPORT_PATH: exportPath
        }
      }
    );

    commitGeneratedBindings({ generatedDir, tempGeneratedDir });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedAsScript =
  process.argv[1] && path.resolve(process.argv[1]) === scriptPath;

if (invokedAsScript) {
  runGenerateBindings(path.resolve(path.dirname(scriptPath), '..'));
}
