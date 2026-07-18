import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { UpdaterController } from '../features/about/useUpdater';
import type { UpdaterSnapshot } from '../features/about/updater';
import { getUpdaterUiContract } from '../features/about/updaterPresentation';
import { updaterProblemFromError } from '../features/about/updaterProblems';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { ShellUpdateModal } from './ShellUpdateModal';

function controller(snapshot: UpdaterSnapshot): UpdaterController {
  return {
    ...snapshot,
    checkNow: () => undefined,
    install: () => undefined,
    restart: () => undefined,
    dismiss: () => undefined
  };
}

function renderModal(snapshot: UpdaterSnapshot): string {
  const presentation = getUpdaterUiContract(snapshot).modal;
  if (!presentation) throw new Error('test snapshot must render a modal');
  return renderToStaticMarkup(
    <LocaleProvider>
      <ShellUpdateModal
        updater={controller(snapshot)}
        presentation={presentation}
      />
    </LocaleProvider>
  );
}

describe('ShellUpdateModal', () => {
  it('exposes determinate progress value, minimum, maximum, label, and status', () => {
    const mib = 1024 * 1024;
    const html = renderModal({
      phase: 'downloading',
      version: '5.1.0',
      notes: '',
      progress: { downloaded: 25 * mib, total: 100 * mib },
      problem: null
    });

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="更新下载进度"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain(`aria-valuemax="${100 * mib}"`);
    expect(html).toContain(`aria-valuenow="${25 * mib}"`);
    expect(html).toContain('role="status"');
    expect(html).toContain('已下载 25.0 / 100.0 MB（25%）');
    expect(html).not.toContain('稍后');
  });

  it('announces indeterminate downloaded bytes without inventing a maximum', () => {
    const html = renderModal({
      phase: 'downloading',
      version: '5.1.0',
      notes: '',
      progress: { downloaded: 2 * 1024 * 1024, total: null },
      problem: null
    });

    expect(html).not.toContain('aria-valuemax');
    expect(html).not.toContain('aria-valuenow');
    expect(html).toContain('aria-valuetext="已下载 2.0 MB"');
  });

  it('shows restart recovery, retry, and optional diagnostics after install succeeded', () => {
    const html = renderModal({
      phase: 'failed',
      version: '5.1.0',
      notes: '',
      progress: null,
      problem: updaterProblemFromError(
        new Error('native relaunch detail'),
        'restart',
        '5.1.0'
      )
    });

    expect(html).toContain('更新已安装，需要手动重启');
    expect(html).toContain(
      '自动重启失败，但 BazaarPlusPlus 5.1.0 已安装完成。请退出 BazaarPlusPlus Installer，再从“应用程序”中重新打开。'
    );
    expect(html).toContain('再次尝试重启');
    expect(html).toContain('查看诊断信息');
    expect(html).toContain('native relaunch detail');
  });
});
