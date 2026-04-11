<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import StreamServiceCard from '$lib/components/stream/StreamServiceCard.svelte';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import {
    getStreamOverlayCropSettings,
    loadStreamRecordAtOffset,
    loadStreamRecordWindowSummary,
    getStreamServiceStatus,
    importStreamOverlayCropCode,
    startStreamService,
    stopStreamService
  } from '$lib/stream/api';
  import { createStreamPageState } from '$lib/stream/state';
  import type {
    StreamRecordSummary,
    StreamRecordWindowSummary,
    StreamServiceStatus
  } from '$lib/types';

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
    started_at: null
  };
  let busy = false;
  let importingCropCode = false;
  let cropCodeInput = '';
  let cropCodeMessage = '';
  let copyMessage = '';
  let copyMessageTone: 'success' | 'error' | null = null;
  let copyMessageTimer: number | null = null;
  let recordWindowSummary: StreamRecordWindowSummary = {
    total: 0,
    existing_before_start: 0,
    captured_since_start: 0
  };
  let selectedOffset = 0;
  let maxBacktrack = 5;
  let selectedRecord: StreamRecordSummary | null = null;

  $: t = (
    key: keyof typeof messages.en,
    params?: Record<string, string | number>
  ): string => formatMessage($locale, key, params);
  $: panelTitle = title || t('streamTitle');
  $: panelIntro = intro || t('streamIntro');
  $: panelEyebrow = eyebrow || ($locale === 'zh' ? '直播模式' : 'Stream Mode');
  $: pageState = createStreamPageState(status);
  $: baseUrl = status.overlay_url?.replace(/\/overlay$/, '') ?? null;
  $: previewUrl = withOffsetQuery(status.overlay_url, selectedOffset);
  $: calibrationUrl = withOffsetQuery(
    baseUrl ? `${baseUrl}/settings` : null,
    selectedOffset
  );
  $: isZh = $locale === 'zh';
  $: effectiveBacktrackLimit = Math.min(
    Math.max(1, Math.trunc(maxBacktrack || 1)),
    Math.max(0, recordWindowSummary.captured_since_start)
  );
  $: canStepEarlier =
    status.running &&
    recordWindowSummary.captured_since_start > 0 &&
    selectedOffset + 1 < effectiveBacktrackLimit;
  $: canStepLater = status.running && selectedOffset > 0;
  $: overviewStartLabel = formatOverviewStartTime(
    selectedOffset > 0
      ? selectedRecord?.captured_at ?? status.started_at
      : status.started_at
  );
  $: overviewDescription = status.running
    ? isZh
      ? `overview 会展示从这个起始时间之后的记录；当前窗口内共有 ${recordWindowSummary.captured_since_start} 条开播后记录。`
      : `Overview shows records captured after this start time. There are ${recordWindowSummary.captured_since_start} record(s) in the current stream window.`
    : isZh
      ? '启动服务后，overview 才会按当前起始时间展示记录。'
      : 'Start the service to show overview records from the current start time.';

  onMount(() => {
    locale.init();
    void initializePage();
  });

  onDestroy(() => {
    clearCopyMessage();
  });

  async function initializePage() {
    try {
      status = await getStreamServiceStatus();
      const cropSettings = await getStreamOverlayCropSettings();
      cropCodeInput = cropSettings.code;
      cropCodeMessage = '';
      await refreshOverviewState();
    } catch (error) {
      console.error(error);
    }
  }

  async function handleStart() {
    busy = true;
    try {
      status = await startStreamService();
      selectedOffset = 0;
      await refreshOverviewState();
    } catch (error) {
      console.error(error);
      status = await getStreamServiceStatus();
      await refreshOverviewState();
    } finally {
      busy = false;
    }
  }

  async function handleStop() {
    busy = true;
    try {
      status = await stopStreamService();
      selectedOffset = 0;
      await refreshOverviewState();
    } catch (error) {
      console.error(error);
      status = await getStreamServiceStatus();
      await refreshOverviewState();
    } finally {
      busy = false;
    }
  }

  async function refreshOverviewState() {
    const currentBaseUrl = status.overlay_url?.replace(/\/overlay$/, '') ?? null;
    if (!status.running || !currentBaseUrl) {
      recordWindowSummary = {
        total: 0,
        existing_before_start: 0,
        captured_since_start: 0
      };
      selectedRecord = null;
      selectedOffset = 0;
      return;
    }

    recordWindowSummary = await loadStreamRecordWindowSummary(currentBaseUrl);
    const maxSelectableOffset = Math.max(
      0,
      Math.min(
        Math.max(1, Math.trunc(maxBacktrack || 1)),
        Math.max(0, recordWindowSummary.captured_since_start)
      ) - 1
    );
    selectedOffset = Math.max(0, Math.min(selectedOffset, maxSelectableOffset));
    selectedRecord = await loadStreamRecordAtOffset(currentBaseUrl, selectedOffset);
  }

  async function stepOverviewOffset(direction: 1 | -1) {
    if (direction === 1 && !canStepEarlier) {
      return;
    }
    if (direction === -1 && !canStepLater) {
      return;
    }

    selectedOffset = Math.max(0, selectedOffset + direction);
    await refreshOverviewState();
  }

  async function updateMaxBacktrack(value: number) {
    maxBacktrack = Math.max(1, Math.min(50, Math.trunc(value || 1)));
    await refreshOverviewState();
  }

  function withOffsetQuery(url: string | null, offset: number): string | null {
    if (!url) {
      return null;
    }

    if (offset <= 0) {
      return url;
    }

    const nextUrl = new URL(url);
    nextUrl.searchParams.set('offset', String(offset));
    return nextUrl.toString();
  }

  function formatOverviewStartTime(value: string | null): string {
    if (!value) {
      return isZh ? '尚未开始' : 'Not started';
    }

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

  async function copyUrl() {
    if (!previewUrl) return;

    try {
      await navigator.clipboard.writeText(previewUrl);
      showCopyMessage(isZh ? 'OBS 地址已复制' : 'OBS URL copied');
    } catch (error) {
      console.error(error);
      showCopyMessage(isZh ? '复制失败，请重试' : 'Copy failed');
    }
  }

  async function openPreview() {
    if (!previewUrl) return;

    try {
      await openUrl(previewUrl);
    } catch (error) {
      console.error(error);
    }
  }

  async function openCalibration() {
    if (!calibrationUrl) return;

    try {
      await openUrl(calibrationUrl);
    } catch (error) {
      console.error(error);
    }
  }

  async function importCropCode() {
    importingCropCode = true;
    cropCodeMessage = '';

    try {
      const payload = await importStreamOverlayCropCode(cropCodeInput.trim());
      cropCodeInput = payload.code;
      cropCodeMessage = isZh
        ? '裁切代码已保存，overlay 会在下次刷新时使用它。'
        : 'Crop code saved. The overlay will use it on the next refresh.';
    } catch (error) {
      console.error(error);
      cropCodeMessage =
        error instanceof Error
          ? error.message
          : isZh
            ? '导入裁切代码失败。'
            : 'Failed to import crop code.';
    } finally {
      importingCropCode = false;
    }
  }

  function clearCopyMessage() {
    if (copyMessageTimer !== null) {
      window.clearTimeout(copyMessageTimer);
      copyMessageTimer = null;
    }
  }

  function showCopyMessage(message: string) {
    copyMessageTone = message === (isZh ? '复制失败，请重试' : 'Copy failed')
      ? 'error'
      : 'success';
    copyMessage = message;
    clearCopyMessage();
    copyMessageTimer = window.setTimeout(() => {
      copyMessage = '';
      copyMessageTone = null;
      copyMessageTimer = null;
    }, 1800);
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
      {importingCropCode}
      previewUrl={previewUrl}
      {cropCodeInput}
      {cropCodeMessage}
      {copyMessage}
      {copyMessageTone}
      {overviewStartLabel}
      {overviewDescription}
      {selectedOffset}
      {maxBacktrack}
      {canStepEarlier}
      {canStepLater}
      onStart={handleStart}
      onStop={handleStop}
      onCopyUrl={copyUrl}
      onOpenPreview={openPreview}
      onOpenCalibration={openCalibration}
      onStepEarlier={() => stepOverviewOffset(1)}
      onStepLater={() => stepOverviewOffset(-1)}
      onMaxBacktrackInput={updateMaxBacktrack}
      onCropCodeInput={(value) => {
        cropCodeInput = value;
        cropCodeMessage = '';
      }}
      onImportCropCode={importCropCode}
    />
  </div>
</section>

<style>
  .stream-panel {
    display: grid;
    gap: 0.85rem;
  }

  .stream-copy {
    display: grid;
    gap: 0.22rem;
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
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
  }
</style>
