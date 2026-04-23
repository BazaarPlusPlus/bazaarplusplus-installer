import { createIdentityState, type IdentityState } from '../identity/state.ts';
import type {
  AuthRecordPayload,
  PlayerObservationPayload
} from '../identity/types.ts';
import type { BppDataIssue, EnvironmentInfo } from '../types.ts';
import type { ActionBusy, PageState } from './state.ts';
import type { UpdaterSnapshot } from '../updater.ts';
import {
  type IdentityActionBusy,
  type IdentityLoadState,
  type LocalizedText,
  type PendingSteamAction,
  type TranslateText
} from './selectors/types.ts';
import { selectIdentityGates } from './selectors/identity-gates.ts';
import { selectIdentityPanel } from './selectors/identity-panel.ts';
import { selectInstallGates } from './selectors/install-gates.ts';
import { selectModeLabels } from './selectors/mode-labels.ts';
import { selectSteamModal } from './selectors/steam-modal.ts';
import { selectUpdaterButton } from './selectors/updater-button.ts';

export type {
  PendingSteamAction,
  IdentityLoadState,
  IdentityActionBusy,
  LocalizedText,
  TranslateText
} from './selectors/types.ts';

export interface InstallPageModelInput {
  env: EnvironmentInfo | null;
  bazaarFound: boolean;
  customGamePath: string;
  cachedDetectedGamePath: string;
  actionBusy: ActionBusy;
  showStreamMode: boolean;
  locale: string;
  isDebugInstallPreview: boolean;
  updaterSnapshot: UpdaterSnapshot;
  hasPendingUpdate: boolean;
  pendingSteamAction: PendingSteamAction;
  playerObservation: PlayerObservationPayload | null;
  authRecord: AuthRecordPayload | null;
  identityLoadState: IdentityLoadState;
  identityActionBusy: IdentityActionBusy;
  identityPassword: string;
  localized: LocalizedText;
  t: TranslateText;
}

export interface InstallPageModel {
  selectedPath: string | null;
  modInstalled: boolean;
  bundledBppVersion: string | null;
  installedBppVersion: string | null;
  bppDataVersion: string | null;
  bppDataIssue: BppDataIssue | null;
  bppDataResetRequired: boolean;
  pageState: PageState;
  hasPath: boolean;
  isBusy: boolean;
  canInstall: boolean;
  canLaunchGame: boolean;
  versionMismatch: boolean;
  modeTitle: string;
  modeToggleLabel: string;
  dotnetDownloadUrl: string;
  localeBadge: string;
  localeButtonLabel: string;
  updaterProgressLabel: string | null;
  updaterButtonLabel: string;
  updaterButtonTitle: string;
  updaterButtonDisabled: boolean;
  updaterButtonHighlighted: boolean;
  steamModalTitle: string;
  steamModalBody: string;
  steamModalCancelText: string;
  identityState: IdentityState;
  identityPanelTitle: string;
  identityPanelSummary: string;
  identityPanelAccountHighlight?: string;
  identityBusy: boolean;
  canContinueIdentity: boolean;
  canLogoutIdentity: boolean;
}

export function createInstallDebugEnvironment(): EnvironmentInfo {
  return {
    steam_path: 'C:\\Program Files (x86)\\Steam',
    steam_launch_options_supported: true,
    game_path: 'C:\\Games\\The Bazaar',
    game_path_valid: true,
    dotnet_version: '9.0.0',
    dotnet_ok: true,
    bepinex_installed: false,
    bpp_version: null,
    bundled_bpp_version: 'debug-preview',
    bpp_data_version: '1',
    bpp_data_reset_required: false,
    bpp_data_issue: null
  };
}

