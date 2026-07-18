import { DownloadCloud, Loader2, Play, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/LocaleProvider';
import type { useInstallPage } from './useInstallPage';

type InstallPage = ReturnType<typeof useInstallPage>;

export type PrimaryInstallMode = 'install' | 'reinstall' | 'launch';

export function PrimaryInstallActionButton({
  page,
  mode,
  onOpenInstallModal
}: {
  page: InstallPage;
  mode: PrimaryInstallMode;
  onOpenInstallModal: () => void;
}) {
  const { t } = useI18n();
  const isLaunch = mode === 'launch';
  const disabled =
    page.busy ||
    (isLaunch
      ? !page.state.actions.can_launch
      : mode === 'reinstall'
        ? !page.state.actions.can_reinstall
        : !page.state.actions.can_install);
  const label = isLaunch
    ? t('launchGame')
    : mode === 'reinstall'
      ? t('actionReinstall')
      : t('actionInstall');
  const Icon = isLaunch
    ? Play
    : mode === 'reinstall'
      ? RefreshCw
      : DownloadCloud;
  const busy = page.action === (isLaunch ? 'launch' : 'install');

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={isLaunch ? page.launch : onOpenInstallModal}
      className="bpp-install-primary-button w-full"
    >
      <span className="bpp-install-primary-content flex min-w-0 items-center justify-center gap-3.5">
        {busy ? (
          <Loader2 size={30} className="bpp-primary-action-icon animate-spin" />
        ) : (
          <Icon size={30} className="bpp-primary-action-icon" />
        )}
        <span className="bpp-primary-action-label text-[18px] font-semibold text-white">
          {label}
        </span>
      </span>
    </button>
  );
}
