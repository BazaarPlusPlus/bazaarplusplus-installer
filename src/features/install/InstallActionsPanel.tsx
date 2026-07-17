import {
  AlertCircle,
  AlertTriangle,
  DownloadCloud,
  FolderX,
  Loader2,
  Play,
  RefreshCw,
  Trash2
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/LocaleProvider';
import { ResetDataFailureDetails } from './ResetDataFailureDetails';
import type { useInstallPage } from './useInstallPage';
import primaryActionPng from '../../../static/buttons/reinstall-primary.png';

type InstallPage = ReturnType<typeof useInstallPage>;

export function InstallActionsPanel({
  page,
  primaryMode,
  onOpenInstallModal,
  onOpenResetDataModal,
  onOpenResetBepinexModal
}: {
  page: InstallPage;
  primaryMode: 'install' | 'reinstall' | 'launch';
  onOpenInstallModal: () => void;
  onOpenResetDataModal: () => void;
  onOpenResetBepinexModal: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 flex-col">
      <section>
        <h3 className="bpp-section-label">{t('installActionsHeading')}</h3>
        <PrimaryActionButton
          page={page}
          primaryMode={primaryMode}
          onOpenInstallModal={onOpenInstallModal}
        />

        <div className="mt-7 flex items-center justify-between border-b border-[rgba(210,132,29,.12)] px-3 pb-3">
          <span className="text-sm font-semibold text-[#bbb6ae]">
            BazaarPlusPlus
          </span>
          <span
            className={
              page.state.mod_state.installed
                ? 'text-[#58b66f]'
                : 'text-[#7e7c76]'
            }
          >
            <span className="bpp-status-dot mr-2 !size-[8px]" />
            <span className="text-xs">
              {page.state.mod_state.installed
                ? t('installed')
                : t('notInstalled')}
            </span>
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3">
          <ActionRow
            disabled={page.busy || !page.state.actions.can_reset_data}
            busy={page.action === 'resetData'}
            icon={<AlertTriangle size={20} />}
            title={
              page.state.game.path_valid && !page.state.has_resettable_data
                ? t('actionNoResettableData')
                : t('actionResetData')
            }
            detail={t('resetDataDescription')}
            onClick={onOpenResetDataModal}
          />
          <ActionRow
            disabled={page.busy || !page.state.actions.can_reset_bepinex}
            busy={page.action === 'resetBepinex'}
            icon={<FolderX size={20} />}
            title={t('actionResetBepinex')}
            detail={t('resetBepinexDescription')}
            onClick={onOpenResetBepinexModal}
          />
          <ActionRow
            danger
            disabled={page.busy || !page.state.actions.can_uninstall}
            busy={page.action === 'uninstall'}
            icon={<Trash2 size={20} />}
            title={t('actionUninstall')}
            detail={t('uninstallDescription')}
            onClick={page.uninstall}
          />
        </div>

        {page.state.warnings.length > 0 && (
          <div
            className="mt-4 flex flex-col gap-2"
            role="status"
            aria-live="polite"
          >
            {page.state.warnings.map((warning) => (
              <p
                key={warning.code}
                className="m-0 flex items-start gap-2 text-[11px] text-[#c68b43]"
              >
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{warning.message}</span>
              </p>
            ))}
          </div>
        )}

        {(page.error || page.message) && (
          <p
            role={page.error ? 'alert' : 'status'}
            aria-live={page.error ? 'assertive' : 'polite'}
            className={`selectable mt-4 text-xs ${page.error ? 'text-[#d66a5d]' : 'text-[#58b66f]'}`}
          >
            {page.error ?? page.message}
          </p>
        )}
        {page.resetDataFailurePaths.length > 0 && (
          <ResetDataFailureDetails paths={page.resetDataFailurePaths} />
        )}
      </section>
    </div>
  );
}

function ActionRow({
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
      className={`group flex min-h-[68px] items-center gap-4 rounded-[4px] border px-5 text-left transition-all disabled:opacity-35 ${danger
        ? 'border-[rgba(194,72,55,.2)] bg-[rgba(145,45,34,.035)] hover:border-[rgba(211,79,60,.42)]'
        : 'border-[rgba(204,132,36,.16)] bg-[rgba(255,255,255,.01)] hover:border-[rgba(227,137,22,.4)] hover:bg-[rgba(227,137,22,.035)]'
        }`}
    >
      <span className={danger ? 'text-[#d26052]' : 'text-[#d57d16]'}>
        {busy ? <Loader2 size={20} className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-[#bdb8b0]">
          {title}
        </span>
        <span className="mt-1 block truncate text-[10px] text-[#62635f]">
          {detail}
        </span>
      </span>
      <span className="text-lg text-[#4f504e] group-hover:text-[#b67122]">
        ›
      </span>
    </button>
  );
}

function PrimaryActionButton({
  page,
  primaryMode,
  onOpenInstallModal
}: {
  page: InstallPage;
  primaryMode: 'install' | 'reinstall' | 'launch';
  onOpenInstallModal: () => void;
}) {
  const { t } = useI18n();
  const isLaunch = primaryMode === 'launch';
  const disabled =
    page.busy ||
    (isLaunch
      ? !page.state.actions.can_launch
      : primaryMode === 'reinstall'
        ? !page.state.actions.can_reinstall
        : !page.state.actions.can_install);
  const label = isLaunch
    ? t('launchGame')
    : primaryMode === 'reinstall'
      ? t('actionReinstall')
      : t('actionInstall');
  const description = isLaunch
    ? t('launchGameDescription')
    : primaryMode === 'reinstall'
      ? t('actionReinstallDescription')
      : t('actionInstallDescription');
  const Icon = isLaunch
    ? Play
    : primaryMode === 'reinstall'
      ? RefreshCw
      : DownloadCloud;
  const busy = page.action === (isLaunch ? 'launch' : 'install');

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={isLaunch ? page.launch : onOpenInstallModal}
      className="bpp-button bpp-button-primary bpp-button-primary-image relative min-h-[108px] w-full overflow-hidden text-left"
    >
      <img
        src={primaryActionPng}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="bpp-primary-action-image"
      />
      <span className="relative z-[2] flex items-center gap-4 bpp-button-primary-content">
        {busy ? (
          <Loader2
            size={30}
            className="bpp-primary-action-icon animate-spin text-[#f29a24]"
          />
        ) : (
          <Icon
            size={30}
            className="bpp-primary-action-icon text-[#f29a24]"
          />
        )}
        <span>
          <span className="block text-xl font-semibold text-[#e7dfd4]">
            {label}
          </span>
          <span className="block text-[10px] text-[#D9D2C7]">
            {description}
          </span>
        </span>
      </span>
    </button>
  );
}
