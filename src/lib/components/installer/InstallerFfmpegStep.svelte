<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type {
    FfmpegDetectResult,
    FfmpegInstallProgress
  } from '$lib/generated/commands';
  import type {
    FfmpegBusy,
    FfmpegPhase
  } from '$lib/installer/controllers/ffmpeg-controller';
  import { describeFfmpegError, type FfmpegError } from '$lib/installer/ffmpeg-errors';
  import { selectFfmpegDisplay } from '$lib/installer/selectors/ffmpeg';

  export let detect: Readable<FfmpegDetectResult | null>;
  export let busy: Readable<FfmpegBusy>;
  export let progress: Readable<FfmpegInstallProgress | null>;
  export let phase: Readable<FfmpegPhase>;
  export let error: Readable<FfmpegError | null>;
  export let platformSupported: boolean;
  export let skipped: boolean;
  export let localized: (zh: string, en: string) => string;
  export let onInstall: () => void | Promise<void>;
  export let onRepair: () => void | Promise<void>;
  export let onUninstall: () => void | Promise<void>;
  export let onSkip: () => void;
  export let onUnskip: () => void;
  export let onDismissError: () => void;

  $: display = selectFfmpegDisplay({
    detect: $detect,
    platformSupported
  });
  $: errorCopy = $error ? describeFfmpegError($error, localized) : null;

  $: actionLabel = (() => {
    switch (display.primaryAction) {
      case 'install':
        return localized('安装 FFmpeg', 'Install FFmpeg');
      case 'reinstall':
        return localized('重新安装', 'Reinstall');
      case 'override_install':
        return localized('覆盖安装到游戏目录', 'Override install in game folder');
      case 'repair':
        return localized('修复', 'Repair');
      case 'platform_unsupported':
        return localized('当前平台暂不支持', 'Not supported on this platform');
    }
  })();

  $: tagText = (() => {
    if ($busy === 'detecting') return localized('检测中…', 'Checking…');
    if ($busy === 'installing') return localized('安装中…', 'Installing…');
    if ($busy === 'uninstalling') return localized('卸载中…', 'Uninstalling…');
    if ($busy === 'repairing') return localized('修复中…', 'Repairing…');
    if (!platformSupported) {
      return localized('暂不支持', 'Unsupported');
    }
    const status = display.status;
    if (!status) return localized('未检测', 'Not checked');
    switch (status.kind) {
      case 'bundled':
        return status.version
          ? localized(`已就绪 v${status.version}`, `Ready v${status.version}`)
          : localized('已就绪', 'Ready');
      case 'bundled_corrupted':
        return localized('损坏', 'Corrupted');
      case 'system_available':
        return localized('系统已有', 'On system PATH');
      case 'not_installed':
        return localized('未安装', 'Not installed');
    }
  })();

  $: percentage = (() => {
    const p = $progress;
    if (!p || p.total_bytes === 0) return null;
    const ratio = Math.min(1, p.downloaded_bytes / p.total_bytes);
    return Math.round(ratio * 100);
  })();

  $: phaseLabel = (() => {
    switch ($phase) {
      case 'manifest':
        return localized('读取清单…', 'Fetching manifest…');
      case 'downloading':
        return percentage !== null
          ? localized(`下载中 ${percentage}%`, `Downloading ${percentage}%`)
          : localized('下载中…', 'Downloading…');
      case 'extracting':
        return localized('解压中…', 'Extracting…');
      case 'probing':
        return localized('校验运行…', 'Probing binary…');
      case 'complete':
        return localized('完成', 'Done');
      default:
        return '';
    }
  })();

  $: isBundledReady = display.status?.kind === 'bundled';
  $: isCorrupted = display.status?.kind === 'bundled_corrupted';
  $: actionDisabled =
    $busy !== 'idle' || display.primaryAction === 'platform_unsupported';
</script>

