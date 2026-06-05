import { useCallback, useEffect, useState } from 'react';
import type { AppBootstrap } from '../../types/backend';
import { useI18n } from '../../i18n/LocaleProvider';
import { toErrorMessage } from '../shared/errors';
import {
  checkForUpdate,
  fallbackBootstrap,
  loadAppBootstrap
} from './aboutApi';

export function useAppBootstrapState() {
  const { t } = useI18n();
  const [bootstrap, setBootstrap] = useState<AppBootstrap>(fallbackBootstrap);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState<string | null>(
    null
  );
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

  const checkUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkForUpdate();
      setUpdateMessage(
        result.status === 'preview'
          ? t('updaterPreview')
          : result.status === 'available'
            ? t('updaterAvailable', { version: result.version })
            : t('updaterCurrent')
      );
      setUpdateDownloadUrl(
        result.status === 'available'
          ? `${bootstrap.links.github}/releases/latest`
          : null
      );
    } catch (error) {
      setUpdateMessage(toErrorMessage(error));
      setUpdateDownloadUrl(null);
    } finally {
      setCheckingUpdate(false);
    }
  }, [bootstrap.links.github, t]);

  return {
    bootstrap,
    updateMessage,
    updateDownloadUrl,
    checkingUpdate,
    checkUpdates
  };
}

export type AppBootstrapController = ReturnType<typeof useAppBootstrapState>;
