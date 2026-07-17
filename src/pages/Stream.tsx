import {
  AlertCircle,
  Copy,
  ExternalLink,
  Maximize,
  Minimize,
  Radio,
  RefreshCw,
  Settings2
} from 'lucide-react';
import { PageShell } from '../components/ui/PageShell';
import { useStreamPage } from '../features/stream/useStreamPage';
import { useI18n } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import type { StreamOverlayDisplayMode } from '../types/backend';

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
  const page = useStreamPage();
  const { status, cropSettings, dbPath, viewModel } = page;
  const feedbackIsError = Boolean(page.error || page.messageTone === 'error');
  const dbLabel = dbPath.found ? t('dbConnected') : t('dbMissing');
  const statusLabel = t(
    viewModel.state === 'error'
      ? 'streamStatusError'
      : viewModel.state === 'starting'
        ? 'streamStatusStarting'
        : viewModel.state === 'running'
          ? 'streamStatusRunning'
          : 'streamStatusIdle'
  );
  const statusDetail =
    viewModel.state === 'error'
      ? (viewModel.message ?? '')
      : viewModel.state === 'starting'
        ? t('streamStarting')
        : viewModel.state === 'running' && status.port
          ? t('streamPortDetail', { port: status.port })
          : t('streamIdleDetail');
  const statusTone =
    viewModel.state === 'error' ? 'error' : status.running ? 'running' : 'idle';

  return (
    <PageShell eyebrow="Stream" title={t('streamTitle')}>
      <div className="flex flex-col gap-5">
        <section className="bpp-panel overflow-hidden">
          <div className="border-b border-[rgba(215,132,28,.12)] px-5 py-3">
            <h3 className="m-0 text-[13px] font-semibold text-[#c7c1b9]">
              {t('streamServiceSection')}
            </h3>
          </div>
          <div className="flex items-center gap-5 px-6 py-5 max-[980px]:flex-wrap">
            <div
              className={`flex size-14 shrink-0 items-center justify-center rounded-full border ${
                statusTone === 'error'
                  ? 'border-[rgba(213,91,79,.28)] bg-[rgba(213,91,79,.11)] text-[#d55b4f]'
                  : statusTone === 'running'
                    ? 'border-[rgba(82,179,107,.26)] bg-[rgba(82,179,107,.12)] text-[#58b970]'
                    : 'border-[rgba(218,132,26,.22)] bg-[rgba(218,132,26,.08)] text-[#d18421]'
              }`}
            >
              {statusTone === 'error' ? (
                <AlertCircle size={25} />
              ) : status.running ? (
                <Radio size={25} className="animate-pulse" />
              ) : (
                <RefreshCw
                  size={23}
                  className={viewModel.isBusy ? 'animate-spin' : ''}
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="m-0 text-xl font-semibold tracking-[.02em] text-[#d8d3cb]">
                {statusLabel}
              </h4>
              <p className="mt-1 fira-code text-[11px] text-[#777871]">
                {statusDetail}
                {status.running ? ` · ${dbLabel}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                disabled={!viewModel.canOpenOverlay}
                onClick={page.openOverlay}
                className="bpp-button"
              >
                <ExternalLink size={15} /> {t('streamOpenOverlay')}
              </button>
              <button
                type="button"
                disabled={!viewModel.canRestart}
                onClick={page.restart}
                className="bpp-button"
              >
                <RefreshCw
                  size={15}
                  className={page.action === 'restart' ? 'animate-spin' : ''}
                />
                {t('streamRestart')}
              </button>
            </div>
          </div>
        </section>

        <section>
          <label
            id="stream-obs-url-label"
            className="mb-2 block text-[12px] text-[#aaa59e]"
          >
            {t('streamObsUrlLabel')}
          </label>
          <div className="flex gap-3">
            <div
              id="stream-obs-url"
              className="bpp-input selectable flex min-w-0 flex-1 items-center truncate px-4 fira-code text-xs"
              aria-labelledby="stream-obs-url-label"
            >
              {viewModel.obsUrl ?? t('streamObsPlaceholder')}
            </div>
            <button
              type="button"
              disabled={!viewModel.obsUrl}
              onClick={page.copyObsUrl}
              className="bpp-button shrink-0"
            >
              <Copy size={16} /> {t('copy')}
            </button>
          </div>
          {(page.message || page.error) && (
            <p
              role={feedbackIsError ? 'alert' : 'status'}
              aria-live={feedbackIsError ? 'assertive' : 'polite'}
              className={`mt-2 text-xs ${feedbackIsError ? 'text-[#d55b4f]' : 'text-[#55b66d]'}`}
            >
              {page.error ?? page.message}
            </p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="m-0 text-[13px] font-semibold text-[#c3beb6]">
              {t('streamWindowSection')}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!status.running || page.action === 'window'}
                onClick={() => page.moveWindow(1)}
                className="bpp-button !min-h-8 !px-3 text-[10px]"
              >
                <Maximize size={12} /> {t('streamMoreHistory')}
              </button>
              <button
                type="button"
                disabled={
                  !status.running ||
                  status.active_window_offset === 0 ||
                  page.action === 'window'
                }
                onClick={() => page.moveWindow(-1)}
                className="bpp-button !min-h-8 !px-3 text-[10px]"
              >
                <Minimize size={12} /> {t('streamLessHistory')}
              </button>
            </div>
          </div>
          <div className="bpp-panel grid grid-cols-4 overflow-hidden max-[980px]:grid-cols-2">
            <InfoMetric label={t('streamInfoHost')} value={status.host} />
            <InfoMetric
              label={t('streamInfoPort')}
              value={status.port ? String(status.port) : '-'}
            />
            <InfoMetric
              label={t('streamInfoDb')}
              value={dbLabel}
              good={dbPath.found}
            />
            <InfoMetric
              label={t('streamInfoWindow')}
              value={
                status.active_window_offset === 0
                  ? t('streamWindowLatest')
                  : t('streamWindowOffset', {
                      count: status.active_window_offset
                    })
              }
            />
          </div>
        </section>

        <section>
          <h3 className="bpp-section-label">{t('streamOverlayConfig')}</h3>
          <div className="grid grid-cols-3 gap-3">
            {displayModes.map((mode) => (
              <label key={mode.value}>
                <input
                  type="radio"
                  name="displayMode"
                  className="peer sr-only"
                  checked={cropSettings.display_mode === mode.value}
                  onChange={() => page.changeDisplayMode(mode.value)}
                />
                <span className="bpp-button flex w-full peer-checked:border-[rgba(237,139,24,.72)] peer-checked:bg-[rgba(223,126,15,.1)] peer-checked:text-[#ed8b18] peer-checked:shadow-[0_0_16px_rgba(229,129,15,.12)]">
                  {t(mode.labelKey)}
                </span>
              </label>
            ))}
          </div>

          <div className="bpp-panel mt-3 flex flex-wrap items-center gap-3 p-4">
            <label htmlFor="stream-crop-code" className="sr-only">
              {t('streamCropCodeLabel')}
            </label>
            <input
              id="stream-crop-code"
              type="text"
              placeholder={t('streamCropCodePlaceholder')}
              value={page.cropCode}
              onChange={(event) => page.setCropCode(event.target.value)}
              className="bpp-input min-w-[14rem] flex-1 px-4 fira-code text-xs outline-none"
            />
            <button
              type="button"
              onClick={page.submitCropCode}
              disabled={page.action === 'crop'}
              className="bpp-button"
            >
              {t('streamApplyCrop')}
            </button>
            <button
              type="button"
              onClick={page.resetCropCode}
              className="bpp-button"
            >
              {t('streamResetCrop')}
            </button>
            <button
              type="button"
              disabled={!viewModel.canOpenSettings}
              onClick={page.openSettings}
              className="bpp-button"
            >
              <Settings2 size={15} /> {t('streamOpenSettings')}
            </button>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

function InfoMetric({
  label,
  value,
  good = false
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="flex min-h-[72px] flex-col justify-center border-r border-[rgba(215,132,28,.1)] px-5 last:border-r-0">
      <span className="text-[9px] uppercase tracking-[.12em] text-[#696a66]">
        {label}
      </span>
      <span
        className={`mt-2 truncate fira-code text-xs ${good ? 'text-[#55b66d]' : 'text-[#c5c0b8]'}`}
      >
        {good && <span className="bpp-status-dot mr-2 !size-[6px]" />}
        {value}
      </span>
    </div>
  );
}
