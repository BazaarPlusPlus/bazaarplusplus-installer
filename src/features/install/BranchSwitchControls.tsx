import {
  CircleStop,
  FlaskConical,
  Globe2,
  GitBranch,
  Loader2
} from 'lucide-react';
import type {
  BranchSwitchPhase,
  BranchSwitchStatus,
  SteamBranchTarget
} from '../../types/backend';
import { useI18n, type Translate } from '../../i18n/LocaleProvider';
import type { MessageKey } from '../../i18n/messages';
import { PTR_BRANCH_AUTH_ERROR } from './branchSwitchErrors';
import type { useInstallPage } from './useInstallPage';

type InstallPage = ReturnType<typeof useInstallPage>;

export function BranchSwitchControls({ page }: { page: InstallPage }) {
  const { t } = useI18n();
  const status = page.branchSwitch.status;
  const active = page.branchSwitch.active;
  const progress = createBranchProgress(status);
  const currentTargetLabel = status?.target
    ? branchTargetLabel(status.target, t)
    : null;
  const visibleMessage = branchStatusDetail(status, t);
  const showMessage = Boolean(visibleMessage);
  const controlsDisabled =
    page.busy ||
    page.branchSwitch.blocking ||
    !page.state.game.path_valid ||
    page.branchSwitch.canceling;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
          {t('branchSwitchHeading')}
        </h3>
        {active && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[rgba(232,190,120,0.82)]">
            <Loader2 size={12} className="animate-spin" />
            {t(branchPhaseKey(status?.phase ?? 'pre_check'))}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => page.switchBranch('online')}
          className="min-h-14 px-3 py-2 text-left border rounded-sm bg-[rgba(200,148,55,0.04)] border-[rgba(180,130,48,0.2)] hover:bg-[rgba(200,148,55,0.1)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.04)] transition-colors text-[#e8dcc8]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Globe2 size={15} />
            {t('branchTargetOnline')}
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-[rgba(200,170,120,0.78)]">
            {t('branchSwitchOnlineDescription')}
          </span>
        </button>
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => page.switchBranch('ptr')}
          className="min-h-14 px-3 py-2 text-left border rounded-sm bg-[rgba(160,60,105,0.08)] border-[rgba(210,105,145,0.22)] hover:bg-[rgba(160,60,105,0.14)] disabled:opacity-40 disabled:hover:bg-[rgba(160,60,105,0.08)] transition-colors text-[#f0d8e2]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical size={15} />
            {t('branchTargetPtr')}
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-[rgba(230,180,200,0.78)]">
            {t('branchSwitchPtrDescription')}
          </span>
        </button>
      </div>

      {status && status.phase !== 'idle' && (
        <div
          className="rounded-sm border border-[rgba(180,130,48,0.16)] bg-[rgba(18,11,5,0.62)] px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 text-xs text-[#e8dcc8]">
            <span className="inline-flex items-center gap-2 min-w-0">
              <GitBranch
                size={13}
                className="shrink-0 text-[rgba(200,170,120,0.8)]"
              />
              <span className="truncate">
                {currentTargetLabel
                  ? `${currentTargetLabel} / ${t(branchPhaseKey(status.phase))}`
                  : t(branchPhaseKey(status.phase))}
              </span>
            </span>
            {progress.percentLabel && (
              <span className="shrink-0 fira-code text-[rgba(200,170,120,0.82)]">
                {progress.percentLabel}
              </span>
            )}
          </div>

          {progress.showBar && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-[rgba(232,220,200,0.12)]">
              <div
                className="h-full bg-[#d4a040] transition-[width]"
                style={{ width: progress.barWidth }}
              />
            </div>
          )}

          {(progress.bytesLabel || showMessage || status.cancelable) && (
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0 text-[11px] leading-snug text-[rgba(200,170,120,0.78)]">
                {progress.bytesLabel && (
                  <p className="m-0 fira-code">{progress.bytesLabel}</p>
                )}
                {showMessage && (
                  <p className="m-0 selectable break-words">{visibleMessage}</p>
                )}
              </div>
              {status.cancelable && (
                <button
                  type="button"
                  disabled={page.branchSwitch.canceling}
                  onClick={page.cancelBranchSwitch}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-sm border border-[rgba(190,80,80,0.26)] bg-[rgba(160,50,50,0.1)] px-2.5 py-1 text-[11px] text-[rgba(232,190,190,0.92)] hover:bg-[rgba(160,50,50,0.18)] disabled:opacity-40 transition-colors"
                >
                  {page.branchSwitch.canceling ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CircleStop size={12} />
                  )}
                  {page.branchSwitch.canceling
                    ? t('branchSwitchCanceling')
                    : t('branchSwitchCancel')}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function branchTargetLabel(target: SteamBranchTarget, t: Translate) {
  return target === 'ptr' ? t('branchTargetPtr') : t('branchTargetOnline');
}

function branchPhaseKey(phase: BranchSwitchPhase) {
  return BRANCH_PHASE_KEYS[phase];
}

function branchStatusDetail(
  status: BranchSwitchStatus | null,
  t: Translate
): string | null {
  if (status?.message === PTR_BRANCH_AUTH_ERROR) {
    return t('branchSwitchPtrAuthRequired');
  }
  if (status?.phase === 'downloading' && !status.cancelable) {
    return t('branchSwitchCancelLocked');
  }
  if (status?.phase === 'error' && status.message) {
    return status.message;
  }
  return null;
}

const BRANCH_PHASE_KEYS: Record<BranchSwitchPhase, MessageKey> = {
  idle: 'branchSwitchPhaseIdle',
  pre_check: 'branchSwitchPhasePreCheck',
  quit_steam: 'branchSwitchPhaseQuitSteam',
  edit_acf: 'branchSwitchPhaseEditAcf',
  downloading: 'branchSwitchPhaseDownloading',
  repairing: 'branchSwitchPhaseRepairing',
  restoring: 'branchSwitchPhaseRestoring',
  canceled: 'branchSwitchPhaseCanceled',
  ready: 'branchSwitchPhaseReady',
  error: 'branchSwitchPhaseError'
};

function createBranchProgress(status: BranchSwitchStatus | null) {
  const fraction =
    typeof status?.progress_fraction === 'number'
      ? Math.max(0, Math.min(1, status.progress_fraction))
      : null;
  const percentLabel =
    fraction === null ? null : `${Math.round(fraction * 100)}%`;
  const hasDownloaded = typeof status?.bytes_downloaded === 'number';
  const hasTotal = typeof status?.bytes_to_download === 'number';
  const bytesLabel =
    hasDownloaded && hasTotal
      ? `${formatBytes(status.bytes_downloaded ?? 0)} / ${formatBytes(
          status.bytes_to_download ?? 0
        )}`
      : hasDownloaded
        ? formatBytes(status.bytes_downloaded ?? 0)
        : null;

  return {
    showBar: fraction !== null,
    barWidth: fraction === null ? '0%' : `${fraction * 100}%`,
    percentLabel,
    bytesLabel
  };
}

function formatBytes(bytes: number) {
  const mib = bytes / (1024 * 1024);
  if (mib >= 100) {
    return `${Math.round(mib)} MB`;
  }
  if (mib >= 10) {
    return `${mib.toFixed(1)} MB`;
  }
  return `${mib.toFixed(2)} MB`;
}
