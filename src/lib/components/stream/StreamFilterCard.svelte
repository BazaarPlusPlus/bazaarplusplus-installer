<script lang="ts">
  import { locale } from '$lib/locale';
  import type { StreamPageState } from '$lib/stream/state';
  import type { StreamServiceStatus } from '$lib/types';

  export let status: StreamServiceStatus;
  export let pageState: StreamPageState;
  export let manualFromInput = '';
  export let maxRecordsInput = 5;
  export let saving = false;
  export let onManualFromInput: (value: string) => void;
  export let onMaxRecordsInput: (value: number) => void;
  export let onSave: () => void | Promise<void>;
  export let onUseStreamStart: () => void | Promise<void>;
</script>

<section class="card">
  <div class="heading-row">
    <div>
      <p class="eyebrow">{$locale === 'zh' ? '展示范围' : 'Display Range'}</p>
      <h2>
        {$locale === 'zh'
          ? '控制从哪一场开始展示'
          : 'Control where record display starts'}
      </h2>
    </div>
    <span class="badge">
      {$locale === 'zh' ? `最多 ${status.max_records} 条` : `Up to ${status.max_records}`}
    </span>
  </div>

  <div class="grid">
    <label class="field">
      <span>{$locale === 'zh' ? '手动起始时间' : 'Manual start time'}</span>
      <input
        type="datetime-local"
        value={manualFromInput}
        on:input={(event) => onManualFromInput(event.currentTarget.value)}
      />
      <small>
        {$locale === 'zh'
          ? '留空时将自动使用本次启动直播服务的时间。'
          : 'Leave empty to follow the time when this stream service session starts.'}
      </small>
    </label>

    <label class="field">
      <span>{$locale === 'zh' ? '最多展示条数' : 'Max records to show'}</span>
      <input
        type="number"
        min="1"
        max="50"
        value={maxRecordsInput}
        on:input={(event) => onMaxRecordsInput(Number(event.currentTarget.value))}
      />
      <small>
        {$locale === 'zh'
          ? '服务端会限制在 1 到 50 条之间。'
          : 'The backend clamps this between 1 and 50.'}
      </small>
    </label>
  </div>

  <p class="detail">{pageState.effectiveFromMessage}</p>
  <p class="detail subtle">{pageState.maxRecordsMessage}</p>

  <div class="actions">
    <button class="primary" disabled={saving} on:click={onSave}>
      {$locale === 'zh' ? '保存展示范围' : 'Save Display Range'}
    </button>
    <button disabled={saving || !status.started_at} on:click={onUseStreamStart}>
      {$locale === 'zh' ? '改回本次开播时间' : 'Use Stream Start Time'}
    </button>
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
    align-items: start;
  }

  .eyebrow,
  h2,
  .detail,
  .badge {
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

  .badge {
    padding: 0.4rem 0.7rem;
    border-radius: 2px;
    border: 1px solid rgba(190, 137, 59, 0.16);
    color: rgba(231, 220, 194, 0.7);
    background: rgba(192, 138, 54, 0.08);
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem;
  }

  .field {
    display: grid;
    gap: 0.42rem;
  }

  .field span {
    color: #f0e2bf;
    font-size: 0.9rem;
  }

  .field small,
  .detail {
    color: rgba(231, 220, 196, 0.74);
    line-height: 1.5;
  }

  .detail.subtle,
  .field small {
    color: rgba(199, 183, 152, 0.62);
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

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
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

  @media (max-width: 720px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
