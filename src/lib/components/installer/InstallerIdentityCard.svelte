<script lang="ts">
  import type { IdentityState } from '$lib/identity/state';
  import type { InstallPageModel } from '$lib/installer/page-model';

  export let visible: boolean;
  export let identityState: IdentityState;
  export let pageModel: InstallPageModel;
  export let identityLoadState: 'idle' | 'loading';
  export let identityPassword: string;
  export let identityConfirmed: boolean;
  export let identityActionBusy: 'idle' | 'activating' | 'logging_in';
  export let identityError: string;
  export let identitySuccess: string;
  export let localized: (zh: string, en: string) => string;
  export let onContinue: () => void;

  $: isInteractive =
    identityState.kind === 'activate_first_account' ||
    identityState.kind === 'relogin_required';
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
        ? localized('已连接', 'Ready')
        : identityState.kind === 'observation_required'
          ? localized('等待游戏检测', 'Awaiting game detection')
          : identityState.kind === 'activate_first_account'
            ? localized('需要验证', 'Verification needed')
            : localized('需要重新连接', 'Reconnect required');
  $: accountName = identityState.observation?.player_username ?? null;
  $: helperCopy =
    identityState.kind === 'activate_first_account'
      ? localized(
          '输入当前游戏账号密码后继续。如果这个账号已经注册过，安装器会自动直接登录，不需要你再选一次。',
          'Enter the current game account password and continue. If this account already exists, the installer will sign in automatically without asking you to choose again.'
        )
      : identityState.kind === 'relogin_required'
        ? localized(
            '输入当前游戏账号密码后继续，安装器会按当前观察到的账号刷新这台电脑上的本地凭证。',
            'Enter the current game account password and continue. The installer will refresh this machine\'s local credentials for the currently observed account.'
          )
        : '';
  $: primaryActionLabel =
    identityState.kind === 'relogin_required'
      ? localized('继续并刷新本地凭证', 'Continue and refresh local credentials')
      : localized('继续', 'Continue');
  $: busyActionLabel =
    identityActionBusy === 'logging_in'
      ? localized('正在连接…', 'Connecting...')
      : localized('正在继续…', 'Continuing...');
  $: showInlineError = Boolean(identityError) && isInteractive;
  $: passivePanelTitle =
    identityState.kind === 'observation_required'
      ? localized('下一步', 'Next step')
      : localized('当前状态', 'Current status');
  $: passivePanelLead =
    identityState.kind === 'observation_required'
      ? localized('先完成下面 3 步，安装器就会自动识别账号。', 'Finish these 3 steps and the installer will detect the account automatically.')
      : localized(
          '当前设备上的本地安装凭证已经就绪。',
          'Local installation credentials are ready on this device.'
        );
  $: passiveChecklist =
    identityState.kind === 'observation_required'
      ? [
          localized('确认游戏安装路径', 'Confirm the game path'),
          localized('完成 MOD 安装', 'Install the mod'),
          localized('启动一次带 MOD 的游戏', 'Launch the modded game once')
        ]
      : [
          localized('可以直接继续安装、修复或启动游戏', 'You can continue with install, repair, or launch'),
          localized('如果切换了游戏账号，这里会自动提示重新连接', 'If the in-game account changes, this panel will prompt you to reconnect')
        ];

  function handleContinueShortcut(event: KeyboardEvent) {
    if (event.key !== 'Enter' || pageModel.identityBusy || !pageModel.canLoginIdentity) {
      return;
    }

    event.preventDefault();
    onContinue();
  }
</script>

