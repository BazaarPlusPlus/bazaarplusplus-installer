<script lang="ts">
  import type { StreamPageState } from '$lib/stream/state';
  import type { StreamServiceStatus } from '$lib/types';

  export let status: StreamServiceStatus;
  export let pageState: StreamPageState;
  export let busy = false;
  export let importingCropCode = false;
  export let cropCodeInput = '';
  export let cropCodeMessage = '';
  export let onStart: () => void | Promise<void>;
  export let onStop: () => void | Promise<void>;
  export let onCopyUrl: () => void | Promise<void>;
  export let onOpenPreview: () => void | Promise<void>;
  export let onOpenCalibration: () => void | Promise<void>;
  export let onCropCodeInput: (value: string) => void;
  export let onImportCropCode: () => void | Promise<void>;

  let importPanelOpen = false;
</script>

<section class="card">
  <div class="heading-row">
    <div>
      <p class="eyebrow">Live Service</p>
      <h2>
        {status.running
          ? 'Stream service is running'
          : 'Stream service is stopped'}
      </h2>
    </div>

    <span class:online={status.running} class="badge"
      >{status.running ? 'Live' : 'Idle'}</span
    >
  </div>

  <p class="detail">{pageState.portMessage}</p>
  <p class="detail subtle">{pageState.lifecycleMessage}</p>

  {#if status.overlay_url}
    <div class="url-box">{status.overlay_url}</div>
  {/if}

  {#if status.last_error}
    <p class="error">{status.last_error}</p>
  {/if}

  <div class="actions">
    <button class="primary" disabled={busy || status.running} on:click={onStart}
      >Start Service</button
    >
    <button disabled={busy || !status.running} on:click={onStop}
      >Stop Service</button
    >
    <button disabled={!pageState.canCopyUrl} on:click={onCopyUrl}
      >Copy OBS URL</button
    >
    <button disabled={!pageState.canOpenPreview} on:click={onOpenPreview}
      >Open Preview</button
    >
    <button disabled={!pageState.canOpenPreview} on:click={onOpenCalibration}
      >Open Calibration</button
    >
    <button
      disabled={busy}
      on:click={() => {
        importPanelOpen = !importPanelOpen;
      }}>Import Crop Code</button
    >
  </div>

  {#if importPanelOpen}
    <label class="code-block">
      <span class="code-label">Import Base64 Crop Code</span>
      <textarea
        value={cropCodeInput}
        rows="4"
        spellcheck="false"
        on:input={(event) => onCropCodeInput(event.currentTarget.value)}
      ></textarea>
    </label>

    <div class="import-row">
      <button disabled={busy || importingCropCode || !cropCodeInput.trim()} on:click={onImportCropCode}
        >Apply Crop Code</button
      >
      {#if cropCodeMessage}
        <p class="import-message">{cropCodeMessage}</p>
      {/if}
    </div>
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
      0 18px 44px rgba(0, 0, 0, 0.24);
  }

  .heading-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }

  .eyebrow {
    margin: 0 0 0.2rem;
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(212, 160, 78, 0.62);
  }

  h2,
  .detail,
  .error {
    margin: 0;
  }

  h2 {
    font-size: 1.22rem;
    color: #f0e2bf;
  }

  .badge {
    padding: 0.4rem 0.7rem;
    border-radius: 2px;
    border: 1px solid rgba(190, 137, 59, 0.16);
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(231, 220, 194, 0.7);
  }

  .badge.online {
    border-color: rgba(211, 159, 77, 0.3);
    color: #f5dfa8;
    background: rgba(192, 136, 52, 0.12);
  }

  .detail {
    color: rgba(231, 220, 196, 0.74);
    line-height: 1.5;
  }

  .detail.subtle {
    color: rgba(199, 183, 152, 0.62);
  }

  .url-box {
    padding: 0.8rem 0.9rem;
    border-radius: 2px;
    background: rgba(8, 6, 4, 0.82);
    border: 1px solid rgba(176, 126, 52, 0.16);
    color: #eccf92;
    font-family: 'Fira Code', monospace;
    font-size: 0.8rem;
    word-break: break-all;
  }

  .error {
    color: #ffb8a1;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }

  .code-block {
    display: grid;
    gap: 0.35rem;
  }

  .code-label,
  .import-message {
    margin: 0;
  }

  .code-label {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(213, 188, 145, 0.74);
  }

  textarea {
    width: 100%;
    min-height: 5.8rem;
    padding: 0.7rem 0.8rem;
    border-radius: 2px;
    border: 1px solid rgba(183, 132, 57, 0.16);
    background: rgba(8, 6, 4, 0.82);
    color: #eccf92;
    font-family: 'Fira Code', monospace;
    font-size: 0.76rem;
    resize: vertical;
    box-sizing: border-box;
  }

  .import-row {
    display: grid;
    gap: 0.45rem;
  }

  .import-message {
    font-size: 0.76rem;
    color: rgba(231, 220, 196, 0.72);
  }

  button {
    min-height: 2.4rem;
    padding: 0.65rem 0.9rem;
    border-radius: 2px;
    border: 1px solid rgba(183, 132, 57, 0.16);
    background: rgba(192, 138, 54, 0.08);
    color: rgba(240, 227, 198, 0.82);
    font-family: 'Cinzel', serif;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
  }

  button.primary {
    background: linear-gradient(
      180deg,
      rgba(199, 145, 58, 0.28),
      rgba(116, 68, 24, 0.32)
    );
    border-color: rgba(216, 164, 82, 0.3);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