export function formatIdentityErrorMessage(
  error: unknown,
  localized: LocalizedText
): string {
  const code = error instanceof Error ? error.message : String(error);
  const identityRequestFailedMatch = code.match(
    /^identity_request_failed:(\d+):(.*)$/
  );

  if (identityRequestFailedMatch) {
    const status = Number(identityRequestFailedMatch[1]);
    const summary = identityRequestFailedMatch[2] || 'empty_body';

    if (status === 404) {
      return localized(
        '身份服务接口不存在。当前客户端和服务端版本可能不一致。',
        'The identity service endpoint was not found. The client and server may be on different versions.'
      );
    }

    if (status >= 500) {
      return localized(
        `身份服务暂时不可用（HTTP ${status}）。响应摘要：${summary}`,
        `The identity service is temporarily unavailable (HTTP ${status}). Response summary: ${summary}`
      );
    }

    return localized(
      `身份服务请求失败（HTTP ${status}）。响应摘要：${summary}`,
      `The identity service request failed (HTTP ${status}). Response summary: ${summary}`
    );
  }

  switch (code) {
    case 'invalid_credentials':
      return localized('用户名或密码不正确。', 'Username or password is incorrect.');
    case 'player_account_id_taken':
      return localized(
        '这个游戏账号已经注册过，请直接登录。',
        'This game account already exists. Sign in instead.'
      );
    case 'player_username_taken':
      return localized(
        '这个用户名已经被占用。',
        'This username is already taken.'
      );
    case 'existing_account_invalid_credentials':
      return localized(
        '这个游戏账号已经注册过，但输入的密码不正确。',
        'This game account is already registered, but the password is incorrect.'
      );
    case 'invalid_token':
      return localized(
        '本地登录状态已经失效，请重新登录。',
        'The local sign-in state is no longer valid. Sign in again.'
      );
    case 'Failed to fetch':
    case 'fetch failed':
      return localized(
        '无法连接身份服务。当前更像是网络或跨域配置问题，不是账号密码错误。',
        'Could not reach the identity service. This looks like a network or CORS configuration issue, not a credential error.'
      );
    case 'identity_request_failed':
      return localized(
        '身份服务请求失败，但返回内容不可解析。请检查当前服务端版本是否正确。',
        'The identity service request failed, but the response could not be parsed. Check whether the server version is the one you expect.'
      );
    default:
      return code;
  }
}

export function formatByteLabel(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function createInstallPageModel(
  input: InstallPageModelInput
): InstallPageModel {
  const installGates = selectInstallGates({
    env: input.env,
    bazaarFound: input.bazaarFound,
    customGamePath: input.customGamePath,
    cachedDetectedGamePath: input.cachedDetectedGamePath,
    actionBusy: input.actionBusy,
    isDebugInstallPreview: input.isDebugInstallPreview
  });
  const identityState = createIdentityState({
    observation: input.playerObservation,
    auth: input.authRecord
  });
  const updaterButton = selectUpdaterButton({
    snapshot: input.updaterSnapshot,
    hasPendingUpdate: input.hasPendingUpdate,
    t: input.t
  });
  const steamModal = selectSteamModal({
    pendingSteamAction: input.pendingSteamAction,
    t: input.t
  });
  const identityPanel = selectIdentityPanel({
    identityState,
    identityLoadState: input.identityLoadState,
    localized: input.localized
  });
  const modeLabels = selectModeLabels({
    showStreamMode: input.showStreamMode,
    locale: input.locale,
    localized: input.localized,
    t: input.t
  });
  const identityGates = selectIdentityGates({
    identityState,
    pageState: installGates.pageState,
    identityLoadState: input.identityLoadState,
    identityActionBusy: input.identityActionBusy,
    identityPassword: input.identityPassword
  });

  return {
    selectedPath: installGates.selectedPath,
    modInstalled: installGates.modInstalled,
    bundledBppVersion: installGates.bundledBppVersion,
    installedBppVersion: installGates.installedBppVersion,
    bppDataVersion: installGates.bppDataVersion,
    bppDataIssue: installGates.bppDataIssue,
    bppDataResetRequired: installGates.bppDataResetRequired,
    pageState: installGates.pageState,
    hasPath: installGates.hasPath,
    isBusy: installGates.isBusy,
    canInstall: installGates.canInstall,
    canLaunchGame: installGates.canLaunchGame,
    versionMismatch: installGates.versionMismatch,
    modeTitle: modeLabels.modeTitle,
    modeToggleLabel: modeLabels.modeToggleLabel,
    dotnetDownloadUrl: modeLabels.dotnetDownloadUrl,
    localeBadge: modeLabels.localeBadge,
    localeButtonLabel: modeLabels.localeButtonLabel,
    updaterProgressLabel: updaterButton.progressLabel,
    updaterButtonLabel: updaterButton.label,
    updaterButtonTitle: updaterButton.title,
    updaterButtonDisabled: updaterButton.disabled,
    updaterButtonHighlighted: updaterButton.highlighted,
    steamModalTitle: steamModal.title,
    steamModalBody: steamModal.body,
    steamModalCancelText: steamModal.cancelText,
    identityState,
    identityPanelTitle: identityPanel.title,
    identityPanelSummary: identityPanel.summary,
    identityPanelAccountHighlight: identityPanel.accountHighlight,
    identityBusy: identityGates.identityBusy,
    canContinueIdentity: identityGates.canContinueIdentity,
    canLogoutIdentity: identityGates.canLogoutIdentity
  };
}
