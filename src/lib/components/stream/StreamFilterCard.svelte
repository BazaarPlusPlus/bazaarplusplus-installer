<script lang="ts">
  import { locale } from '$lib/locale';
  import { toDateTimeLocalValue } from '$lib/stream/state';
  import type { StreamRecordSummary, StreamServiceStatus } from '$lib/types';

  export let status: StreamServiceStatus;
  export let manualFromInput = '';
  export let maxRecordsInput = 5;
  export let selectableRecords: StreamRecordSummary[] = [];
  export let excludedRecordIds: string[] = [];
  export let saving = false;
  export let onManualFromInput: (value: string) => void;
  export let onMaxRecordsInput: (value: number) => void;
  export let onExcludedRecordIdsInput: (value: string[]) => void | Promise<void>;
  export let onRevealRecordImage: (recordId: string) => void | Promise<void>;
  export let onSave: () => void | Promise<void>;

  let manualFromField: HTMLInputElement | null = null;
  $: isZh = $locale === 'zh';
  $: effectiveTimeInputValue = toDateTimeLocalValue(
    status.manual_from ?? status.started_at
  );
  let timeFieldFocused = false;

  function openDateTimePicker() {
    manualFromField?.focus();
    manualFromField?.showPicker?.();
  }

  function isRecordSelected(recordId: string): boolean {
    return !excludedRecordIds.includes(recordId);
  }

  async function toggleRecord(recordId: string, selected: boolean) {
    if (selected) {
      await onExcludedRecordIdsInput(
        excludedRecordIds.filter((value) => value !== recordId)
      );
      return;
    }

    await onExcludedRecordIdsInput([...excludedRecordIds, recordId]);
  }

  async function setAllRecordsSelected(selected: boolean) {
    await onExcludedRecordIdsInput(
      selected ? [] : selectableRecords.map((record) => record.id)
    );
  }
</script>

