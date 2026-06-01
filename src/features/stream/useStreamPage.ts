import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamServiceStatus
} from '../../types/backend';
import { toErrorMessage } from '../shared/errors';
import {
  applyCropCode,
  defaultCropSettings,
  ensureStreamSession,
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
  | 'window'
  | null;

export function useStreamPage() {
  const [status, setStatus] = useState<StreamServiceStatus>(idleStreamStatus);
  const [cropSettings, setCropSettings] =
    useState<StreamOverlayCropSettingsPayload>(defaultCropSettings);
  const [cropCode, setCropCode] = useState(defaultCropSettings.code);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<StreamAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStatus, nextCropSettings] = await Promise.all([
        ensureStreamSession('route_enter'),
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
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (
      nextAction: Exclude<StreamAction, null>,
      task: () => Promise<void>
    ) => {
      setAction(nextAction);
      setError(null);
      setMessage(null);
      try {
        await task();
      } catch (caught) {
        setError(toErrorMessage(caught));
      } finally {
        setAction(null);
      }
    },
    []
  );

  const restart = useCallback(
    () =>
      runAction('restart', async () => {
        const nextStatus = await restartStreamSession();
        setStatus(nextStatus);
      }),
    [runAction]
  );

  const copyObsUrl = useCallback(
    () =>
      runAction('copy', async () => {
        if (!status.overlay_url) return;
        await navigator.clipboard.writeText(status.overlay_url);
        setMessage('OBS URL 已复制');
      }),
    [runAction, status.overlay_url]
  );

  const openOverlay = useCallback(
    () =>
      runAction('open_overlay', async () => {
        if (status.overlay_url) {
          await openExternal(status.overlay_url);
        }
      }),
    [runAction, status.overlay_url]
  );

  const openSettings = useCallback(
    () =>
      runAction('open_settings', async () => {
        if (status.settings_url) {
          await openExternal(status.settings_url);
        }
      }),
    [runAction, status.settings_url]
  );

  const changeDisplayMode = useCallback(
    (displayMode: StreamOverlayDisplayMode) =>
      runAction('display_mode', async () => {
        const payload = await saveDisplayMode(displayMode);
        setCropSettings(payload);
      }),
    [runAction]
  );

  const submitCropCode = useCallback(
    () =>
      runAction('crop', async () => {
        const payload = await applyCropCode(cropCode.trim());
        setCropSettings(payload);
        setCropCode(payload.code);
        setMessage('裁切代码已保存');
      }),
    [cropCode, runAction]
  );

  const resetCropCode = useCallback(
    () =>
      runAction('crop', async () => {
        const payload = await resetCropSettings();
        setCropSettings(payload);
        setCropCode(payload.code);
        setMessage('裁切设置已恢复默认');
      }),
    [runAction]
  );

  const moveWindow = useCallback(
    (delta: number) =>
      runAction('window', async () => {
        const nextOffset = Math.max(0, status.active_window_offset + delta);
        setStatus(await setStreamWindowOffset(nextOffset));
      }),
    [runAction, status.active_window_offset]
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