{#if visible}
  <section
    class="identity-card"
    class:tone-ready={statusTone === 'ready'}
    class:tone-prompt={statusTone === 'prompt'}
    class:tone-attention={statusTone === 'attention'}
  >
    <div class="identity-header">
      <div class="identity-title-block">
        <p class="identity-kicker">{localized('身份状态', 'Identity Status')}</p>
        <h2>{pageModel.identityPanelTitle}</h2>
      </div>
      <span class={`identity-status-pill tone-${statusTone}`}>{statusLabel}</span>
    </div>

    <div class="identity-main">
      <div class="identity-overview">
        {#if pageModel.identityPanelSummary}
          <p class="identity-summary">{pageModel.identityPanelSummary}</p>
        {/if}

        {#if accountName}
          <dl class="identity-account">
            <div>
              <dt>{localized('当前游戏账号', 'Current game account')}</dt>
              <dd>{accountName}</dd>
            </div>
          </dl>
        {/if}

        {#if identitySuccess}
          <p class="identity-feedback identity-feedback-success">{identitySuccess}</p>
        {/if}
      </div>

      <aside class="identity-panel" class:is-interactive={isInteractive}>
        {#if isInteractive && identityLoadState !== 'loading'}
          <div class="identity-form-shell">
            <p class="identity-panel-title">
              {localized('继续当前账号验证', 'Continue current account verification')}
            </p>
            <p class="identity-panel-intro">{helperCopy}</p>

            <label class="identity-field">
              <span>{localized('账号密码', 'Account password')}</span>
              <input
                bind:value={identityPassword}
                type="password"
                autocomplete="current-password"
                placeholder={localized('输入当前账号密码', 'Enter the current account password')}
                aria-invalid={showInlineError}
                onkeydown={handleContinueShortcut}
              />
            </label>

            {#if showInlineError}
              <p class="identity-field-error">{identityError}</p>
            {/if}

            <label class="identity-confirm">
              <input bind:checked={identityConfirmed} type="checkbox" />
              <span>
                {localized(
                  '我确认要为当前观察到的游戏账号更新这台电脑上的本地凭证。',
                  'I confirm that the local credentials on this machine should be updated for the currently observed game account.'
                )}
              </span>
            </label>

            <button
              type="button"
              class="identity-button primary"
              onclick={onContinue}
              disabled={!pageModel.canLoginIdentity}
            >
              {pageModel.identityBusy ? busyActionLabel : primaryActionLabel}
            </button>
          </div>
        {:else}
          <div class="identity-passive-shell">
            <p class="identity-panel-title">{passivePanelTitle}</p>
            <p class="identity-panel-intro">{passivePanelLead}</p>
            <ul class="identity-checklist">
              {#each passiveChecklist as item}
                <li>{item}</li>
              {/each}
            </ul>
          </div>
        {/if}
      </aside>
    </div>

    {#if identityError && !showInlineError}
      <p class="identity-feedback identity-feedback-error">{identityError}</p>
    {/if}
  </section>
{/if}

<style>
  .identity-card {
    border-radius: 4px;
    border: 1px solid rgba(214, 170, 86, 0.18);
    background:
      radial-gradient(
        circle at top left,
        rgba(255, 214, 140, 0.1),
        transparent 34%
      ),
      linear-gradient(180deg, rgba(27, 16, 8, 0.96), rgba(14, 8, 5, 0.94));
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.24),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
    display: grid;
    gap: 1rem;
    padding: 1rem 1.1rem 1.05rem;
  }

  .identity-card.tone-ready {
    border-color: rgba(96, 188, 132, 0.24);
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.24),
      0 0 18px rgba(96, 188, 132, 0.05),
      inset 0 0 0 1px rgba(96, 188, 132, 0.05);
  }

  .identity-card.tone-attention {
    border-color: rgba(224, 176, 88, 0.3);
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.28),
      0 0 26px rgba(224, 176, 88, 0.08),
      inset 0 0 0 1px rgba(255, 214, 140, 0.05);
  }

  .identity-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .identity-title-block {
    display: grid;
    gap: 0.28rem;
  }

  .identity-kicker {
    margin: 0;
    font-size: 0.58rem;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: rgba(216, 182, 109, 0.72);
  }

  .identity-title-block h2 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 1.04rem;
    color: rgba(248, 232, 196, 0.96);
  }

  .identity-status-pill {
    display: inline-flex;
    align-items: center;
    min-height: 1.7rem;
    padding: 0.22rem 0.62rem;
    border-radius: 999px;
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    border: 1px solid rgba(200, 148, 55, 0.22);
    color: rgba(244, 230, 201, 0.88);
    background: rgba(200, 148, 55, 0.08);
    white-space: nowrap;
  }

  .identity-status-pill.tone-ready {
    color: rgba(214, 244, 225, 0.94);
    border-color: rgba(96, 188, 132, 0.3);
    background: rgba(96, 188, 132, 0.12);
  }

  .identity-status-pill.tone-prompt {
    color: rgba(235, 214, 172, 0.9);
    border-color: rgba(214, 170, 86, 0.26);
    background: rgba(214, 170, 86, 0.1);
  }

  .identity-status-pill.tone-attention {
    color: rgba(247, 227, 184, 0.92);
    border-color: rgba(224, 176, 88, 0.32);
    background: rgba(224, 176, 88, 0.12);
  }

  .identity-status-pill.tone-loading {
    color: rgba(180, 212, 230, 0.9);
    border-color: rgba(112, 170, 210, 0.28);
    background: rgba(112, 170, 210, 0.12);
  }

  .identity-main {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.85fr);
    gap: 1rem;
    align-items: stretch;
  }

  .identity-overview {
    display: grid;
    align-content: start;
    gap: 0.8rem;
  }

  .identity-summary {
    margin: 0;
    line-height: 1.6;
    font-size: 0.9rem;
    color: rgba(240, 222, 188, 0.76);
    max-width: 42rem;
  }

  .identity-account {
    margin: 0;
  }

  .identity-account div {
    display: grid;
    gap: 0.22rem;
    width: fit-content;
    min-width: min(100%, 280px);
    padding: 0.78rem 0.88rem;
    border: 1px solid rgba(205, 177, 118, 0.14);
    border-radius: 3px;
    background: rgba(12, 7, 4, 0.44);
  }

  .identity-account dt {
    font-size: 0.64rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.6);
  }

  .identity-account dd {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(249, 236, 211, 0.94);
    word-break: break-word;
  }

  .identity-panel {
    border: 1px solid rgba(214, 170, 86, 0.14);
    border-radius: 3px;
    background: rgba(9, 5, 3, 0.5);
    padding: 0.86rem 0.9rem;
    display: grid;
    align-content: start;
  }

  .identity-panel.is-interactive {
    background:
      linear-gradient(180deg, rgba(214, 170, 86, 0.07), rgba(214, 170, 86, 0.02)),
      rgba(9, 5, 3, 0.6);
    border-color: rgba(214, 170, 86, 0.18);
  }

  .identity-form-shell,
  .identity-passive-shell {
    display: grid;
    gap: 0.7rem;
  }

  .identity-panel-title {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(240, 222, 188, 0.88);
  }

  .identity-panel-intro {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
    color: rgba(234, 219, 188, 0.74);
  }

  .identity-checklist {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.42rem;
  }

  .identity-checklist li {
    position: relative;
    padding-left: 0.9rem;
    font-size: 0.78rem;
    line-height: 1.45;
    color: rgba(240, 222, 188, 0.8);
  }

  .identity-checklist li::before {
    content: '•';
    position: absolute;
    left: 0;
    top: 0;
    color: rgba(214, 170, 86, 0.72);
  }

  .identity-field {
    display: grid;
    gap: 0.36rem;
  }

  .identity-field span {
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.68);
  }

  .identity-field input {
    width: 100%;
    padding: 0.76rem 0.84rem;
    border-radius: 3px;
    border: 1px solid rgba(200, 148, 55, 0.2);
    background: rgba(10, 6, 4, 0.78);
    color: rgba(251, 240, 220, 0.96);
    font-size: 0.92rem;
  }

  .identity-field input::placeholder {
    color: rgba(208, 181, 127, 0.42);
  }

  .identity-field input[aria-invalid='true'] {
    border-color: rgba(224, 114, 94, 0.38);
    box-shadow: 0 0 0 1px rgba(224, 114, 94, 0.08) inset;
  }

  .identity-field-error {
    margin: -0.08rem 0 0;
    color: rgba(255, 182, 167, 0.95);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .identity-confirm {
    display: flex;
    gap: 0.52rem;
    align-items: flex-start;
    color: rgba(240, 222, 188, 0.8);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .identity-confirm input {
    margin-top: 0.15rem;
  }

  .identity-field input:focus-visible,
  .identity-button:focus-visible {
    outline: 2px solid rgba(255, 214, 140, 0.9);
    outline-offset: 2px;
  }

  .identity-button {
    border: 1px solid rgba(208, 170, 94, 0.3);
    background: linear-gradient(135deg, #d4a040 0%, #9e5c1e 50%, #d4a040 100%);
    color: #1c0e03;
    padding: 0.82rem 0.95rem;
    border-radius: 3px;
    font-family: 'Cinzel', serif;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    box-shadow:
      0 0 0 1px rgba(255, 198, 98, 0.12) inset,
      0 6px 18px rgba(170, 100, 25, 0.22);
  }

  .identity-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .identity-feedback {
    margin: 0;
    padding: 0.68rem 0.82rem;
    border-radius: 3px;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .identity-feedback-error {
    border: 1px solid rgba(224, 114, 94, 0.2);
    background: rgba(160, 56, 39, 0.1);
    color: rgba(255, 182, 167, 0.95);
  }

  .identity-feedback-success {
    border: 1px solid rgba(96, 188, 132, 0.2);
    background: rgba(66, 132, 84, 0.12);
    color: rgba(188, 237, 198, 0.95);
  }

  @media (max-width: 760px) {
    .identity-main {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .identity-card {
      padding: 0.9rem 0.92rem 0.96rem;
    }

    .identity-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
