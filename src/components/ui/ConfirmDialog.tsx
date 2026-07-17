import {
  AlertTriangle,
  DownloadCloud,
  Loader2,
  X,
  type LucideIcon
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog } from './Dialog';
import { useI18n } from '../../i18n/LocaleProvider';

export type ConfirmTone = 'gold' | 'danger';

export interface ConfirmAcknowledge {
  /** Already-localized label (pass t('...')). */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export interface ConfirmDialogProps {
  /** Constant per-modal DOM id (e.g. "install-modal-title"), NOT useId() —
   *  useId changes rendered bytes. Wired to <h2 id> and Dialog labelledBy. */
  titleId: string;
  title: string;
  /** gold => DownloadCloud + gold chrome + body gap-6;
   *  danger => AlertTriangle + red chrome + body gap-5. */
  tone: ConfirmTone;
  /** Body blocks. MUST be direct siblings (a fragment or multiple top-level
   *  elements) — ConfirmDialog renders {children} as direct children of the
   *  `p-6 flex flex-col gap-*` body div. A wrapping <div> breaks both the flex
   *  gap spacing AND byte-identity. */
  children: ReactNode;
  /** Optional tone-styled gating checkbox, rendered AFTER children, BEFORE
   *  footer. Unchecked => confirm disabled. Fully controlled; the page owns
   *  reset-on-open/on-success. ConfirmDialog holds NO internal checkbox state. */
  acknowledge?: ConfirmAcknowledge;
  confirmLabel: string;
  /** Present => Install affordance: busy swaps text to busyLabel, NO spinner.
   *  Absent => the four danger modals: busy prepends Loader2 animate-spin to
   *  confirmLabel. Presence is the switch. */
  busyLabel?: string;
  /** Disables confirm + triggers busy affordance. Escape/backdrop/X/cancel
   *  stay active while busy. */
  busy: boolean;
  /** Extra gate (for example, Cleanup having nothing to clean). */
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

const TONE = {
  gold: {
    Icon: DownloadCloud as LucideIcon,
    card: 'bpp-modal-card w-full max-w-md mx-4 relative',
    bar: 'bpp-modal-header flex justify-between items-center px-5 py-4',
    icon: 'text-[rgba(200,148,55,0.8)]',
    title: 'cinzel text-[1.1rem] text-[#e8dcc8] m-0 tracking-wider',
    close:
      'text-[rgba(200,170,120,0.72)] hover:text-[#e8dcc8] transition-colors',
    body: 'p-6 flex flex-col gap-6',
    ackBox:
      'flex items-start gap-3 p-3 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.055)] to-[rgba(200,148,55,0.015)] group',
    ackText: 'text-[13px] leading-relaxed text-[rgba(232,220,194,0.78)]',
    confirm:
      'px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110 active:brightness-95 disabled:opacity-45 disabled:hover:brightness-100'
  },
  danger: {
    Icon: AlertTriangle as LucideIcon,
    card: 'bpp-modal-card bpp-modal-danger w-full max-w-md mx-4 relative',
    bar: 'bpp-modal-header flex justify-between items-center px-5 py-4',
    icon: 'text-[rgba(232,120,120,0.9)]',
    title: 'cinzel text-[1.1rem] text-[#f0d8d8] m-0 tracking-wider',
    close:
      'text-[rgba(232,190,190,0.72)] hover:text-[#f0d8d8] transition-colors',
    body: 'p-6 flex flex-col gap-5',
    ackBox:
      'flex items-start gap-3 p-3 border border-[rgba(190,80,80,0.22)] rounded-[4px] bg-[rgba(160,50,50,0.06)] group',
    ackText: 'text-[13px] leading-relaxed text-[rgba(245,220,220,0.82)]',
    confirm:
      'px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all bg-gradient-to-b from-[#d85d5d] to-[#9a2a2a] text-[#fff1f1] shadow-[0_0_15px_rgba(160,50,50,0.35)] hover:brightness-110 active:brightness-95 disabled:opacity-45 disabled:hover:brightness-100'
  }
} as const;

export function ConfirmDialog({
  titleId,
  title,
  tone,
  children,
  acknowledge,
  confirmLabel,
  busyLabel,
  busy,
  confirmDisabled,
  onConfirm,
  onClose
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const s = TONE[tone];
  const Icon = s.Icon;

  return (
    <Dialog onClose={onClose} labelledBy={titleId}>
      <div className={s.card}>
        <div className={s.bar}>
          <div className="flex items-center gap-3">
            <Icon size={18} className={s.icon} />
            <h2 id={titleId} className={s.title}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={s.close}
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className={s.body}>
          {children}
          {acknowledge && (
            <label className={s.ackBox}>
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledge.checked}
                onChange={(event) => acknowledge.onChange(event.target.checked)}
              />
              <span className={s.ackText}>{acknowledge.label}</span>
            </label>
          )}
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
                busy ||
                (acknowledge ? !acknowledge.checked : false) ||
                Boolean(confirmDisabled)
              }
              onClick={onConfirm}
              className={s.confirm}
            >
              {busyLabel !== undefined ? (
                busy ? (
                  busyLabel
                ) : (
                  confirmLabel
                )
              ) : busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {confirmLabel}
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
