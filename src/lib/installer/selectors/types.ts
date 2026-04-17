import type { MessageKey } from '../../i18n.ts';

export type PendingSteamAction = 'install' | 'uninstall' | null;
export type IdentityLoadState = 'idle' | 'loading';
export type IdentityActionBusy =
  | 'idle'
  | 'activating'
  | 'logging_in'
  | 'logging_out';
export type LocalizedText = (zh: string, en: string) => string;
export type TranslateText = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string;
