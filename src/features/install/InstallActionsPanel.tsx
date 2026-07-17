import {
  AlertTriangle,
  Box,
  Layers3,
  Loader2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/LocaleProvider';
import { ResetDataFailureDetails } from './ResetDataFailureDetails';
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

  return (
    <section>
      <h3 className="bpp-install-section-title">
        {t('maintenanceToolsHeading')}
      </h3>
      <div className="bpp-install-maintenance-grid">
        <MaintenanceAction
          disabled={page.busy || !page.state.actions.can_reset_data}
          busy={page.action === 'resetData'}
          icon={<Layers3 size={25} />}
          title={
            page.state.game.path_valid && !page.state.has_resettable_data
              ? t('actionNoResettableData')
              : t('actionResetData')
          }
          detail={t('maintenanceResetDataDescription')}
          onClick={onOpenResetDataModal}
        />
        <MaintenanceAction
          disabled={page.busy || !page.state.actions.can_reset_bepinex}
          busy={page.action === 'resetBepinex'}
          icon={<Box size={25} />}
          title={t('actionResetBepinex')}
          detail={t('maintenanceResetBepinexDescription')}
          onClick={onOpenResetBepinexModal}
        />
        <MaintenanceAction
          disabled={updateChecking}
          busy={updateChecking}
          icon={<RefreshCw size={25} />}
          title={t('headerCheckUpdate')}
          detail={t('checkUpdateDescription')}
          onClick={onCheckUpdate}
        />
        <MaintenanceAction
          danger
          disabled={page.busy || !page.state.actions.can_uninstall}
          busy={page.action === 'uninstall'}
          icon={<Trash2 size={25} />}
          title={t('actionUninstall')}
          detail={t('maintenanceUninstallDescription')}
          onClick={page.uninstall}
        />
      </div>

      {(page.error || page.message) && (
        <p
          role={page.error ? 'alert' : 'status'}
          aria-live={page.error ? 'assertive' : 'polite'}
          className={`selectable mt-4 flex items-start gap-2 text-xs ${page.error ? 'text-[#d66a5d]' : 'text-[#58b66f]'}`}
        >
          {page.error && (
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          )}
          <span>{page.error ?? page.message}</span>
        </p>
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
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`bpp-install-maintenance-action ${danger ? 'is-danger' : ''}`}
    >
      <span className="bpp-install-maintenance-icon">
        {busy ? <Loader2 size={25} className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[#d6d1ca]">
          {title}
        </span>
        <span className="mt-1 block truncate text-[10px] text-[#77757b]">
          {detail}
        </span>
      </span>
    </button>
  );
}
