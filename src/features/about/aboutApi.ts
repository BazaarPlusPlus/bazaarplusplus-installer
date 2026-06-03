import { check } from '@tauri-apps/plugin-updater';
import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type { AppBootstrap } from '../../types/backend';

export const fallbackBootstrap: AppBootstrap = {
  app_version: '4.0.0',
  bundled_bpp_version: null,
  links: {
    github: 'https://github.com/cauyxy/BazaarPlusPlus',
    x: 'https://x.com/yxinyu715',
    bilibili_project: 'https://space.bilibili.com/3546978457750467',
    bilibili_author: 'https://space.bilibili.com/1564408396',
    xiaohongshu: '#',
    kofi: 'https://ko-fi.com/cauyxy',
    supporter_list: 'https://bazaarplusplus.com/support'
  },
  credits: [
    { name: 'cauyxy', role: 'AUTHOR' },
    { name: 'Trae', role: 'CO-CREATOR' },
    { name: 'Codex', role: 'CO-CREATOR' },
    { name: 'Claude Code', role: 'CO-CREATOR' }
  ],
  licenses: [
    { name: 'BepInEx', license: 'LGPL-2.1', category: 'runtime' },
    { name: 'React', license: 'MIT', category: 'frontend' },
    { name: 'Tauri', license: 'MIT', category: 'backend' },
    { name: 'Tailwind CSS', license: 'MIT', category: 'frontend' }
  ]
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
