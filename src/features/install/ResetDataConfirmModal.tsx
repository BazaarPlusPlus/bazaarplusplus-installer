import { Database, ShieldCheck } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useI18n } from '../../i18n/LocaleProvider';

export function ResetDataConfirmModal({
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
      titleId="reset-data-modal-title"
      title={t('resetDataConfirmTitle')}
      tone="danger"
      acknowledge={{
        label: t('resetDataConfirmAcknowledge'),
        checked: acknowledged,
        onChange: onAcknowledgedChange
      }}
      confirmLabel={t('resetDataConfirmAction')}
      busy={busy}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div className="flex items-start gap-3 p-4 border border-[rgba(190,80,80,0.24)] rounded-[4px] bg-[rgba(160,50,50,0.08)] text-[rgba(245,220,220,0.86)]">
        <Database
          size={16}
          className="mt-0.5 shrink-0 text-[rgba(232,120,120,0.9)]"
        />
        <p className="m-0 text-[13px] leading-relaxed">
          {t('resetDataConfirmBody')}
        </p>
      </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex items-start gap-3 p-4 border border-[rgba(190,80,80,0.24)] rounded-[4px] bg-[rgba(160,50,50,0.08)] text-[rgba(245,220,220,0.86)]">
            <Database
              size={16}
              className="mt-0.5 shrink-0 text-[rgba(232,120,120,0.9)]"
            />
            <p className="m-0 text-[13px] leading-relaxed">
              {t('resetDataConfirmBody')}
            </p>
          </div>

          <div className="flex items-start gap-3 p-4 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-[rgba(200,148,55,0.05)] text-[rgba(232,220,194,0.82)]">
            <ShieldCheck
              size={16}
              className="mt-0.5 shrink-0 text-[rgba(232,190,120,0.9)]"
            />
            <div className="flex flex-col gap-2 text-[13px] leading-relaxed">
              <p className="m-0">{t('resetDataConfirmKeepsInstall')}</p>
              <p className="m-0">{t('resetDataConfirmGameClosed')}</p>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 border border-[rgba(190,80,80,0.22)] rounded-[4px] bg-[rgba(160,50,50,0.06)] group">
            <input
              type="checkbox"
              className="mt-1"
              checked={acknowledged}
              onChange={(event) => onAcknowledgedChange(event.target.checked)}
            />
            <span className="text-[13px] leading-relaxed text-[rgba(245,220,220,0.82)]">
              {t('resetDataConfirmAcknowledge')}
            </span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={
                !acknowledged || page.action === 'resetData'
              }
              onClick={onConfirm}
              className="px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all bg-gradient-to-b from-[#d85d5d] to-[#9a2a2a] text-[#fff1f1] shadow-[0_0_15px_rgba(160,50,50,0.35)] hover:brightness-110 active:brightness-95 disabled:opacity-45 disabled:hover:brightness-100"
            >
              {page.action === 'resetData' ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t('resetDataConfirmAction')}
                </span>
              ) : (
                t('resetDataConfirmAction')
              )}
            </button>
          </div>
        </div>
      </div>
    </ConfirmDialog>
  );
}
