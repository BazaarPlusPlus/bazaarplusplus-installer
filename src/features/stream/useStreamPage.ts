import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamServiceStatus
} from '../../types/backend';
import { useI18n } from '../../i18n/LocaleProvider';
import { toErrorMessage } from '../shared/errors';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  applyCropCode,
  defaultCropSettings,
  ensureStreamSession,
  getStreamStatus,
  idleStreamStatus,
  loadCropSettings,
  openExternal,
  restartStreamSession,
  resetCropSettings,
  saveDisplayMode,
  setStreamWindowOffset
} from './streamApi';
import { createStreamViewModel } from './streamViewModel';

type StreamAction =
  | 'restart'
  | 'copy'
  | 'open_overlay'
  | 'open_settings'
  | 'crop'
  | 'display_mode'
  | 'window';

export function useStreamPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<StreamServiceStatus>(idleStreamStatus);
  const [cropSettings, setCropSettings] =
    useState<StreamOverlayCropSettingsPayload>(defaultCropSettings);
  const [cropCode, setCropCode] = useState(defaultCropSettings.code);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const { action, error, setError, run } = useAsyncAction<StreamAction>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextCropSettings] = await Promise.all([
        ensureStreamSession(),
        loadCropSettings()
      ]);
      setStatus(nextStatus);
      setCropSettings(nextCropSettings);
      setCropCode(nextCropSettings.code);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    const interval = window.setInterval(() => {
      void getStreamStatus()
        .then((nextStatus) => {
          if (mounted) {
            setStatus(nextStatus);
          }
        })
        .catch((caught) => {
          if (mounted) {
            setError(toErrorMessage(caught));
          }
        });
    }, 2000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [setError]);

  const restart = useCallback(
    () =>
      run('restart', async () => {
        setStatus(await restartStreamSession());
      }),
    [run]
  );

  const copyObsUrl = useCallback(
    () =>
      run(
        'copy',
        async () => {
          if (!status.overlay_url) return;
          await navigator.clipboard.writeText(status.overlay_url);
          setMessage(t('streamCopied'));
        },
        { onStart: () => setMessage(null) }
      ),
    [run, status.overlay_url, t]
  );

  const openOverlay = useCallback(
    () =>
      run('open_overlay', async () => {
        if (status.overlay_url) {
          await openExternal(status.overlay_url);
        }
      }),
    [run, status.overlay_url]
  );

  const openSettings = useCallback(
    () =>
      run('open_settings', async () => {
        if (status.settings_url) {
          await openExternal(status.settings_url);
        }
      }),
    [run, status.settings_url]
  );

  const changeDisplayMode = useCallback(
    (displayMode: StreamOverlayDisplayMode) =>
      run('display_mode', async () => {
        setCropSettings(await saveDisplayMode(displayMode));
      }),
    [run]
  );

  const submitCropCode = useCallback(
    () =>
      run(
        'crop',
        async () => {
          const payload = await applyCropCode(cropCode.trim());
          setCropSettings(payload);
          setCropCode(payload.code);
          setMessage(t('streamCropSaved'));
        },
        { onStart: () => setMessage(null) }
      ),
    [cropCode, run, t]
  );

  const resetCropCode = useCallback(
    () =>
      run(
        'crop',
        async () => {
          const payload = await resetCropSettings();
          setCropSettings(payload);
          setCropCode(payload.code);
          setMessage(t('streamCropReset'));
        },
        { onStart: () => setMessage(null) }
      ),
    [run, t]
  );

  const moveWindow = useCallback(
    (delta: number) =>
      run('window', async () => {
        const nextOffset = Math.max(0, status.active_window_offset + delta);
        setStatus(await setStreamWindowOffset(nextOffset));
      }),
    [run, status.active_window_offset]
  );

  const viewModel = useMemo(
    () => createStreamViewModel({ status, loading, action, error }),
    [action, error, loading, status]
  );

  return {
    status,
    cropSettings,
    cropCode,
    dbPath: status.db,
    viewModel,
    action,
    error,
    message,
    setCropCode,
    restart,
    copyObsUrl,
    openOverlay,
    openSettings,
    changeDisplayMode,
    submitCropCode,
    resetCropCode,
    moveWindow
  };
}
