<script lang="ts">
  import { onMount } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { locale } from '$lib/locale';
  import { hasTauriRuntime } from '$lib/installer/runtime';
  import { loadRecentStreamRecords } from '$lib/stream/api';
  import type { StreamRecordSummary } from '$lib/types';

  export let baseUrl: string | null;

  let records: StreamRecordSummary[] = [];
  let loading = false;
  let refreshTimer: number | null = null;
  $: isZh = $locale === 'zh';
  $: countLabel = isZh ? `最近 ${records.length} 条` : `${records.length} recent`;
  $: serviceLabel = baseUrl
    ? isZh
      ? '服务已连接'
      : 'Service connected'
    : isZh
      ? '等待服务启动'
      : 'Waiting for service';

  async function refresh() {
    loading = true;
    records = await loadRecentStreamRecords(baseUrl);
    loading = false;
  }

  function clearRefreshTimer() {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function restartRefreshTimer() {
    clearRefreshTimer();

    if (!baseUrl) {
      return;
    }

    refreshTimer = window.setInterval(() => {
      void refresh();
    }, 5000);
  }

  $: if (baseUrl) {
    void refresh();
  } else {
    records = [];
  }

  $: restartRefreshTimer();

  onMount(() => {
    return () => clearRefreshTimer();
  });

  function resolveImageUrl(record: StreamRecordSummary): string | null {
    if (!baseUrl || !record.image_url) {
      return null;
    }

    try {
      return new URL(record.image_url, `${baseUrl}/`).toString();
    } catch {
      return null;
    }
  }

  function formatCapturedAt(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(isZh ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(parsed);
  }

  function getRecordFacts(record: StreamRecordSummary): string[] {
    const facts: string[] = [];

    if (typeof record.position === 'number') {
      facts.push(isZh ? `排名 ${record.position}` : `Place ${record.position}`);
    }

    if (typeof record.wins === 'number') {
      facts.push(isZh ? `${record.wins} 胜` : `${record.wins} wins`);
    }

    if (typeof record.battle_count === 'number') {
      facts.push(isZh ? `${record.battle_count} 场战斗` : `${record.battle_count} battles`);
    }

    if (record.rank) {
      facts.push(isZh ? `段位 ${record.rank}` : `Rank ${record.rank}`);
    }

    if (typeof record.rating === 'number') {
      facts.push(isZh ? `分数 ${record.rating}` : `Rating ${record.rating}`);
    }

    return facts;
  }

  async function openRecordImage(record: StreamRecordSummary) {
    const imageUrl = resolveImageUrl(record);
    if (!imageUrl) {
      return;
    }

    try {
      if (hasTauriRuntime()) {
        await openUrl(imageUrl);
        return;
      }

      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error(error);
    }
  }
</script>

<section class="card">
  <div class="heading-row">
    <div class="heading-copy">
      <p class="eyebrow">{isZh ? '调试预览' : 'Debug Preview'}</p>
      <h2>{isZh ? '最近对局' : 'Recent runs'}</h2>
      <p class="summary">
        {isZh
          ? '这里会每 5 秒自动刷新，方便确认本地服务是否持续读到最新战绩。'
          : 'This view refreshes every 5 seconds so you can confirm the local service is still receiving new runs.'}
      </p>
    </div>
    <button disabled={!baseUrl || loading} on:click={refresh}>
      {isZh ? '刷新' : 'Refresh'}
    </button>
  </div>

  <div class="meta-row">
    <div class:online={Boolean(baseUrl)} class="status-pill">{serviceLabel}</div>
    <div class="status-pill">{isZh ? '自动刷新 5 秒' : 'Auto refresh 5s'}</div>
    <div class="status-pill">{countLabel}</div>
  </div>

  {#if !baseUrl}
    <div class="empty-panel">
      <p class="empty-title">{isZh ? '还没有连接到直播服务' : 'The stream service is not connected yet.'}</p>
      <p class="empty">
        {isZh
          ? '先在上方启动服务，生成 OBS 地址后，这里会自动开始显示最近对局。'
          : 'Start the service above. Once the OBS URL is available, recent runs will appear here automatically.'}
      </p>
    </div>
  {:else if records.length === 0}
    <div class="empty-panel">
      <p class="empty-title">{isZh ? '服务已启动，但还没有新记录' : 'The service is live, but there are no runs yet.'}</p>
      <p class="empty">
        {isZh
          ? '确认游戏内已完成对局，或者检查上面的展示范围设置是否过窄。'
          : 'Finish a run in game, or verify that the display-range filter is not too narrow.'}
      </p>
    </div>
  {:else}
    <ul>
      {#each records as record}
        {@const imageUrl = resolveImageUrl(record)}
        {@const facts = getRecordFacts(record)}
        <li>
          {#if imageUrl}
            <div class="thumb-shell">
              <div class="thumb-stage">
                <img src={imageUrl} alt={record.title} />
              </div>
            </div>
          {/if}
          <div class="copy">
            <div class="record-head">
              <div class="title-stack">
                <strong>{record.title}</strong>
                <time>{formatCapturedAt(record.captured_at)}</time>
              </div>
              {#if imageUrl}
                <button class="inline-action" on:click={() => openRecordImage(record)}>
                  {isZh ? '打开截图' : 'Open screenshot'}
                </button>
              {/if}
            </div>
            <p class="subtitle">{record.subtitle}</p>
            {#if facts.length > 0}
              <div class="facts">
                {#each facts as fact}
                  <span class="fact">{fact}</span>
                {/each}
              </div>
            {/if}
          </div>
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
  .empty,
  h2,
  ul,
  li,
  strong,
  span,
  time,
  .summary,
  .empty-title,
  .subtitle {
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
    max-width: 44rem;
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

  .status-pill.online {
    color: #f1ddaa;
    border-color: rgba(216, 164, 82, 0.24);
    background: rgba(192, 136, 52, 0.14);
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
    gap: 0.7rem;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: minmax(8rem, 10rem) minmax(0, 1fr);
    gap: 0.8rem;
    align-items: center;
    padding: 0.85rem 0.9rem;
    border-radius: 2px;
    background: rgba(8, 6, 4, 0.8);
    border: 1px solid rgba(176, 126, 52, 0.14);
    box-shadow: inset 0 0 0 1px rgba(255, 214, 140, 0.02);
  }

  .thumb-shell {
    display: flex;
    align-items: center;
  }

  .thumb-stage {
    position: relative;
    overflow: hidden;
    width: 100%;
    border-radius: 2px;
    border: 1px solid rgba(183, 132, 57, 0.16);
    background: rgba(2, 2, 2, 0.45);
    aspect-ratio: 4.6875;
  }

  .thumb-stage img {
    position: absolute;
    left: 0;
    top: 0;
    width: 172.4138%;
    height: auto;
    display: block;
    max-width: none;
    transform: translate(-34.2%, -31.3%);
    transform-origin: top left;
  }

  .copy {
    display: grid;
    gap: 0.38rem;
    min-width: 0;
  }

  .record-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .title-stack {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  strong {
    color: #f2e1b6;
    font-size: 1rem;
  }

  .subtitle,
  time {
    color: rgba(231, 220, 196, 0.68);
    font-size: 0.88rem;
  }

  time {
    flex: 0 0 auto;
    white-space: nowrap;
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .fact {
    padding: 0.28rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(183, 132, 57, 0.12);
    background: rgba(192, 138, 54, 0.05);
    color: rgba(236, 216, 176, 0.82);
    font-size: 0.72rem;
  }

  .inline-action {
    min-width: 7.75rem;
    min-height: 2rem;
    padding: 0.45rem 0.72rem;
    font-size: 0.54rem;
    flex: 0 0 auto;
  }

  @media (max-width: 720px) {
    .record-head,
    li {
      grid-template-columns: 1fr;
    }

    .record-head {
      align-items: stretch;
    }

    .inline-action {
      width: 100%;
    }
  }
</style>
