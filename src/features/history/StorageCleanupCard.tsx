import { ChevronRight, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import type { StorageCleanupPreset } from '../../types/backend';
import { formatBytes } from './format';
import {
  useStorageCleanup,
  type CleanupOutcome,
  type CleanupScope,
  type PendingCleanup
} from './useStorageCleanup';

const PRESETS: Array<{
  preset: StorageCleanupPreset;
  labelKey:
    | 'storageCleanupPresetBeforeThisMonth'
    | 'storageCleanupPresetOlderThan7Days'
    | 'storageCleanupPresetAll';
}> = [
  {
    preset: 'before_this_month',
    labelKey: 'storageCleanupPresetBeforeThisMonth'
  },
  {
    preset: 'older_than_7_days',
    labelKey: 'storageCleanupPresetOlderThan7Days'
  },
  { preset: 'all', labelKey: 'storageCleanupPresetAll' }
];

function pendingItemCount(pending: PendingCleanup): number {
  if (pending.scope === 'screenshots') {
    return pending.preview.screenshots + pending.preview.orphan_files;
  }
  return pending.preview.runs;
}

export function StorageCleanupCard({
  onCompleted
}: {
  onCompleted: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const cleanup = useStorageCleanup(onCompleted);

  const pendingBody = (pending: PendingCleanup): string => {
    if (pendingItemCount(pending) === 0) {
      return t('storageCleanupNothingToClean');
    }
    if (pending.scope === 'screenshots') {
      return t('storageCleanupScreenshotsConfirmBody', {
        count: pending.preview.screenshots + pending.preview.orphan_files,
        size: formatBytes(pending.preview.estimated_bytes)
      });
    }
    return t('storageCleanupRunDataConfirmBody', {
      runs: pending.preview.runs,
      battles: pending.preview.battles,
      videos: pending.preview.videos,
      size: formatBytes(pending.preview.estimated_bytes)
    });
  };

  const outcomeText = (outcome: CleanupOutcome): string => {
    if (outcome.scope === 'screenshots') {
      return t('storageCleanupScreenshotsDone', {
        files: outcome.result.deleted_files,
        size: formatBytes(outcome.result.freed_bytes)
      });
    }
    return t('storageCleanupRunDataDone', {
      runs: outcome.result.deleted_runs,
      files: outcome.result.deleted_files,
      size: formatBytes(outcome.result.freed_bytes)
    });
  };

  return (
    <>
      <details className="group p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)]">
        <summary className="flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden">
          <ChevronRight
            size={14}
            className="shrink-0 text-[rgba(200,170,120,0.8)] transition-transform group-open:rotate-90"
          />
          <Trash2 size={14} className="text-[rgba(200,170,120,0.8)]" />
          <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
            {t('storageCleanupTitle')}
          </span>
        </summary>

        <div className="mt-3 flex flex-col gap-3">
          {cleanup.error && <ErrorBanner message={cleanup.error} />}

          <CleanupRow
            label={t('storageCleanupScreenshotsLabel')}
            scope="screenshots"
            busy={cleanup.busy}
            onSelect={cleanup.requestCleanup}
          />
          <CleanupRow
            label={t('storageCleanupRunDataLabel')}
            scope="run_data"
            busy={cleanup.busy}
            onSelect={cleanup.requestCleanup}
          />

          {cleanup.outcome && (
            <p className="m-0 text-xs text-[rgba(200,170,120,0.8)]">
              {outcomeText(cleanup.outcome)}
            </p>
          )}
        </div>
      </details>

      {cleanup.pending && (
        <ConfirmDialog
          titleId="cleanup-confirm-modal-title"
          title={t('storageCleanupConfirmTitle')}
          tone="danger"
          confirmLabel={t('storageCleanupConfirmAction')}
          busy={cleanup.busy}
          confirmDisabled={pendingItemCount(cleanup.pending) === 0}
          onConfirm={cleanup.confirm}
          onClose={cleanup.cancel}
        >
          <p className="m-0 text-[13px] leading-relaxed text-[rgba(245,220,220,0.86)]">
            {pendingBody(cleanup.pending)}
          </p>
          {cleanup.pending.preview.skipped_pending_uploads > 0 && (
            <p className="m-0 text-[12px] leading-relaxed text-[rgba(200,170,120,0.8)]">
              {t('storageCleanupSkippedPending', {
                count: cleanup.pending.preview.skipped_pending_uploads
              })}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

function CleanupRow({
  label,
  scope,
  busy,
  onSelect
}: {
  label: string;
  scope: CleanupScope;
  busy: boolean;
  onSelect: (
    scope: CleanupScope,
    preset: StorageCleanupPreset
  ) => Promise<boolean> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm text-[#e8dcc8]">{label}</span>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {PRESETS.map(({ preset, labelKey }) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => void onSelect(scope, preset)}
            className="px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-xs text-[#e8dcc8]"
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
