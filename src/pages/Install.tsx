import { useState } from 'react';
import { PageShell } from '../components/ui/PageShell';
import { LoadingPanel } from '../components/ui/LoadingPanel';
import { InstallActionsPanel } from '../features/install/InstallActionsPanel';
import { InstallConfirmModal } from '../features/install/InstallConfirmModal';
import { InstallStatusPanel } from '../features/install/InstallStatusPanel';
import { ResetBepinexConfirmModal } from '../features/install/ResetBepinexConfirmModal';
import { ResetDataConfirmModal } from '../features/install/ResetDataConfirmModal';
import { useInstallPage } from '../features/install/useInstallPage';
import { useI18n } from '../i18n/LocaleProvider';
import { InstallProblemBanner } from '../features/install/InstallProblemBanner';

export default function Install() {
  const { t } = useI18n();
  const page = useInstallPage();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showResetDataModal, setShowResetDataModal] = useState(false);
  const [showResetBepinexModal, setShowResetBepinexModal] = useState(false);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const [resetDataAcknowledged, setResetDataAcknowledged] = useState(false);
  const [resetBepinexAcknowledged, setResetBepinexAcknowledged] =
    useState(false);
  const [compatOptIn, setCompatOptIn] = useState(false);

  const openInstallModal = () => {
    setShowInstallModal(true);
    setInstallAcknowledged(false);
    // Seed the checkbox from the current desired mode: forced (checked + locked) on
    // macOS 27+, the persisted choice on <= 26, off elsewhere.
    setCompatOptIn(page.installState?.compat.desired ?? false);
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

  return (
    <PageShell eyebrow="Install" title={t('installTitle')}>
      {page.pageState.phase === 'initial-loading' ? (
        <LoadingPanel label={t('installDetecting')} className="h-64" />
      ) : page.pageState.phase === 'blocking-failure' ? (
        <InstallProblemBanner
          problem={page.pageState.problem}
          onRetry={() => void page.refresh()}
        />
      ) : page.installState && page.status && page.primaryAction ? (
        <>
          {page.pageState.refresh.phase === 'failed' && (
            <InstallProblemBanner
              problem={page.pageState.refresh.problem}
              onRetry={() => void page.refresh()}
            />
          )}
          {page.pageState.refresh.phase === 'refreshing' && (
            <p
              role="status"
              aria-live="polite"
              className="m-0 text-xs text-[rgba(200,170,120,0.8)]"
            >
              {t('installRefreshing')}
            </p>
          )}
          <div className="grid grid-cols-12 gap-8 w-full">
            <InstallStatusPanel
              page={page}
              state={page.installState}
              status={page.status}
            />
            <InstallActionsPanel
              page={page}
              state={page.installState}
              primaryAction={page.primaryAction}
              onOpenInstallModal={openInstallModal}
              onOpenResetDataModal={openResetDataModal}
              onOpenResetBepinexModal={openResetBepinexModal}
            />
          </div>
        </>
      ) : null}

      {showInstallModal && page.installState && (
        <InstallConfirmModal
          busy={page.action === 'install'}
          installAcknowledged={installAcknowledged}
          onAcknowledgedChange={setInstallAcknowledged}
          compat={page.installState.compat}
          compatOptIn={compatOptIn}
          onCompatOptInChange={setCompatOptIn}
          onClose={() => setShowInstallModal(false)}
          onConfirm={confirmInstall}
        />
      )}

      {showResetDataModal && page.installState && (
        <ResetDataConfirmModal
          busy={page.action === 'resetData'}
          acknowledged={resetDataAcknowledged}
          onAcknowledgedChange={setResetDataAcknowledged}
          onClose={() => setShowResetDataModal(false)}
          onConfirm={confirmResetData}
        />
      )}

      {showResetBepinexModal && page.installState && (
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
