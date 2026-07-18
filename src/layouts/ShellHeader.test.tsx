import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AppBootstrapController } from '../features/about/useAppBootstrap';
import { UpdaterProvider } from '../features/about/UpdaterProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { ShellHeader } from './ShellHeader';

const bootstrap: AppBootstrapController['bootstrap'] = {
  app_version: '4.4.0',
  bundled_bpp_version: '4.4.0',
  links: {
    github: 'https://example.com/github',
    x: 'https://example.com/x',
    bilibili_project: 'https://example.com/bilibili-project',
    bilibili_author: 'https://example.com/bilibili-author',
    bilibili_core_dev: 'https://example.com/bilibili-core-dev',
    xiaohongshu: 'https://example.com/xiaohongshu',
    kofi: 'https://example.com/kofi',
    supporter_list: 'https://example.com/supporters'
  },
  credits: [],
  licenses: []
};

const app: AppBootstrapController = {
  bootstrap,
  resource: {
    phase: 'authoritative',
    data: bootstrap,
    source: 'native',
    unavailableFields: [],
    problem: null,
    retrying: false
  },
  retry: () => undefined
};

function renderHeader({
  showBilibili = false,
  showSupport = false
}: {
  showBilibili?: boolean;
  showSupport?: boolean;
} = {}) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <UpdaterProvider>
        <ShellHeader
          app={app}
          showBilibili={showBilibili}
          onToggleBilibili={() => undefined}
          showSupport={showSupport}
          onToggleSupport={() => undefined}
          onOpenPayment={() => undefined}
          onCloseBilibili={() => undefined}
          onCloseSupport={() => undefined}
        />
      </UpdaterProvider>
    </LocaleProvider>
  );
}

describe('ShellHeader Bilibili menu', () => {
  it('shows the author, CoreDev, and project entries in order', () => {
    const html = renderHeader({ showBilibili: true });

    const authorHrefIndex = html.indexOf('https://example.com/bilibili-author');
    const coreDevHrefIndex = html.indexOf(
      'https://example.com/bilibili-core-dev'
    );
    const projectHrefIndex = html.indexOf(
      'https://example.com/bilibili-project'
    );
    const authorIndex = html.indexOf('仓鼠小猫', authorHrefIndex);
    const authorSubtitleIndex = html.indexOf('BazaarLine 作者', authorIndex);
    const coreDevIndex = html.indexOf('hisenser', coreDevHrefIndex);
    const coreDevSubtitleIndex = html.indexOf('CoreDev', coreDevIndex);
    const projectIndex = html.indexOf('BazaarPlusPlus', projectHrefIndex);
    const projectSubtitleIndex = html.indexOf(
      '教程、演示和项目内容',
      projectIndex
    );

    expect(authorHrefIndex).toBeGreaterThanOrEqual(0);
    expect(coreDevHrefIndex).toBeGreaterThanOrEqual(0);
    expect(projectHrefIndex).toBeGreaterThanOrEqual(0);
    expect(authorIndex).toBeGreaterThanOrEqual(0);
    expect(authorSubtitleIndex).toBeGreaterThan(authorIndex);
    expect(coreDevIndex).toBeGreaterThanOrEqual(0);
    expect(coreDevSubtitleIndex).toBeGreaterThan(coreDevIndex);
    expect(authorHrefIndex).toBeLessThan(coreDevHrefIndex);
    expect(coreDevHrefIndex).toBeLessThan(projectHrefIndex);
    expect(authorIndex).toBeLessThan(coreDevIndex);
    expect(authorSubtitleIndex).toBeLessThan(coreDevIndex);
    expect(coreDevSubtitleIndex).toBeLessThan(projectIndex);
    expect(projectSubtitleIndex).toBeGreaterThan(projectIndex);
  });

  it('exposes controlled keyboard-operable disclosure semantics', () => {
    const closed = renderHeader();
    const bilibiliOpen = renderHeader({ showBilibili: true });
    const supportOpen = renderHeader({ showSupport: true });

    expect(closed).toContain('aria-controls="shell-bilibili-menu"');
    expect(closed).toContain('aria-controls="shell-support-menu"');
    expect(closed.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(bilibiliOpen).toContain('id="shell-bilibili-menu"');
    expect(bilibiliOpen).toContain('aria-expanded="true"');
    expect(supportOpen).toContain('id="shell-support-menu"');
    expect(supportOpen).toContain('aria-expanded="true"');
  });
});
