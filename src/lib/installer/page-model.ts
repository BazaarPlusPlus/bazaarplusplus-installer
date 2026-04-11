import type { MessageKey } from '../i18n.ts';
import { createIdentityState, type IdentityState } from '../identity/state.ts';
import type {
  InstallationRecordPayload,
  PlayerObservationPayload
} from '../identity/types.ts';
import type { BppDataIssue, EnvironmentInfo } from '../types.ts';
import {
  createPageState,
  selectCustomGamePath,
  type ActionBusy,
  type PageState
} from './state.ts';
import {
  createProgressLabel,
  type UpdaterSnapshot
} from '../updater.ts';

export type PendingSteamAction = 'install' | 'uninstall' | null;
export type IdentityLoadState = 'idle' | 'loading';
export type IdentityActionBusy = 'idle' | 'activating' | 'logging_in';
export type LocalizedText = (zh: string, en: string) => string;
export type TranslateText = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;

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
  const selectedPath = selectCustomGamePath(input.customGamePath);
  const modInstalled = Boolean(input.env?.bpp_version);
  const bundledBppVersion = input.env?.bundled_bpp_version ?? null;
  const installedBppVersion = input.env?.bpp_version ?? null;
  const bppDataVersion = input.env?.bpp_data_version ?? null;
  const bppDataIssue = input.env?.bpp_data_issue ?? null;
  const bppDataResetRequired = Boolean(input.env?.bpp_data_reset_required);
  const pageState = createPageState({
    actionBusy: input.actionBusy,
    bazaarFound: input.bazaarFound,
    bppDataResetRequired,
    selectedGamePath: selectedPath,
    detectedGamePath: input.env?.game_path ?? null,
    isDebugInstallPreview: input.isDebugInstallPreview,
    bundledBppVersion,
    installedBppVersion
  });
  const identityState = createIdentityState({
    observation: input.playerObservation,
    installation: input.installationRecord,
    hasInstallationPrivateKey: input.hasInstallationPrivateKey
  });
  const updaterProgressLabel = createProgressLabel(input.updaterSnapshot.progress);
  const activationPasswordMatches =
    !input.identityPassword.trim() ||
    !input.identityPasswordConfirm.trim() ||
    input.identityPassword.trim() === input.identityPasswordConfirm.trim();
  const identityBusy =
    input.identityLoadState === 'loading' || input.identityActionBusy !== 'idle';

  const updaterButtonLabel =
    input.updaterSnapshot.status === 'checking'
      ? input.t('updaterChecking')
      : input.updaterSnapshot.status === 'available'
        ? input.t('updaterReady', {
            version: input.updaterSnapshot.availableVersion ?? '...'
          })
        : input.updaterSnapshot.status === 'downloading'
          ? input.t('updaterDownloading', {
              progress: updaterProgressLabel ?? '...'
            })
          : input.updaterSnapshot.status === 'installed'
            ? input.t('updaterInstallReady', {
                version: input.updaterSnapshot.availableVersion ?? '...'
              })
            : input.updaterSnapshot.status === 'error'
              ? input.hasPendingUpdate
                ? input.t('updaterRetry')
                : input.t('updaterErrorState')
              : input.updaterSnapshot.status === 'unsupported'
                ? input.t('updaterUnsupported')
                : input.t('updaterCurrent');

  const updaterButtonTitle =
    input.updaterSnapshot.status === 'available'
      ? input.t('updaterReadyTitle')
      : input.updaterSnapshot.status === 'downloading'
        ? input.t('updaterInstalling')
        : input.updaterSnapshot.status === 'installed'
          ? input.t('updaterInstalledTitle')
          : input.updaterSnapshot.status === 'error'
            ? input.t('updaterErrorTitle')
            : updaterButtonLabel;

  return {
    selectedPath,
    modInstalled,
    bundledBppVersion,
    installedBppVersion,
    bppDataVersion,
    bppDataIssue,
    bppDataResetRequired,
    pageState,
    hasPath: pageState.hasPath,
    isBusy: pageState.isBusy,
    canInstall: pageState.canInstall,
    canLaunchGame: pageState.canLaunchGame,
    versionMismatch: pageState.versionMismatch,
    modeTitle: input.showStreamMode ? input.t('streamTitle') : input.t('subtitle'),
    modeToggleLabel: input.showStreamMode
      ? input.localized('安装模式', 'Install Mode')
      : input.localized('直播模式', 'Stream Mode'),
    dotnetDownloadUrl:
      input.locale === 'zh'
        ? 'https://dotnet.microsoft.com/zh-cn/download'
        : 'https://dotnet.microsoft.com/en-us/download',
    localeBadge: input.locale === 'zh' ? '中' : 'EN',
    localeButtonLabel:
      input.locale === 'zh' ? 'Switch to English' : '切换到中文',
    updaterProgressLabel,
    updaterButtonLabel,
    updaterButtonTitle,
    updaterButtonDisabled:
      input.updaterSnapshot.status === 'checking' ||
      input.updaterSnapshot.status === 'downloading',
    updaterButtonHighlighted:
      input.updaterSnapshot.status === 'available' ||
      input.updaterSnapshot.status === 'installed',
    steamModalTitle:
      input.pendingSteamAction === 'install'
        ? input.t('installRiskTitle')
        : input.t('steamQuitTitle'),
    steamModalBody:
      input.pendingSteamAction === 'install'
        ? `${input.t('installRiskSteamDetected')}\n\n${input.t('installRiskBody')}`
        : input.t('steamQuitBody'),
    steamModalCancelText:
      input.pendingSteamAction === 'install'
        ? input.t('actionContinueInstall')
        : input.t('actionClose'),
    identityState,
    identityPanelTitle:
      identityState.kind === 'observation_required'
        ? input.localized('尚未检测到游戏账号', 'No game account detected yet')
        : identityState.kind === 'activate_first_account'
          ? input.localized('已检测到游戏账号', 'Game account detected')
          : identityState.kind === 'relogin_required'
            ? input.localized('检测到账号切换', 'Game account changed')
            : input.localized('账号已连接', 'Account connected'),
    identityPanelSummary:
      input.identityLoadState === 'loading'
        ? input.localized('正在读取账号状态…', 'Reading account status...')
        : identityState.kind === 'observation_required'
          ? input.localized(
              '请先安装最新版 MOD，运行一次游戏，再回来绑定账号。',
              'Install the latest mod, run the game once, then come back to bind the account.'
            )
          : identityState.kind === 'activate_first_account'
            ? input.localized(
                `当前账号：${identityState.observation.player_username}，点击展开继续。`,
                `Current account: ${identityState.observation.player_username}. Click to continue.`
              )
            : identityState.kind === 'relogin_required'
              ? input.localized(
                  `当前账号：${identityState.observation.player_username}，点击展开重新登录。`,
                  `Current account: ${identityState.observation.player_username}. Click to re-login.`
                )
              : '',
    shouldCollapseIdentityPanel: identityState.kind === 'ready',
    activationPasswordMatches,
    identityBusy,
    canActivateObservedAccount:
      identityState.kind === 'activate_first_account' &&
      Boolean(pageState.effectiveGamePath) &&
      Boolean(input.playerObservation) &&
      Boolean(input.identityPassword.trim()) &&
      Boolean(input.identityPasswordConfirm.trim()) &&
      activationPasswordMatches &&
      input.identityConfirmed &&
      !identityBusy,
    canLoginIdentity:
      Boolean(pageState.effectiveGamePath) &&
      Boolean(input.playerObservation) &&
      Boolean(input.identityPassword.trim()) &&
      input.identityConfirmed &&
      !identityBusy
  };
}
