<script lang="ts">
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount } from 'svelte';
  import AppModal from '$lib/components/AppModal.svelte';
  import type { EnvironmentInfo, InstallerUpdateInfo } from '$lib/types';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import InstallerHeader from '$lib/components/installer/InstallerHeader.svelte';
  import InstallerInstallPreviewModal from '$lib/components/installer/InstallerInstallPreviewModal.svelte';
  import InstallerStatusSteps from '$lib/components/installer/InstallerStatusSteps.svelte';
  import InstallerSupportBar from '$lib/components/installer/InstallerSupportBar.svelte';
  import {
    detectDotnetRuntime as detectDotnetRuntimeApi,
    detectEnvironment as detectEnvironmentApi,
    detectSteamRunning as detectSteamRunningApi,
    installBepinex,
    loadMachineId,
    patchLaunchOptions,
    uninstallBpp as uninstallBppApi,
    verifyGamePath as verifyGamePathApi
  } from '$lib/installer/api';
  import {
    getOrCreateInstallId,
    loadLastUpdateCheckAt,
    loadPersistedCustomGamePath,
    persistCustomGamePath,
    persistLastUpdateCheckAt
  } from '$lib/installer/storage';
  import { hasTauriRuntime, resolveInstallDebugPreview, shouldConfirmSteamQuit, shouldPatchSteamLaunchOptions } from '$lib/installer/runtime';
  import { createPageState, selectCustomGamePath, selectEffectiveGamePath, type StepState } from '$lib/installer/state';
  import {
    resolveClientUpdateMetadata,
    runInstallerUpdateCheck
  } from '$lib/installer/update';

  let env: EnvironmentInfo | null = null;
  let dotnetState: StepState = 'idle';
  let bazaarFound = false;
  let bazaarChecking = false;
  let bazaarInvalid = false;
  let customGamePath = loadPersistedCustomGamePath();
  let actionBusy: 'idle' | 'detect' | 'install' | 'uninstall' = 'idle';
  const STEAM_BAZAAR_URL = 'steam://rungameid/1617400';
  const BILIBILI_URL = 'https://space.bilibili.com/3546978457750467';
  let showInstallModal = false;
  let showLaunchOptionsWarningModal = false;
  let showSteamQuitModal = false;
  let installAcknowledged = false;
  let pendingSteamAction: 'install' | 'uninstall' | null = null;
  let updateBanner: InstallerUpdateInfo | null = null;
  const UPDATE_CHECK_URL = 'https://update-check.bazaarplusplus.com';

  $: t = (key: keyof typeof messages.en, params?: Record<string, string | number>): string =>
    formatMessage($locale, key, params);

  const isDebugInstallPreview = resolveInstallDebugPreview({
    isDev: import.meta.env.DEV,
    search: typeof window !== 'undefined' ? window.location.search : '',
    hasTauriRuntime: hasTauriRuntime()
  });

  function applyInstallDebugState() {
    env = {
      steam_path: 'C:\\Program Files (x86)\\Steam',
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

  function effectiveGamePath(): string {
    return selectEffectiveGamePath(selectedPath, env?.game_path ?? null);
  }

  function requestInstall() {
    if (!canInstall) return;
    installAcknowledged = false;
    showInstallModal = true;
  }

  async function confirmInstall() {
    if (!installAcknowledged) return;
    showInstallModal = false;
    if (await maybeConfirmSteamQuit('install')) {
      return;
    }
    await installBundled();
  }

  function closeLaunchOptionsWarningModal() {
    showLaunchOptionsWarningModal = false;
  }

  function closeSteamQuitModal() {
    showSteamQuitModal = false;
    pendingSteamAction = null;
  }

  function closeUpdateBanner() {
    updateBanner = null;
  }

  async function confirmSteamQuitAndContinue() {
    const action = pendingSteamAction;
    showSteamQuitModal = false;
    pendingSteamAction = null;

    if (action === 'install') {
      await installBundled();
      return;
    }

    if (action === 'uninstall') {
      await uninstallBpp(true);
    }
  }

  async function detectDotnetRuntime() {
    try {
      const result = await detectDotnetRuntimeApi();
      env = env
        ? { ...env, ...result }
        : {
            steam_path: null,
            game_path: null,
            bpp_version: null,
            bundled_bpp_version: null,
            bepinex_installed: false,
            ...result
          };
      dotnetState = result.dotnet_ok ? 'found' : 'not_found';
    } catch {
      dotnetState = 'idle';
    }
  }

  async function detectEnvironment() {
    if (actionBusy !== 'idle') return;

    if (isDebugInstallPreview) {
      applyInstallDebugState();
      return;
    }

    actionBusy = 'detect';
    dotnetState = 'detecting';
    const dotnetPromise = detectDotnetRuntime();
    const requestedGamePath = selectedPath;

    try {
      env = await detectEnvironmentApi(requestedGamePath ?? undefined);

      if (requestedGamePath) {
        bazaarFound = await verifyGamePathApi(requestedGamePath);
        bazaarInvalid = !bazaarFound;
      } else if (env.game_path) {
        bazaarFound = await verifyGamePathApi(env.game_path);
        bazaarInvalid = !bazaarFound;
      } else {
        bazaarFound = false;
        bazaarInvalid = false;
      }

      await dotnetPromise;
    } catch {
      env = null;
      dotnetState = 'idle';
    } finally {
      actionBusy = 'idle';
    }
  }

  async function pickGamePath() {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      customGamePath = selected.trim();
    }
  }

  async function checkPath() {
    const path = effectiveGamePath();
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

  async function maybeConfirmSteamQuit(action: 'install' | 'uninstall'): Promise<boolean> {
    const steamPath = env?.steam_path?.trim() ?? '';
    if (!hasTauriRuntime() || !shouldPatchSteamLaunchOptions(steamPath)) {
      return false;
    }

    try {
      const steamInfo = await detectSteamRunningApi();
      if (!shouldConfirmSteamQuit({ steamPath, steamRunning: steamInfo.running })) {
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

  async function installBundled() {
    if (!canInstall) return;

    if (isDebugInstallPreview) {
      actionBusy = 'install';
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      env = env ? { ...env, bpp_version: env.bundled_bpp_version ?? 'debug-preview' } : env;
      actionBusy = 'idle';
      return;
    }

    actionBusy = 'install';
    try {
      const steamPath = env?.steam_path?.trim() ?? '';
      await installBepinex(steamPath, effectiveGamePath());
      if (shouldPatchSteamLaunchOptions(steamPath)) {
        const patchResult = await patchLaunchOptions(steamPath, effectiveGamePath());
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
    if (!effectiveGamePath() || actionBusy !== 'idle') return;

    if (!skipPrompt && await maybeConfirmSteamQuit('uninstall')) {
      return;
    }

    actionBusy = 'uninstall';
    try {
      await uninstallBppApi(env?.steam_path ?? '', effectiveGamePath());
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

  async function openUpdateWebsite() {
    if (!updateBanner?.websiteUrl) return;

    try {
      await openUrl(updateBanner.websiteUrl);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadInstallerUpdate() {
    if (!UPDATE_CHECK_URL || !hasTauriRuntime()) {
      return;
    }

    try {
      updateBanner = await runInstallerUpdateCheck({
        endpoint: UPDATE_CHECK_URL,
        getLastCheckedAt: loadLastUpdateCheckAt,
        persistLastCheckedAt: persistLastUpdateCheckAt,
        getAppVersion: async () => (await getVersion())?.trim() ?? null,
        getInstallId: () => getOrCreateInstallId(),
        getMachineId: loadMachineId,
        getClientMetadata: resolveClientUpdateMetadata
      });
    } catch (error) {
      console.error(error);
    }
  }

  function clearBazaarInvalid() {
    bazaarInvalid = false;
  }

  $: selectedPath = selectCustomGamePath(customGamePath);
  $: modInstalled = Boolean(env?.bpp_version);
  $: bundledBppVersion = env?.bundled_bpp_version ?? null;
  $: installedBppVersion = env?.bpp_version ?? null;
  $: pageState = createPageState({
    actionBusy,
    dotnetState,
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
  $: installPrereqsMet = pageState.installPrereqsMet;
  $: canInstall = pageState.canInstall;
  $: canLaunchGame = pageState.canLaunchGame;
  $: dotnetDownloadUrl = $locale === 'zh'
    ? 'https://dotnet.microsoft.com/zh-cn/download'
    : 'https://dotnet.microsoft.com/en-us/download';
  $: localeBadge = $locale === 'zh' ? '中' : 'EN';
  $: localeButtonLabel = $locale === 'zh' ? 'Switch to English' : '切换到中文';
  $: persistCustomGamePath(customGamePath);

  onMount(() => {
    locale.init();
    void detectEnvironment();
    void loadInstallerUpdate();
  });
</script>

<svelte:head>
  <title>{t('pageTitle')}</title>
</svelte:head>

<main class="shell">
  {#if updateBanner}
    <section class="update-banner" role="status" aria-live="polite">
      <div class="update-banner-copy">
        <p class="update-banner-title">{updateBanner.title ?? t('updateAvailableTitle')}</p>
        <p class="update-banner-body">
          {updateBanner.message ?? t('updateAvailableBody', { version: updateBanner.latestVersion })}
        </p>
      </div>
      <div class="update-banner-actions">
        <button class="update-banner-btn" type="button" onclick={openUpdateWebsite}>
          {t('updateAvailableAction')}
        </button>
        <button class="update-banner-dismiss" type="button" onclick={closeUpdateBanner}>
          {t('updateAvailableDismiss')}
        </button>
      </div>
    </section>
  {/if}

  <InstallerInstallPreviewModal
    open={showInstallModal}
    bind:installAcknowledged
    onConfirm={confirmInstall}
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
    title={t('steamQuitTitle')}
    body={t('steamQuitBody')}
    confirmText={t('actionQuitSteam')}
    cancelText={t('actionClose')}
    showCancel={true}
    onConfirm={confirmSteamQuitAndContinue}
    onCancel={closeSteamQuitModal}
  />

  <InstallerHeader
    kicker={t('kicker')}
    subtitle={t('subtitle')}
    {localeBadge}
    {localeButtonLabel}
    bilibiliUrl={BILIBILI_URL}
    onOpenBilibili={openBilibili}
  />

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
    t={t}
    onPickGamePath={pickGamePath}
    onCheckPath={checkPath}
    onRequestInstall={requestInstall}
    onUninstall={uninstallBpp}
    onLaunchGame={launchGame}
    onResetBazaar={resetBazaar}
    onCustomGamePathInput={clearBazaarInvalid}
  />

  <InstallerSupportBar />

  <footer class="footer" aria-hidden="true">
    <div class="rule"><span></span><span class="diamond small">+</span><span></span></div>
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

  .update-banner {
    display: grid;
    gap: 0.75rem;
    padding: 0.95rem 1rem;
    border: 1px solid rgba(205, 150, 60, 0.26);
    background:
      linear-gradient(135deg, rgba(56, 37, 16, 0.9), rgba(27, 20, 11, 0.92)),
      radial-gradient(circle at top left, rgba(214, 169, 85, 0.18), transparent 56%);
    box-shadow: inset 0 0 0 1px rgba(255, 227, 167, 0.04);
  }

  .update-banner-copy {
    display: grid;
    gap: 0.3rem;
  }

  .update-banner-title,
  .update-banner-body {
    margin: 0;
  }

  .update-banner-title {
    font-family: 'Cinzel', serif;
    font-size: 0.84rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(245, 220, 171, 0.96);
  }

  .update-banner-body {
    color: rgba(227, 208, 181, 0.8);
    line-height: 1.55;
    font-size: 0.9rem;
  }

  .update-banner-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    align-items: center;
  }

  .update-banner-btn,
  .update-banner-dismiss {
    border: none;
    cursor: pointer;
    font: inherit;
  }

  .update-banner-btn {
    padding: 0.58rem 0.9rem;
    background: linear-gradient(135deg, rgba(211, 166, 77, 0.95), rgba(158, 109, 33, 0.96));
    color: #1d1308;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .update-banner-dismiss {
    padding: 0.4rem 0;
    background: transparent;
    color: rgba(227, 208, 181, 0.72);
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
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
    background: linear-gradient(90deg, transparent, rgba(200, 148, 55, 0.3) 40%, rgba(200, 148, 55, 0.3) 60%, transparent);
  }

  .diamond { font-size: 0.55rem; color: rgba(205, 150, 60, 0.55); }
  .diamond.small { font-size: 0.42rem; }

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
    .shell { padding: 1rem 0.85rem 1.5rem; }
    .update-banner-actions { flex-direction: column; align-items: stretch; }
    .update-banner-btn,
    .update-banner-dismiss { width: 100%; }
  }
</style>
