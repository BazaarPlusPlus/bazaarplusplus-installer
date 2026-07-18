import {
  AlertCircle,
  AlertTriangle,
  Copy,
  ExternalLink,
  Maximize,
  Minimize,
  Radio,
  RefreshCw,
  Settings2
} from 'lucide-react';
import type { StreamOverlayDisplayMode } from '../types/backend';
import { PageShell } from '../components/ui/PageShell';
import { ProblemBanner } from '../components/ui/ProblemBanner';
import { useStreamPage } from '../features/stream/useStreamPage';
import {
  presentStreamProblem,
  presentStreamSnapshot
} from '../features/stream/streamPresentation';
import type { StreamProblem } from '../features/stream/streamProblems';
import { formatProblemDiagnostic } from '../features/shared/problems';
import { useI18n } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';

const displayModes: Array<{
  value: StreamOverlayDisplayMode;
  labelKey: MessageKey;
}> = [
  { value: 'current', labelKey: 'streamModeCurrent' },
  { value: 'hero', labelKey: 'streamModeHero' },
  { value: 'herohalf', labelKey: 'streamModeHeroHalf' }
];

export default function Stream() {
  const { t } = useI18n();
  const { snapshot, intents } = useStreamPage();
  const presentation = presentStreamSnapshot(snapshot, t);
  const status = snapshot.service.status;
  const cropSettings = snapshot.crop.settings;
  const statusTone = presentation.status.tone;

  return (
    <PageShell eyebrow="Stream" title={t('streamTitle')}>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
        <div className="bpp-panel relative flex flex-col gap-8 overflow-hidden p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border ${
                  statusTone === 'degraded'
                    ? 'bg-[rgba(210,80,80,0.15)] border-[rgba(210,80,80,0.3)] text-[#d96d6d]'
                    : statusTone === 'stale'
                      ? 'bg-[rgba(232,200,122,0.12)] border-[rgba(232,200,122,0.3)] text-[#e8c87a]'
                      : statusTone === 'running'
                        ? 'bg-[rgba(80,180,120,0.15)] border-[rgba(80,180,120,0.3)] text-[#6dd9a0]'
                        : 'bg-[rgba(200,148,55,0.1)] border-[rgba(200,148,55,0.22)] text-[#e8c87a]'
                }`}
              >
                {statusTone === 'degraded' ? (
                  <AlertCircle size={16} />
                ) : statusTone === 'stale' ? (
                  <AlertTriangle size={16} />
                ) : statusTone === 'running' ? (
                  <Radio size={16} className="animate-pulse" />
                ) : (
                  <RefreshCw
                    size={16}
                    className={
                      snapshot.service.phase === 'loading' ||
                      snapshot.service.operation === 'restart'
                        ? 'animate-spin'
                        : ''
                    }
                  />
                )}
              </div>
              <div>
                <h3 className="font-bold text-[#e8dcc8] flex items-center gap-2">
                  {presentation.status.label}
                </h3>
                <p className="text-xs text-[rgba(200,170,120,0.8)] fira-code mt-0.5">
                  {presentation.status.detail}
                  {status?.running && snapshot.polling.freshness === 'fresh'
                    ? ` · ${presentation.dbLabel}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!snapshot.oneOff.canOpenOverlay}
                onClick={() => void intents.openOverlay()}
                className="bpp-button"
              >
                <ExternalLink size={14} /> {t('streamOpenOverlay')}
              </button>
              <button
                type="button"
                disabled={!snapshot.service.canRestart}
                onClick={() => void intents.restart()}
                className="bpp-button"
              >
                <RefreshCw
                  size={14}
                  className={
                    snapshot.service.operation === 'restart'
                      ? 'animate-spin'
                      : ''
                  }
                />
                {t('streamRestart')}
              </button>
            </div>
          </div>

          {snapshot.service.problem && (
            <StreamProblemBanner
              problem={snapshot.service.problem}
              onRetry={() => void intents.restart()}
            />
          )}
          {snapshot.polling.problem && (
            <StreamProblemBanner
              problem={snapshot.polling.problem}
              tone="warning"
              actionLabel={t('streamRetryStatus')}
              busy={snapshot.polling.operation === 'retry'}
              onRetry={() => void intents.retryStatus()}
            />
          )}
          {presentation.notice && (
            <p
              role="status"
              aria-live="polite"
              className="m-0 text-xs text-[rgba(109,217,160,0.86)]"
            >
              {presentation.notice}
            </p>
          )}

          <div className="h-px bg-gradient-to-r from-[rgba(200,148,55,0.3)] to-transparent opacity-50" />

          <div className="flex flex-col gap-2">
            <span
              id="stream-obs-url-label"
              className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase"
            >
              {t('streamObsUrlLabel')}
            </span>
            <div className="flex gap-2">
              <div
                id="stream-obs-url"
                className="bpp-input selectable flex min-w-0 flex-1 items-center truncate px-4 fira-code text-xs"
                aria-labelledby="stream-obs-url-label"
              >
                {snapshot.oneOff.obsUrl ?? t('streamObsPlaceholder')}
              </div>
              <button
                type="button"
                disabled={!snapshot.oneOff.canCopyObsUrl}
                onClick={() => void intents.copyObsUrl()}
                className="bpp-button shrink-0"
              >
                <Copy size={16} /> {t('copy')}
              </button>
            </div>
            {snapshot.oneOff.problems.copy && (
              <StreamProblemBanner problem={snapshot.oneOff.problems.copy} />
            )}
            {snapshot.oneOff.problems.open_overlay && (
              <StreamProblemBanner
                problem={snapshot.oneOff.problems.open_overlay}
              />
            )}
          </div>

          <div className="bpp-panel-subtle flex flex-col gap-4 p-4">
            <div className="flex justify-between items-center">
              <span className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
                {t('streamWindowSection')}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[rgba(200,170,120,0.8)]">
                  {presentation.windowLabel}
                </span>
                <div className="flex items-center gap-2 border-l border-[rgba(200,148,55,0.2)] pl-4">
                  <button
                    type="button"
                    disabled={!snapshot.window.canMoveMoreHistory}
                    onClick={() => void intents.moveWindow(1)}
                    className="bpp-button !min-h-8 !px-3 text-[10px]"
                  >
                    <Maximize size={12} />
                    {t('streamMoreHistory')}
                  </button>
                  <button
                    type="button"
                    disabled={!snapshot.window.canMoveLessHistory}
                    onClick={() => void intents.moveWindow(-1)}
                    className="bpp-button !min-h-8 !px-3 text-[10px]"
                  >
                    <Minimize size={12} />
                    {t('streamLessHistory')}
                  </button>
                </div>
              </div>
            </div>

            {snapshot.window.problem && (
              <StreamProblemBanner problem={snapshot.window.problem} />
            )}

            <div className="grid grid-cols-4 gap-4 mt-2 pt-4 border-t border-[rgba(200,148,55,0.1)]">
              <InfoMetric
                label={t('streamInfoHost')}
                value={status?.host ?? '-'}
              />
              <InfoMetric
                label={t('streamInfoPort')}
                value={status?.port ? String(status.port) : '-'}
              />
              <InfoMetric
                label={t('streamInfoDb')}
                value={presentation.dbLabel}
              />
              <InfoMetric
                label={t('streamInfoWindow')}
                value={String(status?.active_window_offset ?? 0)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
              {t('streamOverlayConfig')}
            </span>

            {snapshot.crop.problem && (
              <StreamProblemBanner
                problem={snapshot.crop.problem}
                actionLabel={
                  snapshot.crop.problem.params.operation === 'load'
                    ? t('streamRetryCrop')
                    : undefined
                }
                busy={snapshot.crop.operation === 'load'}
                onRetry={
                  snapshot.crop.problem.params.operation === 'load'
                    ? () => void intents.reloadCropSettings()
                    : undefined
                }
              />
            )}
            {snapshot.oneOff.problems.open_settings && (
              <StreamProblemBanner
                problem={snapshot.oneOff.problems.open_settings}
              />
            )}

            <div className="flex gap-2">
              {displayModes.map((mode) => (
                <label key={mode.value} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    className="peer sr-only"
                    checked={cropSettings.display_mode === mode.value}
                    disabled={!snapshot.crop.canEdit}
                    onChange={() => void intents.changeDisplayMode(mode.value)}
                  />
                  <div className="bpp-button flex w-full peer-checked:border-[rgba(237,139,24,.72)] peer-checked:bg-[rgba(223,126,15,.1)] peer-checked:text-[#ed8b18] peer-checked:shadow-[0_0_16px_rgba(229,129,15,.12)]">
                    {t(mode.labelKey)}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-2">
              <label htmlFor="stream-crop-code" className="sr-only">
                {t('streamCropCodeLabel')}
              </label>
              <input
                id="stream-crop-code"
                type="text"
                placeholder={t('streamCropCodePlaceholder')}
                value={snapshot.crop.code}
                disabled={!snapshot.crop.canEdit}
                onChange={(event) => intents.setCropCode(event.target.value)}
                className="bpp-input min-w-[14rem] flex-1 px-4 fira-code text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => void intents.submitCropCode()}
                disabled={!snapshot.crop.canEdit}
                className="bpp-button"
              >
                {t('streamApplyCrop')}
              </button>
              <button
                type="button"
                onClick={() => void intents.resetCropCode()}
                disabled={!snapshot.crop.canEdit}
                className="bpp-button"
              >
                {t('streamResetCrop')}
              </button>
              <button
                type="button"
                disabled={!snapshot.oneOff.canOpenSettings}
                onClick={() => void intents.openSettings()}
                className="bpp-button"
              >
                <Settings2 size={16} /> {t('streamOpenSettings')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function StreamProblemBanner({
  problem,
  tone = 'error',
  actionLabel,
  busy = false,
  onRetry
}: {
  problem: StreamProblem;
  tone?: 'error' | 'warning';
  actionLabel?: string;
  busy?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const label = actionLabel ?? t('retry');
  return (
    <ProblemBanner
      tone={tone}
      message={presentStreamProblem(problem, t)}
      diagnostic={problem.diagnostic ? formatProblemDiagnostic(problem) : null}
      diagnosticLabel={t('problemDiagnostics')}
      actions={
        onRetry ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRetry}
            className="underline underline-offset-2 disabled:opacity-50"
          >
            {label}
          </button>
        ) : undefined
      }
    />
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-[rgba(200,170,120,0.8)]">{label}</span>
      <span className="text-xs fira-code text-[#e8dcc8]">{value}</span>
    </div>
  );
}
