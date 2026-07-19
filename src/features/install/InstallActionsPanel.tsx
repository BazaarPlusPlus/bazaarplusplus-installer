import { Box, CloudDownload, Layers3, Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ActionTile } from '../../components/ui/ActionTile';
import { StatusBanner } from '../../components/ui/StatusBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import { ResetDataFailureDetails } from './ResetDataFailureDetails';
import { InstallProblemBanner } from './InstallProblemBanner';
import type { useInstallPage } from './useInstallPage';

type InstallPage = ReturnType<typeof useInstallPage>;

export function InstallActionsPanel({
  page,
  updateChecking,
  onCheckUpdate,
  onOpenResetDataModal,
  onOpenResetBepinexModal
}: {
  page: InstallPage;
  updateChecking: boolean;
  onCheckUpdate: () => void;
  onOpenResetDataModal: () => void;
  onOpenResetBepinexModal: () => void;
}) {
  const { t } = useI18n();
  const state = page.installState;

  if (!state) return null;

  return (
    <section>
      <h3 className="bpp-install-section-title">
        {t('maintenanceToolsHeading')}
      </h3>
      <div className="bpp-install-maintenance-grid">
        <MaintenanceAction
          disabled={page.busy || !state.actions.can_reset_data}
          busy={page.action === 'resetData'}
          icon={<Layers3 size={22} />}
          title={
            state.game.path_valid && !state.has_resettable_data
              ? t('actionNoResettableData')
              : t('actionResetData')
          }
          detail={t('maintenanceResetDataDescription')}
          onClick={onOpenResetDataModal}
        />
        <MaintenanceAction
          disabled={page.busy || !state.actions.can_reset_bepinex}
          busy={page.action === 'resetBepinex'}
          icon={<Box size={22} />}
          title={t('actionResetBepinex')}
          detail={t('maintenanceResetBepinexDescription')}
          onClick={onOpenResetBepinexModal}
        />
        <MaintenanceAction
          disabled={updateChecking}
          busy={updateChecking}
          icon={<CloudDownload size={22} />}
          title={t('headerCheckUpdate')}
          detail={t('checkUpdateDescription')}
          onClick={onCheckUpdate}
        />
        <MaintenanceAction
          danger
          disabled={page.busy || !state.actions.can_uninstall}
          busy={page.action === 'uninstall'}
          icon={<Trash2 size={22} />}
          title={t('actionUninstall')}
          detail={t('maintenanceUninstallDescription')}
          onClick={page.uninstall}
        />
      </div>

      {page.actionProblem && (
        <div className="mt-4">
          <InstallProblemBanner problem={page.actionProblem} />
        </div>
      )}
      {page.message && (
        <StatusBanner tone="success" className="mt-4" message={page.message} />
      )}
      {page.resetDataFailurePaths.length > 0 && (
        <ResetDataFailureDetails paths={page.resetDataFailurePaths} />
      )}
    </section>
  );
}

function MaintenanceAction({
  icon,
  title,
  detail,
  onClick,
  disabled,
  busy,
  danger = false
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  danger?: boolean;
}) {
  return (
    <ActionTile
      disabled={disabled}
      busy={busy}
      onClick={onClick}
      danger={danger}
      icon={busy ? <Loader2 size={22} className="animate-spin" /> : icon}
      title={title}
      description={detail}
    />
  );
}
