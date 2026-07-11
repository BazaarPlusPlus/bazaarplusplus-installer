import { AlertCircle, ExternalLink } from 'lucide-react';
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
      tone="gold"
      acknowledge={{
        label: t('installAcknowledge'),
        checked: installAcknowledged,
        onChange: onAcknowledgedChange
      }}
      confirmLabel={t('confirmInstall')}
      busyLabel={t('installing')}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 p-4 border border-[rgba(200,148,55,0.14)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.04)] to-[rgba(200,148,55,0.015)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.03)]">
        <div className="flex justify-between items-center gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="cinzel text-[10px] tracking-[0.18em] text-[rgba(216,188,123,0.8)] uppercase m-0">
              {t('tutorialKicker')}
            </p>
            <p className="text-[13px] leading-relaxed text-[rgba(200,170,120,0.7)] m-0">
              {t('installModalBody')}
            </p>
          </div>
          <a
            href="https://bazaarplusplus.com/tutorial"
            target="_blank"
            rel="noreferrer"
            className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 border border-[rgba(214,169,84,0.24)] rounded-[3px] bg-gradient-to-b from-[rgba(200,148,55,0.12)] to-[rgba(200,148,55,0.06)] text-[rgba(236,225,202,0.88)] cinzel text-[10px] tracking-[0.12em] uppercase hover:border-[rgba(200,148,55,0.4)] transition-all no-underline"
          >
            {t('viewTutorial')}
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 border border-[rgba(232,190,120,0.24)] rounded-[4px] bg-[rgba(200,148,55,0.08)] text-[rgba(232,220,194,0.82)]">
        <AlertCircle
          size={16}
          className="mt-0.5 shrink-0 text-[rgba(232,190,120,0.9)]"
        />
        <p className="m-0 text-[13px] leading-relaxed">
          {t('installSteamNotice')}
        </p>
      </div>

      {showCompatToggle && (
        <label className="flex items-start gap-3 p-3 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.055)] to-[rgba(200,148,55,0.015)] group">
          <input
            type="checkbox"
            className="mt-1"
            checked={compat.forced ? true : compatOptIn}
            disabled={compat.forced}
            onChange={(event) => onCompatOptInChange(event.target.checked)}
          />
          <span className="flex flex-col gap-1 text-[13px] leading-relaxed text-[rgba(232,220,194,0.78)]">
            <span className="cinzel text-[rgba(232,200,130,0.9)]">
              {t('compatModeLabel')}
            </span>
            <span className="text-[rgba(200,170,120,0.72)]">
              {compat.forced
                ? t('compatModeForcedNotice')
                : t('compatModeDescription')}
            </span>
          </span>
        </label>
      )}
    </ConfirmDialog>
  );
}
