<script lang="ts">
  import { onMount } from 'svelte';
  import { loadPersistedCustomGamePath } from '$lib/installer/storage';
  import { locale } from '$lib/locale';
  import { loadStreamRecordList, revealStreamRecordImage } from '$lib/stream/api';
  import type { StreamRecordSummary } from '$lib/types';

  export let gamePath: string | null = null;

  let records: StreamRecordSummary[] = [];
  let loading = false;
  let isZh = false;
  let persistedGamePath = '';
  let debugStatus = '';
  let debugError = '';

  $: isZh = $locale === 'zh';
  $: requestedGamePath = gamePath?.trim() || persistedGamePath || null;

  onMount(() => {
    persistedGamePath = loadPersistedCustomGamePath();
    void refreshRecords();
  });

  async function refreshRecords() {
    loading = true;
    debugError = '';
    debugStatus = isZh
      ? `准备读取截图记录，路径：${requestedGamePath ?? '未提供，走自动探测'}`
      : `Preparing to load screenshot records. Path: ${requestedGamePath ?? 'not provided, using auto-detect'}`;
    console.info('[stream-record-library] refresh start', {
      requestedGamePath
    });
    try {
      records = await loadStreamRecordList(requestedGamePath);
      debugStatus = isZh
        ? `已读取 ${records.length} 条截图记录，路径：${requestedGamePath ?? '自动探测'}`
        : `Loaded ${records.length} screenshot record(s). Path: ${requestedGamePath ?? 'auto-detect'}`;
      console.info('[stream-record-library] refresh success', {
        requestedGamePath,
        recordCount: records.length,
        recordIds: records.map((record) => record.id)
      });
    } catch (error) {
      console.error('[stream-record-library] refresh failed', {
        requestedGamePath,
        error
      });
      records = [];
      debugError = error instanceof Error ? error.message : String(error);
      debugStatus = isZh
        ? `读取截图记录失败，路径：${requestedGamePath ?? '自动探测'}`
        : `Failed to load screenshot records. Path: ${requestedGamePath ?? 'auto-detect'}`;
    } finally {
      loading = false;
    }
  }

  async function revealRecordImage(recordId: string) {
    try {
      await revealStreamRecordImage(recordId, requestedGamePath);
      console.info('[stream-record-library] reveal image', {
        requestedGamePath,
        recordId
      });
    } catch (error) {
      console.error('[stream-record-library] reveal image failed', {
        requestedGamePath,
        recordId,
        error
      });
      debugError = error instanceof Error ? error.message : String(error);
    }
  }

  function formatRecordTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(parsed);
  }
</script>

<section class="record-library" aria-label={isZh ? '截图记录列表' : 'Screenshot record list'}>
  <div class="record-library-head">
    <div class="record-library-copy">
      <p class="record-library-eyebrow">{isZh ? '截图记录' : 'Screenshot Records'}</p>
      <h2>{isZh ? '全部 End of Run 记录' : 'All End-of-Run Records'}</h2>
      <p class="record-library-body">
        {isZh
          ? `当前已读取 ${records.length} 条 end_of_run_auto 记录；这个列表和 overlay 完全解耦。`
          : `Loaded ${records.length} end_of_run_auto record(s). This list is fully decoupled from the overlay.`}
      </p>
    </div>

    <button type="button" class="refresh-button" on:click={refreshRecords} disabled={loading}>
      {loading ? (isZh ? '刷新中...' : 'Refreshing...') : isZh ? '刷新列表' : 'Refresh'}
    </button>
  </div>

  <div class="record-debug" aria-live="polite">
    <p class="record-debug-line">
      {isZh ? '调试状态' : 'Debug status'}: {debugStatus || (isZh ? '尚未读取' : 'Not loaded yet')}
    </p>
    <p class="record-debug-line">
      {isZh ? '请求路径' : 'Requested path'}: {requestedGamePath ?? (isZh ? '自动探测' : 'auto-detect')}
    </p>
    {#if debugError}
      <p class="record-debug-line record-debug-error">
        {isZh ? '最近错误' : 'Last error'}: {debugError}
      </p>
    {/if}
  </div>

  <div class="record-list-shell">
    {#if records.length === 0}
      <p class="record-empty">
        {isZh ? '当前还没有可显示的截图记录。点击刷新会重新从 SQLite 读取。' : 'No screenshot records are available yet. Refresh to read SQLite again.'}
      </p>
    {:else}
      <div class="record-list">
        {#each records as record}
          <div class="record-row">
            <div class="record-main">
              <p class="record-title">{record.title || (isZh ? '未知英雄' : 'Unknown hero')}</p>
              <p class="record-time">{formatRecordTime(record.captured_at)}</p>
              {#if record.subtitle}
                <p class="record-subtitle">{record.subtitle}</p>
              {/if}
            </div>

            <button
              type="button"
              class="record-action"
              on:click={() => revealRecordImage(record.id)}
            >
              {isZh ? '打开截图位置' : 'Reveal image'}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .record-library {
    display: grid;
    gap: 0.85rem;
    padding: 1.05rem;
    border-radius: 3px;
    border: 1px solid rgba(185, 134, 58, 0.14);
    background:
      radial-gradient(circle at top left, rgba(255, 214, 140, 0.05), transparent 42%),
      linear-gradient(180deg, rgba(20, 12, 6, 0.96), rgba(12, 7, 4, 0.94));
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.3),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
  }

  .record-library-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .record-library-copy {
    display: grid;
    gap: 0.2rem;
  }

  .record-library-eyebrow {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(200, 148, 55, 0.52);
  }

  .record-library-copy h2,
  .record-library-body,
  .record-empty,
  .record-title,
  .record-time,
  .record-subtitle {
    margin: 0;
  }

  .record-library-copy h2 {
    font-family: 'Cinzel', serif;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(232, 220, 194, 0.92);
  }

  .record-library-body,
  .record-empty,
  .record-time,
  .record-subtitle {
    font-size: 0.78rem;
    line-height: 1.55;
    color: rgba(208, 188, 150, 0.74);
  }

  .record-list-shell {
    padding: 0.8rem 0.9rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(10, 7, 4, 0.58);
  }

  .record-debug {
    display: grid;
    gap: 0.2rem;
    padding: 0.7rem 0.85rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(10, 7, 4, 0.42);
  }

  .record-debug-line {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.45;
    color: rgba(208, 188, 150, 0.74);
    word-break: break-word;
  }

  .record-debug-error {
    color: rgba(255, 170, 146, 0.88);
  }

  .record-list {
    display: grid;
    gap: 0.5rem;
    max-height: 18rem;
    overflow-y: auto;
    padding-right: 0.2rem;
  }

  .record-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.65rem;
    align-items: center;
    padding: 0.55rem 0.65rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(6, 4, 3, 0.52);
  }

  .record-main {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
  }

  .record-title {
    color: #f0e2bf;
    font-size: 0.84rem;
    line-height: 1.35;
    word-break: break-word;
  }

  .refresh-button,
  .record-action {
    width: auto;
    min-height: 2.2rem;
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

  .refresh-button:disabled,
  .record-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .record-library-head {
      display: grid;
    }

    .record-row {
      grid-template-columns: 1fr;
    }

    .record-action {
      width: 100%;
    }
  }
</style>
