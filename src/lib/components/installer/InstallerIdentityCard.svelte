<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { IdentityState } from '$lib/identity/state';
  import type { InstallPageModel } from '$lib/installer/page-model';

  export let visible: boolean;
  export let identityState: IdentityState;
  export let pageModel: InstallPageModel;
  export let identityLoadState: 'idle' | 'loading';
  export let identityPassword: string;
  export let identityActionBusy:
    | 'idle'
    | 'activating'
    | 'logging_in'
    | 'logging_out';
  export let identityError: string;
  export let identitySuccess: string;
  export let localized: (zh: string, en: string) => string;
  export let onContinue: () => void;
  export let onDismissError: () => void = () => {};
  export let onLogout: () => void;
  export let onRefresh: () => Promise<void> | void;

  let refreshPending = false;
  let dismissErrorTimer: ReturnType<typeof setTimeout> | null = null;
  let lastIdentityError = '';

  $: refreshBusy = refreshPending || identityLoadState === 'loading';
  $: identitySuccess;
  $: refreshButtonLabel = refreshBusy
    ? localized('重新检测中…', 'Checking again...')
    : localized('重新检测', 'Check again');
  $: statusTone =
    identityLoadState === 'loading'
      ? 'loading'
      : identityState.kind === 'ready'
        ? 'ready'
        : identityState.kind === 'observation_required'
          ? 'prompt'
          : 'attention';
  $: statusLabel =
    identityLoadState === 'loading'
      ? localized('读取中', 'Loading')
      : identityState.kind === 'ready'
        ? localized('已连接', 'Connected')
        : identityState.kind === 'observation_required'
          ? localized('重新检测', 'Check again')
          : identityState.kind === 'account_mismatch'
          ? localized('需要切换', 'Account changed')
          : localized('未登录', 'Not signed in');
  $: showRegisterLoginPanel = identityState.kind === 'login_or_register';
  $: showLogoutPanel =
    identityState.kind === 'ready' || identityState.kind === 'account_mismatch';
  $: activateBusy = identityActionBusy === 'activating';
  $: loginBusy = identityActionBusy === 'logging_in';
  $: logoutBusy = identityActionBusy === 'logging_out';
  $: {
    if (identityError && identityError !== lastIdentityError) {
      clearDismissErrorTimer();
      dismissErrorTimer = setTimeout(() => {
        onDismissError();
      }, 6000);
    } else if (!identityError) {
      clearDismissErrorTimer();
    }

    lastIdentityError = identityError;
  }

  onDestroy(() => {
    clearDismissErrorTimer();
  });

  function handleContinueShortcut(event: KeyboardEvent) {
    if (event.key !== 'Enter' || !pageModel.canContinueIdentity) {
      return;
    }

    event.preventDefault();
    onContinue();
  }

  async function handleRefresh() {
    if (refreshBusy) {
      return;
    }

    refreshPending = true;
    const startedAt = Date.now();
    const minVisibleMs = 700;

    try {
      await onRefresh();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < minVisibleMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
      }

      refreshPending = false;
    }
  }

  function clearDismissErrorTimer() {
    if (dismissErrorTimer !== null) {
      clearTimeout(dismissErrorTimer);
      dismissErrorTimer = null;
    }
  }
</script>

