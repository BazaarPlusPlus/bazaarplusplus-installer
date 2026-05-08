import { call } from '$lib/bridge/commands';
import type { BazaardbStatus } from '$lib/generated/commands';

export interface BazaardbApi {
  getStatus(): Promise<BazaardbStatus>;
  connect(token: string): Promise<BazaardbStatus>;
  disconnect(): Promise<void>;
}

export const tauriBazaardbApi: BazaardbApi = {
  getStatus: () => call('get_bazaardb_status'),
  connect: (token) => call('connect_bazaardb', { request: { token } }),
  disconnect: () => call('disconnect_bazaardb'),
};
