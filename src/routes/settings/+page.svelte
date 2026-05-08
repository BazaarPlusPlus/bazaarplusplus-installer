<script lang="ts">
  import { onMount } from 'svelte';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { accountStore } from '$lib/bazaardb/account-store';
  import { BAZAARDB_TOKEN_PAGE_URL } from '$lib/config/endpoints';
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';
  import { hasTauriRuntime } from '$lib/installer/runtime';
  import { call } from '$lib/bridge/commands';

  function t(key: keyof typeof messages.en): string {
    return formatMessage($locale, key);
  }

  let token = '';
  let busy = false;
  let error: string | null = null;
  let autoUpload = false;

  locale.init();

  onMount(() => {
    accountStore.refresh().catch((err) => (error = String(err)));
    call('get_auto_upload_enabled').then((v) => (autoUpload = v)).catch(() => {});
  });

  async function toggleAutoUpload(next: boolean) {
    autoUpload = next;
    await call('set_auto_upload_enabled', { enabled: next });
  }

  async function connect() {
    if (!token.trim()) {
      error = $locale === 'zh' ? '请先粘贴访问令牌。' : 'Paste the personal access token first.';
      return;
    }
    busy = true;
    error = null;
    try {
      await accountStore.connect(token.trim());
      token = '';
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function disconnect() {
    busy = true;
    error = null;
    try {
      await accountStore.disconnect();
    } catch (err) {
      error = String(err);
    } finally {
      busy = false;
    }
  }

  async function openTokenPage() {
    if (!hasTauriRuntime()) {
      if (typeof window !== 'undefined') {
        window.open(BAZAARDB_TOKEN_PAGE_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    try {
      await openUrl(BAZAARDB_TOKEN_PAGE_URL);
    } catch (err) {
      error = String(err);
    }
  }
</script>

<svelte:head>
  <title>{t('navSettings')} - BazaarPlusPlus</title>
</svelte:head>

<main class="shell">
  <header class="header">
    <a class="back-btn" href="/install">
      <svg class="back-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
      {$locale === 'zh' ? '返回' : 'Back'}
    </a>

    <div class="sigil" aria-hidden="true">
      <svg width="32" height="32" viewBox="0 0 44 44" fill="none">
        <polygon
          points="22,3 41,34 3,34"
          stroke="currentColor"
          stroke-width="1"
          fill="none"
          opacity="0.55"
        />
        <polygon
          points="22,11 35,31 9,31"
          stroke="currentColor"
          stroke-width="0.5"
          fill="none"
          opacity="0.3"
        />
        <circle
          cx="22"
          cy="22"
          r="5"
          stroke="currentColor"
          stroke-width="0.8"
          fill="none"
        />
        <circle cx="22" cy="22" r="2" fill="currentColor" opacity="0.75" />
      </svg>
    </div>

    <h1>{t('navSettings')}</h1>

    <div class="rule" aria-hidden="true">
      <span></span><span class="diamond">+</span><span></span>
    </div>
  </header>

  <section class="card">
    <h2 class="section-title">BazaarDB</h2>

    {#if $accountStore.connected}
      <p class="status-text">
        {$locale === 'zh' ? '已连接为' : 'Connected as'}
        <strong class="account-name">{$accountStore.accountName}</strong>
      </p>
      <button class="action-btn action-btn--danger" type="button" onclick={disconnect} disabled={busy}>
        {$locale === 'zh' ? '断开连接' : 'Disconnect'}
      </button>
    {:else}
      <p class="help-text">
        {#if $locale === 'zh'}
          在
          <button class="inline-link" type="button" onclick={openTokenPage}>
            {BAZAARDB_TOKEN_PAGE_URL}
          </button>
          生成个人访问令牌，然后粘贴到下方。
        {:else}
          Generate a personal access token at
          <button class="inline-link" type="button" onclick={openTokenPage}>
            {BAZAARDB_TOKEN_PAGE_URL}
          </button>,
          then paste it below.
        {/if}
      </p>
      <input
        class="token-input"
        type="password"
        bind:value={token}
        placeholder={$locale === 'zh' ? '粘贴令牌' : 'Paste token here'}
        autocomplete="off"
      />
      <button class="action-btn" type="button" onclick={connect} disabled={busy}>
        {$locale === 'zh' ? '连接' : 'Connect'}
      </button>
    {/if}

    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}
  </section>

  <section class="card">
    <h2 class="section-title">{$locale === 'zh' ? '自动上传' : 'Auto Upload'}</h2>
    <label class="toggle-label">
      <input
        type="checkbox"
        checked={autoUpload}
        onchange={(e) => toggleAutoUpload((e.target as HTMLInputElement).checked)}
      />
      <span>
        {$locale === 'zh' ? '自动上传每局结束截图' : 'Auto-upload end-of-run screenshots'}
      </span>
    </label>
  </section>
</main>

<style>
  .shell {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 1.25rem 1rem 1.75rem;
    display: grid;
    gap: 0.85rem;
    animation: fade-up 0.5s ease both;
  }

  @keyframes fade-up {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .header {
    position: relative;
    text-align: center;
    padding: 1.45rem 1.75rem 1.15rem;
    background: linear-gradient(
      175deg,
      rgba(38, 23, 9, 0.92),
      rgba(16, 10, 5, 0.88)
    );
    border: 1px solid rgba(var(--color-accent-rgb), 0.18);
    border-radius: 3px;
    box-shadow:
      0 0 0 1px rgba(var(--color-accent-rgb), 0.06) inset,
      0 24px 64px rgba(0, 0, 0, 0.5);
    display: grid;
    gap: 0.15rem;
    justify-items: center;
  }

  .back-btn {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    height: 2rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid rgba(var(--color-accent-rgb), 0.24);
    border-radius: 2px;
    background: linear-gradient(
      180deg,
      rgba(var(--color-accent-rgb), 0.12),
      rgba(var(--color-accent-rgb), 0.06)
    );
    color: rgba(var(--color-cream-rgb), 0.82);
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    box-shadow: 0 0 0 1px rgba(var(--color-warm-bright-rgb), 0.08) inset;
    z-index: 2;
    text-decoration: none;
    transition:
      background 0.15s ease,
      border-color 0.15s ease;
  }

  .back-btn:hover {
    background: linear-gradient(
      180deg,
      rgba(var(--color-accent-rgb), 0.2),
      rgba(var(--color-accent-rgb), 0.1)
    );
    border-color: rgba(var(--color-accent-rgb), 0.4);
  }

  .back-btn:focus-visible {
    outline: 2px solid rgba(var(--color-warm-rgb), 0.9);
    outline-offset: 2px;
  }

  .back-icon {
    width: 0.9rem;
    height: 0.9rem;
    flex-shrink: 0;
    opacity: 0.9;
  }

  .sigil {
    color: rgba(205, 150, 60, 0.65);
    margin-bottom: 0.2rem;
    animation: slow-spin 45s linear infinite;
    filter: drop-shadow(0 0 7px rgba(205, 150, 60, 0.22));
  }

  @keyframes slow-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  h1 {
    margin: 0.1rem 0 0;
    font-family: 'Cinzel Decorative', serif;
    font-size: clamp(1.35rem, 4.2vw, 2.1rem);
    font-weight: 700;
    line-height: 1;
    background: linear-gradient(
      155deg,
      var(--color-gold-text) 0%,
      var(--color-gold-deep) 55%,
      var(--color-gold-text) 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 2px 10px rgba(205, 150, 60, 0.28));
  }

  .rule {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: rgba(var(--color-accent-rgb), 0.35);
  }

  .rule span:first-child,
  .rule span:last-child {
    flex: 1;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(var(--color-accent-rgb), 0.3) 40%,
      rgba(var(--color-accent-rgb), 0.3) 60%,
      transparent
    );
  }

  .diamond {
    font-size: 0.55rem;
    color: rgba(205, 150, 60, 0.55);
  }

  .card {
    padding: 0.95rem 1.05rem;
    background: rgba(18, 11, 5, 0.88);
    border: 1px solid rgba(180, 130, 48, 0.13);
    border-radius: 3px;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.35);
    display: grid;
    gap: 0.7rem;
  }

  .section-title {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(220, 195, 145, 0.8);
  }

  .status-text {
    margin: 0;
    font-family: 'Fira Code', monospace;
    font-size: 0.8rem;
    color: rgba(var(--color-cream-rgb), 0.78);
  }

  .account-name {
    color: rgba(232, 200, 122, 0.92);
    font-weight: 600;
  }

  .help-text {
    margin: 0;
    font-family: 'Fira Code', monospace;
    font-size: 0.72rem;
    color: rgba(var(--color-cream-rgb), 0.6);
    line-height: 1.55;
  }

  .inline-link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: rgba(232, 200, 122, 0.82);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: rgba(232, 200, 122, 0.35);
    transition: color 0.15s ease;
  }

  .inline-link:hover {
    color: rgba(244, 220, 162, 0.98);
  }

  .token-input {
    width: 100%;
    padding: 0.5rem 0.65rem;
    background: rgba(10, 7, 4, 0.7);
    border: 1px solid rgba(var(--color-accent-rgb), 0.22);
    border-radius: 2px;
    color: rgba(var(--color-cream-rgb), 0.88);
    font-family: 'Fira Code', monospace;
    font-size: 0.78rem;
    box-shadow: 0 0 0 1px rgba(var(--color-warm-bright-rgb), 0.06) inset;
    transition: border-color 0.15s ease;
  }

  .token-input::placeholder {
    color: rgba(var(--color-cream-rgb), 0.3);
  }

  .token-input:focus {
    outline: 2px solid rgba(var(--color-warm-rgb), 0.9);
    outline-offset: 2px;
    border-color: rgba(var(--color-accent-rgb), 0.42);
  }

  .action-btn {
    justify-self: start;
    padding: 0.42rem 1rem;
    border: 1px solid rgba(var(--color-accent-rgb), 0.38);
    border-radius: 2px;
    background: linear-gradient(
      180deg,
      rgba(var(--color-accent-rgb), 0.22),
      rgba(var(--color-accent-rgb), 0.12)
    );
    color: rgba(var(--color-cream-rgb), 0.88);
    font-family: 'Cinzel', serif;
    font-size: 0.56rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 0 0 1px rgba(var(--color-warm-bright-rgb), 0.08) inset;
    transition:
      background 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: linear-gradient(
      180deg,
      rgba(var(--color-accent-rgb), 0.32),
      rgba(var(--color-accent-rgb), 0.18)
    );
    border-color: rgba(232, 200, 122, 0.52);
    color: var(--color-soft-gold);
  }

  .action-btn:focus-visible {
    outline: 2px solid rgba(var(--color-warm-rgb), 0.9);
    outline-offset: 2px;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .action-btn--danger {
    border-color: rgba(200, 80, 60, 0.38);
    background: linear-gradient(
      180deg,
      rgba(200, 80, 60, 0.16),
      rgba(200, 80, 60, 0.08)
    );
  }

  .action-btn--danger:hover:not(:disabled) {
    background: linear-gradient(
      180deg,
      rgba(220, 100, 75, 0.28),
      rgba(200, 80, 60, 0.16)
    );
    border-color: rgba(220, 100, 75, 0.56);
    color: rgba(255, 180, 160, 0.92);
  }

  .error-text {
    margin: 0;
    font-family: 'Fira Code', monospace;
    font-size: 0.72rem;
    color: rgba(220, 100, 80, 0.9);
    padding: 0.45rem 0.65rem;
    border: 1px solid rgba(220, 100, 80, 0.2);
    border-radius: 2px;
    background: rgba(220, 80, 60, 0.08);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-family: 'Fira Code', monospace;
    font-size: 0.78rem;
    color: rgba(var(--color-cream-rgb), 0.82);
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type='checkbox'] {
    accent-color: rgba(var(--color-accent-rgb), 0.9);
    width: 1rem;
    height: 1rem;
    cursor: pointer;
    flex-shrink: 0;
  }

  @media (max-width: 520px) {
    .shell {
      padding: 1rem 0.85rem 1.5rem;
    }
    .header {
      padding: 1.2rem 1rem 1rem;
    }
    .back-btn {
      top: 0.7rem;
      left: 0.7rem;
    }
  }
</style>
