import { openPath } from '@tauri-apps/plugin-opener';
import { CircleAlert, Copy, Folder } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n/LocaleProvider';
import { PrimaryInstallActionButton } from './PrimaryInstallActionButton';
import type { PrimaryInstallMode } from './PrimaryInstallActionButton';
import type { useInstallPage } from './useInstallPage';

type InstallPage = ReturnType<typeof useInstallPage>;

export function InstallStatusPanel({
  page,
  primaryMode,
  appVersion,
  onOpenInstallModal
}: {
  page: InstallPage;
  primaryMode: PrimaryInstallMode;
  appVersion: string;
  onOpenInstallModal: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const installed = page.state.mod_state.installed;
  const healthy = installed && page.state.mod_state.version_matches;
  const needsReinstall = installed && !page.state.mod_state.version_matches;
  const heroState = healthy
    ? t('installed')
    : needsReinstall
      ? t('modNeedsReinstall')
      : t('notInstalled');
  const heroDescription = healthy
    ? t('installOverviewHealthyShort')
    : needsReinstall
      ? t('installOverviewUpdateDescription')
      : t('installOverviewNotInstalledDescription');
  const selectedPath = page.state.selected_game_path;

  const copyPath = async () => {
    if (!selectedPath) return;
    await navigator.clipboard.writeText(selectedPath);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section className="bpp-install-hero">
        <div className="bpp-install-hero-summary">
          <div className="min-w-0">
            <p className="m-0 text-[21px] font-medium tracking-[.01em] text-[#e5e1da]">
              <span className="bpp-mod-name">BazaarPlusPlus</span>
              <span className="ml-2">{heroState}</span>
            </p>
            <p className="mt-2 text-[12px] text-[#85838a]">{heroDescription}</p>
          </div>
        </div>
        <div className="bpp-install-hero-divider" aria-hidden="true" />
        <div className="bpp-install-primary-slot">
          <PrimaryInstallActionButton
            page={page}
            mode={primaryMode}
            onOpenInstallModal={onOpenInstallModal}
          />
        </div>
      </section>

      <div className="bpp-install-info-grid">
        <InfoCard
          icon={<Folder size={19} />}
          title={t('installationDirectoryHeading')}
        >
          <div className="bpp-install-directory-field">
            <p
              className="selectable bpp-install-path"
              title={selectedPath ?? undefined}
            >
              {selectedPath ?? t('gamePathEmpty')}
            </p>
            <div className="bpp-install-path-actions">
              <button
                type="button"
                disabled={!selectedPath}
                onClick={() => void copyPath()}
                className="bpp-install-secondary-button bpp-install-copy-path-button"
                title={copied ? t('pathCopied') : t('copyPath')}
                aria-label={copied ? t('pathCopied') : t('copyPath')}
              >
                <Copy size={14} />
                {copied ? t('pathCopied') : t('copyPath')}
              </button>
              <button
                type="button"
                disabled={!selectedPath}
                onClick={() => selectedPath && void openPath(selectedPath)}
                className="bpp-install-secondary-button"
              >
                <Folder size={14} />
                {t('openDirectory')}
              </button>
            </div>
          </div>
        </InfoCard>

        <InfoCard title={t('applicationVersionHeading')}>
          <div className="mt-0.5 flex items-center gap-2.5">
            <span className="bpp-install-version-value">{appVersion}</span>
            <span className="bpp-install-build-badge">
              {import.meta.env.DEV ? t('developmentBuild') : t('stableBuild')}
            </span>
          </div>
          <p className="mt-auto fira-code text-[10px] text-[#74737a]">
            v{appVersion} · BazaarPlusPlus Desktop
          </p>
        </InfoCard>
      </div>

      {page.state.warnings.length > 0 && (
        <div className="bpp-install-notices" role="status" aria-live="polite">
          {page.state.warnings.map((warning) => (
            <p key={warning.code} className="m-0 flex items-start gap-2">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              <span>{warning.message}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoCard({
  icon,
  title,
  children
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bpp-install-info-card">
      <h3 className="bpp-install-info-title">
        {icon && <span className="text-[#ef8b17]">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}
