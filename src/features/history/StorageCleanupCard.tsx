import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useI18n } from '../../i18n/LocaleProvider';
import type { CleanupPreset } from '../../types/backend';
import { formatBytes } from './format';
import {
  useStorageCleanup,
  type CleanupOutcome,
  type CleanupScope,
  type PendingCleanup
} from './useStorageCleanup';

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
  const [expanded, setExpanded] = useState(true);

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
      <section className={`bpp-history-cleanup ${expanded ? 'is-open' : ''}`}>
        <button
          type="button"
          className="bpp-history-cleanup-toggle"
          aria-expanded={expanded}
          aria-controls="history-storage-cleanup-content"
          onClick={() => setExpanded((open) => !open)}
        >
          <ChevronDown size={16} className="bpp-history-cleanup-chevron" />
          <Trash2 size={19} className="bpp-history-cleanup-trash" />
          <span className="bpp-history-cleanup-title">
            {t('storageCleanupTitle')}
          </span>
        </button>

        <div
          id="history-storage-cleanup-content"
          className="bpp-history-cleanup-reveal"
          aria-hidden={!expanded}
          inert={!expanded}
        >
          <div className="bpp-history-cleanup-content">
            {cleanup.error && <ErrorBanner message={cleanup.error} />}

            <CleanupRow
              label={t('storageCleanupScreenshotsLabel')}
              description={t('storageCleanupScreenshotsDescription')}
              scope="screenshots"
              busy={cleanup.busy}
              onSelect={cleanup.requestCleanup}
            />
            <CleanupRow
              label={t('storageCleanupRunDataLabel')}
              description={t('storageCleanupRunDataDescription')}
              scope="run_data"
              busy={cleanup.busy}
              onSelect={cleanup.requestCleanup}
            />

            {cleanup.outcome && (
              <p className="bpp-history-cleanup-outcome">
                {outcomeText(cleanup.outcome)}
              </p>
            )}
          </div>
        </div>
      </section>

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
  description,
  scope,
  busy,
  onSelect
}: {
  label: string;
  description: string;
  scope: CleanupScope;
  busy: boolean;
  onSelect: (
    scope: CleanupScope,
    preset: CleanupPreset
  ) => Promise<boolean> | void;
}) {
  const { t } = useI18n();

  return (
    <div className="bpp-history-cleanup-row">
      <div className="bpp-history-cleanup-row-copy">
        <span className="bpp-history-cleanup-row-label">{label}</span>
        <span className="bpp-history-cleanup-row-description">
          {description}
        </span>
      </div>
      <div className="bpp-history-cleanup-actions">
        {PRESETS.map(({ preset, labelKey }) => (
          <button
            key={preset}
            type="button"
            disabled={busy}
            onClick={() => void onSelect(scope, preset)}
            className="bpp-button bpp-history-cleanup-action"
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
