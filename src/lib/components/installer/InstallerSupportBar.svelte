<script lang="ts">
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { onMount } from 'svelte';
  import AppModal from '$lib/components/AppModal.svelte';
  import { locale } from '$lib/locale';
  import { hasTauriRuntime } from '$lib/installer/runtime';

  type SupporterTierId = 1 | 2 | 3 | 4;

  type SupporterEntry = {
    name: string;
    tier: SupporterTierId;
    amount: number;
  };

  type CopyKey =
    | 'title'
    | 'body'
    | 'wechat'
    | 'wechatAction'
    | 'kofi'
    | 'kofiAction'
    | 'supporters'
    | 'supportersAction'
    | 'supportQrTitle'
    | 'supportQrBody'
    | 'supportQrHint'
    | 'supportersTitle'
    | 'supportersIntro'
    | 'supportersEmpty'
    | 'supportersError'
    | 'supportersThanks'
    | 'close';

  const copy = {
    en: {
      title: 'Support the Author',
      body: 'If BazaarPlusPlus saved you time, you can support the project here.',
      wechat: 'WePay',
      wechatAction: 'Open QR',
      kofi: 'Ko-fi',
      kofiAction: 'Buy a coffee',
      supporters: 'Supporters',
      supportersAction: 'Open list',
      supportQrTitle: 'Support BazaarPlusPlus',
      supportQrBody: 'Scan the WeChat code if you want to support the author directly.',
      supportQrHint: 'Thank you for helping BazaarPlusPlus keep shipping.',
      supportersTitle: 'Supporters',
      supportersIntro: 'Thanks to everyone who backed BazaarPlusPlus.',
      supportersEmpty: 'The supporter list is not available yet.',
      supportersError: 'Failed to load supporter list.',
      supportersThanks: 'Thanks as well to everyone who supported without leaving a name.',
      close: 'Close'
    },
    zh: {
      title: '\u652f\u6301\u4f5c\u8005',
      body: '\u5982\u679c BazaarPlusPlus \u5bf9\u4f60\u6709\u5e2e\u52a9\uff0c\u53ef\u4ee5\u5728\u8fd9\u91cc\u652f\u6301\u9879\u76ee\u3002',
      wechat: 'WePay',
      wechatAction: '\u6253\u5f00\u6536\u6b3e\u7801',
      kofi: 'Ko-fi',
      kofiAction: '\u8bf7\u4f5c\u8005\u559d\u676f\u5496\u5561',
      supporters: '\u652f\u6301\u8005\u540d\u5355',
      supportersAction: '\u67e5\u770b\u540d\u5355',
      supportQrTitle: '\u652f\u6301 BazaarPlusPlus',
      supportQrBody: '\u5982\u679c\u4f60\u60f3\u76f4\u63a5\u652f\u6301\u4f5c\u8005\uff0c\u53ef\u4ee5\u626b\u63cf\u5fae\u4fe1\u6536\u6b3e\u7801\u3002',
      supportQrHint: '\u611f\u8c22\u4f60\u8ba9 BazaarPlusPlus \u7ee7\u7eed\u66f4\u65b0\u3002',
      supportersTitle: '\u652f\u6301\u8005\u540d\u5355',
      supportersIntro: '\u611f\u8c22\u6bcf\u4e00\u4f4d\u652f\u6301 BazaarPlusPlus \u7684\u670b\u53cb\u3002',
      supportersEmpty: '\u6682\u65f6\u8fd8\u6ca1\u6709\u8bfb\u53d6\u5230\u652f\u6301\u8005\u540d\u5355\u3002',
      supportersError: '\u8bfb\u53d6\u652f\u6301\u8005\u540d\u5355\u5931\u8d25\u3002',
      supportersThanks: '\u4e5f\u611f\u8c22\u6240\u6709\u6ca1\u6709\u7559\u540d\u7684\u652f\u6301\u8005\u3002',
      close: '\u5173\u95ed'
    }
  } as const;

  const KOFI_URL = 'https://ko-fi.com/cauyxy';
  const supporterTierIds: SupporterTierId[] = [1, 2, 3, 4];

  let showPaymentCodes = false;
  let showSupporterList = false;
  let supporters: SupporterEntry[] = [];
  let supportersLoaded = false;
  let supportersLoadError = '';

  $: currentCopy = $locale === 'zh' ? copy.zh : copy.en;
  $: sortedSupporters = supporters
    .slice()
    .sort((left, right) => right.tier - left.tier || right.amount - left.amount || left.name.localeCompare(right.name));

  onMount(() => {
    void loadSupporters();
  });

  function normalizeSupporterTier(value: unknown): SupporterTierId | null {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;

    const matchedTier = supporterTierIds.find((tierId) => tierId === value);

    return matchedTier ?? null;
  }

  function normalizeSupporterAmount(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.round(value * 100) / 100;
  }

  function normalizeSupporterEntry(value: unknown): SupporterEntry | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const { name, tier, amount } = value as { name?: unknown; tier?: unknown; amount?: unknown };
    if (typeof name !== 'string' || !name.trim()) {
      return null;
    }

    const normalizedTier = normalizeSupporterTier(tier);
    if (normalizedTier == null) {
      return null;
    }

    const normalizedAmount = normalizeSupporterAmount(amount);
    if (normalizedAmount === null) {
      return null;
    }

    return {
      name: name.trim(),
      tier: normalizedTier,
      amount: normalizedAmount
    };
  }

  function normalizeSupporterPayload(payload: unknown): SupporterEntry[] {
    const entries = Array.isArray(payload) ? payload : [];

    return entries
      .map((entry) => normalizeSupporterEntry(entry))
      .filter((entry): entry is SupporterEntry => entry !== null);
  }

  async function loadSupporters() {
    if (supportersLoaded) return;

    supportersLoadError = '';

    try {
      const response = await fetch('/support/supportorlist.json');
      if (!response.ok) {
        throw new Error(`Failed to load supporter list: ${response.status}`);
      }

      const payload = await response.json();
      supporters = normalizeSupporterPayload(payload);
      supportersLoaded = true;
    } catch (error) {
      supporters = [];
      supportersLoadError = error instanceof Error ? error.message : String(error);
    }
  }

  function openPaymentCodes() {
    showPaymentCodes = true;
  }

  async function openKoFi() {
    if (!hasTauriRuntime()) {
      if (typeof window !== 'undefined') {
        window.open(KOFI_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    try {
      await openUrl(KOFI_URL);
    } catch (error) {
      console.error(error);
    }
  }

  async function openSupporterList() {
    showSupporterList = true;
    await loadSupporters();
  }
</script>

<AppModal
  open={showPaymentCodes}
  eyebrow="BazaarPlusPlus"
  title={currentCopy.supportQrTitle}
  bodyClass="support-modal-body"
  confirmText={currentCopy.close}
  onConfirm={() => {
    showPaymentCodes = false;
  }}
>
  <section class="support-modal-shell">
    <p class="support-modal-copy">{currentCopy.supportQrBody}</p>
    <div class="payment-frame">
      <img class="payment-image" src="/support/wechat-pay.svg" alt={currentCopy.wechat} />
    </div>
    <p class="support-modal-hint">{currentCopy.supportQrHint}</p>
  </section>
</AppModal>

<AppModal
  open={showSupporterList}
  eyebrow="BazaarPlusPlus"
  title={currentCopy.supportersTitle}
  bodyClass="supporter-modal-body"
  confirmText={currentCopy.close}
  onConfirm={() => {
    showSupporterList = false;
  }}
  wide={true}
>
  <section class="supporter-modal-shell">
    <p class="supporter-modal-copy">{currentCopy.supportersIntro}</p>

    {#if supportersLoadError}
      <p class="supporter-state">{currentCopy.supportersError}</p>
    {:else if sortedSupporters.length > 0}
      <ul class="supporter-list" aria-label={currentCopy.supportersTitle}>
        {#each sortedSupporters as supporter}
          <li class={`supporter-item supporter-item-tier-${supporter.tier}`}>{supporter.name}</li>
        {/each}
      </ul>
    {:else}
      <p class="supporter-state">{currentCopy.supportersEmpty}</p>
    {/if}

    <p class="supporter-note">{currentCopy.supportersThanks}</p>
  </section>
</AppModal>

<section class="support-strip" aria-label={currentCopy.title}>
  <div class="support-copy">
    <p class="support-eyebrow">Support</p>
    <h2>{currentCopy.title}</h2>
    <p class="support-body">{currentCopy.body}</p>
  </div>

  <div class="support-actions">
    <button class="support-action" type="button" onclick={openPaymentCodes}>
      <span class="support-action-title">{currentCopy.wechat}</span>
      <span class="support-action-subtitle">{currentCopy.wechatAction}</span>
    </button>

    <button class="support-action" type="button" onclick={openKoFi}>
      <span class="support-action-title">{currentCopy.kofi}</span>
      <span class="support-action-subtitle">{currentCopy.kofiAction}</span>
    </button>

    <button class="support-action" type="button" onclick={openSupporterList}>
      <span class="support-action-title">{currentCopy.supporters}</span>
      <span class="support-action-subtitle">{currentCopy.supportersAction}</span>
    </button>
  </div>
</section>

<style>
  .support-strip {
    padding: 0.95rem 1.05rem;
    background:
      radial-gradient(circle at top left, rgba(255, 214, 140, 0.08), transparent 42%),
      linear-gradient(180deg, rgba(20, 12, 6, 0.96), rgba(12, 7, 4, 0.94));
    border: 1px solid rgba(200, 148, 55, 0.15);
    border-radius: 3px;
    box-shadow:
      0 8px 28px rgba(0, 0, 0, 0.3),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
    display: grid;
    gap: 0.85rem;
  }

  .support-copy {
    display: grid;
    gap: 0.2rem;
  }

  .support-eyebrow {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(200, 148, 55, 0.52);
  }

  .support-copy h2 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(232, 220, 194, 0.92);
  }

  .support-body {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.55;
    color: rgba(208, 188, 150, 0.74);
  }

  .support-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .support-action {
    padding: 0.7rem 0.8rem;
    border: 1px solid rgba(200, 148, 55, 0.14);
    border-radius: 3px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.06), rgba(200, 148, 55, 0.02));
    display: grid;
    gap: 0.14rem;
    text-align: left;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .support-action:hover {
    border-color: rgba(220, 168, 76, 0.28);
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.12), rgba(200, 148, 55, 0.05));
    transform: translateY(-1px);
  }

  .support-action:focus-visible {
    outline: 2px solid rgba(255, 214, 140, 0.9);
    outline-offset: 2px;
  }

  .support-action-title {
    font-family: 'Cinzel', serif;
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(236, 224, 196, 0.9);
  }

  .support-action-subtitle {
    font-family: 'Fira Code', monospace;
    font-size: 0.62rem;
    color: rgba(200, 170, 120, 0.58);
  }

  .supporter-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .supporter-item {
    --pill-border: rgba(255, 232, 174, 0.18);
    --pill-top: rgba(255, 248, 231, 0.12);
    --pill-bottom: rgba(200, 148, 55, 0.08);
    --pill-shadow: rgba(255, 214, 140, 0.04);
    --pill-glow: transparent;
    padding: 0.34rem 0.66rem;
    border-radius: 999px;
    background:
      radial-gradient(circle at top, var(--pill-glow), transparent 70%),
      linear-gradient(180deg, var(--pill-top), var(--pill-bottom));
    border: 1px solid var(--pill-border);
    color: rgba(236, 224, 198, 0.88);
    font-family: 'Fira Code', monospace;
    font-size: 0.66rem;
    line-height: 1.3;
    box-shadow:
      inset 0 0 0 1px var(--pill-shadow),
      0 4px 14px rgba(0, 0, 0, 0.12);
  }

  .supporter-item-tier-1 {
    --pill-border: rgba(111, 166, 224, 0.3);
    --pill-top: rgba(216, 235, 255, 0.12);
    --pill-bottom: rgba(111, 166, 224, 0.08);
    --pill-shadow: rgba(141, 198, 255, 0.06);
    --pill-glow: rgba(141, 198, 255, 0.14);
  }

  .supporter-item-tier-2 {
    --pill-border: rgba(220, 156, 76, 0.28);
    --pill-top: rgba(255, 232, 178, 0.12);
    --pill-bottom: rgba(220, 156, 76, 0.08);
    --pill-shadow: rgba(255, 187, 104, 0.06);
    --pill-glow: rgba(255, 187, 104, 0.14);
  }

  .supporter-item-tier-3 {
    --pill-border: rgba(219, 102, 86, 0.28);
    --pill-top: rgba(255, 218, 208, 0.12);
    --pill-bottom: rgba(219, 102, 86, 0.08);
    --pill-shadow: rgba(255, 132, 118, 0.06);
    --pill-glow: rgba(255, 110, 92, 0.14);
  }

  .supporter-item-tier-4 {
    --pill-border: rgba(172, 138, 219, 0.32);
    --pill-top: rgba(240, 228, 255, 0.14);
    --pill-bottom: rgba(172, 138, 219, 0.1);
    --pill-shadow: rgba(210, 177, 255, 0.07);
    --pill-glow: rgba(210, 177, 255, 0.16);
  }

  .supporter-state,
  .supporter-note,
  .support-modal-copy,
  .support-modal-hint,
  .supporter-modal-copy {
    margin: 0;
  }

  .support-modal-body,
  .supporter-modal-body {
    padding-top: 0.1rem;
  }

  .support-modal-shell,
  .supporter-modal-shell {
    display: grid;
    gap: 0.8rem;
    text-align: center;
  }

  .support-modal-copy,
  .supporter-modal-copy {
    font-size: 0.82rem;
    line-height: 1.6;
    color: rgba(228, 216, 191, 0.8);
  }

  .support-modal-hint,
  .supporter-note {
    font-size: 0.74rem;
    line-height: 1.6;
    color: rgba(200, 170, 120, 0.72);
  }

  .supporter-state {
    font-size: 0.8rem;
    line-height: 1.6;
    color: rgba(214, 190, 146, 0.76);
  }

  .payment-frame {
    width: min(100%, 280px);
    margin: 0 auto;
    padding: 0.8rem;
    aspect-ratio: 1 / 1;
    background: linear-gradient(135deg, rgba(255, 248, 231, 0.98), rgba(245, 238, 220, 0.98));
    border-radius: 3px;
    box-shadow:
      inset 0 0 0 1px rgba(95, 65, 19, 0.08),
      0 10px 24px rgba(0, 0, 0, 0.22);
  }

  .payment-image {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
    background: #fff;
    border-radius: 2px;
  }

  button {
    cursor: pointer;
    border: none;
    font: inherit;
  }

  @media (max-width: 520px) {
    .support-actions {
      grid-template-columns: 1fr;
    }
  }
</style>
