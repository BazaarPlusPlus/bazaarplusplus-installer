import { Download } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { useI18n } from '../i18n/LocaleProvider';

type ShellUpdateModalProps = {
  downloadUrl: string;
  onClose: () => void;
  version: string;
};

export function ShellUpdateModal({
  downloadUrl,
  onClose,
  version
}: ShellUpdateModalProps) {
  const { t } = useI18n();

  return (
    <Dialog onClose={onClose} labelledBy="update-modal-title">
      <div className="w-[min(460px,calc(100vw-32px))] border border-[rgba(200,148,55,0.26)] bg-[#130d08] shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
        <div className="border-b border-[rgba(200,148,55,0.18)] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 items-center justify-center rounded-[2px] border border-[rgba(200,148,55,0.28)] bg-[rgba(200,148,55,0.1)] text-[rgba(232,212,174,0.9)]">
              <Download size={18} />
            </div>
            <div>
              <p className="m-0 cinzel text-[10px] uppercase text-[rgba(200,170,120,0.68)]">
                {t('updateModalKicker')}
              </p>
              <h2
                id="update-modal-title"
                className="m-0 mt-2 cinzel text-xl leading-tight text-[#f2e4c8]"
              >
                {t('updateModalTitle')}
              </h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="m-0 text-sm leading-6 text-[rgba(232,220,200,0.82)]">
            {t('updateModalBody', { version })}
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-[rgba(200,148,55,0.14)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 border border-[rgba(200,148,55,0.22)] rounded-[2px] text-[11px] uppercase text-[rgba(232,220,200,0.72)] transition-colors hover:border-[rgba(200,148,55,0.38)]"
          >
            {t('updateModalLater')}
          </button>
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[rgba(255,198,98,0.38)] bg-[rgba(200,148,55,0.16)] px-4 cinzel text-[11px] uppercase text-[#f2e4c8] transition-colors hover:bg-[rgba(200,148,55,0.24)]"
          >
            <Download size={14} />
            {t('updateModalConfirm')}
          </a>
        </div>
      </div>
    </Dialog>
  );
}
