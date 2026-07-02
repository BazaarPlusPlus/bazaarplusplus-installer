import { Trash2 } from 'lucide-react';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import type { CleanupPreset } from '../../types/backend';
import { CleanupConfirmModal } from './CleanupConfirmModal';
import { formatBytes } from './format';
import { useStorageCleanup } from './useStorageCleanup';

const PRESETS: Array<{
  preset: CleanupPreset;
  labelKey:
    | 'storageCleanupPresetBeforeThisMonth'
    | 'storageCleanupPresetOlderThan7Days'
    | 'storageCleanupPresetAll';
}> = [
  {
    preset: 'before_this_month',
    labelKey: 'storageCleanupPresetBeforeThisMonth'
  },
  { preset: 'older_than_7_days', labelKey: 'storageCleanupPresetOlderThan7Days' },
  { preset: 'all', labelKey: 'storageCleanupPresetAll' }
];

export function StorageCleanupCard({
  onCompleted
}: {
  onCompleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const cleanup = useStorageCleanup(onCompleted);
  const pendingCount = cleanup.pending
    ? cleanup.pending.preview.screenshots + cleanup.pending.preview.orphan_files
    : 0;

  return (
    <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Trash2 size={14} className="text-[rgba(200,170,120,0.8)]" />
        <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
          {t('storageCleanupTitle')}
        </span>
      </div>

      {cleanup.error && <ErrorBanner message={cleanup.error} />}

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-[#e8dcc8]">
          {t('storageCleanupScreenshotsLabel')}
        </span>
        <div className="flex gap-2">
          {PRESETS.map(({ preset, labelKey }) => (
            <button
              key={preset}
              type="button"
              disabled={cleanup.busy}
              onClick={() => void cleanup.requestCleanup(preset)}
              className="px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-xs text-[#e8dcc8]"
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {cleanup.result && (
        <p className="m-0 text-xs text-[rgba(200,170,120,0.8)]">
          {t('storageCleanupScreenshotsDone', {
            files: cleanup.result.deleted_files,
            size: formatBytes(cleanup.result.freed_bytes)
          })}
        </p>
      )}

      {cleanup.pending && (
        <CleanupConfirmModal
          title={t('storageCleanupConfirmTitle')}
          body={
            pendingCount === 0
              ? t('storageCleanupNothingToClean')
              : t('storageCleanupScreenshotsConfirmBody', {
                  count: pendingCount,
                  size: formatBytes(cleanup.pending.preview.estimated_bytes)
                })
          }
          skippedNote={
            cleanup.pending.preview.skipped_pending_uploads > 0
              ? t('storageCleanupSkippedPending', {
                  count: cleanup.pending.preview.skipped_pending_uploads
                })
              : null
          }
          busy={cleanup.busy}
          confirmDisabled={pendingCount === 0}
          onClose={cleanup.cancel}
          onConfirm={cleanup.confirm}
        />
      )}
    </div>
  );
}
