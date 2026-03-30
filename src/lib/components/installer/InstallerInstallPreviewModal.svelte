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
  title={$locale === 'zh' ? '安装 BazaarPlusPlus' : 'Install BazaarPlusPlus'}
  bodyClass="install-preview"
  confirmText={$locale === 'zh' ? '确认安装' : 'Install'}
  confirmDisabled={!installAcknowledged}
  wide={true}
  {onConfirm}
>
  <section class="install-overview">
    <p class="install-overview-kicker">{$locale === 'zh' ? '本次安装内容' : 'What This Installation Enables'}</p>
    <p class="install-overview-body">
      {$locale === 'zh'
        ? 'BazaarPlusPlus 包含几项最常用的功能：战绩记录、战斗回放、野怪预览、升级预览和附魔预览。'
        : "This installation enables several of BazaarPlusPlus's most useful enhancements, including match history, battle replay, monster preview, level-up preview, and enchantment preview."}
    </p>
  </section>

  <section class="install-impact">
    <p class="install-impact-kicker">{$locale === 'zh' ? '安装影响范围' : 'What It Changes'}</p>
    <p class="install-impact-body">
      {$locale === 'zh'
        ? '安装会将 BazaarPlusPlus 所需文件写入当前游戏目录，不会改动你的账号信息或游戏库位置。如需恢复原状，之后可随时卸载。'
        : 'The installer writes the required BazaarPlusPlus files into the current game directory. It does not change your account data or library location, and you can uninstall later at any time.'}
    </p>
  </section>

  <label class="install-acknowledge">
    <input class="install-acknowledge-input" bind:checked={installAcknowledged} type="checkbox" />
    <span class="install-acknowledge-box" aria-hidden="true"></span>
    <span>
      {$locale === 'zh'
        ? '我已了解安装会删除历史作战记录，并准备继续'
        : 'I understand that this installation will delete historical battle records and I am ready to continue.'}
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
  .install-impact-body {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
  }

  .install-overview-body {
    color: rgba(236, 225, 202, 0.84);
  }

  .install-impact {
    display: grid;
    gap: 0.42rem;
    padding: 0.92rem 1rem;
    text-align: left;
    border: 1px solid rgba(200, 148, 55, 0.14);
    border-radius: 4px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.04), rgba(200, 148, 55, 0.015)),
      rgba(12, 8, 4, 0.78);
    box-shadow: inset 0 0 0 1px rgba(255, 198, 98, 0.03);
  }

  .install-impact-kicker {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(216, 188, 123, 0.8);
  }

  .install-impact-body {
    color: rgba(200, 170, 120, 0.7);
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
    .install-overview,
    .install-impact,
    .install-acknowledge {
      padding-left: 0.85rem;
      padding-right: 0.85rem;
    }
  }
</style>
