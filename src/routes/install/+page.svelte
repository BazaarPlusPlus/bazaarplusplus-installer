<script lang="ts">
  import { goto } from '$app/navigation';
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount } from 'svelte';
  import type { Update } from '@tauri-apps/plugin-updater';
  import AppModal from '$lib/components/AppModal.svelte';
  import type { BppDataIssue, EnvironmentInfo } from '$lib/types';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import InstallerHeader from '$lib/components/installer/InstallerHeader.svelte';
  import InstallerInstallPreviewModal from '$lib/components/installer/InstallerInstallPreviewModal.svelte';
  import InstallerResetHistoryModal from '$lib/components/installer/InstallerResetHistoryModal.svelte';
  import InstallerStatusSteps from '$lib/components/installer/InstallerStatusSteps.svelte';
  import InstallerSupportBar from '$lib/components/installer/InstallerSupportBar.svelte';
  import StreamModePanel from '$lib/components/stream/StreamModePanel.svelte';
  import {
    closeSteam as closeSteamApi,
    detectDotnetRuntime as detectDotnetRuntimeApi,
    detectEnvironment as detectEnvironmentApi,
    detectSteamRunning as detectSteamRunningApi,
    getLegacyRecordDirectoryInfo as getLegacyRecordDirectoryInfoApi,
    installBepinex,
    patchLaunchOptions,
    postIdentityJson,
    repairBpp as repairBppApi,
    uninstallBpp as uninstallBppApi,
    verifyGamePath as verifyGamePathApi
  } from '$lib/installer/api';
  import {
    loadPersistedCustomGamePath,
    persistCustomGamePath
  } from '$lib/installer/storage';
  import {
    hasTauriRuntime,
    resolveInstallDebugPreview
  } from '$lib/installer/runtime';
  import {
    clearPendingWhatsNewLaunch,
    loadPendingWhatsNewLaunch,
    markPendingWhatsNewLaunch
  } from '$lib/post-update';
  import {
    createInitialUpdaterSnapshot,
    type UpdaterSnapshot
  } from '$lib/updater';
  import type {
    ActionBusy,
    PageState,
    StepState
  } from '$lib/installer/state';
  import {
    getInstallRuntimeRisks,
    shouldShowInstallRiskModal,
    type InstallRuntimeRisk
  } from '$lib/installer/install-guards';
  import { detectInstallerEnvironment } from '$lib/installer/detect-flow';
  import { createIdentityApi } from '$lib/identity/api';
  import type { IdentityState } from '$lib/identity/state';
  import type {
    InstallationRecordPayload,
    PlayerObservationPayload
  } from '$lib/identity/types';
  import {
    createInstallDebugEnvironment,
    createInstallPageModel,
    formatByteLabel,
    formatIdentityErrorMessage,
    type InstallPageModel
  } from '$lib/installer/page-model';
  import {
    activateInstallIdentity,
    loadInstallIdentitySnapshot,
    reloginInstallIdentity
  } from '$lib/installer/identity-flow';
  import {
    createCheckingUpdaterSnapshot,
    downloadPendingUpdate,
    maybeOpenWhatsNewAfterAutoUpdate as maybeOpenWhatsNewAfterAutoUpdateFlow,
    runStartupUpdaterCheck as runStartupUpdaterCheckFlow,
    resolveUpdaterActionDecision
  } from '$lib/installer/updater-flow';

  let env: EnvironmentInfo | null = null;
  let dotnetState: StepState = 'idle';
  let bazaarFound = false;
  let bazaarChecking = false;
  let bazaarInvalid = false;
  let customGamePath = loadPersistedCustomGamePath();
  let actionBusy: ActionBusy = 'idle';
  const STEAM_BAZAAR_URL = 'steam://rungameid/1617400';
  const BILIBILI_URL = 'https://space.bilibili.com/3546978457750467';
  let showInstallModal = false;
  let showRepairModal = false;
  let repairAcknowledged = false;
  let repairModalBody = '';
  let showLaunchOptionsWarningModal = false;
  let showSteamQuitModal = false;
  let installAcknowledged = false;
  let installConfirmationBusy = false;
  let pendingSteamAction: 'install' | 'uninstall' | null = null;
  let steamActionBusy = false;
  let updaterSnapshot: UpdaterSnapshot = createInitialUpdaterSnapshot();
  let pendingUpdate: Update | null = null;
  let showUpdaterModal = false;
  let updaterModalTitle = '';
  let updaterModalBody = '';
  let showUpdaterReviewModal = false;
  let updaterReviewBusy = false;
  let updaterCheckRequestId = 0;
  let showStreamMode = false;
  const identityApi = createIdentityApi(
    hasTauriRuntime()
      ? {
          postJsonImpl: ({ url, body, authorization }) =>
            postIdentityJson(url, body, authorization)
        }
      : {}
  );
  let playerObservation: PlayerObservationPayload | null = null;
  let installationRecord: InstallationRecordPayload | null = null;
  let hasInstallationPrivateKey = false;
  let identityLoadState: 'idle' | 'loading' = 'idle';
  let identityActionBusy: 'idle' | 'activating' | 'logging_in' = 'idle';
  let identityPassword = '';
  let identityPasswordConfirm = '';
  let identityConfirmed = false;
  let identityError = '';
  let identitySuccess = '';
  let identityLoadedGamePath = '';
  let identityLoadRequestId = 0;
  let identityPanelExpanded = false;

  const isDebugInstallPreview = resolveInstallDebugPreview({
    isDev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    hasTauriRuntime: hasTauriRuntime()
  });

  function t(
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ): string {
    return formatMessage($locale, key, params);
  }

  function localized(zh: string, en: string): string {
    return $locale === 'zh' ? zh : en;
  }

  let pageModel: InstallPageModel = createInstallPageModel({
    env,
    bazaarFound,
    customGamePath,
    actionBusy,
    showStreamMode,
    locale: $locale,
    isDebugInstallPreview,
    updaterSnapshot,
    hasPendingUpdate: Boolean(pendingUpdate),
    pendingSteamAction,
    playerObservation,
    installationRecord,
    hasInstallationPrivateKey,
    identityLoadState,
    identityActionBusy,
    identityPassword,
    identityPasswordConfirm,
    identityConfirmed,
    localized,
    t
  });
  let pageState: PageState = pageModel.pageState;
  let identityState: IdentityState = pageModel.identityState;

  function resetIdentitySnapshot() {
    playerObservation = null;
    installationRecord = null;
    hasInstallationPrivateKey = false;
    identityError = '';
    identitySuccess = '';
  }

  function applyInstallDebugState() {
    env = createInstallDebugEnvironment();
    dotnetState = 'found';
    bazaarFound = true;
    bazaarInvalid = false;
  }

  function requestInstall() {
    if (!pageModel.canInstall) return;
    installAcknowledged = false;
    showInstallModal = true;
  }

  async function confirmInstall() {
    if (!installAcknowledged || installConfirmationBusy) return;

    installConfirmationBusy = true;

    try {
      const runtimeRisks = await detectInstallRuntimeRisks();
      if (shouldShowInstallRiskModal(runtimeRisks)) {
        showInstallModal = false;
        pendingSteamAction = 'install';
        showSteamQuitModal = true;
        return;
      }

      showInstallModal = false;
      await installBundled(false);
    } finally {
      installConfirmationBusy = false;
    }
  }

  function closeLaunchOptionsWarningModal() {
    showLaunchOptionsWarningModal = false;
  }

  async function requestRepair() {
    if (!pageState.effectiveGamePath || actionBusy !== 'idle') return;

    let sizeLabel = '0 B';
    try {
      const info = await getLegacyRecordDirectoryInfoApi(
        pageState.effectiveGamePath
      );
      sizeLabel = formatByteLabel(info.total_bytes);
    } catch (e) {
      console.error(e);
    }

    if (pageModel.bppDataResetRequired) {
      repairModalBody = createBppDataResetBody({
        issue: pageModel.bppDataIssue,
        version: pageModel.bppDataVersion,
        sizeLabel
      });
    } else {
      repairModalBody = t('resetHistoryBody', { size: sizeLabel });
    }
    repairAcknowledged = false;
    showRepairModal = true;
  }

  function closeRepairModal() {
    if (actionBusy === 'repair') return;
    repairAcknowledged = false;
    showRepairModal = false;
  }

  function closeSteamQuitModal() {
    if (steamActionBusy) return;
    showSteamQuitModal = false;
    pendingSteamAction = null;
  }

  async function confirmSteamQuitAndContinue() {
    const action = pendingSteamAction;
    if (!action || steamActionBusy) return;

    steamActionBusy = true;

    try {
      await closeSteamApi();
      showSteamQuitModal = false;
      pendingSteamAction = null;

      if (action === 'install') {
        await installBundled(false);
        return;
      }

      if (action === 'uninstall') {
        await uninstallBpp(true);
      }
    } catch (error) {
      console.error(error);
    } finally {
      steamActionBusy = false;
    }
  }

  async function handleSteamQuitModalCancel() {
    if (steamActionBusy) return;

    if (pendingSteamAction === 'install') {
      showSteamQuitModal = false;
      pendingSteamAction = null;
      await installBundled(true);
      return;
    }

    closeSteamQuitModal();
  }

  async function detectEnvironment() {
    if (actionBusy !== 'idle') return;

    if (isDebugInstallPreview) {
      applyInstallDebugState();
      return;
    }

    actionBusy = 'detect';
    dotnetState = 'detecting';

    try {
      const result = await detectInstallerEnvironment({
        requestedGamePath: pageModel.selectedPath,
        detectEnvironment: detectEnvironmentApi,
        detectDotnetRuntime: detectDotnetRuntimeApi,
        verifyGamePath: verifyGamePathApi
      });
      env = result.env;
      dotnetState = result.dotnetState;
      bazaarFound = result.bazaarFound;
      bazaarInvalid = result.bazaarInvalid;
    } finally {
      actionBusy = 'idle';
    }
  }

  async function refreshIdentity(gameRoot = pageState.effectiveGamePath) {
    if (!hasTauriRuntime() || !gameRoot) {
      identityLoadedGamePath = '';
      resetIdentitySnapshot();
      return;
    }

    const requestId = ++identityLoadRequestId;
    identityLoadState = 'loading';

    try {
      const snapshot = await loadInstallIdentitySnapshot(identityApi, gameRoot);
      if (requestId !== identityLoadRequestId) {
        return;
      }

      playerObservation = snapshot.playerObservation;
      installationRecord = snapshot.installationRecord;
      hasInstallationPrivateKey = snapshot.hasInstallationPrivateKey;
      identityLoadedGamePath = gameRoot;
    } catch (error) {
      if (requestId !== identityLoadRequestId) {
        return;
      }

      resetIdentitySnapshot();
      identityError = formatIdentityErrorMessage(error, localized);
    } finally {
      if (requestId === identityLoadRequestId) {
        identityLoadState = 'idle';
      }
    }
  }

  function resetIdentityMessages() {
    identityError = '';
    identitySuccess = '';
  }

  async function runStartupUpdaterCheck() {
    return runStartupUpdaterCheckFlow({
      snapshot: updaterSnapshot,
      hasTauriRuntime: hasTauriRuntime()
    });
  }

  async function maybeOpenPendingWhatsNewLaunch() {
    return maybeOpenWhatsNewAfterAutoUpdateFlow({
      hasTauriRuntime: hasTauriRuntime(),
      loadPendingWhatsNewLaunch,
      clearPendingWhatsNewLaunch,
      getVersion,
      goto
    });
  }

  function toggleIdentityPanel() {
    if (identityLoadState === 'loading') {
      return;
    }

    if (
      identityState.kind === 'observation_required' ||
      identityState.kind === 'ready'
    ) {
      return;
    }

    identityPanelExpanded = !identityPanelExpanded;
  }

  async function activateObservedAccount() {
    if (
      !pageState.effectiveGamePath ||
      !playerObservation ||
      !identityConfirmed ||
      !identityPassword.trim() ||
      identityPassword.trim() !== identityPasswordConfirm.trim() ||
      identityActionBusy !== 'idle'
    ) {
      return;
    }

    identityActionBusy = 'activating';
    resetIdentityMessages();

    try {
      const result = await activateInstallIdentity({
        identityApi,
        gameRoot: pageState.effectiveGamePath,
        observation: playerObservation,
        password: identityPassword.trim(),
        successMessage: localized(
          '新的 installation 身份已写入本地共享目录。',
          'A new installation identity was written to the shared local directory.'
        )
      });
      playerObservation = result.snapshot.playerObservation;
      installationRecord = result.snapshot.installationRecord;
      hasInstallationPrivateKey = result.snapshot.hasInstallationPrivateKey;
      identityLoadedGamePath = pageState.effectiveGamePath;
      identityPassword = '';
      identityPasswordConfirm = '';
      identityConfirmed = false;
      identitySuccess = result.successMessage;
    } catch (error) {
      identityError = formatIdentityErrorMessage(error, localized);
    } finally {
      identityActionBusy = 'idle';
    }
  }

  async function loginAndRefreshInstallation() {
    if (
      !pageState.effectiveGamePath ||
      !playerObservation ||
      !identityConfirmed ||
      !identityPassword.trim() ||
      identityActionBusy !== 'idle'
    ) {
      return;
    }

    identityActionBusy = 'logging_in';
    resetIdentityMessages();

    try {
      const result = await reloginInstallIdentity({
        identityApi,
        gameRoot: pageState.effectiveGamePath,
        observation: playerObservation,
        password: identityPassword.trim(),
        successMessage: localized(
          'installation 材料已经按当前观察到的账号重新生成。',
          'Installation material was regenerated for the currently observed account.'
        )
      });
      playerObservation = result.snapshot.playerObservation;
      installationRecord = result.snapshot.installationRecord;
      hasInstallationPrivateKey = result.snapshot.hasInstallationPrivateKey;
      identityLoadedGamePath = pageState.effectiveGamePath;
      identityPassword = '';
      identityPasswordConfirm = '';
      identityConfirmed = false;
      identitySuccess = result.successMessage;
    } catch (error) {
      identityError = formatIdentityErrorMessage(error, localized);
    } finally {
      identityActionBusy = 'idle';
    }
  }

  async function checkForUpdatesOnStartup() {
    const requestId = ++updaterCheckRequestId;

    updaterSnapshot = createCheckingUpdaterSnapshot(
      updaterSnapshot,
      hasTauriRuntime()
    );

    const result = await runStartupUpdaterCheck();
    if (
      requestId !== updaterCheckRequestId ||
      updaterSnapshot.status !== 'checking'
    ) {
      return;
    }

    updaterSnapshot = result.snapshot;
    pendingUpdate = result.update;
  }

  async function maybeOpenWhatsNewAfterAutoUpdate(): Promise<boolean> {
    try {
      return await maybeOpenPendingWhatsNewLaunch();
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async function pickGamePath() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      customGamePath = selected.trim();
    }
  }

  async function checkPath() {
    const path = pageState.effectiveGamePath;
    if (!path) return;

    bazaarChecking = true;
    bazaarInvalid = false;
    try {
      const result = await detectInstallerEnvironment({
        requestedGamePath: path,
        detectEnvironment: detectEnvironmentApi,
        detectDotnetRuntime: detectDotnetRuntimeApi,
        verifyGamePath: verifyGamePathApi
      });
      env = result.env;
      dotnetState = result.dotnetState;
      bazaarFound = result.bazaarFound;
      bazaarInvalid = result.bazaarInvalid;
    } catch (error) {
      console.error(error);
      bazaarFound = false;
      bazaarInvalid = true;
    } finally {
      bazaarChecking = false;
    }
  }

  function resetBazaar() {
    bazaarFound = false;
    bazaarInvalid = false;
    customGamePath = '';
  }

  async function refreshAfterAction() {
    actionBusy = 'idle';
    await detectEnvironment();
  }

  async function maybeConfirmSteamQuit(action: 'uninstall'): Promise<boolean> {
    if (!hasTauriRuntime() || !env?.steam_launch_options_supported) {
      return false;
    }

    try {
      const steamInfo = await detectSteamRunningApi();
      if (!steamInfo.running) {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    pendingSteamAction = action;
    showSteamQuitModal = true;
    return true;
  }

  async function detectInstallRuntimeRisks(): Promise<InstallRuntimeRisk[]> {
    if (!hasTauriRuntime()) {
      return [];
    }

    let steamRunning = false;
    if (env?.steam_launch_options_supported) {
      try {
        const steamInfo = await detectSteamRunningApi();
        steamRunning = steamInfo.running;
      } catch (error) {
        console.error(error);
      }
    }

    return getInstallRuntimeRisks({
      hasTauriRuntime: true,
      steamLaunchOptionsSupported: Boolean(env?.steam_launch_options_supported),
      steamRunning
    });
  }

  async function installBundled(skipSteamShutdown = false) {
    if (!pageModel.canInstall) return;

    if (isDebugInstallPreview) {
      actionBusy = 'install';
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      env = env
        ? { ...env, bpp_version: env.bundled_bpp_version ?? 'debug-preview' }
        : env;
      actionBusy = 'idle';
      return;
    }

    actionBusy = 'install';
    try {
      const steamPath = env?.steam_path?.trim() ?? '';
      await installBepinex(
        steamPath,
        pageState.effectiveGamePath,
        skipSteamShutdown
      );
      if (env?.steam_launch_options_supported) {
        const patchResult = await patchLaunchOptions(
          steamPath,
          pageState.effectiveGamePath,
          skipSteamShutdown
        );
        if (!patchResult.verified) {
          showLaunchOptionsWarningModal = true;
        }
      }
      await refreshAfterAction();
    } catch (e) {
      console.error(e);
      actionBusy = 'idle';
    }
  }

  async function uninstallBpp(skipPrompt = false) {
    if (!pageState.effectiveGamePath || actionBusy !== 'idle') return;

    if (!skipPrompt && (await maybeConfirmSteamQuit('uninstall'))) {
      return;
    }

    actionBusy = 'uninstall';
    try {
      await uninstallBppApi(env?.steam_path ?? '', pageState.effectiveGamePath);
      await refreshAfterAction();
    } catch (e) {
      console.error(e);
      actionBusy = 'idle';
    }
  }

  async function launchGame() {
    if (!pageModel.canLaunchGame) return;

    try {
      await openUrl(STEAM_BAZAAR_URL);
    } catch (e) {
      console.error(e);
    }
  }

  async function openBilibili(event?: MouseEvent) {
    event?.preventDefault();

    if (!hasTauriRuntime()) {
      if (typeof window !== 'undefined') {
        window.open(BILIBILI_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await openUrl(BILIBILI_URL);
    } catch (e) {
      console.error(e);
    }
  }

  function openUpdaterModal(title: string, body: string) {
    updaterModalTitle = title;
    updaterModalBody = body;
    showUpdaterModal = true;
  }

  function closeUpdaterModal() {
    showUpdaterModal = false;
  }

  function openUpdaterReviewModal() {
    showUpdaterReviewModal = true;
  }

  function closeUpdaterReviewModal() {
    if (updaterReviewBusy) {
      return;
    }

    showUpdaterReviewModal = false;
  }

  async function startPendingUpdateDownload(update: Update) {
    const result = await downloadPendingUpdate({
      snapshot: updaterSnapshot,
      update,
      t,
      markPendingWhatsNewLaunch,
      onProgress: (snapshot) => {
        updaterSnapshot = snapshot;
      }
    });

    updaterSnapshot = result.snapshot;
    openUpdaterModal(result.modal.title, result.modal.body);
  }

  async function repairBpp() {
    if (!pageState.effectiveGamePath || actionBusy !== 'idle') return;

    showRepairModal = false;
    actionBusy = 'repair';
    try {
      await repairBppApi(pageState.effectiveGamePath);
      await refreshAfterAction();
    } catch (e) {
      console.error(e);
      actionBusy = 'idle';
    }
  }

  async function confirmUpdaterReview() {
    if (!pendingUpdate || updaterReviewBusy) {
      return;
    }

    updaterReviewBusy = true;
    try {
      await startPendingUpdateDownload(pendingUpdate);
      showUpdaterReviewModal = false;
    } finally {
      updaterReviewBusy = false;
    }
  }

  async function handleUpdaterAction() {
    const decision = resolveUpdaterActionDecision({
      snapshot: updaterSnapshot,
      pendingUpdate,
      hasTauriRuntime: hasTauriRuntime(),
      t
    });

    if (decision.type === 'noop') {
      return;
    }

    if (decision.type === 'check') {
      await checkForUpdatesOnStartup();
      return;
    }

    if (decision.type === 'open_review') {
      openUpdaterReviewModal();
      return;
    }

    openUpdaterModal(decision.modal.title, decision.modal.body);
  }

  function clearBazaarInvalid() {
    bazaarInvalid = false;
  }

  function createBppDataResetBody(input: {
    issue: BppDataIssue | null;
    version: string | null;
    sizeLabel: string;
  }) {
    if (input.issue === 'incompatible_version') {
      const versionLabel = input.version ?? localized('未知', 'unknown');
      return localized(
        `检测到 BazaarPlusPlus 数据目录中的 BPPData.version 版本不兼容（当前：${versionLabel}）。\n需要删除游戏根目录下整个 BazaarPlusPlus 文件夹，并重建数据目录。\n你可以点击“重置战绩记录”按钮自动重置，或者手动删除该文件夹。\n当前目录占用空间：${input.sizeLabel}\n这会删除你当前的所有战绩记录。`,
        `An incompatible BPPData.version was detected in the BazaarPlusPlus data directory (current: ${versionLabel}).\nDelete the entire BazaarPlusPlus folder in the game root so the installer can rebuild the data directory.\nYou can use the "Reset Match History" button to reset it automatically, or delete that folder manually.\nCurrent directory size: ${input.sizeLabel}\nThis will delete all current match history.`
      );
    }

    return localized(
      `检测到游戏根目录的 BazaarPlusPlus 文件夹里没有 BPPData.version。\n需要删除整个 BazaarPlusPlus 文件夹，并重建数据目录。\n你可以点击“重置战绩记录”按钮自动重置，或者手动删除该文件夹。\n当前目录占用空间：${input.sizeLabel}\n这会删除你当前的所有战绩记录。`,
      `The BazaarPlusPlus folder exists in the game root, but BPPData.version is missing.\nDelete the entire BazaarPlusPlus folder so the installer can rebuild the data directory.\nYou can use the "Reset Match History" button to reset it automatically, or delete that folder manually.\nCurrent directory size: ${input.sizeLabel}\nThis will delete all current match history.`
    );
  }

  function toggleStreamMode() {
    showStreamMode = !showStreamMode;
  }

  $: pageModel = createInstallPageModel({
    env,
    bazaarFound,
    customGamePath,
    actionBusy,
    showStreamMode,
    locale: $locale,
    isDebugInstallPreview,
    updaterSnapshot,
    hasPendingUpdate: Boolean(pendingUpdate),
    pendingSteamAction,
    playerObservation,
    installationRecord,
    hasInstallationPrivateKey,
    identityLoadState,
    identityActionBusy,
    identityPassword,
    identityPasswordConfirm,
    identityConfirmed,
    localized,
    t
  });
  $: pageState = pageModel.pageState;
  $: identityState = pageModel.identityState;
  $: if (pageModel.shouldCollapseIdentityPanel) {
    identityPanelExpanded = false;
  }
  $: persistCustomGamePath(customGamePath);
  $: if (!hasTauriRuntime() || !pageState.effectiveGamePath) {
    identityLoadedGamePath = '';
    resetIdentitySnapshot();
  } else if (pageState.effectiveGamePath !== identityLoadedGamePath) {
    void refreshIdentity(pageState.effectiveGamePath);
  }

  onMount(() => {
    locale.init();
    void (async () => {
      if (await maybeOpenWhatsNewAfterAutoUpdate()) {
        return;
      }

      await detectEnvironment();
      await checkForUpdatesOnStartup();
    })();
  });
</script>

<svelte:head>
  <title>{t('pageTitle')}</title>
</svelte:head>

<main class="shell">
  <InstallerInstallPreviewModal
    open={showInstallModal}
    bind:installAcknowledged
    confirming={installConfirmationBusy}
    bilibiliUrl={BILIBILI_URL}
    onOpenBilibili={openBilibili}
    onConfirm={confirmInstall}
  />

  <InstallerResetHistoryModal
    open={showRepairModal}
    body={repairModalBody}
    bind:acknowledged={repairAcknowledged}
    confirming={actionBusy === 'repair'}
    onConfirm={repairBpp}
    onCancel={closeRepairModal}
  />

  <AppModal
    open={showLaunchOptionsWarningModal}
    eyebrow="BazaarPlusPlus"
    title={t('launchOptionsWarningTitle')}
    body={t('launchOptionsWarningBody')}
    confirmText={t('actionClose')}
    onConfirm={closeLaunchOptionsWarningModal}
  />

  <AppModal
    open={showSteamQuitModal}
    eyebrow="BazaarPlusPlus"
    title={pageModel.steamModalTitle}
    body={pageModel.steamModalBody}
    confirmText={t('actionQuitSteam')}
    cancelText={pageModel.steamModalCancelText}
    showCancel={true}
    confirmBusy={steamActionBusy}
    confirmBusyText={t('actionQuitSteam')}
    onConfirm={confirmSteamQuitAndContinue}
    onCancel={handleSteamQuitModalCancel}
  />

  <AppModal
    open={showUpdaterReviewModal}
    eyebrow="BazaarPlusPlus"
    title={t('updaterReviewTitle')}
    body={t('updaterReviewBody', {
      version:
        updaterSnapshot.availableVersion ?? pendingUpdate?.version ?? 'unknown'
    })}
    confirmText={t('updaterReviewConfirm')}
    cancelText={t('updaterReviewCancel')}
    showCancel={true}
    confirmBusy={updaterReviewBusy}
    confirmBusyText={t('updaterInstalling')}
    onConfirm={confirmUpdaterReview}
    onCancel={closeUpdaterReviewModal}
  />

  <AppModal
    open={showUpdaterModal}
    eyebrow="BazaarPlusPlus"
    title={updaterModalTitle}
    body={updaterModalBody}
    confirmText={t('actionClose')}
    onConfirm={closeUpdaterModal}
  />

  <InstallerHeader
    kicker={t('kicker')}
    subtitle={pageModel.modeTitle}
    localeBadge={pageModel.localeBadge}
    localeButtonLabel={pageModel.localeButtonLabel}
    bilibiliUrl={BILIBILI_URL}
    onOpenBilibili={openBilibili}
    updaterButtonLabel={pageModel.updaterButtonLabel}
    updaterButtonTitle={pageModel.updaterButtonTitle}
    updaterButtonDisabled={pageModel.updaterButtonDisabled}
    updaterButtonHighlighted={pageModel.updaterButtonHighlighted}
    onOpenUpdater={handleUpdaterAction}
    streamModeActive={showStreamMode}
    streamModeLabel={pageModel.modeToggleLabel}
    onToggleStreamMode={toggleStreamMode}
  />

  {#if !showStreamMode && hasTauriRuntime() && pageModel.hasPath}
    <section class="identity-card">
      <button
        type="button"
        class="identity-toggle"
        class:is-static={identityState.kind === 'observation_required' || identityState.kind === 'ready'}
        class:is-expanded={identityPanelExpanded}
        on:click={toggleIdentityPanel}
        disabled={identityState.kind === 'observation_required' ||
          identityState.kind === 'ready' ||
          identityLoadState === 'loading'}
        aria-expanded={identityState.kind === 'observation_required'
          ? undefined
          : identityState.kind === 'ready'
            ? undefined
          : identityPanelExpanded}
      >
        <div class="identity-toggle-copy">
          <p class="identity-kicker">
            {localized('身份状态', 'Identity Status')}
          </p>
          <h2>{pageModel.identityPanelTitle}</h2>
          {#if pageModel.identityPanelSummary}
            <p class="identity-toggle-summary">{pageModel.identityPanelSummary}</p>
          {/if}
        </div>

        {#if identityState.kind !== 'observation_required' &&
          identityState.kind !== 'ready' &&
          identityLoadState !== 'loading'}
          <span class="identity-toggle-icon" aria-hidden="true">
            {identityPanelExpanded ? '−' : '+'}
          </span>
        {/if}
      </button>

      {#if identityPanelExpanded && identityLoadState !== 'loading'}
        {#if identityState.kind === 'observation_required'}
          <div class="identity-note-stack">
            <p class="identity-note">
              {localized(
                '先启动带 mod 的游戏，安装器会自动识别当前账号。',
                'Launch the modded game first. The installer will detect the current account automatically.'
              )}
            </p>
          </div>
        {:else if identityState.kind === 'activate_first_account'}
          <dl class="identity-account">
            <div>
              <dt>{localized('当前游戏账号', 'Current game account')}</dt>
              <dd>{identityState.observation.player_username}</dd>
            </div>
          </dl>
          <div class="identity-note-stack">
            <p class="identity-note">
              {localized(
                '第一次使用就设置密码并激活。',
                'Set a password and activate if this is your first time here.'
              )}
            </p>
            <p class="identity-note">
              {localized(
                '如果这个账号已经注册过，直接点“已有账号登录”。',
                'If this account already exists, use “Log in existing account”.'
              )}
            </p>
          </div>
        {:else if identityState.kind === 'relogin_required'}
          <dl class="identity-account">
            <div>
              <dt>{localized('当前游戏账号', 'Current game account')}</dt>
              <dd>{identityState.observation.player_username}</dd>
            </div>
          </dl>
          <div class="identity-note-stack">
            <p class="identity-note">
              {localized(
                '检测到游戏里已经切到另一个账号。',
                'The game is currently using a different account.'
              )}
            </p>
            <p class="identity-note">
              {localized(
                '重新登录后会更新这台电脑上的本地安装凭证。',
                'Re-login will refresh the local installation credentials on this computer.'
              )}
            </p>
          </div>
        {:else}
          {#if identityState.observation}
            <dl class="identity-account">
              <div>
                <dt>{localized('当前游戏账号', 'Current game account')}</dt>
                <dd>{identityState.observation.player_username}</dd>
              </div>
            </dl>
          {/if}
          <div class="identity-note-stack">
            <p class="identity-note">
              {identityState.observation
                ? localized(
                    '当前检测到的游戏账号和本地安装凭证一致。',
                    'The detected game account matches the local installation credentials.'
                  )
                : localized(
                    '本地安装凭证已经就绪。',
                    'The local installation credentials are ready.'
                  )}
            </p>
            <p class="identity-note">
              {identityState.observation
                ? localized(
                    '可以直接继续安装、修复或启动游戏。',
                    'You can continue with install, repair, or launch.'
                  )
                : localized(
                    '启动游戏后，安装器会再次自动识别当前账号。',
                    'The installer will detect the current account again after you launch the game.'
                  )}
            </p>
          </div>
        {/if}

        {#if identityState.kind !== 'observation_required' && identityState.kind !== 'ready'}
          <label class="identity-field">
            <span>{localized('账号密码', 'Account password')}</span>
            <input
              bind:value={identityPassword}
              type="password"
              autocomplete="current-password"
              placeholder={localized('输入当前账号密码', 'Enter the current account password')}
            />
          </label>

          {#if identityState.kind === 'activate_first_account'}
            <label class="identity-field">
              <span>{localized('再次输入密码', 'Confirm password')}</span>
              <input
                bind:value={identityPasswordConfirm}
                type="password"
                autocomplete="new-password"
                placeholder={localized('再次输入一次密码', 'Enter the password again')}
              />
            </label>

            {#if identityPasswordConfirm.trim() && !pageModel.activationPasswordMatches}
              <p class="identity-error">
                {localized('两次输入的密码不一致。', 'The two passwords do not match.')}
              </p>
            {/if}
          {/if}

          <label class="identity-confirm">
            <input bind:checked={identityConfirmed} type="checkbox" />
            <span>
              {localized(
                '我确认要为当前游戏账号写入本地安装凭证。',
                'I confirm that local installation credentials should be written for the current game account.'
              )}
            </span>
          </label>

          <div class="identity-actions">
            {#if identityState.kind === 'activate_first_account'}
              <button
                type="button"
                class="identity-button primary"
                on:click={activateObservedAccount}
                disabled={!pageModel.canActivateObservedAccount}
              >
                {identityActionBusy === 'activating'
                  ? localized('正在激活…', 'Activating...')
                  : localized('首次激活', 'Create first account')}
              </button>
              <button
                type="button"
                class="identity-button"
                on:click={loginAndRefreshInstallation}
                disabled={!pageModel.canLoginIdentity}
              >
                {identityActionBusy === 'logging_in'
                  ? localized('正在登录…', 'Logging in...')
                  : localized('已有账号登录', 'Log in existing account')}
              </button>
            {:else if identityState.kind === 'relogin_required'}
              <button
                type="button"
                class="identity-button primary"
                on:click={loginAndRefreshInstallation}
                disabled={!pageModel.canLoginIdentity}
              >
                {identityActionBusy === 'logging_in'
                  ? localized('正在重新登录…', 'Re-logging in...')
                  : localized('重新登录并刷新 installation', 'Re-login and refresh installation')}
              </button>
            {/if}
          </div>
        {/if}
      {/if}

      {#if identityError}
        <p class="identity-error">{identityError}</p>
      {/if}

      {#if identitySuccess && identityState.kind !== 'ready'}
        <p class="identity-success">{identitySuccess}</p>
      {/if}
    </section>
  {/if}

  {#if showStreamMode}
    <section class="embedded-stream-shell">
      <StreamModePanel
        eyebrow={$locale === 'zh' ? '直播模式' : 'Stream Mode'}
        title={$locale === 'zh' ? '直播模式' : 'Stream Mode'}
        intro={t('streamIntro')}
      />
    </section>
  {:else}
    <InstallerStatusSteps
      {env}
      {dotnetState}
      modInstalled={pageModel.modInstalled}
      versionMismatch={pageModel.versionMismatch}
      bundledBppVersion={pageModel.bundledBppVersion}
      installedBppVersion={pageModel.installedBppVersion}
      {bazaarFound}
      {bazaarChecking}
      {bazaarInvalid}
      bppDataResetRequired={pageModel.bppDataResetRequired}
      bppDataIssue={pageModel.bppDataIssue}
      bppDataVersion={pageModel.bppDataVersion}
      bind:customGamePath
      hasPath={pageModel.hasPath}
      isBusy={pageModel.isBusy}
      {actionBusy}
      canInstall={pageModel.canInstall}
      canLaunchGame={pageModel.canLaunchGame}
      dotnetDownloadUrl={pageModel.dotnetDownloadUrl}
      effectiveGamePath={pageState.effectiveGamePath}
      {t}
      onPickGamePath={pickGamePath}
      onCheckPath={checkPath}
      onRequestInstall={requestInstall}
      onRepair={requestRepair}
      onUninstall={uninstallBpp}
      onLaunchGame={launchGame}
      onResetBazaar={resetBazaar}
      onCustomGamePathInput={clearBazaarInvalid}
    />
  {/if}

  <InstallerSupportBar />

  <footer class="footer" aria-hidden="true">
    <div class="rule">
      <span></span><span class="diamond small">+</span><span></span>
    </div>
    <p>{t('footer')}</p>
  </footer>
</main>

<style>
  .shell {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 1.25rem 1rem 1.75rem;
    display: grid;
    gap: 0.85rem;
    animation: fade-up 0.5s ease both;
  }

  .embedded-stream-shell {
    padding: 0.95rem 1.05rem;
    background:
      radial-gradient(
        circle at top left,
        rgba(255, 214, 140, 0.08),
        transparent 42%
      ),
      linear-gradient(180deg, rgba(20, 12, 6, 0.96), rgba(12, 7, 4, 0.94));
    border: 1px solid rgba(200, 148, 55, 0.15);
    border-radius: 3px;
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.3),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
  }

  .identity-card {
    display: grid;
    gap: 0.75rem;
    border-radius: 3px;
    border: 1px solid rgba(200, 148, 55, 0.18);
    background:
      radial-gradient(
        circle at top left,
        rgba(255, 214, 140, 0.09),
        transparent 38%
      ),
      linear-gradient(180deg, rgba(24, 14, 8, 0.97), rgba(14, 8, 5, 0.95));
    box-shadow:
      0 8px 26px rgba(0, 0, 0, 0.28),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
  }

  .identity-toggle {
    width: 100%;
    padding: 0.95rem 1.05rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .identity-toggle.is-static {
    cursor: default;
  }

  .identity-toggle-copy {
    display: grid;
    gap: 0.22rem;
  }

  .identity-kicker {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(216, 182, 109, 0.72);
  }

  .identity-toggle-copy h2 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 1rem;
    color: rgba(248, 232, 196, 0.95);
  }

  .identity-toggle-summary {
    margin: 0;
    line-height: 1.5;
    font-size: 0.9rem;
    color: rgba(240, 222, 188, 0.78);
  }

  .identity-toggle-icon {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(205, 177, 118, 0.2);
    border-radius: 999px;
    color: rgba(248, 232, 196, 0.9);
    font-size: 1.2rem;
    line-height: 1;
  }

  .identity-note,
  .identity-error,
  .identity-success {
    margin: 0 1.05rem;
    line-height: 1.55;
    font-size: 0.92rem;
  }

  .identity-note {
    color: rgba(240, 222, 188, 0.78);
  }

  .identity-note-stack {
    display: grid;
    gap: 0.35rem;
    padding: 0 1.05rem;
  }

  .identity-error {
    color: rgba(255, 162, 142, 0.92);
  }

  .identity-success {
    color: rgba(169, 223, 161, 0.92);
  }

  .identity-account {
    margin: 0 1.05rem;
  }

  .identity-account div {
    display: grid;
    gap: 0.28rem;
    width: fit-content;
    min-width: min(100%, 240px);
    padding: 0.75rem 0.9rem;
    border: 1px solid rgba(205, 177, 118, 0.16);
    border-radius: 2px;
    background: rgba(14, 8, 5, 0.42);
  }

  .identity-account dt {
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.62);
  }

  .identity-account dd {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 600;
    color: rgba(249, 236, 211, 0.94);
    word-break: break-word;
  }

  .identity-field {
    display: grid;
    gap: 0.4rem;
    padding: 0 1.05rem;
  }

  .identity-field span {
    font-size: 0.74rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.7);
  }

  .identity-field input {
    width: 100%;
    padding: 0.72rem 0.82rem;
    border-radius: 2px;
    border: 1px solid rgba(200, 148, 55, 0.24);
    background: rgba(10, 6, 4, 0.72);
    color: rgba(251, 240, 220, 0.96);
    font-size: 0.95rem;
  }

  .identity-field input::placeholder {
    color: rgba(208, 181, 127, 0.42);
  }

  .identity-confirm {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    padding: 0 1.05rem;
    color: rgba(240, 222, 188, 0.82);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .identity-confirm input {
    margin-top: 0.18rem;
  }

  .identity-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    padding: 0 1.05rem 1.05rem;
  }

  .identity-button {
    border: 1px solid rgba(208, 170, 94, 0.32);
    background: rgba(31, 18, 10, 0.84);
    color: rgba(251, 240, 220, 0.95);
    padding: 0.72rem 0.95rem;
    font-family: 'Cinzel', serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .identity-button.primary {
    background: linear-gradient(
      180deg,
      rgba(188, 141, 57, 0.92),
      rgba(136, 89, 28, 0.95)
    );
    color: rgba(18, 10, 4, 0.95);
  }

  .identity-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .rule {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: rgba(200, 148, 55, 0.35);
  }

  .rule span:first-child,
  .rule span:last-child {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(200, 148, 55, 0.3) 40%,
      rgba(200, 148, 55, 0.3) 60%,
      transparent
    );
  }

  .diamond {
    font-size: 0.55rem;
    color: rgba(205, 150, 60, 0.55);
  }
  .diamond.small {
    font-size: 0.42rem;
  }

  .footer {
    text-align: center;
    display: grid;
    gap: 0.4rem;
  }

  .footer p {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(140, 110, 60, 0.35);
  }

  @media (max-width: 520px) {
    .shell {
      padding: 1rem 0.85rem 1.5rem;
    }

    .identity-actions {
      flex-direction: column;
    }
  }
</style>
