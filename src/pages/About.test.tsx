import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AppBootstrapSnapshot } from '../features/about/appBootstrap';
import { createUiProblem } from '../features/shared/problems';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { AppBootstrap } from '../types/backend';
import {
  AboutCheckUpdateButton,
  AboutView,
  type AboutCheckUpdateProps
} from './About';

const fallback: AppBootstrap = {
  app_version: '4.5.0',
  bundled_bpp_version: null,
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

function render(
  resource: AppBootstrapSnapshot,
  checkUpdate?: AboutCheckUpdateProps
) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <AboutView
        resource={resource}
        onRetry={() => undefined}
        checkUpdate={checkUpdate}
      />
    </LocaleProvider>
  );
}

describe('About bootstrap feedback', () => {
  it('announces loading while keeping packaged version data readable', () => {
    const html = render({
      phase: 'initial-loading',
      data: fallback,
      source: 'packaged-fallback',
      unavailableFields: ['bundled_bpp_version'],
      problem: null,
      retrying: false
    });

    expect(html).toContain('role="status"');
    expect(html).toContain('正在获取本机应用信息');
    expect(html).toContain('aria-label="应用 4.5.0"');
    expect(html).toContain('应用内置备用数据');
    expect(html).toContain('不可用字段');
    expect(html).toContain('selectable');
  });

  it('renders retry and optional diagnostics as accessible native controls', () => {
    const html = render({
      phase: 'fallback',
      data: fallback,
      source: 'packaged-fallback',
      unavailableFields: ['bundled_bpp_version'],
      problem: createUiProblem('about_bootstrap_failed', {
        params: { operation: 'load_bootstrap' },
        diagnostic: 'IPC unavailable'
      }),
      retrying: false
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain('<button type="button"');
    expect(html).toContain('>重试</span>');
    expect(html).toContain('<details');
    expect(html).toContain('IPC unavailable');
    expect(html).toContain('aria-label="插件 不可用"');
  });

  it('uses distinct Credits and contributor heading levels', () => {
    const html = render({
      phase: 'authoritative',
      data: {
        ...fallback,
        credits: [
          {
            name: 'Team Member',
            role: 'AUTHOR',
            href: null,
            group: 'team'
          },
          {
            name: 'Data Source',
            role: 'GAMEDATA SOURCE',
            href: null,
            group: 'acknowledgement'
          }
        ]
      },
      source: 'native',
      unavailableFields: [],
      problem: null,
      retrying: false
    });

    expect(html.match(/>致谢<\/h[34]>/g)).toHaveLength(1);
    expect(html).toContain('>贡献者</h4>');
    expect(html).toContain('>数据与灵感</h4>');
    expect(html).toContain('AUTHOR');
    expect(html).toContain('GAMEDATA SOURCE');
  });

  it('offers check-update on the version surface and disables while checking', () => {
    let checkCount = 0;
    const onCheckUpdate = () => {
      checkCount += 1;
    };
    const resource: AppBootstrapSnapshot = {
      phase: 'authoritative',
      data: fallback,
      source: 'native',
      unavailableFields: [],
      problem: null,
      retrying: false
    };

    const idle = render(resource, { phase: 'idle', onCheckUpdate });
    expect(idle).toContain('检查更新');
    expect(idle).not.toContain('aria-busy="true"');

    // Same intent the About route passes from useUpdater().checkNow.
    onCheckUpdate();
    expect(checkCount).toBe(1);

    const checking = render(resource, { phase: 'checking', onCheckUpdate });
    expect(checking).toContain('检查中');
    expect(checking).toContain('disabled');
    expect(checking).toContain('aria-busy="true"');

    const buttonIdle = renderToStaticMarkup(
      <LocaleProvider>
        <AboutCheckUpdateButton phase="idle" onCheckUpdate={onCheckUpdate} />
      </LocaleProvider>
    );
    expect(buttonIdle).toContain('type="button"');
    expect(buttonIdle).toContain('检查更新');
  });
});
