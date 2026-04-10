<script lang="ts">
  import { onMount } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import StreamFilterCard from '$lib/components/stream/StreamFilterCard.svelte';
  import StreamServiceCard from '$lib/components/stream/StreamServiceCard.svelte';
  import StreamPreviewCard from '$lib/components/stream/StreamPreviewCard.svelte';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import {
    getStreamServiceStatus,
    startStreamService,
    stopStreamService,
    updateStreamServiceFilters
  } from '$lib/stream/api';
  import {
    createStreamPageState,
    fromDateTimeLocalValue,
    toDateTimeLocalValue
  } from '$lib/stream/state';
  import type { StreamServiceStatus } from '$lib/types';

  const STREAM_FILTERS_STORAGE_KEY = 'bpp-stream-filters-v1';

  export let title = '';
  export let intro = '';
  export let eyebrow = '';

  let status: StreamServiceStatus = {
    running: false,
    host: '127.0.0.1',
    port: null,
    overlay_url: null,
    using_fallback_port: false,
    last_error: null,
    manual_from: null,
    started_at: null,
    effective_from: null,
    max_records: 5
  };
  let busy = false;
  let savingFilters = false;
  let manualFromInput = '';
  let maxRecordsInput = 5;

  $: t = (
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ): string => formatMessage($locale, key, params);
  $: panelTitle = title || t('streamTitle');
  $: panelIntro = intro || t('streamIntro');
  $: panelEyebrow = eyebrow || ($locale === 'zh' ? '直播模式' : 'Stream Mode');
  $: pageState = createStreamPageState(status);
  $: baseUrl = status.overlay_url?.replace(/\/overlay$/, '') ?? null;

  onMount(() => {
    locale.init();
    void initializePage();
  });

  async function refreshStatus() {
    status = await getStreamServiceStatus();
    syncFormFromStatus();
  }

  async function initializePage() {
    const persisted = readPersistedFilters();

    try {
      status = await updateStreamServiceFilters({
        manualFrom: persisted.manualFrom,
        maxRecords: persisted.maxRecords
      });
    } catch (error) {
      console.error(error);
      await refreshStatus();
      return;
    }

    syncFormFromStatus();
  }

  async function handleStart() {
    busy = true;
    try {
      await saveFilters();
      status = await startStreamService();
      syncFormFromStatus();
    } catch (error) {
      console.error(error);
      await refreshStatus();
    } finally {
      busy = false;
    }
  }

  async function handleStop() {
    busy = true;
    try {
      status = await stopStreamService();
      syncFormFromStatus();
    } catch (error) {
      console.error(error);
      await refreshStatus();
    } finally {
      busy = false;
    }
  }

  async function copyUrl() {
    if (!status.overlay_url) return;

    try {
      await navigator.clipboard.writeText(status.overlay_url);
    } catch (error) {
      console.error(error);
    }
  }

  async function openPreview() {
    if (!status.overlay_url) return;

    try {
      await openUrl(status.overlay_url);
    } catch (error) {
      console.error(error);
    }
  }

  function syncFormFromStatus() {
    manualFromInput = toDateTimeLocalValue(status.manual_from);
    maxRecordsInput = status.max_records;
  }

  function readPersistedFilters(): { manualFrom: string | null; maxRecords: number } {
    if (typeof window === 'undefined') {
      return { manualFrom: null, maxRecords: 5 };
    }

    try {
      const raw = window.localStorage.getItem(STREAM_FILTERS_STORAGE_KEY);
      if (!raw) {
        return { manualFrom: null, maxRecords: 5 };
      }

      const parsed = JSON.parse(raw) as {
        manualFrom?: string | null;
        maxRecords?: number;
      };

      return {
        manualFrom: parsed.manualFrom ?? null,
        maxRecords:
          typeof parsed.maxRecords === 'number' && Number.isFinite(parsed.maxRecords)
            ? parsed.maxRecords
            : 5
      };
    } catch {
      return { manualFrom: null, maxRecords: 5 };
    }
  }

  function persistFilters(input: { manualFrom: string | null; maxRecords: number }) {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      STREAM_FILTERS_STORAGE_KEY,
      JSON.stringify(input)
    );
  }

  async function saveFilters() {
    savingFilters = true;

    try {
      const manualFrom = fromDateTimeLocalValue(manualFromInput);
      const maxRecords = Math.max(1, Math.min(50, Math.trunc(maxRecordsInput || 5)));
      status = await updateStreamServiceFilters({
        manualFrom,
        maxRecords
      });
      persistFilters({
        manualFrom,
        maxRecords: status.max_records
      });
      syncFormFromStatus();
    } finally {
      savingFilters = false;
    }
  }

  async function useStreamStartTime() {
    manualFromInput = '';
    await saveFilters();
  }
</script>

<section class="stream-panel">
  <div class="stream-copy">
    <p class="stream-eyebrow">{panelEyebrow}</p>
    <h2>{panelTitle}</h2>
    <p class="stream-body">{panelIntro}</p>
  </div>

  <div class="stream-grid">
    <StreamServiceCard
      {status}
      {pageState}
      {busy}
      onStart={handleStart}
      onStop={handleStop}
      onCopyUrl={copyUrl}
      onOpenPreview={openPreview}
    />

    <StreamFilterCard
      {status}
      {pageState}
      {manualFromInput}
      {maxRecordsInput}
      saving={savingFilters || busy}
      onManualFromInput={(value) => {
        manualFromInput = value;
      }}
      onMaxRecordsInput={(value) => {
        maxRecordsInput = Number.isFinite(value) ? value : 5;
      }}
      onSave={saveFilters}
      onUseStreamStart={useStreamStartTime}
    />
  </div>

  <StreamPreviewCard {baseUrl} />
</section>

<style>
  .stream-panel {
    display: grid;
    gap: 0.85rem;
  }

  .stream-copy {
    display: grid;
    gap: 0.2rem;
    padding: 0 0.1rem;
  }

  .stream-eyebrow {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(200, 148, 55, 0.52);
  }

  .stream-copy h2 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(232, 220, 194, 0.92);
  }

  .stream-body {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.55;
    color: rgba(208, 188, 150, 0.74);
  }

  .stream-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
  }

  @media (max-width: 900px) {
    .stream-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
