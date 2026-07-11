import { FolderX, ShieldCheck } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useI18n } from '../../i18n/LocaleProvider';

export function ResetBepinexConfirmModal({
  busy,
  acknowledged,
  onAcknowledgedChange,
  onClose,
  onConfirm
}: {
  busy: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useI18n();

  return (
    <ConfirmDialog
      titleId="reset-bepinex-modal-title"
      title={t('resetBepinexConfirmTitle')}
      tone="danger"
      acknowledge={{
        label: t('resetBepinexConfirmAcknowledge'),
        checked: acknowledged,
        onChange: onAcknowledgedChange
      }}
      confirmLabel={t('resetBepinexConfirmAction')}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="flex items-start gap-3 p-4 border border-[rgba(190,80,80,0.24)] rounded-[4px] bg-[rgba(160,50,50,0.08)] text-[rgba(245,220,220,0.86)]">
        <FolderX
          size={16}
          className="mt-0.5 shrink-0 text-[rgba(232,120,120,0.9)]"
        />
        <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
          <p className="m-0">{t('resetBepinexConfirmBody')}</p>
          <p className="m-0">{t('resetBepinexConfirmOtherMods')}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-[rgba(200,148,55,0.05)] text-[rgba(232,220,194,0.82)]">
        <ShieldCheck
          size={16}
          className="mt-0.5 shrink-0 text-[rgba(232,190,120,0.9)]"
        />
        <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
          <p className="m-0">{t('resetBepinexConfirmReinstall')}</p>
          <p className="m-0">{t('resetBepinexConfirmGameClosed')}</p>
        </div>
      </div>
    </ConfirmDialog>
  );
}
