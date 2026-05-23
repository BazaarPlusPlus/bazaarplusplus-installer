<script lang="ts">
  import { locale } from '$lib/locale';
  import { formatMessage, messages } from '$lib/i18n';

  function t(key: keyof typeof messages.en): string {
    return formatMessage($locale, key);
  }

  locale.init();
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
