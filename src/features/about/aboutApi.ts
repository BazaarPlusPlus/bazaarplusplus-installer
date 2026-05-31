import { check } from '@tauri-apps/plugin-updater';
import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type { AppBootstrap } from '../../types/backend';

export const fallbackBootstrap: AppBootstrap = {
  app_version: '4.0.0',
  bundled_bpp_version: null,
  locale: 'zh',
  links: {
    github: 'https://github.com/cauyxy/BazaarPlusPlus',
    bilibili: 'https://space.bilibili.com/3546978457750467',
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

export async function setAppLocale(locale: 'zh' | 'en') {
  if (!hasTauriRuntime()) {
    return { locale };
  }

  return invokeCommand('set_app_locale', { locale });
}

export async function checkForUpdate() {
  if (!hasTauriRuntime()) {
    return '当前为浏览器预览环境';
  }

  const update = await check();
  return update ? `发现新版本 ${update.version}` : '当前已是最新版本';
}
