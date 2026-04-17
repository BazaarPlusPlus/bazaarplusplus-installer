import test from 'node:test';
import assert from 'node:assert/strict';

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

  assert.equal(env.game_path, 'C:\\Games\\The Bazaar');
  assert.equal(env.dotnet_ok, true);
  assert.equal(env.bundled_bpp_version, 'debug-preview');
  assert.equal(env.bpp_data_reset_required, false);
});

test('formatIdentityErrorMessage maps installer-specific error codes', () => {
  assert.equal(
    formatIdentityErrorMessage(new Error('invalid_credentials'), localized),
    'Username or password is incorrect.'
  );
  assert.equal(
    formatIdentityErrorMessage('fetch failed', localized),
    'Could not reach the identity service. This looks like a network or CORS configuration issue, not a credential error.'
  );
});

test('createInstallPageModel centralizes install page derivations', () => {
  const model = createInstallPageModel({
    env: {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'C:\\Games\\The Bazaar',
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
    installationRecord: null,
    hasInstallationPrivateKey: false,
    identityLoadState: 'idle',
    identityActionBusy: 'idle',
    identityPassword: 'secret',
    identityConfirmed: true,
    localized,
    t
  });

  assert.equal(model.selectedPath, 'D:\\Bazaar Custom');
  assert.equal(model.canInstall, true);
  assert.equal(model.versionMismatch, true);
  assert.equal(model.identityState.kind, 'activate_first_account');
  assert.equal(model.identityPanelTitle, 'Identity verification required');
  assert.equal(model.updaterButtonLabel, 'Ready 3.1.0');
  assert.equal(model.steamModalTitle, 'installRiskTitle');
});
