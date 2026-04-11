<script lang="ts">
  import { onMount } from 'svelte';
  import { hasTauriRuntime } from '$lib/installer/runtime';
  import { locale } from '$lib/locale';
  import {
    listStreamScreenshotRecords,
    revealStreamRecordImage
  } from '$lib/stream/api';
  import type { StreamRecordSummary } from '$lib/types';

  let records: StreamRecordSummary[] = [];
  let loading = false;
  let revealBusyId: string | null = null;
  let errorMessage = '';
  let refreshTimer: number | null = null;

  $: isZh = $locale === 'zh';
  $: desktopReady = hasTauriRuntime();
  $: countLabel = isZh
    ? `共 ${records.length} 张`
    : `${records.length} screenshots`;

  onMount(() => {
    locale.init();

    if (!desktopReady) {
      return;
    }

    void refresh();
    refreshTimer = window.setInterval(() => {
      void refresh();
    }, 15000);

    return () => {
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
      }
    };
  });

  async function refresh() {
    loading = true;

    try {
      records = await listStreamScreenshotRecords();
      errorMessage = '';
    } catch (error) {
      console.error(error);
      errorMessage = isZh
        ? '读取截图列表失败。'
        : 'Failed to load screenshot list.';
    } finally {
      loading = false;
    }
  }

  async function revealRecord(recordId: string) {
    if (!desktopReady || revealBusyId) {
      return;
    }

    revealBusyId = recordId;

    try {
      await revealStreamRecordImage(recordId);
      errorMessage = '';
    } catch (error) {
      console.error(error);
      errorMessage =
        error instanceof Error
          ? error.message
          : isZh
            ? '无法定位截图文件。'
            : 'Failed to reveal the screenshot file.';
    } finally {
      revealBusyId = null;
    }
  }

  function formatCapturedAt(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(parsed);
  }
</script>

<section class="card">
  <div class="heading-row">
    <div class="heading-copy">
      <p class="eyebrow">
        {isZh ? 'End of Run 截图' : 'End of Run Screenshots'}
      </p>
      <h2>{isZh ? '对局截图列表' : 'Run screenshot list'}</h2>
      <p class="summary">
        {isZh
          ? '按时间倒序展示已抓到的 End of Run 截图，只保留英雄、截图时间和定位按钮。'
          : 'Shows captured End of Run screenshots in reverse chronological order with only hero, capture time, and a locate action.'}
      </p>
    </div>

    <button disabled={!desktopReady || loading} on:click={refresh}>
      {loading ? (isZh ? '刷新中' : 'Refreshing') : isZh ? '刷新' : 'Refresh'}
    </button>
  </div>

  <div class="meta-row">
    <div class="status-pill">{countLabel}</div>
    <div class="status-pill">
      {isZh ? '自动刷新 15 秒' : 'Auto refresh 15s'}
    </div>
  </div>

  {#if errorMessage}
    <p class="error">{errorMessage}</p>
  {/if}

  {#if !desktopReady}
    <div class="empty-panel">
      <p class="empty-title">
        {isZh
          ? '当前环境不支持读取本地截图'
          : 'This environment cannot read local screenshots.'}
      </p>
      <p class="empty">
        {isZh
          ? '请在 BazaarPlusPlus 桌面应用中打开直播模式。'
          : 'Open Stream Mode inside the BazaarPlusPlus desktop app.'}
      </p>
    </div>
  {:else if !loading && records.length === 0}
    <div class="empty-panel">
      <p class="empty-title">
        {isZh ? '还没有 End of Run 截图' : 'No End of Run screenshots yet.'}
      </p>
      <p class="empty">
        {isZh
          ? '完成一局后，这里会自动显示对应截图。'
          : 'Finish a run and the screenshot will appear here automatically.'}
      </p>
    </div>
  {:else}
    <ul>
      {#each records as record}
        <li>
          <div class="copy">
            <strong>{record.title}</strong>
            <time
              >{isZh ? '截图时间' : 'Captured'}
              {formatCapturedAt(record.captured_at)}</time
            >
          </div>

          <button
            class="inline-action"
            disabled={revealBusyId === record.id}
            on:click={() => revealRecord(record.id)}
          >
            {revealBusyId === record.id
              ? isZh
                ? '定位中'
                : 'Locating'
              : isZh
                ? '定位到文件'
                : 'Show in folder'}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: 0.9rem;
    padding: 1.15rem;
    border-radius: 3px;
    border: 1px solid rgba(185, 134, 58, 0.14);
    background: linear-gradient(
      175deg,
      rgba(30, 18, 8, 0.9),
      rgba(12, 8, 4, 0.84)
    );
    box-shadow:
      0 0 0 1px rgba(200, 148, 55, 0.05) inset,
      0 18px 44px rgba(0, 0, 0, 0.2);
  }

  .heading-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .heading-copy {
    display: grid;
    gap: 0.22rem;
  }

  .eyebrow,
  h2,
  .summary,
  .empty,
  .empty-title,
  .error,
  ul,
  li,
  strong,
  time {
    margin: 0;
  }

  .eyebrow {
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(212, 160, 78, 0.62);
  }

  h2 {
    font-size: 1.18rem;
    color: #f0e2bf;
  }

  .summary {
    max-width: 46rem;
    color: rgba(215, 197, 161, 0.72);
    line-height: 1.45;
  }

  button {
    min-width: 7.5rem;
    min-height: 2.25rem;
    padding: 0.55rem 0.8rem;
    border-radius: 2px;
    border: 1px solid rgba(183, 132, 57, 0.16);
    background: rgba(192, 138, 54, 0.08);
    color: rgba(240, 227, 198, 0.82);
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .status-pill {
    padding: 0.4rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(183, 132, 57, 0.14);
    background: rgba(192, 138, 54, 0.06);
    color: rgba(231, 220, 196, 0.76);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
  }

  .error {
    padding: 0.8rem 0.9rem;
    border-radius: 2px;
    border: 1px solid rgba(153, 76, 62, 0.28);
    background: rgba(67, 20, 16, 0.46);
    color: rgba(241, 195, 179, 0.9);
    line-height: 1.45;
  }

  .empty-panel {
    display: grid;
    gap: 0.35rem;
    padding: 1rem 1.05rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(10, 7, 4, 0.58);
  }

  .empty-title {
    color: #f0e2bf;
    font-size: 0.98rem;
  }

  .empty {
    color: rgba(231, 220, 196, 0.72);
    line-height: 1.5;
  }

  ul {
    display: grid;
    gap: 0.6rem;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.85rem 0.9rem;
    border-radius: 2px;
    background: rgba(8, 6, 4, 0.8);
    border: 1px solid rgba(176, 126, 52, 0.14);
    box-shadow: inset 0 0 0 1px rgba(255, 214, 140, 0.02);
  }

  .copy {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  strong {
    color: #f2e1b6;
    font-size: 1rem;
  }

  time {
    color: rgba(231, 220, 196, 0.68);
    font-size: 0.88rem;
  }

  .inline-action {
    min-width: 8.8rem;
    min-height: 2rem;
    padding: 0.45rem 0.72rem;
    font-size: 0.54rem;
    flex: 0 0 auto;
  }

  @media (max-width: 720px) {
    .heading-row,
    li {
      display: grid;
    }

    .inline-action,
    button {
      width: 100%;
    }
  }
</style>
