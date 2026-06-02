import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { TauriCommandMap } from './tauri';
import { TAURI_COMMAND_NAMES, type TauriCommandName } from '../types/generated/tauri-command-names';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '../..');

function parseWithCommandsNames(): string[] {
  const source = readFileSync(
    path.join(projectRoot, 'src-tauri/src/commands/registry.rs'),
    'utf8'
  );
  const productionSource = source.split('#[cfg(test)]')[0];
  const listMarker = '$macro! {';
  const listStart = productionSource.indexOf(listMarker);
  if (listStart === -1) {
    throw new Error('Could not find with_commands command list in commands/registry.rs');
  }
  const bodyContentStart = listStart + listMarker.length;
  const listEnd = productionSource.indexOf('\n        }', bodyContentStart);
  if (listEnd === -1) {
    throw new Error('Could not find with_commands command list end');
  }
  const block = productionSource.slice(bodyContentStart, listEnd);
  return block
    .split('\n')
    .map((line) => line.trim().replace(/[),]+$/, ''))
    .map((line) => line.split(',').pop()?.trim() ?? '')
    .filter((name) => /^[a-z][a-z0-9_]*$/.test(name));
}

describe('Tauri command registry', () => {
  it('generated names match with_commands list in registry.rs', () => {
    expect([...TAURI_COMMAND_NAMES]).toEqual(parseWithCommandsNames());
  });

  it('every registered command has a TauriCommandMap entry', () => {
    for (const name of TAURI_COMMAND_NAMES) {
      type AssertMapped = typeof name extends keyof TauriCommandMap ? true : false;
      const mapped: AssertMapped = true;
      expect(mapped).toBe(true);
    }
  });
});
