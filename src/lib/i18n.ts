export type Locale = 'en' | 'zh';

export type MessageKey =
  | 'htmlLang'
  | 'pageTitle'
  | 'kicker'
  | 'subtitle'
  | 'stepBpp'
  | 'stepBazaar'
  | 'stepActions'
  | 'statusChecking'
  | 'statusNotInstalled'
  | 'detectInstalledHint'
  | 'statusFound'
  | 'actionReenter'
  | 'actionBrowse'
  | 'placeholderGamePath'
  | 'actionCheck'
  | 'errorGamePath'
  | 'actionInstalling'
  | 'actionReinstall'
  | 'actionInstall'
  | 'actionUninstalling'
  | 'actionUninstall'
  | 'footer'
  | 'aboutTitle'
  | 'aboutBack'
  | 'aboutOpenSource'
  | 'aboutInspiredBy'
  | 'aboutDependencies'
  | 'aboutDataSources'
  | 'aboutInfo'
  | 'aboutAuthors'
  | 'aboutAuthorRole'
  | 'aboutCocreatorRole'
  | 'aboutSupport'
  | 'runtimeDownload'
  | 'launchOptionsWarningTitle'
  | 'launchOptionsWarningBody'
  | 'actionClose'
  | 'gameQuitTitle'
  | 'gameQuitBody'
  | 'actionGameClosed'
  | 'steamQuitTitle'
  | 'steamQuitBody'
  | 'actionQuitSteam';

export const defaultLocale: Locale = 'zh';

export const messages: Record<Locale, Record<MessageKey, string>> = {
  en: {
    htmlLang: 'en',
    pageTitle: 'BazaarPlusPlus Installer',
    kicker: 'Born of Passion',
    subtitle: 'Mod Installation',
    stepBpp: 'BazaarPlusPlus',
    stepBazaar: 'The Bazaar',
    stepActions: 'Actions',
    statusChecking: 'Checking...',
    statusNotInstalled: 'Not installed',
    detectInstalledHint:
      'Run detection to inspect the installed BazaarPlusPlus version.',
    statusFound: 'Found',
    actionReenter: 'Choose again',
    actionBrowse: 'Browse',
    placeholderGamePath: 'Game install path...',
    actionCheck: 'Check',
    errorGamePath:
      'The Bazaar was not found in this folder. Verify the install path.',
    actionInstalling: 'Installing...',
    actionReinstall: 'Reinstall',
    actionInstall: 'Install',
    actionUninstalling: 'Uninstalling...',
    actionUninstall: 'Uninstall',
    footer: 'BazaarPlusPlus · Born of Passion',
    aboutTitle: 'About',
    aboutBack: 'Back',
    aboutOpenSource: 'Open Source Software',
    aboutInspiredBy: 'Inspired By',
    aboutDependencies: 'Dependencies',
    aboutDataSources: 'Data Sources',
    aboutInfo: 'Information',
    aboutAuthors: 'Authors',
    aboutAuthorRole: 'Author',
    aboutCocreatorRole: 'Co-creator',
    aboutSupport: 'Support',
    runtimeDownload: 'Download .NET',
    launchOptionsWarningTitle: 'Steam Launch Option Check',
    launchOptionsWarningBody:
      'BazaarPlusPlus finished installing, but the installer could not confirm that Steam saved the new launch options. Please reopen Steam and verify the game launch command if the mod does not start.',
    actionClose: 'Close',
    gameQuitTitle: 'Close The Bazaar First',
    gameQuitBody:
      'The Bazaar is still running. Close the game completely, then continue once it is no longer open.',
    actionGameClosed: 'I Closed the Game',
    steamQuitTitle: 'Close Steam First',
    steamQuitBody:
      'Steam is still running. BazaarPlusPlus needs Steam to close before it updates the game launch options. Continue and let the installer close Steam for you.',
    actionQuitSteam: 'Close Steam'
  },
  zh: {
    htmlLang: 'zh-CN',
    pageTitle: 'BazaarPlusPlus 安装器',
    kicker: '因热爱而生',
    subtitle: '模组安装',
    stepBpp: 'BazaarPlusPlus',
    stepBazaar: 'The Bazaar',
    stepActions: '操作',
    statusChecking: '检查中...',
    statusNotInstalled: '未安装',
    detectInstalledHint: '点击检测以查看当前已安装的 BazaarPlusPlus 版本。',
    statusFound: '已找到',
    actionReenter: '重新选择',
    actionBrowse: '浏览',
    placeholderGamePath: '游戏安装路径...',
    actionCheck: '检查',
    errorGamePath: '该目录中未找到 The Bazaar，请确认安装路径是否正确。',
    actionInstalling: '安装中...',
    actionReinstall: '重新安装',
    actionInstall: '安装',
    actionUninstalling: '卸载中...',
    actionUninstall: '卸载',
    footer: 'BazaarPlusPlus · 因热爱而生',
    aboutTitle: '关于',
    aboutBack: '返回',
    aboutOpenSource: '开源软件',
    aboutInspiredBy: '灵感来源',
    aboutDependencies: '依赖项目',
    aboutDataSources: '数据来源',
    aboutInfo: '信息',
    aboutAuthors: '作者',
    aboutAuthorRole: '作者',
    aboutCocreatorRole: '联创',
    aboutSupport: '支持我们',
    runtimeDownload: '下载 .NET',
    launchOptionsWarningTitle: 'Steam 启动项检查',
    launchOptionsWarningBody:
      'BazaarPlusPlus 已完成安装，但安装器无法确认 Steam 已正确保存新的启动项。如果模组没有生效，请重新打开 Steam 后检查游戏启动命令。',
    actionClose: '关闭',
    gameQuitTitle: '请先关闭 The Bazaar',
    gameQuitBody:
      '检测到 The Bazaar 当前仍在运行。请先完全关闭游戏，确认已经退出后再继续安装。',
    actionGameClosed: '已关闭游戏',
    steamQuitTitle: '请先关闭 Steam',
    steamQuitBody:
      'Steam 当前仍在运行。BazaarPlusPlus 需要先关闭 Steam，才能安全更新游戏启动项。继续后，安装器会尝试为你关闭 Steam。',
    actionQuitSteam: '关闭 Steam'
  }
};

export function resolveInitialLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const saved = window.localStorage.getItem('locale');
  if (saved === 'en' || saved === 'zh') {
    return saved;
  }

  return defaultLocale;
}

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  let text = messages[locale][key];
  if (!params) {
    return text;
  }

  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }

  return text;
}