<section class="card">
  <div class="heading-row">
    <div class="heading-copy">
      <p class="eyebrow">{isZh ? '展示范围' : 'Display Range'}</p>
      <h2>{isZh ? '设置 overlay 展示范围' : 'Set overlay display range'}</h2>
    </div>
  </div>

  <div class="grid">
    <label class="field">
      <span>{isZh ? '开始时间' : 'Start time'}</span>
      <div class="time-field-shell">
        <input
          bind:this={manualFromField}
          type="datetime-local"
          value={manualFromInput}
          on:click={openDateTimePicker}
          on:focus={() => {
            timeFieldFocused = true;
          }}
          on:blur={() => {
            timeFieldFocused = false;
          }}
          on:input={(event) => onManualFromInput(event.currentTarget.value)}
        />
        {#if !manualFromInput && !timeFieldFocused && effectiveTimeInputValue}
          <div class="time-field-overlay">
            <span>{effectiveTimeInputValue.replace('T', ' ')}</span>
          </div>
        {/if}
      </div>
    </label>

    <label class="field">
      <span>{isZh ? '最多显示条数' : 'Max records to show'}</span>
      <input
        type="number"
        min="1"
        max="50"
        value={maxRecordsInput}
        on:input={(event) => onMaxRecordsInput(Number(event.currentTarget.value))}
      />
    </label>
  </div>

  <div class="actions">
    <button class="primary" disabled={saving} on:click={onSave}>
      {isZh ? '保存展示范围' : 'Save Display Range'}
    </button>
  </div>

  <div class="selection-shell">
    <div class="selection-head">
      <div>
        <p class="context-label">{isZh ? '选择展示的 run' : 'Select runs to show'}</p>
      </div>
      <div class="selection-actions">
        <button type="button" class="secondary-action" on:click={() => setAllRecordsSelected(true)}>
          {isZh ? '全选' : 'Select all'}
        </button>
        <button type="button" class="secondary-action" on:click={() => setAllRecordsSelected(false)}>
          {isZh ? '全部隐藏' : 'Hide all'}
        </button>
      </div>
    </div>

    {#if selectableRecords.length === 0}
      <p class="selection-empty">
        {isZh
          ? '当前还没有可选择的 run，完成几局后这里会自动出现。'
          : 'No runs are available yet. Finish a few runs and they will appear here.'}
      </p>
    {:else}
      <div class="selection-list">
        {#each selectableRecords as record}
          <label class:unchecked={!isRecordSelected(record.id)} class="selection-row">
            <input
              type="checkbox"
              checked={isRecordSelected(record.id)}
              on:change={(event) => toggleRecord(record.id, event.currentTarget.checked)}
            />
            <div class="selection-meta">
              <strong>{record.title}</strong>
              <span>{record.subtitle}</span>
            </div>
            <button
              type="button"
              class="locate-button"
              on:click|stopPropagation={() => onRevealRecordImage(record.id)}
            >
              {isZh ? '定位截图' : 'Locate screenshot'}
            </button>
          </label>
        {/each}
      </div>
    {/if}
  </div>
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
    gap: 0.2rem;
  }

  .eyebrow,
  h2,
  .context-label {
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
    margin-top: 0.2rem;
    font-size: 1.18rem;
    color: #f0e2bf;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(13rem, 0.9fr);
    gap: 0.9rem;
  }

  .field {
    display: grid;
    gap: 0.42rem;
  }

  .time-field-shell {
    position: relative;
  }

  .field span {
    color: #f0e2bf;
    font-size: 0.9rem;
  }

  input {
    min-height: 2.7rem;
    padding: 0.7rem 0.85rem;
    border-radius: 2px;
    border: 1px solid rgba(183, 132, 57, 0.16);
    background: rgba(8, 6, 4, 0.82);
    color: #eccf92;
    font-size: 0.95rem;
  }

  .time-field-overlay {
    position: absolute;
    inset: 1px 3rem 1px 1px;
    display: flex;
    align-items: center;
    padding: 0.7rem 0.85rem;
    color: #eccf92;
    pointer-events: none;
    background: rgba(8, 6, 4, 0.82);
    border-radius: 2px;
    line-height: 1;
  }

  input:focus {
    outline: 1px solid rgba(216, 164, 82, 0.55);
    border-color: rgba(216, 164, 82, 0.28);
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.55rem;
  }

  .selection-shell {
    display: grid;
    gap: 0.65rem;
    padding: 0.85rem 0.9rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(10, 7, 4, 0.58);
  }

  .selection-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .selection-empty,
  .selection-meta strong,
  .selection-meta span {
    margin: 0;
  }

  .selection-empty,
  .selection-meta span {
    color: rgba(215, 197, 161, 0.72);
    line-height: 1.45;
  }

  .context-label {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(213, 188, 145, 0.74);
  }

  .selection-actions {
    display: flex;
    gap: 0.45rem;
    flex-wrap: wrap;
  }

  .secondary-action {
    width: auto;
    min-height: 2rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.56rem;
    background: rgba(192, 138, 54, 0.05);
  }

  .selection-list {
    display: grid;
    gap: 0.5rem;
    max-height: 16rem;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .selection-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 0.7rem;
    align-items: flex-start;
    padding: 0.7rem 0.75rem;
    border-radius: 2px;
    border: 1px solid rgba(176, 126, 52, 0.12);
    background: rgba(8, 6, 4, 0.7);
  }

  .selection-row.unchecked {
    opacity: 0.6;
  }

  .selection-row input {
    min-height: 0;
    margin-top: 0.1rem;
    accent-color: #c7913a;
  }

  .selection-meta {
    display: grid;
    gap: 0.16rem;
    min-width: 0;
  }

  .selection-meta strong {
    color: #f0e2bf;
    font-size: 0.88rem;
  }

  .locate-button {
    width: auto;
    min-width: 7rem;
    min-height: 2rem;
    padding: 0.45rem 0.7rem;
    font-size: 0.54rem;
    background: rgba(192, 138, 54, 0.05);
    white-space: nowrap;
  }

  button {
    width: 100%;
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

  @media (max-width: 720px) {
    .grid,
    .actions {
      grid-template-columns: 1fr;
    }

    .selection-head {
      flex-direction: column;
    }

    .selection-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .locate-button {
      width: 100%;
      grid-column: 1 / -1;
    }
  }
</style>
