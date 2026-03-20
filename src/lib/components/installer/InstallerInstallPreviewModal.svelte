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
  wide={true}
  {onConfirm}
>
  <section class="install-overview">
    <p class="install-overview-kicker">{$locale === 'zh' ? '安装前说明' : 'Before You Install'}</p>
    <p class="install-overview-body">
      {$locale === 'zh'
        ? '本次安装会将 BazaarPlusPlus 的核心增强功能写入当前游戏目录，完成后即可使用主要预览与界面辅助能力。'
        : 'This installation writes BazaarPlusPlus core enhancements into the current game directory so the main preview and interface improvements are available right away.'}
    </p>
    <p class="install-overview-note">
      {$locale === 'zh'
        ? '安装会修改游戏目录中的模组文件；如需恢复原状，可稍后使用卸载功能。'
        : 'Installation updates the mod files inside the game directory; you can later use the uninstall action to restore the original state.'}
    </p>
  </section>

  <div class="feature-list">
    <article class="feature-card">
      <div class="feature-icon">I</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '怪物预览增强' : 'Enhanced Monster Preview'}</h3>
        <p>
          {$locale === 'zh'
            ? '更直接地查看怪物棋盘、技能与关键信息，减少临场判断成本。'
            : 'Inspect monster boards, skills, and key details with less friction during a run.'}
        </p>
      </div>
    </article>

    <article class="feature-card">
      <div class="feature-icon">II</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '附魔预览增强' : 'Enhanced Enchantment Preview'}</h3>
        <p>
          {$locale === 'zh'
            ? '附魔结果与变化会更直观地展示，浏览装备选择时更省步骤。'
            : 'See enchantment outcomes and changes more directly while comparing gear choices.'}
        </p>
      </div>
    </article>

    <article class="feature-card feature-card-wide">
      <div class="feature-icon">III</div>
      <div class="feature-copy">
        <h3>{$locale === 'zh' ? '战斗信息增强' : 'Combat HUD Enhancements'}</h3>
        <p>
          {$locale === 'zh'
            ? '补充战斗过程中的状态显示与信息反馈，让节奏和局势变化更容易读。'
            : 'Adds extra combat status feedback so timing and board-state changes are easier to read.'}
        </p>
        <p class="feature-callout">
          <span class="feature-callout-line">
            {$locale === 'zh' ? '安装仅影响 BazaarPlusPlus 模组文件，不会改动你的账号或库路径。' : 'The installer only touches BazaarPlusPlus mod files and does not change your account or library path.'}
          </span>
        </p>
      </div>
    </article>
  </div>

  <label class="install-acknowledge">
    <input class="install-acknowledge-input" bind:checked={installAcknowledged} type="checkbox" />
    <span class="install-acknowledge-box" aria-hidden="true"></span>
    <span>
      {$locale === 'zh'
        ? '我已阅读说明，并准备继续安装'
        : 'I have read the notes and I am ready to continue with the installation.'}
    </span>
  </label>
</AppModal>

<style>
  .install-overview {
    display: grid;
    gap: 0.42rem;
    padding: 0.92rem 1rem;
    text-align: left;
    border: 1px solid rgba(200, 148, 55, 0.18);
    border-radius: 4px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.07), rgba(200, 148, 55, 0.02)),
      rgba(12, 8, 4, 0.86);
    box-shadow:
      inset 0 0 0 1px rgba(255, 198, 98, 0.04),
      0 10px 24px rgba(0, 0, 0, 0.16);
  }

  .install-overview-kicker {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(232, 200, 122, 0.88);
  }

  .install-overview-body,
  .install-overview-note {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .install-overview-body {
    color: rgba(236, 225, 202, 0.84);
  }

  .install-overview-note {
    color: rgba(200, 170, 120, 0.7);
  }

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
    gap: 0.34rem;
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
    line-height: 1.6;
    color: rgba(228, 216, 191, 0.78);
    white-space: pre-line;
  }

  .feature-callout {
    display: grid;
    gap: 0.22rem;
    margin-top: 0.12rem;
    padding: 0.42rem 0.55rem;
    border: 1px solid rgba(240, 201, 120, 0.1);
    border-radius: 3px;
    background: linear-gradient(180deg, rgba(240, 201, 120, 0.035), rgba(240, 201, 120, 0.01));
    color: rgba(228, 216, 191, 0.62);
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .feature-callout-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
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
    font-size: 0.8rem;
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
