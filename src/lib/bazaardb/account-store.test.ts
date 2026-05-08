import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createAccountStore } from './account-store';

describe('createAccountStore', () => {
  it('starts disconnected', () => {
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, account_name: null }),
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
    });
    expect(get(store).connected).toBe(false);
    expect(get(store).accountName).toBeNull();
  });

  it('reflects connected state after refresh', async () => {
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: true, account_name: 'Xinyu' }),
        connect: vi.fn(),
        disconnect: vi.fn(),
      },
    });
    await store.refresh();
    expect(get(store).connected).toBe(true);
    expect(get(store).accountName).toBe('Xinyu');
  });

  it('connect persists account name on success', async () => {
    const connect = vi
      .fn()
      .mockResolvedValue({ connected: true, account_name: 'Xinyu' });
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: false, account_name: null }),
        connect,
        disconnect: vi.fn(),
      },
    });
    await store.connect('pat-abc');
    expect(connect).toHaveBeenCalledWith('pat-abc');
    expect(get(store).accountName).toBe('Xinyu');
  });

  it('disconnect clears local state', async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const store = createAccountStore({
      api: {
        getStatus: vi.fn().mockResolvedValue({ connected: true, account_name: 'Xinyu' }),
        connect: vi.fn(),
        disconnect,
      },
    });
    await store.refresh();
    await store.disconnect();
    expect(disconnect).toHaveBeenCalled();
    expect(get(store).connected).toBe(false);
    expect(get(store).accountName).toBeNull();
  });
});
