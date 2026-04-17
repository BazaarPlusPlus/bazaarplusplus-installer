import { writable, get } from 'svelte/store';
import { BILIBILI_URL, STEAM_BAZAAR_URL } from '../../config/endpoints.ts';

import type {
  DotnetInfo,
  EnvironmentInfo,
  LaunchOptionsPatchResult,
  LegacyRecordDirectoryInfo,
  SteamRunningInfo
} from '../../types.ts';
import type { ActionBusy, StepState } from '../state.ts';
import type { InstallRuntimeRisk } from '../install-guards.ts';
import { detectInstallerEnvironment } from '../detect-flow.ts';
import type { TranslateText } from '../selectors/types.ts';

export function createInstallController(input: {
  hasTauriRuntime: () => boolean;
  isDebugInstallPreview: boolean;
  createInstallDebugEnvironment: () => EnvironmentInfo;
  detectEnvironmentApi: (requestedGamePath?: string) => Promise<EnvironmentInfo>;
  detectDotnetRuntimeApi: () => Promise<DotnetInfo>;
  verifyGamePathApi: (gamePath: string) => Promise<boolean>;
  detectSteamRunningApi: () => Promise<SteamRunningInfo>;
  closeSteamApi: () => Promise<unknown>;
  installBepinex: (
    steamPath: string,
    gamePath: string,
    skipSteamShutdown: boolean
  ) => Promise<unknown>;
  patchLaunchOptions: (
    steamPath: string,
    gamePath: string,
    skipSteamShutdown: boolean
  ) => Promise<LaunchOptionsPatchResult>;
  uninstallBppApi: (steamPath: string, gamePath: string) => Promise<unknown>;
  repairBppApi: (gamePath: string) => Promise<unknown>;
  getLegacyRecordDirectoryInfoApi: (
    gamePath: string
  ) => Promise<LegacyRecordDirectoryInfo>;
  openUrl: (url: string) => Promise<void>;
  openDialog: (options: {
    directory: boolean;
    multiple: boolean;
  }) => Promise<string | string[] | null>;
  getInstallRuntimeRisks: (input: {
    hasTauriRuntime: boolean;
    steamLaunchOptionsSupported: boolean;
    steamRunning: boolean;
  }) => InstallRuntimeRisk[];
  shouldShowInstallRiskModal: (risks: InstallRuntimeRisk[]) => boolean;
  persistCustomGamePath: (path: string) => void;
  localized: (zh: string, en: string) => string;
  t: TranslateText;
  formatByteLabel: (bytes: number) => string;
}) {
  const env = writable<EnvironmentInfo | null>(null);
  const dotnetState = writable<StepState>('idle');
  const bazaarFound = writable(false);
  const bazaarChecking = writable(false);
  const bazaarInvalid = writable(false);
  const customGamePath = writable('');
  const actionBusy = writable<ActionBusy>('idle');
  const showInstallModal = writable(false);
  const showRepairModal = writable(false);
  const repairAcknowledged = writable(false);
  const repairModalBody = writable('');
  const showLaunchOptionsWarningModal = writable(false);
  const showSteamQuitModal = writable(false);
  const installAcknowledged = writable(false);
  const installConfirmationBusy = writable(false);
  const pendingSteamAction = writable<'install' | 'uninstall' | null>(null);
  const steamActionBusy = writable(false);
  const showStreamMode = writable(false);

  function initializeCustomGamePath(path: string) {
    customGamePath.set(path);
  }

  function persistCurrentGamePath() {
    input.persistCustomGamePath(get(customGamePath));
  }

  function applyInstallDebugState() {
    env.set(input.createInstallDebugEnvironment());
    dotnetState.set('found');
    bazaarFound.set(true);
    bazaarInvalid.set(false);
  }

  function requestInstall(canInstall: boolean) {
    if (!canInstall) return;
    installAcknowledged.set(false);
    showInstallModal.set(true);
  }

  function closeLaunchOptionsWarningModal() {
    showLaunchOptionsWarningModal.set(false);
  }

  function closeRepairModal() {
    if (get(actionBusy) === 'repair') return;
    repairAcknowledged.set(false);
    showRepairModal.set(false);
  }

  function closeSteamQuitModal() {
    if (get(steamActionBusy)) return;
    showSteamQuitModal.set(false);
    pendingSteamAction.set(null);
  }

  async function detectEnvironment(selectedPath: string | null) {
    if (get(actionBusy) !== 'idle') return;

    if (input.isDebugInstallPreview) {
      applyInstallDebugState();
      return;
    }

    actionBusy.set('detect');
    dotnetState.set('detecting');

    try {
      const result = await detectInstallerEnvironment({
        requestedGamePath: selectedPath,
        detectEnvironment: input.detectEnvironmentApi,
        detectDotnetRuntime: input.detectDotnetRuntimeApi,
        verifyGamePath: input.verifyGamePathApi
      });
      env.set(result.env);
      dotnetState.set(result.dotnetState);
      bazaarFound.set(result.bazaarFound);
      bazaarInvalid.set(result.bazaarInvalid);
    } finally {
      actionBusy.set('idle');
    }
  }

  async function checkPath(effectiveGamePath: string) {
    if (!effectiveGamePath) return;

    bazaarChecking.set(true);
    bazaarInvalid.set(false);
    try {
      const result = await detectInstallerEnvironment({
        requestedGamePath: effectiveGamePath,
        detectEnvironment: input.detectEnvironmentApi,
        detectDotnetRuntime: input.detectDotnetRuntimeApi,
        verifyGamePath: input.verifyGamePathApi
      });
      env.set(result.env);
      dotnetState.set(result.dotnetState);
      bazaarFound.set(result.bazaarFound);
      bazaarInvalid.set(result.bazaarInvalid);
    } catch (error) {
      console.error(error);
      bazaarFound.set(false);
      bazaarInvalid.set(true);
    } finally {
      bazaarChecking.set(false);
    }
  }

  function resetBazaar() {
    bazaarFound.set(false);
    bazaarInvalid.set(false);
    customGamePath.set('');
  }

  function clearBazaarInvalid() {
    bazaarInvalid.set(false);
  }

  async function pickGamePath() {
    const selected = await input.openDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      customGamePath.set(selected.trim());
    }
  }

  async function maybeConfirmSteamQuit(action: 'uninstall') {
    const currentEnv = get(env);
    if (!input.hasTauriRuntime() || !currentEnv?.steam_launch_options_supported) {
      return false;
    }

    try {
      const steamInfo = await input.detectSteamRunningApi();
      if (!steamInfo.running) {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    pendingSteamAction.set(action);
    showSteamQuitModal.set(true);
    return true;
  }

  async function detectInstallRuntimeRisks() {
    const currentEnv = get(env);
    if (!input.hasTauriRuntime()) {
      return [];
    }

    let steamRunning = false;
    if (currentEnv?.steam_launch_options_supported) {
      try {
        const steamInfo = await input.detectSteamRunningApi();
        steamRunning = steamInfo.running;
      } catch (error) {
        console.error(error);
      }
    }

    return input.getInstallRuntimeRisks({
      hasTauriRuntime: true,
      steamLaunchOptionsSupported: Boolean(currentEnv?.steam_launch_options_supported),
      steamRunning
    });
  }

  async function refreshAfterAction(selectedPath: string | null) {
    actionBusy.set('idle');
    await detectEnvironment(selectedPath);
  }

  async function installBundled(inputArgs: {
    canInstall: boolean;
    effectiveGamePath: string;
    selectedPath: string | null;
    skipSteamShutdown?: boolean;
  }) {
    if (!inputArgs.canInstall) return;

    if (input.isDebugInstallPreview) {
      actionBusy.set('install');
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      env.update((currentEnv) =>
        currentEnv
          ? {
              ...currentEnv,
              bpp_version: currentEnv.bundled_bpp_version ?? 'debug-preview'
            }
          : currentEnv
      );
      actionBusy.set('idle');
      return;
    }

    actionBusy.set('install');
    try {
      const currentEnv = get(env);
      const steamPath = currentEnv?.steam_path?.trim() ?? '';
      await input.installBepinex(
        steamPath,
        inputArgs.effectiveGamePath,
        Boolean(inputArgs.skipSteamShutdown)
      );
      if (currentEnv?.steam_launch_options_supported) {
        const patchResult = await input.patchLaunchOptions(
          steamPath,
          inputArgs.effectiveGamePath,
          Boolean(inputArgs.skipSteamShutdown)
        );
        if (!patchResult.verified) {
          showLaunchOptionsWarningModal.set(true);
        }
      }
      await refreshAfterAction(inputArgs.selectedPath);
    } catch (error) {
      console.error(error);
      actionBusy.set('idle');
    }
  }

  async function confirmInstall(inputArgs: {
    canInstall: boolean;
    effectiveGamePath: string;
    selectedPath: string | null;
  }) {
    if (!get(installAcknowledged) || get(installConfirmationBusy)) return;

    installConfirmationBusy.set(true);

    try {
      const runtimeRisks = await detectInstallRuntimeRisks();
      if (input.shouldShowInstallRiskModal(runtimeRisks)) {
        showInstallModal.set(false);
        pendingSteamAction.set('install');
        showSteamQuitModal.set(true);
        return;
      }

      showInstallModal.set(false);
      await installBundled({
        canInstall: inputArgs.canInstall,
        effectiveGamePath: inputArgs.effectiveGamePath,
        selectedPath: inputArgs.selectedPath,
        skipSteamShutdown: false
      });
    } finally {
      installConfirmationBusy.set(false);
    }
  }

  async function uninstallBpp(inputArgs: {
    effectiveGamePath: string;
    selectedPath: string | null;
    skipPrompt?: boolean;
  }) {
    if (!inputArgs.effectiveGamePath || get(actionBusy) !== 'idle') return;

    if (!inputArgs.skipPrompt && (await maybeConfirmSteamQuit('uninstall'))) {
      return;
    }

    actionBusy.set('uninstall');
    try {
      await input.uninstallBppApi(
        get(env)?.steam_path ?? '',
        inputArgs.effectiveGamePath
      );
      await refreshAfterAction(inputArgs.selectedPath);
    } catch (error) {
      console.error(error);
      actionBusy.set('idle');
    }
  }

  async function confirmSteamQuitAndContinue(inputArgs: {
    canInstall: boolean;
    effectiveGamePath: string;
    selectedPath: string | null;
  }) {
    const action = get(pendingSteamAction);
    if (!action || get(steamActionBusy)) return;

    steamActionBusy.set(true);

    try {
      await input.closeSteamApi();
      showSteamQuitModal.set(false);
      pendingSteamAction.set(null);

      if (action === 'install') {
        await installBundled({
          canInstall: inputArgs.canInstall,
          effectiveGamePath: inputArgs.effectiveGamePath,
          selectedPath: inputArgs.selectedPath,
          skipSteamShutdown: false
        });
        return;
      }

      if (action === 'uninstall') {
        await uninstallBpp({
          effectiveGamePath: inputArgs.effectiveGamePath,
          selectedPath: inputArgs.selectedPath,
          skipPrompt: true
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      steamActionBusy.set(false);
    }
  }

  async function handleSteamQuitModalCancel(inputArgs: {
    canInstall: boolean;
    effectiveGamePath: string;
    selectedPath: string | null;
  }) {
    if (get(steamActionBusy)) return;

    if (get(pendingSteamAction) === 'install') {
      showSteamQuitModal.set(false);
      pendingSteamAction.set(null);
      await installBundled({
        canInstall: inputArgs.canInstall,
        effectiveGamePath: inputArgs.effectiveGamePath,
        selectedPath: inputArgs.selectedPath,
        skipSteamShutdown: true
      });
      return;
    }

    closeSteamQuitModal();
  }

  async function requestRepair(inputArgs: {
    effectiveGamePath: string;
    bppDataResetRequired: boolean;
    bppDataIssue: EnvironmentInfo['bpp_data_issue'];
    bppDataVersion: string | null;
  }) {
    if (!inputArgs.effectiveGamePath || get(actionBusy) !== 'idle') return;

    let sizeLabel = '0 B';
    try {
      const info = await input.getLegacyRecordDirectoryInfoApi(
        inputArgs.effectiveGamePath
      );
      sizeLabel = input.formatByteLabel(info.total_bytes);
    } catch (error) {
      console.error(error);
    }

    if (inputArgs.bppDataResetRequired) {
      const versionLabel = inputArgs.bppDataVersion ?? input.localized('未知', 'unknown');
      repairModalBody.set(
        inputArgs.bppDataIssue === 'incompatible_version'
          ? input.localized(
              `检测到 BazaarPlusPlus 数据目录中的 BPPData.version 版本不兼容（当前：${versionLabel}）。\n需要删除游戏根目录下整个 BazaarPlusPlus 文件夹，并重建数据目录。\n你可以点击“重置战绩记录”按钮自动重置，或者手动删除该文件夹。\n当前目录占用空间：${sizeLabel}\n这会删除你当前的所有战绩记录。`,
              `An incompatible BPPData.version was detected in the BazaarPlusPlus data directory (current: ${versionLabel}).\nDelete the entire BazaarPlusPlus folder in the game root so the installer can rebuild the data directory.\nYou can use the "Reset Match History" button to reset it automatically, or delete that folder manually.\nCurrent directory size: ${sizeLabel}\nThis will delete all current match history.`
            )
          : input.localized(
              `检测到游戏根目录的 BazaarPlusPlus 文件夹里没有 BPPData.version。\n需要删除整个 BazaarPlusPlus 文件夹，并重建数据目录。\n你可以点击“重置战绩记录”按钮自动重置，或者手动删除该文件夹。\n当前目录占用空间：${sizeLabel}\n这会删除你当前的所有战绩记录。`,
              `The BazaarPlusPlus folder exists in the game root, but BPPData.version is missing.\nDelete the entire BazaarPlusPlus folder so the installer can rebuild the data directory.\nYou can use the "Reset Match History" button to reset it automatically, or delete that folder manually.\nCurrent directory size: ${sizeLabel}\nThis will delete all current match history.`
            )
      );
    } else {
      repairModalBody.set(input.t('resetHistoryBody', { size: sizeLabel }));
    }
    repairAcknowledged.set(false);
    showRepairModal.set(true);
  }

  async function repairBpp(inputArgs: {
    effectiveGamePath: string;
    selectedPath: string | null;
  }) {
    if (!inputArgs.effectiveGamePath || get(actionBusy) !== 'idle') return;

    showRepairModal.set(false);
    actionBusy.set('repair');
    try {
      await input.repairBppApi(inputArgs.effectiveGamePath);
      await refreshAfterAction(inputArgs.selectedPath);
    } catch (error) {
      console.error(error);
      actionBusy.set('idle');
    }
  }

  async function launchGame(canLaunchGame: boolean) {
    if (!canLaunchGame) return;

    try {
      await input.openUrl(STEAM_BAZAAR_URL);
    } catch (error) {
      console.error(error);
    }
  }

  async function openBilibili(event?: MouseEvent) {
    event?.preventDefault();

    if (!input.hasTauriRuntime()) {
      if (typeof window !== 'undefined') {
        window.open(BILIBILI_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await input.openUrl(BILIBILI_URL);
    } catch (error) {
      console.error(error);
    }
  }

  function toggleStreamMode() {
    showStreamMode.update((value) => !value);
  }

  return {
    env,
    dotnetState,
    bazaarFound,
    bazaarChecking,
    bazaarInvalid,
    customGamePath,
    actionBusy,
    showInstallModal,
    showRepairModal,
    repairAcknowledged,
    repairModalBody,
    showLaunchOptionsWarningModal,
    showSteamQuitModal,
    installAcknowledged,
    installConfirmationBusy,
    pendingSteamAction,
    steamActionBusy,
    showStreamMode,
    initializeCustomGamePath,
    persistCurrentGamePath,
    requestInstall,
    closeLaunchOptionsWarningModal,
    closeRepairModal,
    closeSteamQuitModal,
    detectEnvironment,
    checkPath,
    resetBazaar,
    clearBazaarInvalid,
    pickGamePath,
    confirmInstall,
    uninstallBpp,
    confirmSteamQuitAndContinue,
    handleSteamQuitModalCancel,
    requestRepair,
    repairBpp,
    launchGame,
    openBilibili,
    toggleStreamMode
  };
}
