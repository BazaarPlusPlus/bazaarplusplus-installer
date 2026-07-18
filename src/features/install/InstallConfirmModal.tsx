import { BookOpen, ExternalLink, TriangleAlert } from 'lucide-react';
import type { InstallCompatState } from '../../types/backend';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useI18n } from '../../i18n/LocaleProvider';

export function InstallConfirmModal({
  busy,
  installAcknowledged,
  onAcknowledgedChange,
  compat,
  compatOptIn,
  onCompatOptInChange,
  onClose,
  onConfirm
}: {
  busy: boolean;
  installAcknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  compat: InstallCompatState;
  compatOptIn: boolean;
  onCompatOptInChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const showCompatToggle = compat.mode_available || compat.forced;
  return (
    <ConfirmDialog
      titleId="install-modal-title"
      title={t('installModalTitle')}
      subtitle={t('installModalSubtitle')}
      tone="gold"
      acknowledge={{
        label: t('installAcknowledge'),
        checked: installAcknowledged,
        onChange: onAcknowledgedChange
      }}
      confirmLabel={t('confirmInstall')}
      busyLabel={t('installing')}
      busy={busy}
      activeDismissalPolicy={{ kind: 'blocked' }}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <section className="bpp-install-guide-card">
        <BookOpen
          size={26}
          strokeWidth={1.55}
          className="bpp-install-card-icon"
        />
        <div className="bpp-install-card-copy">
          <p className="bpp-install-card-title">{t('tutorialKicker')}</p>
          <p className="bpp-install-card-description">
            {t('installModalBody')}
          </p>
        </div>
        <a
          href="https://bazaarplusplus.com/tutorial"
          target="_blank"
          rel="noreferrer"
          className="bpp-install-guide-link"
        >
          {t('viewTutorial')}
          <ExternalLink size={14} />
        </a>
      </section>

      <section className="bpp-install-steam-warning">
        <TriangleAlert
          size={34}
          strokeWidth={1.55}
          className="bpp-install-warning-icon"
        />
        <p>{t('installSteamNotice')}</p>
      </section>

      {showCompatToggle && (
        <label className="bpp-install-compat-card group">
          <input
            type="checkbox"
            className="bpp-install-checkbox"
            checked={compat.forced ? true : compatOptIn}
            disabled={compat.forced}
            onChange={(event) => onCompatOptInChange(event.target.checked)}
          />
          <span className="bpp-install-card-copy">
            <span className="bpp-install-card-title">
              {t('compatModeLabel')}
            </span>
            <span className="bpp-install-card-description">
              {compat.forced
                ? t('compatModeForcedNotice')
                : t('compatModeDescription')}
            </span>
          </span>
          <span className="bpp-install-compat-orbit" aria-hidden="true" />
        </label>
      )}
    </ConfirmDialog>
  );
}
