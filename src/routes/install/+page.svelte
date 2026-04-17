<script lang="ts">
  import { goto } from '$app/navigation';
  import { getVersion } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount } from 'svelte';
  import AppModal from '$lib/components/AppModal.svelte';
  import { BILIBILI_URL } from '$lib/config/endpoints';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import InstallerHeader from '$lib/components/installer/InstallerHeader.svelte';
  import InstallerFooter from '$lib/components/installer/InstallerFooter.svelte';
  import InstallerIdentityCard from '$lib/components/installer/InstallerIdentityCard.svelte';
  import InstallerPageContent from '$lib/components/installer/InstallerPageContent.svelte';
  import InstallerPageModals from '$lib/components/installer/InstallerPageModals.svelte';
  import InstallerSupportBar from '$lib/components/installer/InstallerSupportBar.svelte';
  import { createIdentityController } from '$lib/installer/controllers/identity-controller';
  import { createInstallController } from '$lib/installer/controllers/install-controller';
  import { createUpdaterController } from '$lib/installer/controllers/updater-controller';
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
  import type { PageState } from '$lib/installer/state';
  import {
    getInstallRuntimeRisks,
    shouldShowInstallRiskModal
  } from '$lib/installer/install-guards';
  import { createIdentityApi } from '$lib/identity/api';
  import type { IdentityState } from '$lib/identity/state';
  import {
    createInstallDebugEnvironment,
    formatByteLabel,
    formatIdentityErrorMessage,
    createInstallPageModel,
    type InstallPageModel,
    type InstallPageModelInput
  } from '$lib/installer/page-model';
  const identityApi = createIdentityApi(
    hasTauriRuntime()
      ? {
          postJsonImpl: ({ url, body, authorization }) =>
            postIdentityJson(url, body, authorization)
        }
      : {}
  );

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

  const installController = createInstallController({
    hasTauriRuntime,
    isDebugInstallPreview,
    createInstallDebugEnvironment,
    detectEnvironmentApi,
    detectDotnetRuntimeApi,
    verifyGamePathApi,
    detectSteamRunningApi,
    closeSteamApi,
    installBepinex,
    patchLaunchOptions,
    uninstallBppApi,
    repairBppApi,
    getLegacyRecordDirectoryInfoApi,
    openUrl,
    openDialog: open,
    getInstallRuntimeRisks,
    shouldShowInstallRiskModal,
    persistCustomGamePath,
    localized,
    t,
    formatByteLabel
  });
  installController.initializeCustomGamePath(loadPersistedCustomGamePath());

  const updaterController = createUpdaterController({
    hasTauriRuntime,
    markPendingWhatsNewLaunch,
    loadPendingWhatsNewLaunch,
    clearPendingWhatsNewLaunch,
    getVersion,
    goto
  });

  const identityController = createIdentityController({
    hasTauriRuntime,
    identityApi,
    localized,
    formatIdentityErrorMessage
  });

  const env = installController.env;
  const dotnetState = installController.dotnetState;
  const bazaarFound = installController.bazaarFound;
  const bazaarChecking = installController.bazaarChecking;
  const bazaarInvalid = installController.bazaarInvalid;
  const customGamePath = installController.customGamePath;
  const actionBusy = installController.actionBusy;
  const showInstallModal = installController.showInstallModal;
  const showRepairModal = installController.showRepairModal;
  const repairAcknowledged = installController.repairAcknowledged;
  const repairModalBody = installController.repairModalBody;
  const showLaunchOptionsWarningModal =
    installController.showLaunchOptionsWarningModal;
  const showSteamQuitModal = installController.showSteamQuitModal;
  const installAcknowledged = installController.installAcknowledged;
  const installConfirmationBusy = installController.installConfirmationBusy;
  const pendingSteamAction = installController.pendingSteamAction;
  const steamActionBusy = installController.steamActionBusy;
  const showStreamMode = installController.showStreamMode;

  const updaterSnapshot = updaterController.updaterSnapshot;
  const pendingUpdate = updaterController.pendingUpdate;
  const showUpdaterModal = updaterController.showUpdaterModal;
  const updaterModalTitle = updaterController.updaterModalTitle;
  const updaterModalBody = updaterController.updaterModalBody;
  const showUpdaterReviewModal = updaterController.showUpdaterReviewModal;
  const updaterReviewBusy = updaterController.updaterReviewBusy;

  const playerObservation = identityController.playerObservation;
  const installationRecord = identityController.installationRecord;
  const hasInstallationPrivateKey =
    identityController.hasInstallationPrivateKey;
  const identityLoadState = identityController.identityLoadState;
  const identityActionBusy = identityController.identityActionBusy;
  const identityPassword = identityController.identityPassword;
  const identityConfirmed = identityController.identityConfirmed;
  const identityError = identityController.identityError;
  const identitySuccess = identityController.identitySuccess;

  function buildPageModelInput(): InstallPageModelInput {
    return {
      env: $env,
      bazaarFound: $bazaarFound,
      customGamePath: $customGamePath,
      actionBusy: $actionBusy,
      showStreamMode: $showStreamMode,
      locale: $locale,
      isDebugInstallPreview,
      updaterSnapshot: $updaterSnapshot,
      hasPendingUpdate: Boolean($pendingUpdate),
      pendingSteamAction: $pendingSteamAction,
      playerObservation: $playerObservation,
      installationRecord: $installationRecord,
      hasInstallationPrivateKey: $hasInstallationPrivateKey,
      identityLoadState: $identityLoadState,
      identityActionBusy: $identityActionBusy,
      identityPassword: $identityPassword,
      identityConfirmed: $identityConfirmed,
      localized,
      t
    };
  }

  let pageModel: InstallPageModel = createInstallPageModel(buildPageModelInput());
  let pageState: PageState = pageModel.pageState;
  let identityState: IdentityState = pageModel.identityState;

  $: pageModel = createInstallPageModel(buildPageModelInput());
  $: pageState = pageModel.pageState;
  $: identityState = pageModel.identityState;
  $: installController.persistCurrentGamePath();
  $: identityController.syncGameRoot(pageState.effectiveGamePath);

  onMount(() => {
    locale.init();
    void (async () => {
      if (await updaterController.maybeOpenPendingWhatsNewLaunch()) {
        return;
      }

      await installController.detectEnvironment(pageModel.selectedPath);
      await updaterController.checkForUpdatesOnStartup();
    })();
  });
