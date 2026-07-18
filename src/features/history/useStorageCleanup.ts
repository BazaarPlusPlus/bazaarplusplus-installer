import { useState } from 'react';
import type {
  StorageCleanupExecution,
  StorageCleanupPreset,
  StorageCleanupPreview,
  StorageCleanupScope
} from '../../types/backend';
import { useAsyncAction } from '../shared/useAsyncAction';
import { executeStorageCleanup, previewStorageCleanup } from './historyApi';

export type CleanupScope = StorageCleanupScope;

export type PendingCleanup = StorageCleanupPreview & {
  preset: StorageCleanupPreset;
};

export type CleanupOutcome = StorageCleanupExecution;

export function useStorageCleanup(onCompleted: () => Promise<void> | void) {
  const [pending, setPending] = useState<PendingCleanup | null>(null);
  const [outcome, setOutcome] = useState<CleanupOutcome | null>(null);
  const { busy, error, clearError, run } = useAsyncAction<
    'preview' | 'execute'
  >();

  const requestCleanup = (
    scope: CleanupScope,
    preset: StorageCleanupPreset
  ) =>
    run('preview', async () => {
      setOutcome(null);
      const preview = await previewStorageCleanup(scope, preset);
      setPending({ ...preview, preset });
    });

  const confirm = () => {
    const target = pending;
    if (!target) {
      return;
    }
    void run('execute', async () => {
      setPending(null);
      setOutcome(await executeStorageCleanup(target.scope, target.preset));
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
