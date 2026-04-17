<script lang="ts">
  import type { IdentityState } from '$lib/identity/state';
  import type { InstallPageModel } from '$lib/installer/page-model';

  export let visible: boolean;
  export let identityState: IdentityState;
  export let pageModel: InstallPageModel;
  export let identityLoadState: 'idle' | 'loading';
  export let identityPanelExpanded: boolean;
  export let identityPassword: string;
  export let identityPasswordConfirm: string;
  export let identityConfirmed: boolean;
  export let identityActionBusy: 'idle' | 'activating' | 'logging_in';
  export let identityError: string;
  export let identitySuccess: string;
  export let localized: (zh: string, en: string) => string;
  export let onTogglePanel: () => void;
  export let onActivate: () => void;
  export let onLogin: () => void;
</script>

{#if visible}
  <section class="identity-card">
    <button
      type="button"
      class="identity-toggle"
      class:is-static={identityState.kind === 'observation_required' || identityState.kind === 'ready'}
      class:is-expanded={identityPanelExpanded}
      on:click={onTogglePanel}
      disabled={identityState.kind === 'observation_required' ||
        identityState.kind === 'ready' ||
        identityLoadState === 'loading'}
      aria-expanded={identityState.kind === 'observation_required'
        ? undefined
        : identityState.kind === 'ready'
          ? undefined
          : identityPanelExpanded}
    >
      <div class="identity-toggle-copy">
        <p class="identity-kicker">
          {localized('身份状态', 'Identity Status')}
        </p>
        <h2>{pageModel.identityPanelTitle}</h2>
        {#if pageModel.identityPanelSummary}
          <p class="identity-toggle-summary">{pageModel.identityPanelSummary}</p>
        {/if}
      </div>

      {#if identityState.kind !== 'observation_required' &&
        identityState.kind !== 'ready' &&
        identityLoadState !== 'loading'}
        <span class="identity-toggle-icon" aria-hidden="true">
          {identityPanelExpanded ? '−' : '+'}
        </span>
      {/if}
    </button>

    {#if identityPanelExpanded && identityLoadState !== 'loading'}
      {#if identityState.kind === 'observation_required'}
        <div class="identity-note-stack">
          <p class="identity-note">
            {localized(
              '先启动带 mod 的游戏，安装器会自动识别当前账号。',
              'Launch the modded game first. The installer will detect the current account automatically.'
            )}
          </p>
        </div>
      {:else if identityState.kind === 'activate_first_account'}
        <dl class="identity-account">
          <div>
            <dt>{localized('当前游戏账号', 'Current game account')}</dt>
            <dd>{identityState.observation.player_username}</dd>
          </div>
        </dl>
        <div class="identity-note-stack">
          <p class="identity-note">
            {localized(
              '第一次使用就设置密码并激活。',
              'Set a password and activate if this is your first time here.'
            )}
          </p>
          <p class="identity-note">
            {localized(
              '如果这个账号已经注册过，直接点“已有账号登录”。',
              'If this account already exists, use “Log in existing account”.'
            )}
          </p>
        </div>
      {:else if identityState.kind === 'relogin_required'}
        <dl class="identity-account">
          <div>
            <dt>{localized('当前游戏账号', 'Current game account')}</dt>
            <dd>{identityState.observation.player_username}</dd>
          </div>
        </dl>
        <div class="identity-note-stack">
          <p class="identity-note">
            {localized(
              '检测到游戏里已经切到另一个账号。',
              'The game is currently using a different account.'
            )}
          </p>
          <p class="identity-note">
            {localized(
              '重新登录后会更新这台电脑上的本地安装凭证。',
              'Re-login will refresh the local installation credentials on this computer.'
            )}
          </p>
        </div>
      {:else}
        {#if identityState.observation}
          <dl class="identity-account">
            <div>
              <dt>{localized('当前游戏账号', 'Current game account')}</dt>
              <dd>{identityState.observation.player_username}</dd>
            </div>
          </dl>
        {/if}
        <div class="identity-note-stack">
          <p class="identity-note">
            {identityState.observation
              ? localized(
                  '当前检测到的游戏账号和本地安装凭证一致。',
                  'The detected game account matches the local installation credentials.'
                )
              : localized(
                  '本地安装凭证已经就绪。',
                  'The local installation credentials are ready.'
                )}
          </p>
          <p class="identity-note">
            {identityState.observation
              ? localized(
                  '可以直接继续安装、修复或启动游戏。',
                  'You can continue with install, repair, or launch.'
                )
              : localized(
                  '启动游戏后，安装器会再次自动识别当前账号。',
                  'The installer will detect the current account again after you launch the game.'
                )}
          </p>
        </div>
      {/if}

      {#if identityState.kind !== 'observation_required' && identityState.kind !== 'ready'}
        <label class="identity-field">
          <span>{localized('账号密码', 'Account password')}</span>
          <input
            bind:value={identityPassword}
            type="password"
            autocomplete="current-password"
            placeholder={localized('输入当前账号密码', 'Enter the current account password')}
          />
        </label>

        {#if identityState.kind === 'activate_first_account'}
          <label class="identity-field">
            <span>{localized('再次输入密码', 'Confirm password')}</span>
            <input
              bind:value={identityPasswordConfirm}
              type="password"
              autocomplete="new-password"
              placeholder={localized('再次输入一次密码', 'Enter the password again')}
            />
          </label>

          {#if identityPasswordConfirm.trim() && !pageModel.activationPasswordMatches}
            <p class="identity-error">
              {localized('两次输入的密码不一致。', 'The two passwords do not match.')}
            </p>
          {/if}
        {/if}

        <label class="identity-confirm">
          <input bind:checked={identityConfirmed} type="checkbox" />
          <span>
            {localized(
              '我确认要为当前游戏账号写入本地安装凭证。',
              'I confirm that local installation credentials should be written for the current game account.'
            )}
          </span>
        </label>

        <div class="identity-actions">
          {#if identityState.kind === 'activate_first_account'}
            <button
              type="button"
              class="identity-button primary"
              on:click={onActivate}
              disabled={!pageModel.canActivateObservedAccount}
            >
              {identityActionBusy === 'activating'
                ? localized('正在激活…', 'Activating...')
                : localized('首次激活', 'Create first account')}
            </button>
            <button
              type="button"
              class="identity-button"
              on:click={onLogin}
              disabled={!pageModel.canLoginIdentity}
            >
              {identityActionBusy === 'logging_in'
                ? localized('正在登录…', 'Logging in...')
                : localized('已有账号登录', 'Log in existing account')}
            </button>
          {:else if identityState.kind === 'relogin_required'}
            <button
              type="button"
              class="identity-button primary"
              on:click={onLogin}
              disabled={!pageModel.canLoginIdentity}
            >
              {identityActionBusy === 'logging_in'
                ? localized('正在重新登录…', 'Re-logging in...')
                : localized('重新登录并刷新 installation', 'Re-login and refresh installation')}
            </button>
          {/if}
        </div>
      {/if}
    {/if}

    {#if identityError}
      <p class="identity-error">{identityError}</p>
    {/if}

    {#if identitySuccess && identityState.kind !== 'ready'}
      <p class="identity-success">{identitySuccess}</p>
    {/if}
  </section>
{/if}

<style>
  .identity-card {
    display: grid;
    gap: 0.75rem;
    border-radius: 3px;
    border: 1px solid rgba(200, 148, 55, 0.18);
    background:
      radial-gradient(
        circle at top left,
        rgba(255, 214, 140, 0.09),
        transparent 38%
      ),
      linear-gradient(180deg, rgba(24, 14, 8, 0.97), rgba(14, 8, 5, 0.95));
    box-shadow:
      0 8px 26px rgba(0, 0, 0, 0.28),
      inset 0 0 0 1px rgba(255, 214, 140, 0.04);
  }

  .identity-toggle {
    width: 100%;
    padding: 0.95rem 1.05rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .identity-toggle.is-static {
    cursor: default;
  }

  .identity-toggle-copy {
    display: grid;
    gap: 0.22rem;
  }

  .identity-kicker {
    margin: 0;
    font-size: 0.62rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(216, 182, 109, 0.72);
  }

  .identity-toggle-copy h2 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 1rem;
    color: rgba(248, 232, 196, 0.95);
  }

  .identity-toggle-summary {
    margin: 0;
    line-height: 1.5;
    font-size: 0.9rem;
    color: rgba(240, 222, 188, 0.78);
  }

  .identity-toggle-icon {
    flex: none;
    width: 1.9rem;
    height: 1.9rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(205, 177, 118, 0.2);
    border-radius: 999px;
    color: rgba(248, 232, 196, 0.9);
    font-size: 1.2rem;
    line-height: 1;
  }

  .identity-note,
  .identity-error,
  .identity-success {
    margin: 0 1.05rem;
    line-height: 1.55;
    font-size: 0.92rem;
  }

  .identity-note {
    color: rgba(240, 222, 188, 0.78);
  }

  .identity-note-stack {
    display: grid;
    gap: 0.35rem;
    padding: 0 1.05rem;
  }

  .identity-error {
    color: rgba(255, 162, 142, 0.92);
  }

  .identity-success {
    color: rgba(169, 223, 161, 0.92);
  }

  .identity-account {
    margin: 0 1.05rem;
  }

  .identity-account div {
    display: grid;
    gap: 0.28rem;
    width: fit-content;
    min-width: min(100%, 240px);
    padding: 0.75rem 0.9rem;
    border: 1px solid rgba(205, 177, 118, 0.16);
    border-radius: 2px;
    background: rgba(14, 8, 5, 0.42);
  }

  .identity-account dt {
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.62);
  }

  .identity-account dd {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 600;
    color: rgba(249, 236, 211, 0.94);
    word-break: break-word;
  }

  .identity-field {
    display: grid;
    gap: 0.4rem;
    padding: 0 1.05rem;
  }

  .identity-field span {
    font-size: 0.74rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(205, 177, 118, 0.7);
  }

  .identity-field input {
    width: 100%;
    padding: 0.72rem 0.82rem;
    border-radius: 2px;
    border: 1px solid rgba(200, 148, 55, 0.24);
    background: rgba(10, 6, 4, 0.72);
    color: rgba(251, 240, 220, 0.96);
    font-size: 0.95rem;
  }

  .identity-field input::placeholder {
    color: rgba(208, 181, 127, 0.42);
  }

  .identity-confirm {
    display: flex;
    gap: 0.55rem;
    align-items: flex-start;
    padding: 0 1.05rem;
    color: rgba(240, 222, 188, 0.82);
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .identity-confirm input {
    margin-top: 0.18rem;
  }

  .identity-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    padding: 0 1.05rem 1.05rem;
  }

  .identity-button {
    border: 1px solid rgba(208, 170, 94, 0.32);
    background: rgba(31, 18, 10, 0.84);
    color: rgba(251, 240, 220, 0.95);
    padding: 0.72rem 0.95rem;
    font-family: 'Cinzel', serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.72rem;
    cursor: pointer;
  }

  .identity-button.primary {
    background: linear-gradient(
      180deg,
      rgba(188, 141, 57, 0.92),
      rgba(136, 89, 28, 0.95)
    );
    color: rgba(18, 10, 4, 0.95);
  }

  .identity-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
