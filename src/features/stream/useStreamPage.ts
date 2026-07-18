import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useI18n } from '../../i18n/LocaleProvider';
import { streamCommandPort, streamOpener } from './streamApi';
import {
  createStreamWorkflow,
  type StreamClipboard,
  type StreamScheduler
} from './streamWorkflow';

const browserScheduler: StreamScheduler = {
  setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
  clearInterval: (handle) => window.clearInterval(handle as number),
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (handle) => window.clearTimeout(handle as number)
};

const browserClipboard: StreamClipboard = {
  writeText: (value) => navigator.clipboard.writeText(value)
};

export function useStreamPage() {
  const { t } = useI18n();
  const workflow = useMemo(
    () =>
      createStreamWorkflow({
        commands: streamCommandPort,
        scheduler: browserScheduler,
        clipboard: browserClipboard,
        opener: streamOpener,
        copy: {
          statusError: t('streamStatusError'),
          statusStarting: t('streamStatusStarting'),
          statusRunning: t('streamStatusRunning'),
          statusIdle: t('streamStatusIdle'),
          startingDetail: t('streamStarting'),
          idleDetail: t('streamIdleDetail'),
          portDetail: (port) => t('streamPortDetail', { port }),
          dbConnected: t('dbConnected'),
          dbMissing: t('dbMissing'),
          windowLatest: t('streamWindowLatest'),
          windowOffset: (count) => t('streamWindowOffset', { count }),
          copied: t('streamCopied'),
          copyFailed: t('streamCopyFailed'),
          cropSaved: t('streamCropSaved'),
          cropReset: t('streamCropReset')
        }
      }),
    [t]
  );
  const snapshot = useSyncExternalStore(
    workflow.subscribe,
    workflow.getSnapshot,
    workflow.getSnapshot
  );

  useEffect(() => {
    void workflow.start();
    return () => workflow.dispose();
  }, [workflow]);

  return { snapshot, intents: workflow.intents };
}
