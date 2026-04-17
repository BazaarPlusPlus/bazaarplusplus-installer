import { createIdentityState, type IdentityState } from '../identity/state.ts';
import type {
  InstallationRecordPayload,
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
  actionBusy: ActionBusy;
  showStreamMode: boolean;
  locale: string;
  isDebugInstallPreview: boolean;
  updaterSnapshot: UpdaterSnapshot;
  hasPendingUpdate: boolean;
  pendingSteamAction: PendingSteamAction;
  playerObservation: PlayerObservationPayload | null;
  installationRecord: InstallationRecordPayload | null;
  hasInstallationPrivateKey: boolean;
  identityLoadState: IdentityLoadState;
  identityActionBusy: IdentityActionBusy;
  identityPassword: string;
  identityPasswordConfirm: string;
  identityConfirmed: boolean;
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
  shouldCollapseIdentityPanel: boolean;
  activationPasswordMatches: boolean;
  identityBusy: boolean;
  canActivateObservedAccount: boolean;
  canLoginIdentity: boolean;
}

export function createInstallDebugEnvironment(): EnvironmentInfo {
  return {
    steam_path: 'C:\\Program Files (x86)\\Steam',
    steam_launch_options_supported: true,
    game_path: 'C:\\Games\\The Bazaar',
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

  switch (code) {
    case 'invalid_credentials':
      return localized('用户名或密码不正确。', 'Username or password is incorrect.');
    case 'player_account_id_claimed':
      return localized(
        '这个游戏账号已经注册过，请使用登录入口。',
        'This observed game account already exists. Use the login path instead.'
      );
    case 'player_account_mismatch':
    case 'observed_player_account_mismatch':
      return localized(
        '当前登录账号和游戏里观察到的账号不一致。',
        'The logged-in account does not match the observed in-game account.'
      );
    case 'invalid_installer_session':
      return localized(
        '登录会话已经失效，请重新输入密码。',
        'The installer session expired. Enter your password again.'
      );
    case 'webcrypto_unavailable':
      return localized(
        '当前运行环境不支持生成 installation 密钥。',
        'This runtime cannot generate installation keys.'
      );
    case 'Failed to fetch':
    case 'fetch failed':
      return localized(
        '无法连接身份服务。当前更像是网络或跨域配置问题，不是账号密码错误。',
        'Could not reach the identity service. This looks like a network or CORS configuration issue, not a credential error.'
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
    actionBusy: input.actionBusy,
    isDebugInstallPreview: input.isDebugInstallPreview
  });
  const identityState = createIdentityState({
    observation: input.playerObservation,
    installation: input.installationRecord,
    hasInstallationPrivateKey: input.hasInstallationPrivateKey
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
    playerObservationPresent: Boolean(input.playerObservation),
    identityLoadState: input.identityLoadState,
    identityActionBusy: input.identityActionBusy,
    identityPassword: input.identityPassword,
    identityPasswordConfirm: input.identityPasswordConfirm,
    identityConfirmed: input.identityConfirmed
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
    shouldCollapseIdentityPanel: identityPanel.shouldCollapse,
    activationPasswordMatches: identityGates.activationPasswordMatches,
    identityBusy: identityGates.identityBusy,
    canActivateObservedAccount: identityGates.canActivateObservedAccount,
    canLoginIdentity: identityGates.canLoginIdentity
  };
}
