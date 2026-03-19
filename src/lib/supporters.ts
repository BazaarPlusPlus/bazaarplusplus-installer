import { loadSupporters as loadSupportersFromTauri } from './installer/api.ts';
import { hasTauriRuntime as detectTauriRuntime } from './installer/runtime.ts';
import type { SupporterEntry, SupporterTierId, SupportersResponse } from './types.ts';

const SUPPORTER_TIERS: readonly SupporterTierId[] = [1, 2, 3, 4];
const BUNDLED_SUPPORTERS_PATH = '/support/supportorlist.json';

type LoadSupportersDataOptions = {
  hasTauriRuntime?: boolean;
  fetchImpl?: typeof fetch;
  loadFromTauri?: () => Promise<SupportersResponse>;
};

export function normalizeSupporterPayload(payload: unknown): SupporterEntry[] {
  const entries = Array.isArray(payload) ? payload : [];

  return sortSupporters(
    entries
      .map((entry) => normalizeSupporterEntry(entry))
      .filter((entry): entry is SupporterEntry => entry !== null)
  );
}

export function sortSupporters(entries: SupporterEntry[]): SupporterEntry[] {
  return entries
    .slice()
    .sort((left, right) => right.tier - left.tier || right.amount - left.amount || left.name.localeCompare(right.name));
}

export async function loadSupportersData(options: LoadSupportersDataOptions = {}): Promise<SupportersResponse> {
  const hasTauriRuntime = options.hasTauriRuntime ?? detectTauriRuntime();

  if (hasTauriRuntime) {
    try {
      const payload = await (options.loadFromTauri ?? loadSupportersFromTauri)();

      return {
        ...payload,
        entries: sortSupporters(payload.entries)
      };
    } catch {
      return loadBundledSupporters(options.fetchImpl);
    }
  }

  return loadBundledSupporters(options.fetchImpl);
}

function normalizeSupporterTier(value: unknown): SupporterTierId | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;

  const matchedTier = SUPPORTER_TIERS.find((tierId) => tierId === value);

  return matchedTier ?? null;
}

function normalizeSupporterAmount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeSupporterEntry(value: unknown): SupporterEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const { name, tier, amount } = value as { name?: unknown; tier?: unknown; amount?: unknown };
  if (typeof name !== 'string' || !name.trim()) {
    return null;
  }

  const normalizedTier = normalizeSupporterTier(tier);
  if (normalizedTier == null) {
    return null;
  }

  const normalizedAmount = normalizeSupporterAmount(amount);
  if (normalizedAmount === null) {
    return null;
  }

  return {
    name: name.trim(),
    tier: normalizedTier,
    amount: normalizedAmount
  };
}

async function loadBundledSupporters(fetchImpl: typeof fetch = fetch): Promise<SupportersResponse> {
  const response = await fetchImpl(BUNDLED_SUPPORTERS_PATH);
  if (!response.ok) {
    throw new Error(`Failed to load supporter list: ${response.status}`);
  }

  const payload = await response.json();

  return {
    entries: normalizeSupporterPayload(payload),
    source: 'bundled',
    fetchedAt: null,
    stale: false
  };
}
