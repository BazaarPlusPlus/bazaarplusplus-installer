import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AppBootstrapController } from '../features/about/useAppBootstrap';
import { UpdaterProvider } from '../features/about/UpdaterProvider';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { ShellHeader } from './ShellHeader';

const app: AppBootstrapController = {
  bootstrap: {
    app_version: '4.4.0',
    bundled_bpp_version: '4.4.0',
    links: {
      github: 'https://example.com/github',
      x: 'https://example.com/x',
      bilibili_project: 'https://example.com/bilibili-project',
      bilibili_author: 'https://example.com/bilibili-author',
      xiaohongshu: 'https://example.com/xiaohongshu',
      kofi: 'https://example.com/kofi',
      supporter_list: 'https://example.com/supporters'
    },
    credits: [],
    licenses: []
  }
};

function renderOpenHeader() {
  return renderToStaticMarkup(
    <LocaleProvider>
      <UpdaterProvider>
        <ShellHeader
          app={app}
          showBilibili
          onToggleBilibili={() => undefined}
          showSupport={false}
          onToggleSupport={() => undefined}
          onOpenPayment={() => undefined}
          onCloseBilibili={() => undefined}
          onCloseSupport={() => undefined}
        />
      </UpdaterProvider>
    </LocaleProvider>
  );
}

describe('ShellHeader', () => {
  it('shows the brand logo and language icon without an update check', () => {
    const html = renderOpenHeader();

    expect(html).not.toContain('检查更新');
    expect(html).toContain('lucide-languages');
    expect(html).toContain('bpp-brand-logo');
  });

  it('shows the author entry before the project entry', () => {
    const html = renderOpenHeader();

    const authorHrefIndex = html.indexOf('https://example.com/bilibili-author');
    const projectHrefIndex = html.indexOf(
      'https://example.com/bilibili-project'
    );
    const authorIndex = html.indexOf('仓鼠小猫', authorHrefIndex);
    const authorSubtitleIndex = html.indexOf('BazaarLine 作者', authorIndex);
    const projectIndex = html.indexOf('BazaarPlusPlus', projectHrefIndex);
    const projectSubtitleIndex = html.indexOf(
      '教程、演示和项目内容',
      projectIndex
    );

    expect(authorHrefIndex).toBeGreaterThanOrEqual(0);
    expect(projectHrefIndex).toBeGreaterThanOrEqual(0);
    expect(authorIndex).toBeGreaterThanOrEqual(0);
    expect(authorSubtitleIndex).toBeGreaterThan(authorIndex);
    expect(authorHrefIndex).toBeLessThan(projectHrefIndex);
    expect(authorIndex).toBeLessThan(projectIndex);
    expect(authorSubtitleIndex).toBeLessThan(projectIndex);
    expect(projectSubtitleIndex).toBeGreaterThan(projectIndex);
  });
});
