import { useState } from 'react';
import type {
  CleanupPreset,
  ScreenshotCleanupPreview,
  ScreenshotCleanupResult
} from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  executeScreenshotCleanup,
  previewScreenshotCleanup
} from './historyApi';

type PendingCleanup = {
  preset: CleanupPreset;
  preview: ScreenshotCleanupPreview;
};

export function useStorageCleanup(onCompleted: () => Promise<void> | void) {
  const [pending, setPending] = useState<PendingCleanup | null>(null);
  const [result, setResult] = useState<ScreenshotCleanupResult | null>(null);
  const { busy, error, clearError, run } =
    useAsyncAction<'preview' | 'execute'>();

  const requestCleanup = (preset: CleanupPreset) =>
    run('preview', async () => {
      setResult(null);
      const preview = await previewScreenshotCleanup(preset);
      if (preview) {
        setPending({ preset, preview });
      }
    });

  const confirm = () => {
    const target = pending;
    if (!target) {
      return;
    }
    void run('execute', async () => {
      setPending(null);
      const outcome = await executeScreenshotCleanup(target.preset);
      if (outcome) {
        setResult(outcome);
      }
      await onCompleted();
    });
  };

  const cancel = () => setPending(null);

  return {
    pending,
    result,
    busy,
    error,
    clearError,
    requestCleanup,
    confirm,
    cancel
  };
}