</script>

<svelte:head>
  <title>{t('pageTitle')}</title>
</svelte:head>

<main class="shell">
  <InstallerPageModals
    bind:installAcknowledged={$installAcknowledged}
    bind:repairAcknowledged={$repairAcknowledged}
    showInstallModal={$showInstallModal}
    bilibiliUrl={BILIBILI_URL}
    installConfirmationBusy={$installConfirmationBusy}
    showRepairModal={$showRepairModal}
    repairModalBody={$repairModalBody}
    repairConfirming={$actionBusy === 'repair'}
    showLaunchOptionsWarningModal={$showLaunchOptionsWarningModal}
    showSteamQuitModal={$showSteamQuitModal}
    steamModalTitle={pageModel.steamModalTitle}
    steamModalBody={pageModel.steamModalBody}
    steamModalCancelText={pageModel.steamModalCancelText}
    steamActionBusy={$steamActionBusy}
    showUpdaterReviewModal={$showUpdaterReviewModal}
    updaterReviewBody={t('updaterReviewBody', {
      version:
        $updaterSnapshot.availableVersion ?? $pendingUpdate?.version ?? 'unknown'
    })}
    updaterReviewBusy={$updaterReviewBusy}
    showUpdaterModal={$showUpdaterModal}
    updaterModalTitle={$updaterModalTitle}
    updaterModalBody={$updaterModalBody}
    t={t}
    onOpenBilibili={installController.openBilibili}
    onConfirmInstall={() =>
      installController.confirmInstall({
        canInstall: pageModel.canInstall,
        effectiveGamePath: pageState.effectiveGamePath,
        selectedPath: pageModel.selectedPath
      })}
    onConfirmRepair={() =>
      installController.repairBpp({
        effectiveGamePath: pageState.effectiveGamePath,
        selectedPath: pageModel.selectedPath
      })}
    onCancelRepair={installController.closeRepairModal}
    onCloseLaunchOptionsWarning={installController.closeLaunchOptionsWarningModal}
    onConfirmSteamQuit={() =>
      installController.confirmSteamQuitAndContinue({
        canInstall: pageModel.canInstall,
        effectiveGamePath: pageState.effectiveGamePath,
        selectedPath: pageModel.selectedPath
      })}
    onCancelSteamQuit={() =>
      installController.handleSteamQuitModalCancel({
        canInstall: pageModel.canInstall,
        effectiveGamePath: pageState.effectiveGamePath,
        selectedPath: pageModel.selectedPath
      })}
    onConfirmUpdaterReview={() => updaterController.confirmUpdaterReview(t)}
    onCancelUpdaterReview={updaterController.closeUpdaterReviewModal}
    onCloseUpdaterModal={updaterController.closeUpdaterModal}
  />

  <InstallerHeader
    kicker={t('kicker')}
    subtitle={pageModel.modeTitle}
    localeBadge={pageModel.localeBadge}
    localeButtonLabel={pageModel.localeButtonLabel}
    updaterButtonLabel={pageModel.updaterButtonLabel}
    updaterButtonTitle={pageModel.updaterButtonTitle}
    updaterButtonDisabled={pageModel.updaterButtonDisabled}
    updaterButtonHighlighted={pageModel.updaterButtonHighlighted}
    onOpenUpdater={() => updaterController.handleUpdaterAction(t)}
    streamModeActive={$showStreamMode}
    streamModeLabel={pageModel.modeToggleLabel}
    onToggleStreamMode={installController.toggleStreamMode}
  />

  <InstallerIdentityCard
    visible={!$showStreamMode && hasTauriRuntime()}
    {identityState}
    {pageModel}
    identityLoadState={$identityLoadState}
    bind:identityPassword={$identityPassword}
    bind:identityConfirmed={$identityConfirmed}
    identityActionBusy={$identityActionBusy}
    identityError={$identityError}
    identitySuccess={$identitySuccess}
    {localized}
    onContinue={() =>
      identityController.continueIdentity({
        identityState,
        gameRoot: pageState.effectiveGamePath
      })}
  />

  <InstallerPageContent
    showStreamMode={$showStreamMode}
    locale={$locale}
    effectiveGamePath={pageState.effectiveGamePath}
    env={$env}
    dotnetState={$dotnetState}
    modInstalled={pageModel.modInstalled}
    versionMismatch={pageModel.versionMismatch}
    bundledBppVersion={pageModel.bundledBppVersion}
    installedBppVersion={pageModel.installedBppVersion}
    bazaarFound={$bazaarFound}
    bazaarChecking={$bazaarChecking}
    bazaarInvalid={$bazaarInvalid}
    bppDataResetRequired={pageModel.bppDataResetRequired}
    bppDataIssue={pageModel.bppDataIssue}
    bppDataVersion={pageModel.bppDataVersion}
    bind:customGamePath={$customGamePath}
    hasPath={pageModel.hasPath}
    isBusy={pageModel.isBusy}
    actionBusy={$actionBusy}
    canInstall={pageModel.canInstall}
    canLaunchGame={pageModel.canLaunchGame}
    dotnetDownloadUrl={pageModel.dotnetDownloadUrl}
    t={t}
    onPickGamePath={installController.pickGamePath}
    onCheckPath={() => installController.checkPath(pageState.effectiveGamePath)}
    onRequestInstall={() => installController.requestInstall(pageModel.canInstall)}
    onRepair={() =>
      installController.requestRepair({
        effectiveGamePath: pageState.effectiveGamePath,
        bppDataResetRequired: pageModel.bppDataResetRequired,
        bppDataIssue: pageModel.bppDataIssue,
        bppDataVersion: pageModel.bppDataVersion
      })}
    onUninstall={() =>
      installController.uninstallBpp({
        effectiveGamePath: pageState.effectiveGamePath,
        selectedPath: pageModel.selectedPath
      })}
    onLaunchGame={() => installController.launchGame(pageModel.canLaunchGame)}
    onResetBazaar={installController.resetBazaar}
    onCustomGamePathInput={installController.clearBazaarInvalid}
  />

  <InstallerSupportBar />
  <InstallerFooter text={t('footer')} />
</main>

<style>
  .shell {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    padding: 1rem 1rem 1.45rem;
    display: grid;
    gap: 0.7rem;
    animation: fade-up 0.5s ease both;
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
  @media (max-width: 520px) {
    .shell {
      padding: 0.9rem 0.82rem 1.35rem;
    }
  }
</style>
