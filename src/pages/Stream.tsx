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
import type { StreamOverlayDisplayMode } from '../types/backend';
import { PageShell } from '../components/ui/PageShell';
import { useStreamPage } from '../features/stream/useStreamPage';
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
  const { status, cropSettings } = snapshot;
  const feedbackIsError = snapshot.feedback?.tone === 'error';

  return (
    <PageShell eyebrow="Stream" title={t('streamTitle')}>
      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-8 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border ${
                  snapshot.phase === 'error'
                    ? 'bg-[rgba(210,80,80,0.15)] border-[rgba(210,80,80,0.3)] text-[#d96d6d]'
                    : status.running
                      ? 'bg-[rgba(80,180,120,0.15)] border-[rgba(80,180,120,0.3)] text-[#6dd9a0]'
                      : 'bg-[rgba(200,148,55,0.1)] border-[rgba(200,148,55,0.22)] text-[#e8c87a]'
                }`}
              >
                {snapshot.phase === 'error' ? (
                  <AlertCircle size={16} />
                ) : status.running ? (
                  <Radio size={16} className="animate-pulse" />
                ) : (
                  <RefreshCw
                    size={16}
                    className={snapshot.isBusy ? 'animate-spin' : ''}
                  />
                )}
              </div>
              <div>
                <h3 className="font-bold text-[#e8dcc8] flex items-center gap-2">
                  {snapshot.statusLabel}
                </h3>
                <p className="text-xs text-[rgba(200,170,120,0.8)] fira-code mt-0.5">
                  {snapshot.statusDetail}
                  {status.running ? ` · ${snapshot.dbLabel}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!snapshot.canOpenOverlay}
                onClick={() => void intents.openOverlay()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-xs text-[#e8dcc8]"
              >
                <ExternalLink size={14} /> {t('streamOpenOverlay')}
              </button>
              <button
                type="button"
                disabled={!snapshot.canRestart}
                onClick={() => void intents.restart()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-xs text-[#e8dcc8]"
              >
                <RefreshCw
                  size={14}
                  className={
                    snapshot.action === 'restart' ? 'animate-spin' : ''
                  }
                />
                {t('streamRestart')}
              </button>
            </div>
          </div>

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
                className="flex-1 px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] overflow-hidden text-ellipsis whitespace-nowrap selectable"
                aria-labelledby="stream-obs-url-label"
              >
                {snapshot.obsUrl ?? t('streamObsPlaceholder')}
              </div>
              <button
                type="button"
                disabled={!snapshot.canCopyObsUrl}
                onClick={() => void intents.copyObsUrl()}
                className="flex items-center gap-2 px-4 py-2 bg-[rgba(200,148,55,0.1)] border border-[rgba(180,130,48,0.3)] rounded-sm hover:bg-[rgba(200,148,55,0.2)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
              >
                <Copy size={16} /> {t('copy')}
              </button>
            </div>
            {snapshot.feedback && (
              <p
                role={feedbackIsError ? 'alert' : 'status'}
                aria-live={feedbackIsError ? 'assertive' : 'polite'}
                className={`m-0 text-xs ${
                  feedbackIsError
                    ? 'text-[#d96d6d]'
                    : 'text-[rgba(109,217,160,0.86)]'
                }`}
              >
                {snapshot.feedback.text}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 bg-[rgba(200,148,55,0.02)] p-4 rounded-sm border border-[rgba(200,148,55,0.08)]">
            <div className="flex justify-between items-center">
              <span className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
                {t('streamWindowSection')}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-[rgba(200,170,120,0.8)]">
                  {snapshot.windowLabel}
                </span>
                <div className="flex items-center gap-2 border-l border-[rgba(200,148,55,0.2)] pl-4">
                  <button
                    type="button"
                    disabled={!snapshot.canMoveMoreHistory}
                    onClick={() => void intents.moveWindow(1)}
                    className="flex items-center gap-1.5 px-2 py-1 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-[10px] text-[#e8dcc8]"
                  >
                    <Maximize size={12} />
                    {t('streamMoreHistory')}
                  </button>
                  <button
                    type="button"
                    disabled={!snapshot.canMoveLessHistory}
                    onClick={() => void intents.moveWindow(-1)}
                    className="flex items-center gap-1.5 px-2 py-1 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-[10px] text-[#e8dcc8]"
                  >
                    <Minimize size={12} />
                    {t('streamLessHistory')}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-2 pt-4 border-t border-[rgba(200,148,55,0.1)]">
              <InfoMetric label={t('streamInfoHost')} value={status.host} />
              <InfoMetric
                label={t('streamInfoPort')}
                value={status.port ? String(status.port) : '-'}
              />
              <InfoMetric label={t('streamInfoDb')} value={snapshot.dbLabel} />
              <InfoMetric
                label={t('streamInfoWindow')}
                value={String(status.active_window_offset)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
              {t('streamOverlayConfig')}
            </span>

            <div className="flex gap-2">
              {displayModes.map((mode) => (
                <label key={mode.value} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    className="peer sr-only"
                    checked={cropSettings.display_mode === mode.value}
                    disabled={!snapshot.canEditCrop}
                    onChange={() => void intents.changeDisplayMode(mode.value)}
                  />
                  <div className="px-3 py-2 text-center text-sm border border-[rgba(180,130,48,0.3)] rounded-sm text-[rgba(228,216,191,0.6)] peer-checked:bg-[rgba(200,148,55,0.15)] peer-checked:text-[#e8c87a] peer-checked:border-[rgba(200,148,55,0.6)] transition-all">
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
                value={snapshot.cropCode}
                disabled={!snapshot.canEditCrop}
                onChange={(event) => intents.setCropCode(event.target.value)}
                className="flex-1 min-w-[12rem] px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] focus:border-[rgba(200,148,55,0.6)]"
              />
              <button
                type="button"
                onClick={() => void intents.submitCropCode()}
                disabled={!snapshot.canEditCrop}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-sm text-[#e8dcc8]"
              >
                {t('streamApplyCrop')}
              </button>
              <button
                type="button"
                onClick={() => void intents.resetCropCode()}
                disabled={!snapshot.canEditCrop}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-transparent border border-transparent hover:bg-[rgba(255,255,255,0.05)] rounded-sm transition-colors text-sm text-[rgba(200,170,120,0.8)]"
              >
                {t('streamResetCrop')}
              </button>
              <button
                type="button"
                disabled={!snapshot.canOpenSettings}
                onClick={() => void intents.openSettings()}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-sm text-[#e8dcc8] flex items-center gap-2"
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

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-[rgba(200,170,120,0.8)]">{label}</span>
      <span className="text-xs fira-code text-[#e8dcc8]">{value}</span>
    </div>
  );
}