{#if skipped && !isBundledReady && !isCorrupted}
  <div class="step step-collapsed">
    <div class="step-index" aria-hidden="true">IV</div>
    <div class="step-body">
      <span class="step-title">
        {localized('录像 FFmpeg', 'Replay FFmpeg')}
        <span class="tag">{localized('已跳过', 'Skipped')}</span>
      </span>
      <p class="detail-line detail-muted">
        {localized(
          '战斗录像视频功能依赖 FFmpeg。你之前选择稍后安装。',
          'Combat replay video recording needs FFmpeg. You chose to skip it earlier.'
        )}
      </p>
      <div class="actions">
        <button class="ghost-btn" type="button" onclick={onUnskip}>
          {localized('重新启用', 'Re-enable')}
        </button>
      </div>
    </div>
  </div>
{:else}
  <div
    class="step"
    class:step-found={isBundledReady}
    class:step-error={isCorrupted || errorCopy !== null}
  >
    <div class="step-index" aria-hidden="true">IV</div>
    <div class="step-body">
      <span class="step-title">
        {localized('录像 FFmpeg', 'Replay FFmpeg')}
        <span
          class="tag"
          class:tag-ok={display.tag === 'ok'}
          class:tag-warn={display.tag === 'warn'}
          class:tag-danger={display.tag === 'danger'}
        >
          {tagText}
        </span>
      </span>

      <p class="detail-line detail-muted">
        {localized(
          '可选：安装 FFmpeg 后，对战录像才能渲染为视频。',
          'Optional: combat replays can be rendered to video once FFmpeg is installed.'
        )}
      </p>

      {#if display.bundledPath}
        <p class="detail-line detail-path" title={display.bundledPath}>
          {display.bundledPath}
        </p>
      {/if}

      {#if $busy === 'installing' || $busy === 'repairing'}
        <div class="progress-row" role="status" aria-live="polite">
          {#if percentage !== null}
            <div class="progress-bar">
              <div class="progress-fill" style="width: {percentage}%"></div>
            </div>
          {:else}
            <span class="spinner" aria-hidden="true"></span>
          {/if}
          <span class="progress-label">{phaseLabel}</span>
        </div>
      {/if}

      {#if errorCopy}
        <div class="error-box" role="alert">
          <strong>{errorCopy.title}</strong>
          <p>{errorCopy.body}</p>
          <button class="ghost-btn" type="button" onclick={onDismissError}>
            {localized('我知道了', 'Dismiss')}
          </button>
        </div>
      {/if}

      <div class="actions">
        {#if display.primaryAction === 'platform_unsupported'}
          <span class="detail-muted">
            {localized(
              '请等待对应平台支持，或手动放入二进制。',
              'Wait for platform support, or drop the binary in manually.'
            )}
          </span>
        {:else if display.primaryAction === 'repair'}
          <button
            class="primary-btn"
            type="button"
            disabled={actionDisabled}
            onclick={onRepair}
          >
            {actionLabel}
          </button>
        {:else}
          <button
            class="primary-btn"
            type="button"
            disabled={actionDisabled}
            onclick={onInstall}
          >
            {actionLabel}
          </button>
        {/if}

        {#if isBundledReady || isCorrupted}
          <button
            class="ghost-btn"
            type="button"
            disabled={$busy !== 'idle'}
            onclick={onUninstall}
          >
            {localized('卸载', 'Uninstall')}
          </button>
        {:else if !skipped}
          <button
            class="ghost-btn"
            type="button"
            disabled={$busy !== 'idle'}
            onclick={onSkip}
          >
            {localized('稍后再说', 'Skip for now')}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .actions {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .primary-btn {
    min-height: 2.3rem;
    padding: 0.54rem 1.05rem;
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(30, 15, 4, 0.92);
    background: linear-gradient(180deg, #d6a256, #b27d34);
    border: 1px solid rgba(120, 78, 30, 0.5);
    border-radius: 2px;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.15s ease;
  }

  .primary-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .ghost-btn {
    min-height: 2.3rem;
    padding: 0.54rem 0.95rem;
    font-family: 'Cinzel', serif;
    font-size: 0.56rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.82);
    background: transparent;
    border: 1px solid rgba(180, 130, 48, 0.3);
    border-radius: 2px;
    cursor: pointer;
  }

  .ghost-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .progress-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
  }

  .progress-bar {
    flex: 1;
    height: 6px;
    background: rgba(var(--color-accent-rgb), 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #b27d34, #d6a256);
    transition: width 0.18s ease;
  }

  .progress-label {
    font-family: 'Fira Code', monospace;
    font-size: 0.66rem;
    color: rgba(var(--color-cream-rgb), 0.78);
    white-space: nowrap;
  }

  .error-box {
    padding: 0.62rem 0.78rem;
    background: rgba(191, 104, 81, 0.08);
    border: 1px solid rgba(191, 104, 81, 0.28);
    border-radius: 2px;
    display: grid;
    gap: 0.4rem;
  }

  .error-box strong {
    color: rgba(240, 178, 162, 0.95);
    font-size: 0.78rem;
  }

  .error-box p {
    margin: 0;
    font-size: 0.74rem;
    color: rgba(var(--color-cream-rgb), 0.82);
  }

  .step-collapsed {
    opacity: 0.78;
  }
</style>
