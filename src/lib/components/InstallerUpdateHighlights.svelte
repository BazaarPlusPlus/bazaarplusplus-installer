<script lang="ts">
  import AppModal from '$lib/components/AppModal.svelte';
  import { locale } from '$lib/locale';

  type LocalizedText = {
    zh: string;
    en: string;
  };

  type HighlightTone = 'default' | 'featured' | 'warning';

  type HighlightSection = {
    icon: string;
    title: LocalizedText;
    bullets: LocalizedText[];
    tone?: HighlightTone;
    badge?: LocalizedText;
    actionLead?: LocalizedText;
    actionLabel?: LocalizedText;
  };

  let showSupportQr = false;

  const sections: HighlightSection[] = [
    {
      icon: 'I',
      title: {
        zh: '战绩记录和战斗回放',
        en: 'Match History and Battle Replays'
      },
      bullets: [
        {
          zh: '增加了战绩记录和战斗回放功能。',
          en: 'Added match history and battle replay features.'
        }
      ],
      tone: 'featured',
      badge: {
        zh: '主推功能',
        en: 'Featured'
      },
      actionLead: {
        zh: '太牛了',
        en: 'Love It'
      },
      actionLabel: {
        zh: '支持作者',
        en: 'Support Author'
      }
    },
    {
      icon: 'II',
      title: {
        zh: '预览修饰键更改',
        en: 'Preview Modifier Key Changes'
      },
      bullets: [
        {
          zh: '增加了修饰键更改功能。',
          en: 'Added support for changing modifier keys.'
        }
      ]
    },
    {
      icon: 'III',
      title: {
        zh: '战斗加速调整',
        en: 'Combat Speed Changes'
      },
      bullets: [
        {
          zh: '移除了战斗加速功能。',
          en: 'Removed the combat speed-up feature.'
        }
      ]
    },
    {
      icon: 'IV',
      title: {
        zh: '设置路径优化',
        en: 'Settings Path Optimization'
      },
      bullets: [
        {
          zh: '优化了设置的路径。',
          en: 'Optimized the settings path.'
        }
      ]
    },
    {
      icon: 'V',
      title: {
        zh: '野怪预览修复',
        en: 'Monster Preview Fixes'
      },
      bullets: [
        {
          zh: '修复了野怪预览的附魔。',
          en: 'Fixed enchant display in monster previews.'
        }
      ]
    },
    {
      icon: 'VI',
      title: {
        zh: '首轮野怪加速修复',
        en: 'First-Round Monster Speed Fix'
      },
      bullets: [
        {
          zh: '修复了首轮野怪加速不会生效的问题。',
          en: 'Fixed an issue where first-round monster acceleration would not take effect.'
        }
      ]
    },
    {
      icon: 'VII',
      title: {
        zh: 'F6 战斗状态条显隐自动记忆',
        en: 'F6 Combat Status Bar Visibility Memory'
      },
      bullets: [
        {
          zh: '增加 F6 战斗状态条显隐自动记忆。',
          en: 'Added automatic memory for F6 combat status bar visibility.'
        }
      ]
    },
    {
      icon: 'VIII',
      title: {
        zh: '已知问题',
        en: 'Known Issues'
      },
      bullets: [
        {
          zh: '战斗回放的玩家血条显示不准确。',
          en: 'The player health bar is displayed inaccurately during battle replay.'
        }
      ],
      tone: 'warning'
    }
  ];
</script>

<AppModal
  open={showSupportQr}
  eyebrow="BazaarPlusPlus"
  title={$locale === 'zh' ? '支持 BazaarPlusPlus' : 'Support BazaarPlusPlus'}
  bodyClass="support-modal-body"
  confirmText={$locale === 'zh' ? '关闭' : 'Close'}
  onConfirm={() => {
    showSupportQr = false;
  }}
>
  <section class="support-modal-shell">
    <p class="support-modal-copy">
      {$locale === 'zh'
        ? '如果你想直接支持作者，可以扫描微信收款码。'
        : 'Scan the WeChat code if you want to support the author directly.'}
    </p>
    <div class="payment-frame">
      <img class="payment-image" src="/support/wechat-pay.svg" alt="WePay" />
    </div>
    <p class="support-modal-hint">
      {$locale === 'zh' ? '感谢支持，BazaarPlusPlus 会继续更新。' : 'Thank you for supporting BazaarPlusPlus.'}
    </p>
  </section>
</AppModal>

