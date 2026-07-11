import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamServiceStatus
} from '../../types/backend';
import { useI18n } from '../../i18n/LocaleProvider';
import {
  defaultCropSettings,
  idleStreamStatus
} from '../../api/previewDefaults';
import { toErrorMessage } from '../shared/errors';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  useTransientMessage,
  type TransientTone
} from '../shared/useTransientMessage';
import {
  applyCropCode,
  loadCropSettings,
  openExternal,
  restartStreamSession,
  resetCropSettings,
  saveDisplayMode,
  setStreamWindowOffset
} from './streamApi';
import {
  ensureStreamSession,
  getStreamStatus
} from '../shared/streamSessionApi';
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
  const [transient, setTransient] = useTransientMessage();
  const [pollError, setPollError] = useState<string | null>(null);
  const {
    action,
    error: actionError,
    setError: setActionError,
    run
  } = useAsyncAction<StreamAction>();
  const error = actionError ?? pollError;

  const flashMessage = useCallback(
    (next: string, tone: TransientTone = 'success') => setTransient(next, tone),
    [setTransient]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    setPollError(null);
    try {
      const [nextStatus, nextCropSettings] = await Promise.all([
        ensureStreamSession(),
        loadCropSettings()
      ]);
      setStatus(nextStatus);
      setCropSettings(nextCropSettings);
      setCropCode(nextCropSettings.code);
    } catch (caught) {
      setActionError(toErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [setActionError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let mounted = true;
    // Tolerate transient polling blips: only surface an error after several
    // consecutive failures so a single dropped poll doesn't flash the overlay
    // into an error state and disable its controls.
    let consecutiveFailures = 0;
    const failureThreshold = 3;
    const interval = window.setInterval(() => {
      void getStreamStatus()
        .then((nextStatus) => {
          if (!mounted) return;
          consecutiveFailures = 0;
          setPollError(null);
          setStatus(nextStatus);
        })
        .catch((caught) => {
          if (!mounted) return;
          consecutiveFailures += 1;
          if (consecutiveFailures >= failureThreshold) {
            setPollError(toErrorMessage(caught));
          }
        });
    }, 2000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

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
          try {
            await navigator.clipboard.writeText(status.overlay_url);
            flashMessage(t('streamCopied'));
          } catch {
            flashMessage(t('streamCopyFailed'), 'error');
          }
        },
        { onStart: () => setTransient(null) }
      ),
    [flashMessage, run, setTransient, status.overlay_url, t]
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
          flashMessage(t('streamCropSaved'));
        },
        { onStart: () => setTransient(null) }
      ),
    [cropCode, flashMessage, run, setTransient, t]
  );

  const resetCropCode = useCallback(
    () =>
      run(
        'crop',
        async () => {
          const payload = await resetCropSettings();
          setCropSettings(payload);
          setCropCode(payload.code);
          flashMessage(t('streamCropReset'));
        },
        { onStart: () => setTransient(null) }
      ),
    [flashMessage, run, setTransient, t]
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
    message: transient?.text ?? null,
    messageTone: transient?.tone ?? 'success',
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
