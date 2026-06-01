import { useCallback, useEffect, useState } from 'react';
import type { AppBootstrap } from '../../types/backend';
import { toErrorMessage } from '../shared/errors';
import {
  checkForUpdate,
  fallbackBootstrap,
  loadAppBootstrap,
  setAppLocale
} from './aboutApi';

export function useAppBootstrapState() {
  const [bootstrap, setBootstrap] = useState<AppBootstrap>(fallbackBootstrap);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadAppBootstrap()
      .then((payload) => {
        if (mounted) setBootstrap(payload);
      })
      .catch(() => {
        if (mounted) setBootstrap(fallbackBootstrap);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const changeLocale = useCallback(async () => {
    const nextLocale = bootstrap.locale === 'en' ? 'zh' : 'en';
    const payload = await setAppLocale(nextLocale);
    setBootstrap((current) => ({ ...current, locale: payload.locale }));
  }, [bootstrap.locale]);

  const checkUpdates = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      setUpdateMessage(await checkForUpdate());
    } catch (error) {
      setUpdateMessage(toErrorMessage(error));
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  return {
    bootstrap,
    updateMessage,
    checkingUpdate,
    changeLocale,
    checkUpdates
  };
}

export type AppBootstrapController = ReturnType<typeof useAppBootstrapState>;
