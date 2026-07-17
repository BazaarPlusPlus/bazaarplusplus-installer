import { useState } from 'react';
import { PageShell } from '../components/ui/PageShell';
import { useAppBootstrap } from '../features/about/AppBootstrapProvider';
import { useUpdater } from '../features/about/UpdaterProvider';
import { InstallActionsPanel } from '../features/install/InstallActionsPanel';
import { InstallConfirmModal } from '../features/install/InstallConfirmModal';
import { InstallStatusPanel } from '../features/install/InstallStatusPanel';
import { ResetBepinexConfirmModal } from '../features/install/ResetBepinexConfirmModal';
import { ResetDataConfirmModal } from '../features/install/ResetDataConfirmModal';
import { useInstallPage } from '../features/install/useInstallPage';
import type { PrimaryInstallMode } from '../features/install/PrimaryInstallActionButton';
import { useI18n } from '../i18n/LocaleProvider';

export default function Install() {
  const { t } = useI18n();
  const { bootstrap } = useAppBootstrap();
  const updater = useUpdater();
  const page = useInstallPage();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [showResetBepinexModal, setShowResetBepinexModal] = useState(false);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const [resetDataAcknowledged, setResetDataAcknowledged] = useState(false);
  const [resetBepinexAcknowledged, setResetBepinexAcknowledged] =
    useState(false);
  const [compatOptIn, setCompatOptIn] = useState(false);
  const primaryMode: PrimaryInstallMode = !page.state.mod_state.installed
    ? 'install'
    : page.state.mod_state.version_matches
      ? 'launch'
      : 'reinstall';

  const openInstallModal = () => {
    setShowInstallModal(true);
    setInstallAcknowledged(false);
    // Seed the checkbox from the current desired mode: forced (checked + locked) on
    // macOS 27+, the persisted choice on <= 26, off elsewhere.
    setCompatOptIn(page.state.compat.desired);
  };

  const confirmInstall = async () => {
    const installed = await page.install(compatOptIn);
    if (installed) {
      setShowInstallModal(false);
      setInstallAcknowledged(false);
    }
  };

  const openResetDataModal = () => {
    setShowResetDataModal(true);
    setResetDataAcknowledged(false);
  };

  const confirmResetData = async () => {
    await page.resetData();
    setShowResetDataModal(false);
    setResetDataAcknowledged(false);
  };

  const openResetBepinexModal = () => {
    setShowResetBepinexModal(true);
    setResetBepinexAcknowledged(false);
  };

  const confirmResetBepinex = async () => {
    await page.resetBepinex();
    setShowResetBepinexModal(false);
    setResetBepinexAcknowledged(false);
  };

  const checkForUpdates = () => {
    updater.checkNow();
  };

  return (
    <PageShell
      eyebrow="Install"
      title={t('installTitle')}
      className="bpp-install-page"
    >
      <InstallStatusPanel
        page={page}
        primaryMode={primaryMode}
        appVersion={bootstrap.app_version}
        onOpenInstallModal={openInstallModal}
      />
      <InstallActionsPanel
        page={page}
        updateChecking={updater.phase === 'checking'}
        onCheckUpdate={checkForUpdates}
        onOpenResetDataModal={openResetDataModal}
        onOpenResetBepinexModal={openResetBepinexModal}
      />

      {showInstallModal && (
        <InstallConfirmModal
          busy={page.action === 'install'}
          installAcknowledged={installAcknowledged}
          onAcknowledgedChange={setInstallAcknowledged}
          compat={page.state.compat}
          compatOptIn={compatOptIn}
          onCompatOptInChange={setCompatOptIn}
          onClose={() => setShowInstallModal(false)}
          onConfirm={confirmInstall}
        />
      )}

      {showResetDataModal && (
        <ResetDataConfirmModal
          busy={page.action === 'resetData'}
          acknowledged={resetDataAcknowledged}
          onAcknowledgedChange={setResetDataAcknowledged}
          onClose={() => setShowResetDataModal(false)}
          onConfirm={confirmResetData}
        />
      )}

      {showResetBepinexModal && (
        <ResetBepinexConfirmModal
          busy={page.action === 'resetBepinex'}
          acknowledged={resetBepinexAcknowledged}
          onAcknowledgedChange={setResetBepinexAcknowledged}
          onClose={() => setShowResetBepinexModal(false)}
          onConfirm={confirmResetBepinex}
        />
      )}
    </PageShell>
  );
}
