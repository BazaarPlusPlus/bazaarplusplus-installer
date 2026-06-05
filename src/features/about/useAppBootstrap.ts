import { useCallback, useEffect, useState } from 'react';
import type { AppBootstrap } from '../../types/backend';
import { useI18n } from '../../i18n/LocaleProvider';
import { hasTauriRuntime } from '../../api/runtime';
import { toErrorMessage } from '../shared/errors';
import {
  checkForUpdate,
  fallbackBootstrap,
  loadAppBootstrap,
  type UpdateCheckResult
} from './aboutApi';

let startupUpdateCheck: Promise<UpdateCheckResult> | null = null;

type UpdatePrompt = {
  downloadUrl: string;
  version: string;
};

export function useAppBootstrapState() {
  const { t } = useI18n();
  const [bootstrap, setBootstrap] = useState<AppBootstrap>(fallbackBootstrap);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePrompt | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadAppBootstrap()
      .then((payload) => {
        if (mounted) setBootstrap(payload);
      })
      .catch((error) => {
        console.error(
          'Failed to load app bootstrap from Tauri runtime.',
          error
        );
        if (mounted) setBootstrap(fallbackBootstrap);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const checkUpdates = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setCheckingUpdate(true);
        setUpdateMessage(null);
      }
      try {
        const result = await checkForUpdate();
        if (result.status === 'available') {
          setUpdatePrompt({
            downloadUrl: `${bootstrap.links.github}/releases/latest`,
            version: result.version
          });
          setUpdateMessage(null);
          return;
        }

        if (!silent && result.status === 'preview') {
          setUpdateMessage(t('updaterPreview'));
        }
      } catch (error) {
        if (!silent) setUpdateMessage(toErrorMessage(error));
      } finally {
        if (!silent) setCheckingUpdate(false);
      }
    },
    [bootstrap.links.github, t]
  );

  useEffect(() => {
    if (!hasTauriRuntime()) return;

    let mounted = true;
    startupUpdateCheck ??= checkForUpdate();
    void startupUpdateCheck
      .then((result) => {
        if (!mounted || result.status !== 'available') return;
        setUpdatePrompt({
          downloadUrl: `${bootstrap.links.github}/releases/latest`,
          version: result.version
        });
        setUpdateMessage(null);
      })
      .catch(() => {
        // Startup checks are intentionally silent; manual checks still surface errors.
      });

    return () => {
      mounted = false;
    };
  }, [bootstrap.links.github]);

  return {
    bootstrap,
    updateMessage,
    updatePrompt,
    checkingUpdate,
    checkUpdates,
    dismissUpdatePrompt: () => setUpdatePrompt(null)
  };
}

export type AppBootstrapController = ReturnType<typeof useAppBootstrapState>;
