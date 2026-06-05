import { check } from '@tauri-apps/plugin-updater';
import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type { AppBootstrap } from '../../types/backend';
import bootstrapResource from '../../../src-tauri/resources/app-bootstrap.json';

export const fallbackBootstrap: AppBootstrap = {
  ...(bootstrapResource as Pick<
    AppBootstrap,
    'links' | 'credits' | 'licenses'
  >),
  app_version: __FRONTEND_VERSION__,
  bundled_bpp_version: null
};

export async function loadAppBootstrap() {
  if (!hasTauriRuntime()) {
    return fallbackBootstrap;
  }

  return invokeCommand('get_app_bootstrap');
}

export type UpdateCheckResult =
  | { status: 'preview' }
  | { status: 'available'; version: string }
  | { status: 'current' };

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (!hasTauriRuntime()) {
    return { status: 'preview' };
  }

  const update = await check();
  return update
    ? { status: 'available', version: update.version }
    : { status: 'current' };
}
