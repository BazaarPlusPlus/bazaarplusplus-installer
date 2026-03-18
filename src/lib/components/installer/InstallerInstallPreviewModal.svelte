<script lang="ts">
  import AppModal from '$lib/components/AppModal.svelte';
  import { locale } from '$lib/locale';

  export let open: boolean;
  export let installAcknowledged: boolean;
  export let onConfirm: () => void | Promise<void>;
</script>

<AppModal
  {open}
  eyebrow="BazaarPlusPlus"
  title={$locale === 'zh' ? '开始安装' : 'Install BazaarPlusPlus'}
  bodyClass="install-preview"
  confirmText={$locale === 'zh' ? '确认安装' : 'Install'}
  confirmDisabled={!installAcknowledged}
  {onConfirm}
>
  <div class="feature-list">
    <article class="feature-card">
      <div class="feature-icon">I</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '怪物预览增强' : 'Enhanced Monster Preview'}</h3>
        <p>
          {$locale === 'zh'
            ? '右键点击查看怪物棋盘与技能信息'
            : 'Right-click to inspect the monster board and skill details.'}
        </p>
      </div>
    </article>

    <article class="feature-card">
      <div class="feature-icon">II</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '附魔预览增强' : 'Enhanced Enchantment Preview'}</h3>
        {#if $locale === 'zh'}
          <p>默认直接显示附魔效果预览</p>
        {:else}
          <p>Enchantment results are shown directly by default.</p>
        {/if}
      </div>
    </article>

    <article class="feature-card feature-card-wide">
      <div class="feature-icon">III</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '战斗状态条' : 'Combat Status Bar'}</h3>
        {#if $locale === 'zh'}
          <p>可选功能，显示战斗时间、帧数和速度控制</p>
          <p class="feature-callout">
            <span class="feature-callout-line">
              首次使用可在 <span class="feature-emphasis">游戏内选项菜单中开启</span>
            </span>
            <span class="feature-callout-line">
              游戏内可按 <span class="feature-hotkey">F6</span> 快速切换显示
            </span>
          </p>
        {:else}
          <p>
            Optional feature showing battle time, frame count, and speed controls.
            <br />
            Launch the game once, enable it from the in-game options menu, then restart the game
            to apply. Press <span class="feature-hotkey">F6</span> in-game to toggle it quickly.
          </p>
          <p class="feature-callout">
            <span class="feature-callout-line">Enable it from the in-game options menu</span>
            <span class="feature-callout-line">
              Press <span class="feature-hotkey">F6</span> in-game to toggle it quickly
            </span>
          </p>
        {/if}
      </div>
    </article>
  </div>

  <label class="install-acknowledge">
    <input class="install-acknowledge-input" bind:checked={installAcknowledged} type="checkbox" />
    <span class="install-acknowledge-box" aria-hidden="true"></span>
    <span>
      {$locale === 'zh'
        ? '我已了解战斗状态条需在安装后前往游戏内选项菜单手动开启'
        : 'I understand that the combat status bar must be enabled later from the in-game options menu after installation.'}
    </span>
  </label>
</AppModal>

<style>
  .feature-list {
    display: grid;
    gap: 0.7rem;
    text-align: left;
  }

  .feature-card {
    display: grid;
    grid-template-columns: 2.25rem 1fr;
    gap: 0.8rem;
    align-items: start;
    padding: 0.9rem;
    border: 1px solid rgba(200, 148, 55, 0.18);
    border-radius: 3px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.08), rgba(200, 148, 55, 0.02)),
      rgba(12, 8, 4, 0.82);
    box-shadow: inset 0 0 0 1px rgba(255, 198, 98, 0.04);
  }

  .feature-icon {
    width: 2.25rem;
    height: 2.25rem;
    display: grid;
    place-items: center;
    border: 1px solid rgba(214, 169, 84, 0.28);
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(232, 200, 122, 0.22), rgba(158, 92, 30, 0.14));
    color: rgba(232, 200, 122, 0.92);
    font-family: 'Cinzel', serif;
    font-size: 0.66rem;
    letter-spacing: 0.12em;
  }

  .feature-copy {
    display: grid;
    gap: 0.28rem;
    min-width: 0;
  }

  .feature-copy h3 {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(233, 215, 182, 0.92);
  }

  .feature-copy p {
    margin: 0;
    font-size: 0.84rem;
    line-height: 1.55;
    color: rgba(228, 216, 191, 0.72);
    white-space: pre-line;
  }

  .feature-callout {
    display: grid;
    gap: 0.22rem;
    margin-top: 0.08rem;
    padding: 0.32rem 0.48rem;
    border: 1px solid rgba(240, 201, 120, 0.1);
    border-radius: 3px;
    background: linear-gradient(180deg, rgba(240, 201, 120, 0.035), rgba(240, 201, 120, 0.01));
    color: rgba(228, 216, 191, 0.56);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .feature-callout-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .feature-emphasis {
    color: rgba(246, 216, 146, 0.88);
    font-weight: 600;
  }

  .feature-hotkey {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    padding: 0.05rem 0.34rem;
    border: 1px solid rgba(240, 201, 120, 0.36);
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(240, 201, 120, 0.12), rgba(158, 92, 30, 0.1));
    box-shadow: 0 0 0 1px rgba(255, 198, 98, 0.05) inset;
    color: #f7d995;
    font-family: 'Fira Code', monospace;
    font-size: 0.78em;
    font-weight: 700;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }

  .install-acknowledge {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 0.7rem;
    align-items: start;
    padding: 0.8rem 0.88rem;
    border: 1px solid rgba(200, 148, 55, 0.18);
    border-radius: 4px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.055), rgba(200, 148, 55, 0.015)),
      rgba(12, 8, 4, 0.78);
    box-shadow: inset 0 0 0 1px rgba(255, 198, 98, 0.04);
    text-align: left;
    color: rgba(228, 216, 191, 0.78);
    font-size: 0.77rem;
    line-height: 1.45;
    cursor: pointer;
  }

  .install-acknowledge-input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .install-acknowledge-box {
    width: 1.15rem;
    height: 1.15rem;
    margin-top: 0.08rem;
    border: 1px solid rgba(244, 227, 188, 0.58);
    border-radius: 0.28rem;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.03));
    box-shadow:
      0 0 0 1px rgba(255, 198, 98, 0.05) inset,
      0 2px 10px rgba(0, 0, 0, 0.16);
    position: relative;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease,
      transform 0.15s ease;
  }

  .install-acknowledge-box::after {
    content: '';
    position: absolute;
    left: 0.33rem;
    top: 0.14rem;
    width: 0.32rem;
    height: 0.62rem;
    border-right: 2px solid transparent;
    border-bottom: 2px solid transparent;
    transform: rotate(45deg);
    transition: border-color 0.15s ease;
  }

  .install-acknowledge-input:checked + .install-acknowledge-box {
    border-color: rgba(240, 201, 120, 0.62);
    background: linear-gradient(180deg, rgba(212, 160, 64, 0.28), rgba(158, 92, 30, 0.22));
    box-shadow:
      0 0 0 1px rgba(255, 198, 98, 0.12) inset,
      0 4px 14px rgba(170, 100, 25, 0.24);
  }

  .install-acknowledge-input:checked + .install-acknowledge-box::after {
    border-color: #fff2ca;
  }

  .install-acknowledge:hover .install-acknowledge-box {
    border-color: rgba(255, 214, 140, 0.8);
    transform: translateY(-1px);
  }

  .install-acknowledge-input:focus-visible + .install-acknowledge-box {
    outline: 2px solid rgba(255, 214, 140, 0.9);
    outline-offset: 2px;
  }

  @media (max-width: 520px) {
    .feature-card,
    .install-acknowledge {
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }
  }
</style>
