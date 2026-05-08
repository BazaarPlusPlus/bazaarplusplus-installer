import { writable } from 'svelte/store';
import type { BazaardbApi } from './api';
import { tauriBazaardbApi } from './api';

export interface AccountState {
  connected: boolean;
  accountName: string | null;
}

const initial: AccountState = { connected: false, accountName: null };

export function createAccountStore({ api = tauriBazaardbApi }: { api?: BazaardbApi } = {}) {
  const { subscribe, set } = writable<AccountState>(initial);

  function apply(status: { connected: boolean; account_name: string | null }) {
    set({ connected: status.connected, accountName: status.account_name ?? null });
  }

  async function refresh() {
    apply(await api.getStatus());
  }

  async function connect(token: string) {
    apply(await api.connect(token));
  }

  async function disconnect() {
    await api.disconnect();
    set(initial);
  }

  return { subscribe, refresh, connect, disconnect };
}

export const accountStore = createAccountStore();
