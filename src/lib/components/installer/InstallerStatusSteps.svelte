<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { messages } from '$lib/i18n';
  import { locale } from '$lib/locale';
  import type { EnvironmentInfo } from '$lib/types';
  import type { StepState } from '$lib/installer/state';

  export let env: EnvironmentInfo | null;
  export let dotnetState: StepState;
  export let modInstalled: boolean;
  export let versionMismatch: boolean;
  export let bundledBppVersion: string | null;
  export let installedBppVersion: string | null;
  export let bazaarFound: boolean;
  export let bazaarChecking: boolean;
  export let bazaarInvalid: boolean;
  export let customGamePath: string;
  export let hasPath: boolean;
  export let isBusy: boolean;
  export let actionBusy: 'idle' | 'detect' | 'install' | 'uninstall';
  export let canInstall: boolean;
  export let canLaunchGame: boolean;
  export let dotnetDownloadUrl: string;
  export let effectiveGamePath: string;
  export let t: (key: keyof typeof messages.en, params?: Record<string, string | number>) => string;
  export let onPickGamePath: () => void | Promise<void>;
  export let onCheckPath: () => void | Promise<void>;
  export let onDetectEnvironment: () => void | Promise<void>;
  export let onRequestInstall: () => void | Promise<void>;
  export let onUninstall: () => void | Promise<void>;
  export let onLaunchGame: () => void | Promise<void>;
  export let onResetBazaar: () => void | Promise<void>;
  export let onCustomGamePathInput: () => void;

  let actionMenuOpen = false;

  function toggleActionMenu() {
    actionMenuOpen = !actionMenuOpen;
  }

  async function handleUninstall() {
    actionMenuOpen = false;
    await onUninstall();
  }
</script>

