import { useCallback, useState } from 'react';
import { toErrorMessage } from './errors';

type AsyncActionOptions = {
  onStart?: () => void;
};

export function useAsyncAction<TAction extends string = string>() {
  const [action, setAction] = useState<TAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (
      name: TAction,
      task: () => Promise<void>,
      options?: AsyncActionOptions
    ) => {
      setAction(name);
      setError(null);
      options?.onStart?.();
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

  const clearError = useCallback(() => setError(null), []);

  return {
    action,
    error,
    setError,
    clearError,
    run,
    busy: action !== null
  };
}
