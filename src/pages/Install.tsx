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
import { useConfirmedOperation } from '../features/shared/confirmedOperation';
import {
  installProblemFromError,
  type InstallProblem
} from '../features/install/installProblems';
import { ModalSource } from '../components/ui/ModalCoordinator';

type InstallResetTarget = {
  kind: 'reset-data' | 'reset-bepinex';
  gamePath: string;
};

export default function Install() {
  const { t } = useI18n();
  const page = useInstallPage();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const resetOperation = useConfirmedOperation<
    InstallResetTarget,
    InstallProblem
  >();
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
    if (installed.ok) {
      setShowInstallModal(false);
      setInstallAcknowledged(false);
    }
  };

  const openResetDataModal = () => {
    const gamePath = page.installState?.selected_game_path;
    if (!gamePath) return;
    resetOperation.controller.request({ kind: 'reset-data', gamePath });
    setResetDataAcknowledged(false);
  };

  const openResetBepinexModal = () => {
    const gamePath = page.installState?.selected_game_path;
    if (!gamePath) return;
    resetOperation.controller.request({ kind: 'reset-bepinex', gamePath });
    setResetBepinexAcknowledged(false);
  };

  const confirmReset = async () => {
    const completed = await resetOperation.controller.run(
      (target) =>
        target.kind === 'reset-data' ? page.resetData() : page.resetBepinex(),
      installProblemFromError
    );
    if (completed) {
      setResetDataAcknowledged(false);
      setResetBepinexAcknowledged(false);
    }
  };

  const closeReset = () => {
    if (resetOperation.controller.dismiss()) {
      setResetDataAcknowledged(false);
      setResetBepinexAcknowledged(false);
    }
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

      <ModalSource
        id="route:install-confirmation"
        open={showInstallModal && page.installState !== null}
        priority={page.action === 'install' ? 'critical' : 'confirmation'}
        dismissalPolicy={page.action === 'install' ? 'blocked' : 'dismissible'}
      >
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
      </ModalSource>

      <ModalSource
        id="route:install-reset"
        open={resetOperation.state !== null && page.installState !== null}
        priority={
          resetOperation.state?.phase === 'running'
            ? 'critical'
            : 'confirmation'
        }
        dismissalPolicy={
          resetOperation.state?.phase === 'running' ? 'blocked' : 'dismissible'
        }
      >
        {resetOperation.state?.target.kind === 'reset-data' &&
          page.installState && (
            <ResetDataConfirmModal
              busy={resetOperation.state.phase === 'running'}
              acknowledged={resetDataAcknowledged}
              targetPath={resetOperation.state.target.gamePath}
              problem={
                resetOperation.state.phase === 'failed'
                  ? resetOperation.state.problem
                  : null
              }
              failurePaths={page.resetDataFailurePaths}
              onAcknowledgedChange={setResetDataAcknowledged}
              onClose={closeReset}
              onConfirm={confirmReset}
            />
          )}

        {resetOperation.state?.target.kind === 'reset-bepinex' &&
          page.installState && (
            <ResetBepinexConfirmModal
              busy={resetOperation.state.phase === 'running'}
              acknowledged={resetBepinexAcknowledged}
              targetPath={resetOperation.state.target.gamePath}
              problem={
                resetOperation.state.phase === 'failed'
                  ? resetOperation.state.problem
                  : null
              }
              onAcknowledgedChange={setResetBepinexAcknowledged}
              onClose={closeReset}
              onConfirm={confirmReset}
            />
          )}
      </ModalSource>
    </PageShell>
  );
}