<section class="update-hero">
  <p class="update-kicker">
    {$locale === 'zh' ? '当前版本 · 更新亮点' : "Current Build · What's New"}
  </p>
  <h2 class="update-title">BazaarPlusPlus</h2>
  <p class="update-summary">
    {$locale === 'zh'
      ? '本次更新主推战绩记录和战斗回放功能，同时包含修饰键调整、设置路径优化、多项功能修复，以及当前已知问题。'
      : 'This release is centered on match history and battle replays, with modifier key customization, settings path improvements, several bug fixes, and known issues also included.'}
  </p>
</section>

<div class="update-feature-list">
  {#each sections as section}
    <article class={`update-feature-card tone-${section.tone ?? 'default'}`}>
      <div class="update-feature-icon">{section.icon}</div>
      <div class="update-feature-copy">
        {#if section.badge}
          <p class="update-feature-badge">{$locale === 'zh' ? section.badge.zh : section.badge.en}</p>
        {/if}
        <h3>{$locale === 'zh' ? section.title.zh : section.title.en}</h3>
        <ul class="update-feature-points">
          {#each section.bullets as bullet}
            <li>{$locale === 'zh' ? bullet.zh : bullet.en}</li>
          {/each}
        </ul>
      </div>
      {#if section.actionLabel && section.actionLead}
        <div class="update-feature-action">
          <button class="featured-support-button" type="button" onclick={() => (showSupportQr = true)}>
            <span class="featured-support-lead">{$locale === 'zh' ? section.actionLead.zh : section.actionLead.en}</span>
            <span class="featured-support-label">{$locale === 'zh' ? section.actionLabel.zh : section.actionLabel.en}</span>
          </button>
        </div>
      {/if}
    </article>
  {/each}
</div>

<style>
  .update-hero {
    display: grid;
    gap: 0.5rem;
    padding: 1rem 1.05rem;
    text-align: left;
    border: 1px solid rgba(200, 148, 55, 0.18);
    border-radius: 4px;
    background:
      radial-gradient(circle at top right, rgba(232, 200, 122, 0.16), transparent 42%),
      linear-gradient(180deg, rgba(200, 148, 55, 0.08), rgba(200, 148, 55, 0.02)),
      rgba(12, 8, 4, 0.84);
    box-shadow: inset 0 0 0 1px rgba(255, 198, 98, 0.04);
  }

  .update-kicker {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(232, 200, 122, 0.7);
  }

  .update-title {
    margin: 0;
    font-family: 'Cinzel', serif;
    font-size: clamp(1rem, 2.6vw, 1.4rem);
    letter-spacing: 0.06em;
    color: rgba(239, 223, 188, 0.95);
  }

  .update-summary {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.65;
    color: rgba(233, 222, 198, 0.84);
  }

  .update-feature-list {
    display: grid;
    gap: 0.7rem;
    margin-top: 0.15rem;
    text-align: left;
  }

  .update-feature-card {
    display: grid;
    grid-template-columns: 2.25rem 1fr;
    gap: 0.8rem;
    align-items: start;
    padding: 0.9rem;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(255, 198, 98, 0.04);
  }

  .tone-default {
    border: 1px solid rgba(200, 148, 55, 0.18);
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.08), rgba(200, 148, 55, 0.02)),
      rgba(12, 8, 4, 0.82);
  }

  .tone-featured {
    grid-template-columns: 2.25rem minmax(0, 1fr) auto;
    border: 1px solid rgba(226, 181, 82, 0.34);
    background:
      radial-gradient(circle at top right, rgba(255, 218, 120, 0.16), transparent 38%),
      linear-gradient(180deg, rgba(230, 178, 74, 0.14), rgba(200, 148, 55, 0.04)),
      rgba(16, 10, 4, 0.88);
    box-shadow:
      inset 0 0 0 1px rgba(255, 216, 125, 0.08),
      0 10px 28px rgba(0, 0, 0, 0.18);
  }

  .tone-warning {
    border: 1px solid rgba(214, 78, 78, 0.4);
    background:
      radial-gradient(circle at top right, rgba(214, 78, 78, 0.14), transparent 42%),
      linear-gradient(180deg, rgba(165, 44, 44, 0.16), rgba(114, 26, 26, 0.06)),
      rgba(16, 8, 8, 0.88);
    box-shadow: inset 0 0 0 1px rgba(255, 132, 132, 0.05);
  }

  .update-feature-icon {
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

  .tone-featured .update-feature-icon {
    border-color: rgba(255, 212, 111, 0.42);
    background: radial-gradient(circle at 30% 30%, rgba(255, 219, 129, 0.34), rgba(194, 120, 25, 0.18));
    color: rgba(255, 226, 150, 0.98);
  }

  .tone-warning .update-feature-icon {
    border-color: rgba(223, 110, 110, 0.42);
    background: radial-gradient(circle at 30% 30%, rgba(224, 112, 112, 0.28), rgba(133, 31, 31, 0.16));
    color: rgba(255, 182, 182, 0.94);
  }

  .update-feature-copy h3 {
    margin: 0 0 0.35rem;
    font-family: 'Cinzel', serif;
    font-size: 0.86rem;
    letter-spacing: 0.06em;
    color: rgba(239, 223, 188, 0.92);
  }

  .update-feature-badge {
    display: inline-flex;
    align-items: center;
    margin: 0 0 0.35rem;
    padding: 0.18rem 0.5rem;
    border: 1px solid rgba(255, 216, 124, 0.32);
    border-radius: 999px;
    background: rgba(255, 216, 124, 0.08);
    color: rgba(255, 222, 148, 0.92);
    font-family: 'Cinzel', serif;
    font-size: 0.54rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .tone-warning .update-feature-copy h3 {
    color: rgba(255, 202, 202, 0.95);
  }

  .update-feature-action {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-height: 100%;
  }

  .featured-support-button {
    display: grid;
    gap: 0.18rem;
    min-width: 13.5rem;
    padding: 0.9rem 1.1rem;
    border: 1px solid rgba(236, 195, 104, 0.34);
    border-radius: 14px;
    background:
      linear-gradient(180deg, rgba(255, 221, 146, 0.12), rgba(204, 142, 40, 0.08)),
      rgba(28, 18, 8, 0.88);
    color: rgba(248, 230, 185, 0.96);
    text-align: left;
    box-shadow:
      inset 0 0 0 1px rgba(255, 225, 154, 0.05),
      0 10px 24px rgba(0, 0, 0, 0.18);
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .featured-support-button:hover {
    transform: translateY(-1px);
    border-color: rgba(255, 214, 118, 0.52);
    background:
      linear-gradient(180deg, rgba(255, 225, 154, 0.16), rgba(214, 152, 48, 0.1)),
      rgba(32, 20, 8, 0.92);
    box-shadow:
      inset 0 0 0 1px rgba(255, 229, 162, 0.06),
      0 14px 28px rgba(0, 0, 0, 0.22);
  }

  .featured-support-lead {
    font-family: 'Cinzel', serif;
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 215, 124, 0.78);
  }

  .featured-support-label {
    font-family: 'Cinzel', serif;
    font-size: 0.92rem;
    letter-spacing: 0.08em;
    color: rgba(255, 235, 190, 0.98);
  }

  :global(.support-modal-body) {
    max-width: 24rem;
  }

  .support-modal-shell {
    display: grid;
    gap: 0.95rem;
    text-align: center;
  }

  .support-modal-copy,
  .support-modal-hint {
    margin: 0;
    line-height: 1.6;
    color: rgba(226, 215, 189, 0.84);
  }

  .payment-frame {
    display: flex;
    justify-content: center;
    padding: 0.8rem;
    border: 1px solid rgba(200, 148, 55, 0.18);
    border-radius: 10px;
    background:
      linear-gradient(180deg, rgba(200, 148, 55, 0.06), rgba(200, 148, 55, 0.02)),
      rgba(12, 8, 4, 0.72);
  }

  .payment-image {
    width: min(100%, 16rem);
    height: auto;
    display: block;
  }

  .update-feature-points {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    color: rgba(233, 222, 198, 0.82);
    line-height: 1.62;
    font-size: 0.88rem;
  }

  .tone-featured .update-feature-points {
    color: rgba(245, 231, 198, 0.9);
  }

  .tone-warning .update-feature-points {
    color: rgba(244, 214, 214, 0.9);
  }

  .update-feature-points li::marker {
    color: rgba(232, 200, 122, 0.72);
  }

  .tone-warning .update-feature-points li::marker {
    color: rgba(239, 126, 126, 0.88);
  }

  @media (max-width: 560px) {
    .update-feature-card {
      grid-template-columns: 1fr;
    }

    .tone-featured {
      grid-template-columns: 1fr;
    }

    .update-feature-icon {
      width: 2rem;
      height: 2rem;
    }

    .update-feature-action {
      justify-content: stretch;
    }

    .featured-support-button {
      width: 100%;
      min-width: 0;
    }
  }
</style>
