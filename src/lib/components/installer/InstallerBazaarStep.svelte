<script lang="ts">
  import { messages } from '$lib/i18n';
  import { locale } from '$lib/locale';
  import type { BppDataIssue } from '$lib/types';

  export let bazaarFound: boolean;
  export let bazaarChecking: boolean;
  export let bazaarInvalid: boolean;
  export let bppDataResetRequired: boolean;
  export let bppDataIssue: BppDataIssue | null;
  export let bppDataVersion: string | null;
  export let customGamePath: string;
  export let hasPath: boolean;
  export let effectiveGamePath: string;
  export let t: (
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ) => string;
  export let onPickGamePath: () => void | Promise<void>;
  export let onCheckPath: () => void | Promise<void>;
  export let onResetBazaar: () => void | Promise<void>;
  export let onCustomGamePathInput: () => void;
</script>

<div
  class="step"
  class:step-found={bazaarFound && Boolean(effectiveGamePath)}
  class:step-error={bppDataResetRequired}
>
  <div class="step-index" aria-hidden="true">II</div>
  <div class="step-body">
    <span class="step-title">
      {t('stepBazaar')}
      {#if bazaarFound && effectiveGamePath}
        <span class:tag-ok={!bppDataResetRequired} class:tag-danger={bppDataResetRequired} class="tag"
          >{bppDataResetRequired
            ? $locale === 'zh'
              ? '需要重建'
              : 'Reset required'
            : t('statusFound')}</span
        >
      {/if}
    </span>

    {#if bazaarFound && effectiveGamePath}
      <p class="detail-line detail-path" title={effectiveGamePath}>
        {effectiveGamePath}
      </p>
      {#if bppDataResetRequired}
        <div class="locate-warning-panel">
          <p class="locate-warning-title">
            {$locale === 'zh'
              ? '战绩数据需要重建'
              : 'Match-history data needs to be rebuilt'}
          </p>
          <p class="locate-warning">
            {#if bppDataIssue === 'incompatible_version'}
              {$locale === 'zh'
                ? `检测到当前战绩数据格式与安装器不兼容（数据版本：${bppDataVersion ?? '未知'}）。点击下面"重置战绩记录"会自动清空并重建；也可以在关闭游戏后手动删除游戏根目录下的 BazaarPlusPlus 文件夹。这会删除所有现有战绩。`
                : `The current match-history data format is not compatible with this installer (data version: ${bppDataVersion ?? 'unknown'}). Use "Reset Match History" below to clear and rebuild it automatically, or quit the game and delete the BazaarPlusPlus folder in the game root yourself. This removes all match history.`}
            {:else}
              {$locale === 'zh'
                ? 'BazaarPlusPlus 文件夹缺少版本标记，安装器无法判断它是否还能正常使用。点击下面"重置战绩记录"会自动清空并重建；也可以在关闭游戏后手动删除该文件夹。这会删除所有现有战绩。'
                : "The BazaarPlusPlus folder is missing its version marker, so the installer can't tell whether it is still usable. Use \"Reset Match History\" below to clear and rebuild it automatically, or quit the game and delete the folder yourself. This removes all match history."}
            {/if}
          </p>
        </div>
      {/if}
      <button class="redetect-btn" onclick={onResetBazaar} type="button"
        >{t('actionReenter')}</button
      >
    {:else}
      <div class="locate-bar" class:locate-bar-invalid={bazaarInvalid}>
        <button
          class="locate-browse"
          onclick={onPickGamePath}
          type="button"
          disabled={bazaarChecking}
        >
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

<style>
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
    border-color: rgba(var(--color-accent-rgb), 0.4);
  }

  .locate-browse {
    flex-shrink: 0;
    padding: 0.62rem 0.84rem;
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.7);
    background: rgba(var(--color-accent-rgb), 0.06);
    border: none;
    border-right: 1px solid rgba(180, 130, 48, 0.18);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    white-space: nowrap;
  }

  .locate-browse:hover {
    background: rgba(var(--color-accent-rgb), 0.12);
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
    font-size: 0.74rem;
    min-width: 0;
    user-select: text;
  }

  .path-input::placeholder {
    color: rgba(150, 120, 75, 0.35);
    font-style: italic;
  }

  .locate-confirm {
    flex-shrink: 0;
    padding: 0.62rem 0.84rem;
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(200, 155, 72, 0.7);
    background: rgba(var(--color-accent-rgb), 0.06);
    border: none;
    border-left: 1px solid rgba(180, 130, 48, 0.18);
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease;
    white-space: nowrap;
  }

  .locate-confirm:hover:not(:disabled) {
    background: rgba(var(--color-accent-rgb), 0.14);
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
    font-size: 0.68rem;
    color: rgba(220, 100, 80, 0.8);
    animation: fade-up 0.2s ease both;
  }

  .locate-warning-panel {
    display: grid;
    gap: 0.35rem;
    padding: 0.72rem 0.78rem;
    border: 1px solid rgba(191, 104, 81, 0.24);
    border-radius: 4px;
    background:
      linear-gradient(
        180deg,
        rgba(191, 104, 81, 0.08),
        rgba(191, 104, 81, 0.025)
      ),
      rgba(12, 8, 4, 0.78);
  }

  .locate-warning-title,
  .locate-warning {
    margin: 0;
  }

  .locate-warning-title {
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(240, 178, 162, 0.88);
  }

  .locate-warning {
    font-size: 0.76rem;
    line-height: 1.55;
    color: rgba(var(--color-cream-rgb), 0.82);
  }

  .redetect-btn {
    align-self: start;
    padding: 0.34rem 0.7rem;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(160, 120, 55, 0.55);
    border: 1px solid rgba(160, 120, 55, 0.18);
    border-radius: 2px;
    background: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .redetect-btn:hover {
    color: rgba(200, 160, 80, 0.8);
    border-color: rgba(var(--color-accent-rgb), 0.35);
  }

  button:focus-visible,
  .path-input:focus-visible {
    outline: 2px solid rgba(var(--color-warm-rgb), 0.9);
    outline-offset: 2px;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
