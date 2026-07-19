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
import { Button } from '../components/ui/Button';
import { PageShell } from '../components/ui/PageShell';
import { ProblemBanner } from '../components/ui/ProblemBanner';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatusBanner } from '../components/ui/StatusBanner';
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
      <div className="bpp-stream-stack">
        <section className="bpp-panel bpp-stream-panel">
          <div className="bpp-stream-service-row">
            <div className="bpp-stream-service-status">
              <div className={`bpp-stream-status-icon is-${statusTone}`}>
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
              <div className="min-w-0">
                <h3 className="bpp-stream-status-title">
                  {presentation.status.label}
                </h3>
                <p className="bpp-stream-status-detail">
                  {presentation.status.detail}
                  {status?.running && snapshot.polling.freshness === 'fresh'
                    ? ` · ${presentation.dbLabel}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="bpp-stream-service-actions">
              <Button
                disabled={!snapshot.oneOff.canOpenOverlay}
                onClick={() => void intents.openOverlay()}
              >
                <ExternalLink size={14} /> {t('streamOpenOverlay')}
              </Button>
              <Button
                disabled={!snapshot.service.canRestart}
                onClick={() => void intents.restart()}
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
              </Button>
            </div>
          </div>

          <div className="bpp-stream-service-feedback">
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
            {snapshot.oneOff.problems.open_overlay && (
              <StreamProblemBanner
                problem={snapshot.oneOff.problems.open_overlay}
              />
            )}
            {presentation.notice && (
              <StatusBanner tone="success" message={presentation.notice} />
            )}
          </div>

          <div className="bpp-stream-section">
            <span
              id="stream-obs-url-label"
              className="bpp-stream-section-label"
            >
              {t('streamObsUrlLabel')}
            </span>
            <div className="bpp-stream-obs-row">
              <div
                id="stream-obs-url"
                className="bpp-input bpp-stream-obs-value selectable fira-code"
                aria-labelledby="stream-obs-url-label"
              >
                {snapshot.oneOff.obsUrl ?? t('streamObsPlaceholder')}
              </div>
              <Button
                disabled={!snapshot.oneOff.canCopyObsUrl}
                onClick={() => void intents.copyObsUrl()}
              >
                <Copy size={16} /> {t('copy')}
              </Button>
            </div>
            {snapshot.oneOff.problems.copy && (
              <StreamProblemBanner problem={snapshot.oneOff.problems.copy} />
            )}
          </div>

          <div className="bpp-stream-section">
            <div className="bpp-stream-section-heading">
              <span className="bpp-stream-section-label">
                {t('streamWindowSection')}
              </span>
              <span className="bpp-stream-window-summary">
                {presentation.windowLabel}
              </span>
            </div>
            <div className="bpp-stream-metrics-grid">
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
              <div className="bpp-stream-window-metric">
                <InfoMetric
                  label={t('streamInfoWindow')}
                  value={String(status?.active_window_offset ?? 0)}
                />
                <div className="bpp-stream-window-actions">
                  <Button
                    size="small"
                    disabled={!snapshot.window.canMoveMoreHistory}
                    onClick={() => void intents.moveWindow(1)}
                  >
                    <Maximize size={12} />
                    {t('streamMoreHistory')}
                  </Button>
                  <Button
                    size="small"
                    disabled={!snapshot.window.canMoveLessHistory}
                    onClick={() => void intents.moveWindow(-1)}
                  >
                    <Minimize size={12} />
                    {t('streamLessHistory')}
                  </Button>
                </div>
              </div>
            </div>
            {snapshot.window.problem && (
              <StreamProblemBanner problem={snapshot.window.problem} />
            )}
          </div>

          <div className="bpp-stream-section bpp-stream-config-section">
            <span className="bpp-stream-section-label">
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

            <SegmentedControl
              label={t('streamOverlayConfig')}
              name="displayMode"
              value={cropSettings.display_mode}
              disabled={!snapshot.crop.canEdit}
              options={displayModes.map((mode) => ({
                value: mode.value,
                label: t(mode.labelKey)
              }))}
              onChange={(mode) => void intents.changeDisplayMode(mode)}
            />

            <div className="bpp-stream-crop-row">
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
                className="bpp-input bpp-stream-crop-input fira-code"
              />
              <Button
                onClick={() => void intents.submitCropCode()}
                disabled={!snapshot.crop.canEdit}
              >
                {t('streamApplyCrop')}
              </Button>
              <Button
                onClick={() => void intents.resetCropCode()}
                disabled={!snapshot.crop.canEdit}
              >
                {t('streamResetCrop')}
              </Button>
              <Button
                disabled={!snapshot.oneOff.canOpenSettings}
                onClick={() => void intents.openSettings()}
              >
                <Settings2 size={16} /> {t('streamOpenSettings')}
              </Button>
            </div>
          </div>
        </section>
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
          <Button size="small" variant="ghost" busy={busy} onClick={onRetry}>
            {label}
          </Button>
        ) : undefined
      }
    />
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bpp-stream-metric">
      <span className="bpp-stream-metric-label">{label}</span>
      <span className="bpp-stream-metric-value fira-code">{value}</span>
    </div>
  );
}
