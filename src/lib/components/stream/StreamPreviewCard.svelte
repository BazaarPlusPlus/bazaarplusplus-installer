<script lang="ts">
  import { onMount } from 'svelte';
  import { loadRecentStreamRecords } from '$lib/stream/api';
  import type { StreamRecordSummary } from '$lib/types';

  export let baseUrl: string | null;

  let records: StreamRecordSummary[] = [];
  let loading = false;
  let refreshTimer: number | null = null;

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
</script>

<section class="card">
  <div class="heading-row">
    <div>
      <p class="eyebrow">Debug Preview</p>
      <h2>Recent records</h2>
    </div>
    <button disabled={!baseUrl || loading} on:click={refresh}>Refresh</button>
  </div>

  {#if !baseUrl}
    <p class="empty">
      Start the stream service to preview recently captured records.
    </p>
  {:else if records.length === 0}
    <p class="empty">No records available yet.</p>
  {:else}
    <ul>
      {#each records as record}
        <li>
          {#if resolveImageUrl(record)}
            <div class="thumb-shell">
              <div class="thumb-stage">
                <img src={resolveImageUrl(record) ?? undefined} alt={record.title} />
              </div>
            </div>
          {/if}
          <div class="copy">
            <strong>{record.title}</strong>
            <span>{record.subtitle}</span>
            <time>{record.captured_at}</time>
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
    align-items: start;
  }

  .eyebrow,
  .empty,
  h2,
  ul,
  li,
  strong,
  span,
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

  button {
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
    padding: 0.8rem 0.9rem;
    border-radius: 2px;
    background: rgba(8, 6, 4, 0.8);
    border: 1px solid rgba(176, 126, 52, 0.14);
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
    gap: 0.2rem;
    min-width: 0;
  }

  strong {
    color: #f2e1b6;
  }

  span,
  time {
    color: rgba(231, 220, 196, 0.68);
    font-size: 0.92rem;
  }

  @media (max-width: 720px) {
    li {
      grid-template-columns: 1fr;
    }
  }
</style>
