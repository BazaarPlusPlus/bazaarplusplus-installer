import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { invokeOrFallback, normalizeBackendError } from './tauri';
import { parseResetBppDataError } from '../features/shared/errors';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

describe('desktop dispatch (runtime present)', () => {
  beforeEach(() => vi.stubGlobal('window', { __TAURI_INTERNALS__: {} }));
  afterEach(() => {
    vi.unstubAllGlobals();
    invokeMock.mockReset();
  });

  it('routes fallback-eligible commands to invoke when the runtime exists', async () => {
    const state = { marker: true };
    invokeMock.mockResolvedValueOnce(state);
    await expect(
      invokeOrFallback('get_install_state', { gamePath: 'p' })
    ).resolves.toBe(state);
    expect(invokeMock).toHaveBeenCalledWith('get_install_state', {
      gamePath: 'p'
    });
  });

  it('dispatches one-arg invoke when the optional payload is omitted', async () => {
    invokeMock.mockResolvedValueOnce({});
    await invokeOrFallback('get_overlay_settings');
    expect(invokeMock).toHaveBeenCalledWith('get_overlay_settings');
  });

  it("passes 'invoke' commands through and preserves string rejections", async () => {
    invokeMock.mockRejectedValueOnce('bpp_data_reset_blocked_by_game');
    await expect(
      invokeOrFallback('reset_bpp_data', { gamePath: 'p' })
    ).rejects.toMatchObject({ message: 'bpp_data_reset_blocked_by_game' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});

describe('normalizeBackendError sentinel contract', () => {
  it('keeps string errors verbatim', () => {
    expect(
      normalizeBackendError('bpp_data_reset_blocked_by_game').message
    ).toBe('bpp_data_reset_blocked_by_game');
  });

  it('passes Error instances through unchanged', () => {
    const error = new Error('boom');
    expect(normalizeBackendError(error)).toBe(error);
  });

  it('wraps unknown shapes', () => {
    expect(normalizeBackendError({ weird: true }).message).toBe(
      'Backend command failed.'
    );
  });

  it('feeds reset partial-failure parsing end to end', () => {
    const parsed = parseResetBppDataError(
      normalizeBackendError('bpp_data_reset_partial_failure:a\u001fb')
    );
    expect(parsed).toMatchObject({
      code: 'partial_failure',
      paths: ['a', 'b']
    });
  });
});
