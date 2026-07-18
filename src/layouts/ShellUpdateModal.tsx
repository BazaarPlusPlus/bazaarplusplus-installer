import { Download, LoaderCircle, RefreshCw } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { ProblemBanner } from '../components/ui/ProblemBanner';
import type { UpdaterController } from '../features/about/useUpdater';
import type { UpdaterUiContract } from '../features/about/updaterPresentation';
import { presentUpdaterProblem } from '../features/about/updaterProblems';
import { formatProblemDiagnostic } from '../features/shared/problems';
import { useI18n } from '../i18n/LocaleProvider';

type ShellUpdateModalProps = {
  updater: UpdaterController;
  presentation: NonNullable<UpdaterUiContract['modal']>;
};

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function ShellUpdateModal({
  updater,
  presentation
}: ShellUpdateModalProps) {
  const { t } = useI18n();
  const dismissible = presentation.dismissalPolicy === 'dismissible';
  const action = presentation.action;
  const actionHandler =
    action === 'install' || action === 'retry-install'
      ? updater.install
      : updater.restart;

  return (
    <Dialog onClose={updater.dismiss} labelledBy="update-modal-title">
      <div className="w-[min(460px,calc(100vw-32px))] border border-[rgba(200,148,55,0.26)] bg-[#130d08] shadow-[0_24px_70px_rgba(0,0,0,0.58)]">
        <div className="border-b border-[rgba(200,148,55,0.18)] px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="flex size-10 items-center justify-center rounded-[2px] border border-[rgba(200,148,55,0.28)] bg-[rgba(200,148,55,0.1)] text-[rgba(232,212,174,0.9)]">
              {updater.phase === 'downloading' ||
              updater.phase === 'installing' ||
              updater.phase === 'restarting' ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : updater.phase === 'ready-to-restart' ||
                (updater.phase === 'failed' &&
                  updater.problem.code === 'updater_restart_failed') ? (
                <RefreshCw size={18} />
              ) : (
                <Download size={18} />
              )}
            </div>
            <div>
              <p className="m-0 cinzel text-[10px] uppercase text-[rgba(200,170,120,0.68)]">
                {t('updateModalKicker')}
              </p>
              <h2
                id="update-modal-title"
                className="m-0 mt-2 cinzel text-xl leading-tight text-[#f2e4c8]"
              >
                {t(presentation.titleKey)}
              </h2>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {updater.phase === 'available' && (
            <>
              <p className="m-0 text-sm leading-6 text-[rgba(232,220,200,0.82)]">
                {t('updateModalBody', { version: updater.version })}
              </p>
              {updater.notes && (
                <div className="mt-4">
                  <p className="m-0 cinzel text-[10px] uppercase text-[rgba(200,170,120,0.68)]">
                    {t('updateNotesLabel')}
                  </p>
                  <p className="m-0 mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[13px] leading-6 text-[rgba(232,220,200,0.72)]">
                    {updater.notes}
                  </p>
                </div>
              )}
            </>
          )}

          {updater.phase === 'downloading' && (
            <UpdateDownloadProgress progress={updater.progress} />
          )}

          {updater.phase === 'installing' && (
            <p
              role="status"
              aria-live="polite"
              className="m-0 text-sm leading-6 text-[rgba(232,220,200,0.82)]"
            >
              {t('updateInstallingBody', { version: updater.version })}
            </p>
          )}

          {updater.phase === 'ready-to-restart' && (
            <p className="m-0 text-sm leading-6 text-[rgba(232,220,200,0.82)]">
              {t('updateReadyBody', { version: updater.version })}
            </p>
          )}

          {updater.phase === 'restarting' && (
            <p
              role="status"
              aria-live="polite"
              className="m-0 text-sm leading-6 text-[rgba(232,220,200,0.82)]"
            >
              {t('updateRestarting')}
            </p>
          )}

          {updater.phase === 'failed' && (
            <ProblemBanner
              message={presentUpdaterProblem(updater.problem, t)}
              diagnostic={
                updater.problem.diagnostic
                  ? formatProblemDiagnostic(updater.problem)
                  : null
              }
              diagnosticLabel={t('problemDiagnostics')}
            />
          )}
        </div>

        {dismissible && (
          <div className="flex justify-end gap-3 border-t border-[rgba(200,148,55,0.14)] px-6 py-4">
            <button
              type="button"
              onClick={updater.dismiss}
              className="h-9 px-4 border border-[rgba(200,148,55,0.22)] rounded-[2px] text-[11px] uppercase text-[rgba(232,220,200,0.72)] transition-colors hover:border-[rgba(200,148,55,0.38)]"
            >
              {t('updateModalLater')}
            </button>
            {action && presentation.actionLabelKey && (
              <button
                type="button"
                onClick={actionHandler}
                className="inline-flex h-9 items-center gap-2 rounded-[2px] border border-[rgba(255,198,98,0.38)] bg-[rgba(200,148,55,0.16)] px-4 cinzel text-[11px] uppercase text-[#f2e4c8] transition-colors hover:bg-[rgba(200,148,55,0.24)]"
              >
                {action === 'install' ? (
                  <Download size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                {t(presentation.actionLabelKey)}
              </button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function UpdateDownloadProgress({
  progress
}: {
  progress: UpdaterController['progress'];
}) {
  const { t } = useI18n();
  const downloaded = progress?.downloaded ?? 0;
  const total = progress?.total ?? null;
  const percent =
    total && total > 0
      ? Math.min(100, Math.round((downloaded / total) * 100))
      : null;
  const accessibleValue =
    total === null ? undefined : Math.min(downloaded, total);
  const status =
    percent === null
      ? t('updateDownloadProgressUnknown', {
          downloaded: formatMegabytes(downloaded)
        })
      : t('updateDownloadProgressKnown', {
          downloaded: formatMegabytes(downloaded),
          total: formatMegabytes(total ?? 0),
          percent
        });

  return (
    <div>
      <div
        role="progressbar"
        aria-label={t('updateDownloadProgressLabel')}
        aria-valuemin={0}
        aria-valuemax={total ?? undefined}
        aria-valuenow={accessibleValue}
        aria-valuetext={status}
        className="h-1.5 w-full overflow-hidden rounded-[2px] bg-[rgba(200,148,55,0.14)]"
      >
        <div
          className={`h-full bg-[rgba(228,178,88,0.85)] transition-[width] duration-200 ${
            percent === null ? 'w-1/3 animate-pulse' : ''
          }`}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className="m-0 mt-3 text-[12px] tabular-nums text-[rgba(232,220,200,0.72)]"
      >
        {status}
      </p>
    </div>
  );
}
