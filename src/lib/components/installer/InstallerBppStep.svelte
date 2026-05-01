<script lang="ts">
  import { messages } from '$lib/i18n';
  import { locale } from '$lib/locale';
  import type { EnvironmentInfo } from '$lib/types';
  import type { ActionBusy } from '$lib/installer/state';

  export let env: EnvironmentInfo | null;
  export let modInstalled: boolean;
  export let versionMismatch: boolean;
  export let bundledBppVersion: string | null;
  export let installedBppVersion: string | null;
  export let actionBusy: ActionBusy;
  export let t: (
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ) => string;
</script>

<div
  class="step"
  class:step-found={modInstalled && !versionMismatch}
  class:step-error={versionMismatch}
>
  <div class="step-index" aria-hidden="true">I</div>
  <div class="step-body">
    <span class="step-title">
      {t('stepBpp')}
      {#if versionMismatch}
        <span class="tag tag-danger"
          >{$locale === 'zh' ? '版本不一致' : 'Version mismatch'}</span
        >
      {:else if actionBusy === 'detect'}
        <span class="tag">{t('statusChecking')}</span>
      {:else if !modInstalled}
        <span class="tag tag-warn">{t('statusNotInstalled')}</span>
      {/if}
    </span>
    {#if versionMismatch}
      <div class="mismatch-summary">
        <p class="detail-line detail-muted">
          {$locale === 'zh'
            ? '已安装版本和安装器版本不同，建议重新安装'
            : 'The installed version differs from the bundled one. Check what changed before reinstalling.'}
        </p>
      </div>
      <div class="mismatch-versions">
        <span class="mismatch-version">
          <span class="mismatch-version-label"
            >{$locale === 'zh' ? '本地已安装' : 'Installed'}</span
          >
          <span class="mismatch-version-value">v{installedBppVersion}</span>
        </span>
        <span class="mismatch-version">
          <span class="mismatch-version-label"
            >{$locale === 'zh' ? '安装器版本' : 'Installer bundle'}</span
          >
          <span class="mismatch-version-value">v{bundledBppVersion}</span>
        </span>
      </div>
    {:else if modInstalled}
      <div class="mismatch-versions">
        <span class="mismatch-version mismatch-version-ok">
          <span class="mismatch-version-label"
            >{$locale === 'zh' ? '本地已安装' : 'Installed'}</span
          >
          <span class="mismatch-version-value">v{env?.bpp_version}</span>
        </span>
      </div>
      <p class="detail-line detail-muted">
        {$locale === 'zh'
          ? 'BazaarPlusPlus 当前已处于最新状态'
          : 'BazaarPlusPlus is already up to date'}
      </p>
    {:else}
      <p class="detail-line detail-muted">{t('detectInstalledHint')}</p>
    {/if}
  </div>
</div>

<style>
  .mismatch-summary {
    display: flex;
    gap: 0.55rem;
  }

  .mismatch-versions {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
    align-items: flex-start;
  }

  .mismatch-version {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.28rem 0.48rem;
    border: 1px solid rgba(191, 104, 81, 0.14);
    border-radius: 999px;
    background: rgba(191, 104, 81, 0.06);
  }

  .mismatch-version-ok {
    border-color: rgba(80, 180, 120, 0.24);
    background: rgba(80, 180, 120, 0.1);
    box-shadow: 0 0 0 1px rgba(80, 180, 120, 0.04) inset;
  }

  .mismatch-version-label {
    color: rgba(214, 182, 126, 0.62);
    font-size: 0.63rem;
    white-space: nowrap;
  }

  .mismatch-version-ok .mismatch-version-label {
    color: rgba(156, 214, 179, 0.78);
  }

  .mismatch-version-value {
    color: rgba(235, 223, 198, 0.86);
    font-family: 'Fira Code', monospace;
    font-size: 0.66rem;
    white-space: nowrap;
  }

  .mismatch-version-ok .mismatch-version-value {
    color: rgba(216, 244, 228, 0.92);
  }
</style>