{#if visible}
  <section class="identity-card">
    <div class="identity-header">
      <h2>{pageModel.identityPanelTitle}</h2>
      <div class="identity-header-actions">
        {#if identityState.kind === 'observation_required'}
          <button
            type="button"
            class={`identity-status-pill identity-status-button tone-${statusTone}`}
            class:is-busy={refreshBusy}
            onclick={handleRefresh}
            disabled={refreshBusy}
            aria-busy={refreshBusy}
          >
            {#if refreshBusy}
              <span class="identity-status-spinner" aria-hidden="true"></span>
            {/if}
            {refreshButtonLabel}
          </button>
        {:else}
          <span class={`identity-status-pill tone-${statusTone}`}>{statusLabel}</span>
        {/if}

        {#if showLogoutPanel}
          <button
            type="button"
            class="identity-logout-link"
            onclick={onLogout}
            disabled={!pageModel.canLogoutIdentity}
            aria-busy={logoutBusy}
          >
            {logoutBusy
              ? localized('登出中…', 'Signing out...')
              : localized('登出', 'Sign out')}
          </button>
        {/if}
      </div>
    </div>

    <p class="identity-summary">
      {pageModel.identityPanelSummary}{#if pageModel.identityPanelAccountHighlight}
        {' '}<strong class="identity-account">{pageModel.identityPanelAccountHighlight}</strong>
      {/if}
    </p>

    {#if showRegisterLoginPanel}
      <div class="identity-panel">
        <div class="identity-form-shell">
          <label class="identity-field">
            <span>{localized('账号密码', 'Account password')}</span>
            <input
              bind:value={identityPassword}
              type="password"
              autocomplete="current-password"
              placeholder={localized('输入当前账号密码', 'Enter the current account password')}
              onkeydown={handleContinueShortcut}
            />
          </label>

          <p class="identity-field-hint">
            {localized('首次使用此账号时，将以该密码完成注册。', 'First-time use will register the account with this password.')}
          </p>

          <button
            type="button"
            class="identity-button primary"
            onclick={onContinue}
            disabled={!pageModel.canContinueIdentity}
          >
            {activateBusy
              ? localized('正在注册…', 'Registering...')
              : loginBusy
                ? localized('正在登录…', 'Signing in...')
                : localized('继续', 'Continue')}
          </button>
        </div>
      </div>
    {/if}

    {#if identityError}
      <p class="identity-feedback identity-feedback-error">
        {identityError}
        <button
          type="button"
          class="identity-feedback-close"
          onclick={onDismissError}
          aria-label={localized('关闭提示', 'Dismiss message')}
        >
          ×
        </button>
      </p>
    {/if}
  </section>
{/if}

<style>
  .identity-card {
    border-radius: 4px;
    border: 1px solid rgba(214, 170, 86, 0.18);
    background:
      radial-gradient(circle at top left, rgba(255, 214, 140, 0.1), transparent 34%),
      linear-gradient(180deg, rgba(27, 16, 8, 0.96), rgba(14, 8, 5, 0.94));
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.24),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
    display: grid;
    gap: 1rem;
    padding: 1rem 1.1rem 1.05rem;
  }

  .identity-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .identity-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .identity-header h2 {
    margin: 0;
    font-size: 1.05rem;
    color: #f6ebd1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity-summary {
    margin: 0;
    color: rgba(244, 231, 209, 0.84);
    line-height: 1.5;
  }

  .identity-account {
    color: #f8d88a;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .identity-panel {
    border: 1px solid rgba(247, 224, 176, 0.12);
    background: rgba(0, 0, 0, 0.14);
    padding: 0.85rem;
  }

  .identity-form-shell {
    display: grid;
    gap: 0.7rem;
  }

  .identity-field-hint {
    margin: 0;
    font-size: 0.78rem;
    color: rgba(244, 231, 209, 0.62);
    line-height: 1.4;
  }

  .identity-panel-title {
    margin: 0;
    font-size: 0.92rem;
    font-weight: 700;
    color: #f6ebd1;
  }

  .identity-panel-intro {
    margin: 0;
    color: rgba(244, 231, 209, 0.78);
    line-height: 1.45;
  }

  .identity-field {
    display: grid;
    gap: 0.35rem;
    color: rgba(244, 231, 209, 0.86);
    font-size: 0.9rem;
  }

  .identity-field input {
    border: 1px solid rgba(247, 224, 176, 0.18);
    background: rgba(15, 10, 7, 0.9);
    color: #f6ebd1;
    padding: 0.72rem 0.8rem;
    outline: none;
  }

  .identity-field input:focus {
    border-color: rgba(247, 224, 176, 0.42);
  }

  .identity-button {
    border: 1px solid rgba(247, 224, 176, 0.18);
    background: rgba(23, 16, 10, 0.92);
    color: #f6ebd1;
    padding: 0.72rem 0.95rem;
    cursor: pointer;
  }

  .identity-logout-link {
    background: transparent;
    border: none;
    padding: 0.2rem 0.3rem;
    color: rgba(244, 231, 209, 0.62);
    font-size: 0.78rem;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .identity-logout-link:hover:not(:disabled) {
    color: rgba(246, 235, 209, 0.9);
  }

  .identity-logout-link:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .identity-button.primary {
    background: linear-gradient(180deg, #7f5a24, #5f4118);
    border-color: rgba(247, 224, 176, 0.28);
  }

  .identity-button:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .identity-feedback {
    margin: 0;
    padding: 0.72rem 0.82rem;
    line-height: 1.45;
    position: relative;
  }

  .identity-feedback-error {
    border: 1px solid rgba(217, 104, 91, 0.24);
    background: rgba(120, 46, 40, 0.17);
    color: #f6d4cf;
    padding-right: 2.1rem;
  }

  .identity-feedback-close {
    position: absolute;
    top: 0.28rem;
    right: 0.4rem;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1;
    cursor: pointer;
  }

  .identity-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.26rem 0.56rem;
    border: 1px solid rgba(247, 224, 176, 0.16);
    color: rgba(247, 224, 176, 0.9);
    font-size: 0.72rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .identity-status-button {
    background: transparent;
    cursor: pointer;
  }

  .identity-status-pill.tone-ready {
    border-color: rgba(96, 188, 132, 0.24);
    color: #b8e1c4;
  }

  .identity-status-pill.tone-attention {
    border-color: rgba(224, 176, 88, 0.28);
    color: #f4d692;
  }

  .identity-status-spinner {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 999px;
    border: 2px solid rgba(247, 224, 176, 0.28);
    border-top-color: rgba(247, 224, 176, 0.9);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
