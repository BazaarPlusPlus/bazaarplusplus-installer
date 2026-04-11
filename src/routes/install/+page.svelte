<script lang="ts">
  import { goto } from '$app/navigation';
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount } from 'svelte';
  import type { Update } from '@tauri-apps/plugin-updater';
  import AppModal from '$lib/components/AppModal.svelte';
  import type { EnvironmentInfo } from '$lib/types';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import InstallerHeader from '$lib/components/installer/InstallerHeader.svelte';
  import InstallerInstallPreviewModal from '$lib/components/installer/InstallerInstallPreviewModal.svelte';
  import InstallerResetHistoryModal from '$lib/components/installer/InstallerResetHistoryModal.svelte';
  import InstallerStatusSteps from '$lib/components/installer/InstallerStatusSteps.svelte';
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
    checkForAppUpdate,
    createInitialUpdaterSnapshot,
    createProgressLabel,
    downloadAndInstallUpdate,
    formatUpdaterError,
    type UpdaterSnapshot
  } from '$lib/updater';
  import {
    createPageState,
    selectCustomGamePath,
    type ActionBusy,
    type StepState
  } from '$lib/installer/state';
  import {
    getInstallRuntimeRisks,
    shouldShowInstallRiskModal,
    type InstallRuntimeRisk
  } from '$lib/installer/install-guards';
  import { detectInstallerEnvironment } from '$lib/installer/detect-flow';
  import { createIdentityApi } from '$lib/identity/api';
  import { createIdentityState } from '$lib/identity/state';
  import type {
    InstallationRecordPayload,
    PlayerObservationPayload,
    RegistrationStreamProfile
  } from '$lib/identity/types';

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
  const registrationStreamPlatformOptions = [
    {
      value: 'bilibili',
      zhLabel: '哔哩哔哩',
      enLabel: 'Bilibili'
    },
    {
      value: 'twitch',
      zhLabel: 'Twitch',
      enLabel: 'Twitch'
    }
  ] as const;
  let playerObservation: PlayerObservationPayload | null = null;
  let installationRecord: InstallationRecordPayload | null = null;
  let hasInstallationPrivateKey = false;
  let identityLoadState: 'idle' | 'loading' = 'idle';
  let identityActionBusy: 'idle' | 'activating' | 'logging_in' = 'idle';
  let identityPassword = '';
  let identityPasswordConfirm = '';
  let identityStreamPlatform = '';
  let identityStreamChannelId = '';
  let identityStreamUrl = '';
  let identityConfirmed = false;
  let identityError = '';
  let identitySuccess = '';
  let identityLoadedGamePath = '';
  let identityLoadRequestId = 0;
  let identityPanelExpanded = false;

  $: t = (
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ): string => formatMessage($locale, key, params);

  const isDebugInstallPreview = resolveInstallDebugPreview({
    isDev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    hasTauriRuntime: hasTauriRuntime()
  });

  function localized(zh: string, en: string): string {
    return $locale === 'zh' ? zh : en;
  }

  function isValidHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function resetIdentitySnapshot() {
    playerObservation = null;
    installationRecord = null;
    hasInstallationPrivateKey = false;
    identityError = '';
    identitySuccess = '';
  }

  function formatIdentityError(error: unknown): string {
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

  function formatBytes(bytes: number): string {
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

  function applyInstallDebugState() {
    env = {
      steam_path: 'C:\\Program Files (x86)\\Steam',
      steam_launch_options_supported: true,
      game_path: 'C:\\Games\\The Bazaar',
      dotnet_version: '9.0.0',
      dotnet_ok: true,
      bepinex_installed: false,
      bpp_version: null,
      bundled_bpp_version: 'debug-preview'
    };
    dotnetState = 'found';
    bazaarFound = true;
    bazaarInvalid = false;
  }

  function requestInstall() {
    if (!canInstall) return;
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
      sizeLabel = formatBytes(info.total_bytes);
    } catch (e) {
      console.error(e);
    }

    repairModalBody = t('resetHistoryBody', { size: sizeLabel });
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
        requestedGamePath: selectedPath,
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
      const snapshot = await identityApi.loadLocalIdentity(gameRoot);
      if (requestId !== identityLoadRequestId) {
        return;
      }

      playerObservation = snapshot.observation;
      installationRecord = snapshot.installation;
      hasInstallationPrivateKey = Boolean(
        snapshot.installationPrivateKeyPkcs8B64
      );
      identityLoadedGamePath = gameRoot;
    } catch (error) {
      if (requestId !== identityLoadRequestId) {
        return;
      }

      resetIdentitySnapshot();
      identityError = formatIdentityError(error);
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
      !identityRegistrationStreamProfile ||
      identityPassword.trim() !== identityPasswordConfirm.trim() ||
      identityActionBusy !== 'idle'
    ) {
      return;
    }

    identityActionBusy = 'activating';
    resetIdentityMessages();

    try {
      await identityApi.activateFirstAccount({
        gameRoot: pageState.effectiveGamePath,
        observation: playerObservation,
        password: identityPassword.trim(),
        streamProfile: identityRegistrationStreamProfile
      });
      identityPassword = '';
      identityPasswordConfirm = '';
      identityStreamPlatform = '';
      identityStreamChannelId = '';
      identityStreamUrl = '';
      identityConfirmed = false;
      identitySuccess = localized(
        '新的 installation 身份已写入本地共享目录。',
        'A new installation identity was written to the shared local directory.'
      );
      await refreshIdentity(pageState.effectiveGamePath);
    } catch (error) {
      identityError = formatIdentityError(error);
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
      await identityApi.loginAndCreateInstallation({
        gameRoot: pageState.effectiveGamePath,
        observation: playerObservation,
        password: identityPassword.trim()
      });
      identityPassword = '';
      identityPasswordConfirm = '';
      identityConfirmed = false;
      identitySuccess = localized(
        'installation 材料已经按当前观察到的账号重新生成。',
        'Installation material was regenerated for the currently observed account.'
      );
      await refreshIdentity(pageState.effectiveGamePath);
    } catch (error) {
      identityError = formatIdentityError(error);
    } finally {
      identityActionBusy = 'idle';
    }
  }

  async function checkForUpdatesOnStartup() {
    const requestId = ++updaterCheckRequestId;

    updaterSnapshot = {
      ...updaterSnapshot,
      status: hasTauriRuntime() ? 'checking' : 'unsupported',
      errorMessage: null
    };

    const result = await checkForAppUpdate();
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
    if (!hasTauriRuntime()) {
      return false;
    }

    const pendingLaunch = loadPendingWhatsNewLaunch();
    if (!pendingLaunch) {
      return false;
    }

    try {
      const currentVersion = (await getVersion()).trim();

      if (currentVersion !== pendingLaunch.toVersion) {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }

    clearPendingWhatsNewLaunch();
    await goto(
      `/whats-new?version=${encodeURIComponent(pendingLaunch.toVersion)}`
    );
    return true;
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
      bazaarFound = await verifyGamePathApi(path);
      if (!bazaarFound) {
        bazaarInvalid = true;
      }
    } catch {
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
    if (!canInstall) return;

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
    if (!canLaunchGame) return;

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
    updaterSnapshot = {
      ...updaterSnapshot,
      status: 'downloading',
      errorMessage: null,
      progress: {
        downloadedBytes: 0,
        totalBytes: null
      }
    };

    try {
      await downloadAndInstallUpdate(update, (progress) => {
        updaterSnapshot = {
          ...updaterSnapshot,
          status: 'downloading',
          progress
        };
      });

      markPendingWhatsNewLaunch({
        reason: 'auto-update',
        fromVersion: update.currentVersion,
        toVersion: update.version
      });

      updaterSnapshot = {
        ...updaterSnapshot,
        status: 'installed'
      };
      openUpdaterModal(
        t('updaterInstalledTitle'),
        t('updaterInstalledBody', {
          version: updaterSnapshot.availableVersion ?? update.version
        })
      );
    } catch (error) {
      const errorMessage = formatUpdaterError(error);
      updaterSnapshot = {
        ...updaterSnapshot,
        status: 'error',
        errorMessage: errorMessage,
        progress: {
          downloadedBytes: 0,
          totalBytes: null
        }
      };

      openUpdaterModal(
        t('updaterErrorTitle'),
        t('updaterErrorBody', { message: errorMessage })
      );
    }
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
    if (
      updaterSnapshot.status === 'checking' ||
      updaterSnapshot.status === 'downloading'
    ) {
      return;
    }

    if (!hasTauriRuntime()) {
      openUpdaterModal(
        t('updaterErrorTitle'),
        t('updaterErrorBody', { message: t('updaterUnsupported') })
      );
      return;
    }

    if (updaterSnapshot.status === 'available' && pendingUpdate) {
      openUpdaterReviewModal();
      return;
    }

    if (updaterSnapshot.status === 'installed') {
      openUpdaterModal(
        t('updaterInstalledTitle'),
        t('updaterInstalledBody', {
          version:
            updaterSnapshot.availableVersion ??
            updaterSnapshot.currentVersion ??
            'unknown'
        })
      );
      return;
    }

    if (updaterSnapshot.status === 'error') {
      if (pendingUpdate) {
        openUpdaterReviewModal();
        return;
      }

      openUpdaterModal(
        t('updaterErrorTitle'),
        t('updaterErrorBody', {
          message: updaterSnapshot.errorMessage ?? t('updaterUnsupported')
        })
      );
      return;
    }

    if (updaterSnapshot.status === 'up-to-date') {
      openUpdaterModal(t('updaterCurrentTitle'), t('updaterCurrentBody'));
      return;
    }

    if (updaterSnapshot.status === 'idle') {
      await checkForUpdatesOnStartup();
      return;
    }

    if (updaterSnapshot.status === 'unsupported') {
      openUpdaterModal(
        t('updaterErrorTitle'),
        t('updaterErrorBody', { message: t('updaterUnsupported') })
      );
      return;
    }

    openUpdaterModal(
      t('updaterReadyTitle'),
      t('updaterReadyBody', {
        version: updaterSnapshot.availableVersion ?? 'unknown'
      })
    );
  }

  function clearBazaarInvalid() {
    bazaarInvalid = false;
  }

  function toggleStreamMode() {
    showStreamMode = !showStreamMode;
  }

  $: modeTitle = showStreamMode ? t('streamTitle') : t('subtitle');
  $: modeToggleLabel = showStreamMode
    ? localized('安装模式', 'Install Mode')
    : localized('直播模式', 'Stream Mode');
  $: identityPanelTitle =
    identityState.kind === 'observation_required'
      ? localized('尚未检测到游戏账号', 'No game account detected yet')
      : identityState.kind === 'activate_first_account'
        ? localized('已检测到游戏账号', 'Game account detected')
        : identityState.kind === 'relogin_required'
          ? localized('检测到账号切换', 'Game account changed')
          : localized('账号已连接', 'Account connected');
  $: identityPanelSummary =
    identityLoadState === 'loading'
      ? localized('正在读取账号状态…', 'Reading account status...')
      : identityState.kind === 'observation_required'
        ? localized(
            '请先安装最新版 MOD，运行一次游戏，再回来绑定账号。',
            'Install the latest mod, run the game once, then come back to bind the account.'
          )
        : identityState.kind === 'activate_first_account'
          ? localized(
              `当前账号：${identityState.observation.player_username}，点击展开继续。`,
              `Current account: ${identityState.observation.player_username}. Click to continue.`
            )
          : identityState.kind === 'relogin_required'
            ? localized(
                `当前账号：${identityState.observation.player_username}，点击展开重新登录。`,
                `Current account: ${identityState.observation.player_username}. Click to re-login.`
              )
            : '';
  $: if (identityState.kind === 'ready') {
    identityPanelExpanded = false;
  }
  $: selectedPath = selectCustomGamePath(customGamePath);
  $: modInstalled = Boolean(env?.bpp_version);
  $: bundledBppVersion = env?.bundled_bpp_version ?? null;
  $: installedBppVersion = env?.bpp_version ?? null;
  $: pageState = createPageState({
    actionBusy,
    bazaarFound,
    selectedGamePath: selectedPath,
    detectedGamePath: env?.game_path ?? null,
    isDebugInstallPreview,
    bundledBppVersion,
    installedBppVersion
  });
  $: hasPath = pageState.hasPath;
  $: versionMismatch = pageState.versionMismatch;
  $: isBusy = pageState.isBusy;
  $: canInstall = pageState.canInstall;
  $: canLaunchGame = pageState.canLaunchGame;
  $: dotnetDownloadUrl =
    $locale === 'zh'
      ? 'https://dotnet.microsoft.com/zh-cn/download'
      : 'https://dotnet.microsoft.com/en-us/download';
  $: localeBadge = $locale === 'zh' ? '中' : 'EN';
  $: localeButtonLabel = $locale === 'zh' ? 'Switch to English' : '切换到中文';
  $: updaterProgressLabel = createProgressLabel(updaterSnapshot.progress);
  $: updaterButtonLabel =
    updaterSnapshot.status === 'checking'
      ? t('updaterChecking')
      : updaterSnapshot.status === 'available'
        ? t('updaterReady', {
            version: updaterSnapshot.availableVersion ?? '...'
          })
        : updaterSnapshot.status === 'downloading'
          ? t('updaterDownloading', {
              progress: updaterProgressLabel ?? '...'
            })
          : updaterSnapshot.status === 'installed'
            ? t('updaterInstallReady', {
                version: updaterSnapshot.availableVersion ?? '...'
              })
            : updaterSnapshot.status === 'error'
              ? pendingUpdate
                ? t('updaterRetry')
                : t('updaterErrorState')
              : updaterSnapshot.status === 'unsupported'
                ? t('updaterUnsupported')
                : t('updaterCurrent');
  $: updaterButtonTitle =
    updaterSnapshot.status === 'available'
      ? t('updaterReadyTitle')
      : updaterSnapshot.status === 'downloading'
        ? t('updaterInstalling')
        : updaterSnapshot.status === 'installed'
          ? t('updaterInstalledTitle')
          : updaterSnapshot.status === 'error'
            ? t('updaterErrorTitle')
            : updaterButtonLabel;
  $: updaterButtonDisabled =
    updaterSnapshot.status === 'checking' ||
    updaterSnapshot.status === 'downloading';
  $: updaterButtonHighlighted =
    updaterSnapshot.status === 'available' ||
    updaterSnapshot.status === 'installed';
  $: steamModalTitle =
    pendingSteamAction === 'install'
      ? t('installRiskTitle')
      : t('steamQuitTitle');
  $: steamModalBody =
    pendingSteamAction === 'install'
      ? `${t('installRiskSteamDetected')}\n\n${t('installRiskBody')}`
      : t('steamQuitBody');
  $: steamModalCancelText =
    pendingSteamAction === 'install'
      ? t('actionContinueInstall')
      : t('actionClose');
  $: persistCustomGamePath(customGamePath);
  $: identityState = createIdentityState({
    observation: playerObservation,
    installation: installationRecord,
    hasInstallationPrivateKey
  });
  $: activationPasswordMatches =
    !identityPassword.trim() ||
    !identityPasswordConfirm.trim() ||
    identityPassword.trim() === identityPasswordConfirm.trim();
  $: activationStreamUrlValid =
    !identityStreamUrl.trim() || isValidHttpUrl(identityStreamUrl.trim());
  $: identityRegistrationStreamProfile =
    identityStreamPlatform.trim() &&
    identityStreamChannelId.trim() &&
    identityStreamUrl.trim() &&
    activationStreamUrlValid
      ? ({
          stream_platform: identityStreamPlatform.trim(),
          stream_channel_id: identityStreamChannelId.trim(),
          stream_url: identityStreamUrl.trim()
        } satisfies RegistrationStreamProfile)
      : null;
  $: identityBusy =
    identityLoadState === 'loading' || identityActionBusy !== 'idle';
  $: canActivateObservedAccount =
    identityState.kind === 'activate_first_account' &&
    Boolean(pageState.effectiveGamePath) &&
    Boolean(playerObservation) &&
    Boolean(identityPassword.trim()) &&
    Boolean(identityPasswordConfirm.trim()) &&
    Boolean(identityRegistrationStreamProfile) &&
    activationPasswordMatches &&
    identityConfirmed &&
    !identityBusy;
  $: canLoginIdentity =
    Boolean(pageState.effectiveGamePath) &&
    Boolean(playerObservation) &&
    Boolean(identityPassword.trim()) &&
    identityConfirmed &&
    !identityBusy;
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
    title={steamModalTitle}
    body={steamModalBody}
    confirmText={t('actionQuitSteam')}
    cancelText={steamModalCancelText}
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
    subtitle={modeTitle}
    {localeBadge}
    {localeButtonLabel}
    bilibiliUrl={BILIBILI_URL}
    onOpenBilibili={openBilibili}
    {updaterButtonLabel}
    {updaterButtonTitle}
    {updaterButtonDisabled}
    {updaterButtonHighlighted}
    onOpenUpdater={handleUpdaterAction}
    streamModeActive={showStreamMode}
    streamModeLabel={modeToggleLabel}
    onToggleStreamMode={toggleStreamMode}
  />

  {#if !showStreamMode && hasTauriRuntime() && hasPath}
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
          <h2>{identityPanelTitle}</h2>
          {#if identityPanelSummary}
            <p class="identity-toggle-summary">{identityPanelSummary}</p>
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

            {#if identityPasswordConfirm.trim() && !activationPasswordMatches}
              <p class="identity-error">
                {localized('两次输入的密码不一致。', 'The two passwords do not match.')}
              </p>
            {/if}

            <label class="identity-field">
              <span>{localized('直播平台', 'Streaming platform')}</span>
              <select bind:value={identityStreamPlatform}>
                <option value="">
                  {localized('请选择直播平台', 'Select a streaming platform')}
                </option>
                {#each registrationStreamPlatformOptions as option}
                  <option value={option.value}>
                    {$locale === 'zh' ? option.zhLabel : option.enLabel}
                  </option>
                {/each}
              </select>
            </label>

            <label class="identity-field">
              <span>{localized('直播频道 ID', 'Stream channel ID')}</span>
              <input
                bind:value={identityStreamChannelId}
                type="text"
                autocomplete="nickname"
                placeholder={localized(
                  '输入频道 ID，例如房间号或频道名',
                  'Enter the channel ID, for example a room ID or channel name'
                )}
              />
            </label>

            <label class="identity-field">
              <span>{localized('直播 URL', 'Stream URL')}</span>
              <input
                bind:value={identityStreamUrl}
                type="url"
                inputmode="url"
                autocomplete="url"
                placeholder={localized('输入完整直播链接', 'Enter the full stream URL')}
              />
            </label>

            {#if identityStreamUrl.trim() && !activationStreamUrlValid}
              <p class="identity-error">
                {localized(
                  '请输入有效的直播链接，必须以 http:// 或 https:// 开头。',
                  'Enter a valid stream URL starting with http:// or https://.'
                )}
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
                disabled={!canActivateObservedAccount}
              >
                {identityActionBusy === 'activating'
                  ? localized('正在激活…', 'Activating...')
                  : localized('首次激活', 'Create first account')}
              </button>
              <button
                type="button"
                class="identity-button"
                on:click={loginAndRefreshInstallation}
                disabled={!canLoginIdentity}
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
                disabled={!canLoginIdentity}
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
      {modInstalled}
      {versionMismatch}
      {bundledBppVersion}
      {installedBppVersion}
      {bazaarFound}
      {bazaarChecking}
      {bazaarInvalid}
      bind:customGamePath
      {hasPath}
      {isBusy}
      {actionBusy}
      {canInstall}
      {canLaunchGame}
      {dotnetDownloadUrl}
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

  .identity-field select {
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
