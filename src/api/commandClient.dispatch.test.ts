import { afterEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { parseResetBppDataError } from '../features/shared/errors';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  invokeMock.mockReset();
});

describe('native command adapter', () => {
  it('selects the generated native client once when the runtime is present', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    invokeMock.mockResolvedValueOnce({ marker: true });
    const { commandClient } = await import('./commandClient');

    await expect(commandClient.getInstallState('/game')).resolves.toEqual({
      marker: true
    });
    expect(invokeMock).toHaveBeenCalledWith('get_install_state', {
      gamePath: '/game'
    });
  });

  it('normalizes string rejections from generated commands', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    invokeMock.mockRejectedValueOnce('bpp_data_reset_blocked_by_game');
    const { commandClient } = await import('./commandClient');

    await expect(commandClient.resetBppData('/game')).rejects.toMatchObject({
      message: 'bpp_data_reset_blocked_by_game'
    });
  });
});

describe('normalizeBackendError sentinel contract', () => {
  it('keeps string errors verbatim and passes Error instances through', async () => {
    const { normalizeBackendError } = await import('./nativeCommands');
    const error = new Error('boom');

    expect(
      normalizeBackendError('bpp_data_reset_blocked_by_game').message
    ).toBe('bpp_data_reset_blocked_by_game');
    expect(normalizeBackendError(error)).toBe(error);
  });

  it('wraps unknown shapes', async () => {
    const { normalizeBackendError } = await import('./nativeCommands');
    expect(normalizeBackendError({ weird: true }).message).toBe(
      'Backend command failed.'
    );
  });

  it('feeds reset partial-failure parsing end to end', async () => {
    const { normalizeBackendError } = await import('./nativeCommands');
    const parsed = parseResetBppDataError(
      normalizeBackendError('bpp_data_reset_partial_failure:a\u001fb')
    );
    expect(parsed).toMatchObject({
      code: 'partial_failure',
      paths: ['a', 'b']
    });
  });
});
