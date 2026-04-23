import { test, expect } from 'vitest';

import {
  createInstallDebugEnvironment,
  createInstallPageModel,
  formatIdentityErrorMessage
} from './page-model.ts';

function localized(zh: string, en: string): string {
  return en || zh;
}

function t(key: string, params?: Record<string, string | number>): string {
  if (key === 'updaterReady') {
    return `Ready ${params?.version ?? ''}`.trim();
  }

  return key;
}

test('createInstallDebugEnvironment returns a stable preview environment', () => {
  const env = createInstallDebugEnvironment();

  expect(env.game_path).toBe('C:\\Games\\The Bazaar');
  expect(env.dotnet_ok).toBe(true);
  expect(env.bundled_bpp_version).toBe('debug-preview');
  expect(env.bpp_data_reset_required).toBe(false);
});

test('formatIdentityErrorMessage maps installer-specific error codes', () => {
  expect(
    formatIdentityErrorMessage(new Error('invalid_credentials'), localized)
  ).toBe('Username or password is incorrect.');
  expect(formatIdentityErrorMessage('fetch failed', localized)).toBe(
    'Could not reach the identity service. This looks like a network or CORS configuration issue, not a credential error.'
  );
  expect(
    formatIdentityErrorMessage(
      'identity_request_failed:404:<html><body>not found</body></html>',
      localized
    )
  ).toBe(
    'The identity service endpoint was not found. The client and server may be on different versions.'
  );
});

test('createInstallPageModel centralizes install page derivations', () => {
  const model = createInstallPageModel({
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'C:\\Games\\The Bazaar',
      game_path_valid: true,
      dotnet_version: '9.0.1',
      dotnet_ok: true,
      bepinex_installed: true,
      bpp_version: '3.0.0',
      bundled_bpp_version: '3.1.0',
      bpp_data_version: '1',
      bpp_data_reset_required: false,
      bpp_data_issue: null
    },
    bazaarFound: true,
    customGamePath: '  D:\\Bazaar Custom  ',
    cachedDetectedGamePath: '',
    actionBusy: 'idle',
    showStreamMode: false,
    locale: 'en',
    isDebugInstallPreview: false,
    updaterSnapshot: {
      status: 'available',
      currentVersion: '3.0.0',
      availableVersion: '3.1.0',
      errorMessage: null,
      progress: {
        downloadedBytes: 0,
        totalBytes: null
      }
    },
    hasPendingUpdate: true,
    pendingSteamAction: 'install',
    playerObservation: {
      player_account_id: 'player-1',
      player_username: 'Tester',
      observed_at_utc: '2026-04-12T00:00:00Z'
    },
    authRecord: null,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: 'secret',
    localized,
    t
  });

  expect(model.selectedPath).toBe('D:\\Bazaar Custom');
  expect(model.canInstall).toBe(true);
  expect(model.versionMismatch).toBe(true);
  expect(model.identityState.kind).toBe('login_or_register');
  expect(model.identityPanelTitle).toBe('Account');
  expect(model.identityPanelSummary).toBe('Detected game account');
  expect(model.identityPanelAccountHighlight).toBe('Tester');
  expect(model.canContinueIdentity).toBe(true);
  expect(model.updaterButtonLabel).toBe('Ready 3.1.0');
  expect(model.steamModalTitle).toBe('installRiskTitle');
});

test('createInstallPageModel hydrates effectiveGamePath from cached detection before env loads', () => {
  const model = createInstallPageModel({
    env: null,
    bazaarFound: false,
    customGamePath: '',
    cachedDetectedGamePath: '  C:\\Games\\The Bazaar  ',
    actionBusy: 'idle',
    showStreamMode: false,
    locale: 'en',
    isDebugInstallPreview: false,
    updaterSnapshot: {
      status: 'idle',
      currentVersion: null,
      availableVersion: null,
      errorMessage: null,
      progress: {
        downloadedBytes: 0,
        totalBytes: null
      }
    },
    hasPendingUpdate: false,
    pendingSteamAction: null,
    playerObservation: null,
    authRecord: null,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: '',
    localized,
    t
  });

  expect(model.pageState.effectiveGamePath).toBe('C:\\Games\\The Bazaar');
  expect(model.hasPath).toBe(true);
  expect(model.canInstall).toBe(false);
});