<div class="steps">
  <div class="step" class:step-found={modInstalled && !versionMismatch} class:step-error={versionMismatch}>
    <div class="step-index" aria-hidden="true">I</div>
    <div class="step-body step-body-bpp">
      <div class="step-bpp-content">
        <span class="step-title">
          {t('stepBpp')}
          {#if versionMismatch}
            <span class="tag tag-danger">{$locale === 'zh' ? '版本不一致' : 'Version mismatch'}</span>
          {:else if modInstalled}
            <span class="tag tag-ok">{t('statusInstalled')}{env?.bpp_version ? ` · v${env.bpp_version}` : ''}</span>
          {:else if actionBusy === 'detect'}
            <span class="tag">{t('statusChecking')}</span>
          {:else}
            <span class="tag tag-warn">{t('statusNotInstalled')}</span>
          {/if}
        </span>
        {#if versionMismatch}
          <div class="mismatch-summary">
            <p class="detail-line detail-muted">
              {$locale === 'zh'
                ? '已安装版本和安装器内置版本不同，建议重新安装前先看一下本次更新内容。'
                : 'The installed version differs from the bundled one. Check what changed before reinstalling.'}
            </p>
            <a class="mismatch-link" href="/whats-new">
              {$locale === 'zh' ? '查看更新内容' : "View what's new"}
            </a>
          </div>
          <div class="mismatch-versions">
            <span class="mismatch-version">
              <span class="mismatch-version-label">{$locale === 'zh' ? '已安装' : 'Installed'}</span>
              <span class="mismatch-version-value">v{installedBppVersion}</span>
            </span>
            <span class="mismatch-version">
              <span class="mismatch-version-label">{$locale === 'zh' ? '安装器内置' : 'Installer bundle'}</span>
              <span class="mismatch-version-value">v{bundledBppVersion}</span>
            </span>
          </div>
        {:else if modInstalled}
          <p class="detail-line detail-muted">{t('modInstalledHint')}</p>
          {#if bundledBppVersion}
            <p class="detail-line detail-faint">
              {$locale === 'zh' ? '安装器内置版本' : 'Installer bundle'}: v{bundledBppVersion}
            </p>
          {/if}
        {:else}
          <p class="detail-line detail-muted">{t('detectInstalledHint')}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="step" class:step-found={dotnetState === 'found'} class:step-warn={dotnetState === 'not_found'}>
    <div class="step-index" aria-hidden="true">II</div>
    <div class="step-body">
      <span class="step-title">
        {t('stepDotnet')}
        {#if dotnetState === 'found'}
          <span class="tag tag-ok">{env?.dotnet_version ?? 'OK'}</span>
        {:else if dotnetState === 'not_found'}
          <span class="tag tag-warn">{t('statusRuntimeMissing')}</span>
        {/if}
      </span>

      {#if dotnetState === 'found'}
        <p class="detail-line detail-muted">{t('runtimeCompatible')}</p>
      {:else if dotnetState === 'not_found'}
        <p class="detail-line detail-muted">{t('runtimeNotFound')}</p>
        <button class="dotnet-download-btn" onclick={() => openUrl(dotnetDownloadUrl)} type="button">
          {t('runtimeDownload')}
        </button>
      {:else if dotnetState === 'idle'}
        <p class="detail-line detail-muted">{t('runtimeIdle')}</p>
      {/if}
    </div>
  </div>

  <div class="step" class:step-found={bazaarFound}>
    <div class="step-index" aria-hidden="true">III</div>
    <div class="step-body">
      <span class="step-title">
        {t('stepBazaar')}
        {#if bazaarFound}
          <span class="tag tag-ok">{t('statusFound')}</span>
        {/if}
      </span>

      {#if bazaarFound}
        <p class="detail-line detail-path" title={effectiveGamePath}>{effectiveGamePath}</p>
        <button class="redetect-btn" onclick={onResetBazaar} type="button">{t('actionReenter')}</button>
      {:else}
        <div class="locate-bar" class:locate-bar-invalid={bazaarInvalid}>
          <button class="locate-browse" onclick={onPickGamePath} type="button" disabled={bazaarChecking}>
            {t('actionBrowse')}
          </button>
          <div class="locate-input-wrap">
            <input
              bind:value={customGamePath}
              class="path-input"
              placeholder={t('placeholderGamePath')}
              type="text"
              spellcheck="false"
              onkeydown={(e) => e.key === 'Enter' && onCheckPath()}
              oninput={onCustomGamePathInput}
            />
          </div>
          <button
            class="locate-confirm"
            onclick={onCheckPath}
            type="button"
            disabled={!hasPath || bazaarChecking}
          >
            {#if bazaarChecking}
              <span class="spinner" aria-hidden="true"></span>
            {:else}
              {t('actionCheck')}
            {/if}
          </button>
        </div>
        {#if bazaarInvalid}
          <p class="locate-error">{t('errorGamePath')}</p>
        {/if}
      {/if}
    </div>
  </div>

  <div class="step step-install">
    <div class="step-index" aria-hidden="true">IV</div>
    <div class="step-body">
      <span class="step-title">{t('stepActions')}</span>
      <div class="action-row">
        <button class="secondary-btn detect-btn" onclick={onDetectEnvironment} type="button" disabled={isBusy}>
          {#if actionBusy === 'detect'}
            <span class="spinner" aria-hidden="true"></span>
            {t('actionDetecting')}
          {:else}
            {t('actionDetect')}
          {/if}
        </button>

        <div class="action-primary">
          <button class="install-btn" class:install-btn-danger={versionMismatch} disabled={!canInstall} onclick={onRequestInstall} type="button">
            {#if actionBusy === 'install'}
              <span class="spinner dark" aria-hidden="true"></span>
              {t('actionInstalling')}
            {:else if versionMismatch}
              {$locale === 'zh' ? '⚠ 需要重新安装' : '⚠ Reinstall Required'}
            {:else if modInstalled}
              ✦ {t('actionReinstall')}
            {:else}
              ✦ {t('actionInstall')}
            {/if}
          </button>
          <div class="menu-wrap">
            <button
              class="secondary-btn menu-trigger"
              type="button"
              onclick={toggleActionMenu}
              disabled={isBusy}
              aria-expanded={actionMenuOpen}
            >
              ...
            </button>
            {#if actionMenuOpen}
              <div class="action-menu">
                <button class="menu-item" type="button" onclick={handleUninstall} disabled={isBusy}>
                  {#if actionBusy === 'uninstall'}
                    {t('actionUninstalling')}
                  {:else}
                    {t('actionUninstall')}
                  {/if}
                </button>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <button class="secondary-btn launch-btn" type="button" onclick={onLaunchGame} disabled={!canLaunchGame}>
        {$locale === 'zh' ? '启动游戏' : 'Launch Game'}
      </button>
    </div>
  </div>
</div>

<style>
  .steps {
    display: grid;
    gap: 0.5rem;
  }

  .step {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    padding: 0.95rem 1.05rem;
    background: rgba(18, 11, 5, 0.88);
    border: 1px solid rgba(180, 130, 48, 0.13);
    border-radius: 3px;
    box-shadow: 0 6px 28px rgba(0,0,0,0.35);
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .step-found {
    border-color: rgba(90, 200, 130, 0.25);
    box-shadow: 0 6px 28px rgba(0,0,0,0.35), 0 0 18px rgba(90, 200, 130, 0.05);
  }

  .step-warn {
    border-color: rgba(205, 150, 60, 0.3);
  }

  .step-error {
    border-color: rgba(196, 98, 76, 0.28);
    box-shadow: 0 6px 28px rgba(0,0,0,0.35), 0 0 14px rgba(196, 98, 76, 0.04);
  }

  .step-install {
    margin-top: 0.2rem;
  }

  .step-index {
    font-family: 'Cinzel', serif;
    font-size: 0.55rem;
    letter-spacing: 0.15em;
    color: rgba(200, 148, 55, 0.4);
    padding-top: 0.25rem;
    flex-shrink: 0;
    width: 1.4rem;
    text-align: center;
  }

  .step-body {
    flex: 1;
    display: grid;
    gap: 0.7rem;
    min-width: 0;
    overflow: visible;
  }

  .step-body-bpp {
    display: flex;
    align-items: stretch;
    gap: 1.1rem;
  }

  .step-bpp-content {
    flex: 1;
    display: grid;
    gap: 0.7rem;
    min-width: 0;
  }

  .step-title {
    font-family: 'Cinzel', serif;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(220, 195, 145, 0.8);
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-width: 0;
  }

  .tag {
    font-family: 'Fira Code', monospace;
    font-size: 0.65rem;
    letter-spacing: 0;
    text-transform: none;
    padding: 0.18rem 0.55rem;
    border-radius: 2px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-ok   { background: rgba(80, 180, 120, 0.15); color: #6dd9a0; border: 1px solid rgba(80, 180, 120, 0.25); }
  .tag-warn { background: rgba(200, 140, 50, 0.12); color: #c4923a; border: 1px solid rgba(200, 140, 50, 0.22); }
  .tag-danger { background: rgba(191, 104, 81, 0.1); color: #f0b2a2; border: 1px solid rgba(191, 104, 81, 0.2); }

  .detail-line {
    margin: 0;
    min-width: 0;
  }

  .detail-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: text;
    font-family: 'Fira Code', monospace;
    font-size: 0.73rem;
    color: rgba(228, 216, 191, 0.82);
  }

  .detail-muted {
    font-size: 0.8rem;
    color: rgba(200, 170, 120, 0.6);
  }

  .detail-faint {
    font-size: 0.74rem;
    color: rgba(180, 150, 110, 0.48);
  }

  .mismatch-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem 0.85rem;
  }

  .mismatch-link {
    flex-shrink: 0;
    color: rgba(223, 184, 115, 0.86);
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-decoration: none;
    white-space: nowrap;
  }

  .mismatch-link:hover {
    color: rgba(240, 211, 152, 0.96);
  }

  .mismatch-link:focus-visible {
    outline: 2px solid rgba(255, 214, 140, 0.9);
    outline-offset: 2px;
  }

  .mismatch-versions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .mismatch-version {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
    padding: 0.32rem 0.52rem;
    border: 1px solid rgba(191, 104, 81, 0.14);
    border-radius: 999px;
    background: rgba(191, 104, 81, 0.06);
  }

  .mismatch-version-label {
    color: rgba(214, 182, 126, 0.62);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  .mismatch-version-value {
    color: rgba(235, 223, 198, 0.86);
    font-family: 'Fira Code', monospace;
    font-size: 0.72rem;
    white-space: nowrap;
  }

  .locate-bar {
    display: flex;
    align-items: stretch;
    border: 1px solid rgba(180, 130, 48, 0.2);
    border-radius: 2px;
    overflow: hidden;
    background: rgba(6, 4, 2, 0.85);
    transition: border-color 0.18s ease;
  }

  .locate-bar:focus-within {
    border-color: rgba(200, 148, 55, 0.4);
  }

  .locate-browse {
    flex-shrink: 0;
    padding: 0.68rem 0.9rem;
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.7);
    background: rgba(200, 148, 55, 0.06);
    border: none;
    border-right: 1px solid rgba(180, 130, 48, 0.18);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    white-space: nowrap;
  }

  .locate-browse:hover {
    background: rgba(200, 148, 55, 0.12);
    color: rgba(220, 180, 100, 0.9);
  }

  .locate-input-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
  }

  .path-input {
    width: 100%;
    background: none;
    border: none;
    color: rgba(225, 210, 185, 0.88);
    font-family: 'Fira Code', monospace;
    font-size: 0.78rem;
    min-width: 0;
    user-select: text;
  }

  .path-input::placeholder {
    color: rgba(150, 120, 75, 0.35);
    font-style: italic;
  }

  .locate-confirm {
    flex-shrink: 0;
    padding: 0.68rem 0.9rem;
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.7);
    background: rgba(200, 148, 55, 0.06);
    border: none;
    border-left: 1px solid rgba(180, 130, 48, 0.18);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    white-space: nowrap;
  }

  .locate-confirm:hover:not(:disabled) {
    background: rgba(200, 148, 55, 0.14);
    color: rgba(220, 180, 100, 0.9);
  }

  .locate-confirm:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .locate-bar-invalid {
    border-color: rgba(200, 80, 60, 0.45) !important;
  }

  .locate-error {
    margin: 0;
    font-family: 'Fira Code', monospace;
    font-size: 0.72rem;
    color: rgba(220, 100, 80, 0.8);
    animation: fade-up 0.2s ease both;
  }

  button { cursor: pointer; border: none; font: inherit; }

  button:focus-visible,
  .path-input:focus-visible {
    outline: 2px solid rgba(255, 214, 140, 0.9);
    outline-offset: 2px;
  }

  .secondary-btn {
    padding: 0.68rem 0.9rem;
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.78);
    background: rgba(200, 148, 55, 0.06);
    border: 1px solid rgba(180, 130, 48, 0.18);
    border-radius: 2px;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
  }

  .secondary-btn:hover:not(:disabled) {
    background: rgba(200, 148, 55, 0.12);
    color: rgba(220, 180, 100, 0.95);
    border-color: rgba(200, 148, 55, 0.34);
  }

  .secondary-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .action-row {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
  }

  .detect-btn {
    flex: 0 0 auto;
    min-width: 96px;
  }

  .action-primary {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 0.5rem;
    position: relative;
  }

  .launch-btn {
    width: 100%;
  }

  .menu-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .menu-trigger {
    min-width: 42px;
    height: 100%;
    padding-left: 0.7rem;
    padding-right: 0.7rem;
  }

  .action-menu {
    position: absolute;
    right: 0;
    top: calc(100% + 0.35rem);
    min-width: 140px;
    padding: 0.35rem;
    border: 1px solid rgba(180, 130, 48, 0.18);
    border-radius: 3px;
    background: rgba(18, 11, 5, 0.96);
    box-shadow: 0 12px 30px rgba(0,0,0,0.35);
    z-index: 20;
  }

  .menu-item {
    width: 100%;
    text-align: left;
    padding: 0.62rem 0.7rem;
    border-radius: 2px;
    background: transparent;
    color: rgba(228, 216, 191, 0.82);
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .menu-item:hover:not(:disabled) {
    background: rgba(200, 148, 55, 0.1);
  }

  .menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .redetect-btn {
    align-self: start;
    padding: 0.38rem 0.8rem;
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(160, 120, 55, 0.55);
    border: 1px solid rgba(160, 120, 55, 0.18);
    border-radius: 2px;
    background: none;
    transition: all 0.15s ease;
  }

  .redetect-btn:hover {
    color: rgba(200, 160, 80, 0.8);
    border-color: rgba(200, 148, 55, 0.35);
  }

  .dotnet-download-btn {
    align-self: start;
    margin-top: 0.25rem;
    padding: 0.38rem 0.8rem;
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(100, 160, 220, 0.78);
    border: 1px solid rgba(100, 160, 220, 0.22);
    border-radius: 2px;
    background: rgba(100, 160, 220, 0.08);
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .dotnet-download-btn:hover {
    color: rgba(130, 190, 240, 0.95);
    background: rgba(100, 160, 220, 0.14);
    border-color: rgba(100, 160, 220, 0.38);
  }

  .install-btn {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    padding: 0.95rem 1rem;
    font-family: 'Cinzel', serif;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #1c0e03;
    background: linear-gradient(135deg, #d4a040 0%, #9e5c1e 50%, #d4a040 100%);
    background-size: 200% 100%;
    border: 1px solid rgba(210, 158, 60, 0.45);
    border-radius: 2px;
    box-shadow: 0 0 0 1px rgba(255, 198, 98, 0.14) inset, 0 4px 22px rgba(170, 100, 25, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    position: relative;
    overflow: hidden;
    transition: all 0.22s ease;
  }

  .install-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255, 218, 128, 0.16) 0%, transparent 55%);
    pointer-events: none;
  }

  .install-btn:hover:not(:disabled) {
    background-position: 100% 0;
    box-shadow: 0 0 0 1px rgba(255, 198, 98, 0.2) inset, 0 6px 30px rgba(170, 100, 25, 0.5), 0 0 44px rgba(205, 150, 60, 0.15);
    transform: translateY(-1px);
  }

  .install-btn.install-btn-danger {
    color: #fff3ee;
    background: linear-gradient(135deg, #bf5442 0%, #842619 52%, #d46d5a 100%);
    border-color: rgba(226, 128, 110, 0.52);
    box-shadow: 0 0 0 1px rgba(255, 181, 166, 0.16) inset, 0 4px 22px rgba(132, 38, 25, 0.34);
  }

  .install-btn.install-btn-danger::before {
    background: linear-gradient(180deg, rgba(255, 216, 208, 0.14) 0%, transparent 55%);
  }

  .install-btn.install-btn-danger:hover:not(:disabled) {
    box-shadow: 0 0 0 1px rgba(255, 181, 166, 0.22) inset, 0 6px 30px rgba(132, 38, 25, 0.5), 0 0 40px rgba(191, 84, 66, 0.18);
  }

  .install-btn:disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }

  .spinner {
    display: inline-block;
    width: 11px;
    height: 11px;
    border: 1.5px solid rgba(200, 165, 100, 0.25);
    border-top-color: rgba(200, 165, 100, 0.75);
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }

  .spinner.dark {
    border-color: rgba(30, 15, 4, 0.25);
    border-top-color: rgba(30, 15, 4, 0.7);
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 520px) {
    .action-row,
    .action-primary {
      flex-direction: column;
    }

    .step-body-bpp {
      flex-direction: column;
      gap: 0.7rem;
    }

    .detect-btn,
    .menu-trigger {
      width: 100%;
    }
  }
</style>
