import { useState } from 'react';
import type {
  CleanupPreset,
  RunDataCleanupPreview,
  RunDataCleanupResult,
  ScreenshotCleanupPreview,
  ScreenshotCleanupResult
} from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  executeRunDataCleanup,
  executeScreenshotCleanup,
  previewRunDataCleanup,
  previewScreenshotCleanup
} from './historyApi';

export type CleanupScope = 'screenshots' | 'run_data';

export type PendingCleanup =
  | {
      scope: 'screenshots';
      preset: CleanupPreset;
      preview: ScreenshotCleanupPreview;
    }
  | {
      scope: 'run_data';
      preset: CleanupPreset;
      preview: RunDataCleanupPreview;
    };

export type CleanupOutcome =
  | { scope: 'screenshots'; result: ScreenshotCleanupResult }
  | { scope: 'run_data'; result: RunDataCleanupResult };

export function useStorageCleanup(onCompleted: () => Promise<void> | void) {
  const [pending, setPending] = useState<PendingCleanup | null>(null);
  const [outcome, setOutcome] = useState<CleanupOutcome | null>(null);
  const { busy, error, clearError, run } = useAsyncAction<
    'preview' | 'execute'
  >();

  const requestCleanup = (scope: CleanupScope, preset: CleanupPreset) =>
    run('preview', async () => {
      setOutcome(null);
      if (scope === 'screenshots') {
        const preview = await previewScreenshotCleanup(preset);
        if (preview) {
          setPending({ scope, preset, preview });
        }
        return;
      }

      const preview = await previewRunDataCleanup(preset);
      if (preview) {
        setPending({ scope, preset, preview });
      }
    });

  const confirm = () => {
    const target = pending;
    if (!target) {
      return;
    }
    void run('execute', async () => {
      setPending(null);
      if (target.scope === 'screenshots') {
        const result = await executeScreenshotCleanup(target.preset);
        if (result) {
          setOutcome({ scope: 'screenshots', result });
        }
      } else {
        const result = await executeRunDataCleanup(target.preset);
        if (result) {
          setOutcome({ scope: 'run_data', result });
        }
      }
      await onCompleted();
    });
  };

  const cancel = () => setPending(null);

  return {
    pending,
    outcome,
    busy,
    error,
    clearError,
    requestCleanup,
    confirm,
    cancel
  };
}
