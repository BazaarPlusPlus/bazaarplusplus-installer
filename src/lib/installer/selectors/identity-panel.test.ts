import { describe, expect, it } from 'vitest';

import { selectIdentityPanel } from './identity-panel.ts';
import type { LocalizedText } from './types.ts';

const localized: LocalizedText = (zh, en) => en || zh;

describe('selectIdentityPanel', () => {
  it('describes the observation-required state', () => {
    const selection = selectIdentityPanel({
      identityState: {
        kind: 'observation_required',
        auth: null,
        observation: null
      },
      identityLoadState: 'idle',
      localized
    });

    expect(selection.title).toBe('Account');
    expect(selection.summary).toBe('No game account detected');
    expect(selection.accountHighlight).toBeUndefined();
  });

  it('describes login and mismatch states', () => {
    const login = selectIdentityPanel({
      identityState: {
        kind: 'login_or_register',
        auth: null,
        observation: {
          player_account_id: 'player-1',
          player_username: 'Tester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        }
      },
      identityLoadState: 'idle',
      localized
    });
    const mismatch = selectIdentityPanel({
      identityState: {
        kind: 'account_mismatch',
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        },
        observation: {
          player_account_id: 'player-2',
          player_username: 'OtherTester',
          observed_at_utc: '2026-04-12T00:00:00Z'
        }
      },
      identityLoadState: 'idle',
      localized
    });

    expect(login.title).toBe('Account');
    expect(login.summary).toBe('Detected game account');
    expect(login.accountHighlight).toBe('Tester');
    expect(mismatch.title).toBe('Account');
    expect(mismatch.summary).toBe(
      'Account mismatch — sign out and sign in again'
    );
    expect(mismatch.accountHighlight).toBeUndefined();
  });

  it('separates the signed-in username into an account highlight', () => {
    const ready = selectIdentityPanel({
      identityState: {
        kind: 'ready',
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        },
        observation: null
      },
      identityLoadState: 'idle',
      localized
    });

    expect(ready.title).toBe('Account');
    expect(ready.summary).toBe('Signed in as');
    expect(ready.accountHighlight).toBe('Tester');
  });

  it('prefers loading summary over ready summary', () => {
    const loading = selectIdentityPanel({
      identityState: {
        kind: 'ready',
        auth: {
          token: 'token-1',
          player_account_id: 'player-1',
          player_username: 'Tester',
          issued_at_utc: '2026-04-12T00:00:00Z'
        },
        observation: null
      },
      identityLoadState: 'loading',
      localized
    });

    expect(loading.title).toBe('Account');
    expect(loading.summary).toBe('Loading...');
    expect(loading.accountHighlight).toBeUndefined();
  });
});
