import { ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { useAppBootstrap } from '../features/about/AppBootstrapProvider';
import { useI18n } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import type { AppCredit } from '../types/backend';
import fableVerifiedBadge from '../../static/about/fable-5-verified.webp';
import { BrandMark } from '../components/brand/BrandMark';

// Credits are split into ordered groups by their `group` field so contributors
// stay separate from the external data/inspiration sources we acknowledge.
const CREDIT_GROUP_LABELS: Record<string, MessageKey> = {
  team: 'aboutCredits',
  acknowledgement: 'aboutAcknowledgements'
};

function groupCredits(
  credits: readonly AppCredit[]
): { key: string; items: AppCredit[] }[] {
  const groups: { key: string; items: AppCredit[] }[] = [];
  for (const credit of credits) {
    const existing = groups.find((group) => group.key === credit.group);
    if (existing) {
      existing.items.push(credit);
    } else {
      groups.push({ key: credit.group, items: [credit] });
    }
  }
  return groups;
}

export default function About() {
  const { bootstrap } = useAppBootstrap();
  const { t } = useI18n();

  return (
    <div className="bpp-page pb-8">
      <PageHeader eyebrow="About" title={t('aboutTitle')} />

      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <section className="bpp-panel relative overflow-hidden p-6">
          <div className="absolute right-5 top-4 text-[10px] tracking-[.24em] text-[rgba(220,128,18,.34)]">
            B++
          </div>
          <div className="flex items-center gap-8">
            <div className="relative flex size-[150px] shrink-0 items-center justify-center rounded-[4px] border border-[rgba(218,132,26,.22)] bg-[rgba(5,9,11,.56)]">
              <div className="absolute inset-3 border border-[rgba(218,132,26,.09)]" />
              <BrandMark className="!size-[105px]" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-[26px] font-[760] tracking-[.02em] text-[#dcd7cf]">
                BazaarPlusPlus
              </h3>
              <p className="mt-2 text-[12px] text-[#77766f]">
                {t('aboutTagline')}
              </p>
              <div className="mt-7 grid max-w-[520px] grid-cols-[auto_1fr] gap-x-4 gap-y-3 selectable">
                <span className="text-[11px] text-[#858079]">
                  {t('aboutAppLabel')}
                </span>
                <span className="bpp-version-chip w-fit">
                  v{bootstrap.app_version}
                </span>
                <span className="text-[11px] text-[#858079]">
                  {t('aboutBppLabel')}
                </span>
                <span className="bpp-version-chip w-fit">
                  {bootstrap.bundled_bpp_version ?? '-'}
                </span>
              </div>
            </div>
            <a
              href={bootstrap.links.github}
              target="_blank"
              rel="noreferrer"
              className="bpp-button bpp-button-primary min-w-[150px] no-underline"
            >
              GitHub
              <ExternalLink size={12} />
            </a>
          </div>
        </section>

        <section className="bpp-panel p-5">
          <h3 className="bpp-section-label">{t('aboutCredits')}</h3>
          <div className="flex flex-col gap-5">
            {groupCredits(bootstrap.credits).map((group) => (
              <div key={group.key} className="flex flex-col gap-3">
                <h4 className="m-0 text-[9px] uppercase tracking-[.14em] text-[#a06b2c]">
                  {t(CREDIT_GROUP_LABELS[group.key] ?? 'aboutCredits')}
                </h4>
                <ul className="m-0 grid list-none grid-cols-2 gap-1 p-0 max-[900px]:grid-cols-1">
                  {group.items.map((credit) => (
                    <ListItem
                      key={`${credit.name}:${credit.role}`}
                      name={credit.name}
                      role={credit.role}
                      href={credit.href}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <details className="bpp-panel group p-5">
          <summary className="list-none text-[11px] font-semibold uppercase tracking-[.12em] text-[#8f8a82] [&::-webkit-details-marker]:hidden">
            {t('aboutLicenses')}
            <span className="ml-2 text-[#d17b18]">+</span>
          </summary>
          <ul className="m-0 mt-4 grid list-none grid-cols-2 gap-1 p-0">
            {bootstrap.licenses.map((license) => (
              <ListItem
                key={`${license.name}:${license.category}`}
                name={license.name}
                role={license.license}
                isLicense
              />
            ))}
          </ul>
        </details>

        <footer className="mt-1 flex flex-col items-center opacity-55">
          <img
            src={fableVerifiedBadge}
            alt={t('aboutVerifiedBadge')}
            draggable={false}
            className="h-auto w-full max-w-[300px] select-none"
          />
        </footer>
      </div>
    </div>
  );
}

function ListItem({
  name,
  role,
  href,
  isLicense = false
}: {
  name: string;
  role?: string;
  href?: string | null;
  isLicense?: boolean;
}) {
  const nameClassName = 'fira-code text-xs text-[#bdb8b0]';

  return (
    <li className="flex items-center justify-between rounded-[3px] border border-[rgba(203,132,38,.1)] bg-[rgba(213,131,26,.025)] px-3 py-2 transition-colors hover:bg-[rgba(213,131,26,.055)]">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} GitHub`}
          className={`${nameClassName} inline-flex items-center gap-1 rounded-[2px] no-underline hover:text-[#e8c87a] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(200,148,55,0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#120b05]`}
        >
          {name}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      ) : (
        <span className={nameClassName}>{name}</span>
      )}
      {role && (
        <span
          className={`${isLicense ? 'fira-code text-[10px]' : 'cinzel text-[10px] tracking-widest uppercase'} text-[rgba(200,170,120,0.8)]`}
        >
          {role}
        </span>
      )}
    </li>
  );
}
