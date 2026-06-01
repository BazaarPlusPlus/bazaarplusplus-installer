import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import {
  useAppBootstrapState,
  type AppBootstrapController
} from './useAppBootstrap';

const AppBootstrapContext = createContext<AppBootstrapController | null>(null);

export function AppBootstrapProvider({ children }: { children: ReactNode }) {
  const app = useAppBootstrapState();
  return (
    <AppBootstrapContext.Provider value={app}>
      {children}
    </AppBootstrapContext.Provider>
  );
}

export function useAppBootstrap() {
  const app = useContext(AppBootstrapContext);
  if (!app) {
    throw new Error(
      'useAppBootstrap must be used inside AppBootstrapProvider.'
    );
  }
  return app;
}
