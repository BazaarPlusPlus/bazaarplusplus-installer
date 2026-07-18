import { ExternalLink } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ProblemBanner } from '../components/ui/ProblemBanner';
import { useAppBootstrap } from '../features/about/AppBootstrapProvider';
import type {
  AppBootstrapSnapshot,
  AppBootstrapUnavailableField
} from '../features/about/appBootstrap';
import { presentAboutProblem } from '../features/about/aboutProblems';
import { formatProblemDiagnostic } from '../features/shared/problems';
import { useI18n } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import type { AppBootstrap, AppCredit } from '../types/backend';
import fableVerifiedBadge from '../../static/about/fable-5-verified.webp';

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
  const { resource, retry } = useAppBootstrap();

  return <AboutView resource={resource} onRetry={retry} />;
}

export function AboutView({
  resource,
  onRetry
}: {
  resource: AppBootstrapSnapshot;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const bootstrap = resource.data;

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12 max-w-5xl mx-auto">
      <PageHeader eyebrow="About" title={t('aboutTitle')} />

      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        <AboutBootstrapFeedback resource={resource} onRetry={onRetry} />

        {bootstrap ? (
          <AboutBootstrapContent bootstrap={bootstrap} resource={resource} />
        ) : null}
      </div>
    </div>
  );
}

function AboutBootstrapContent({
  bootstrap,
  resource
}: {
  bootstrap: AppBootstrap;
  resource: AppBootstrapSnapshot;
}) {
  const { t } = useI18n();

  return (
    <>
      <section className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h3 className="cinzel font-bold text-lg text-[#e8c87a] m-0">
              BazaarPlusPlus
            </h3>
            <div className="flex items-center gap-3 selectable">
              <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
                {t('aboutAppLabel')}
              </span>
              <span
                aria-label={`${t('aboutAppLabel')} ${bootstrap.app_version}`}
                className="selectable px-2 py-0.5 bg-[rgba(80,180,120,0.15)] text-[#6dd9a0] border border-[rgba(80,180,120,0.25)] rounded-sm text-[10px] fira-code"
              >
                v{bootstrap.app_version}
              </span>
              <div className="w-px h-3 bg-gradient-to-b from-transparent via-[rgba(200,170,120,0.45)] to-transparent" />
              <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
                {t('aboutBppLabel')}
              </span>
              <span
                aria-label={`${t('aboutBppLabel')} ${bootstrap.bundled_bpp_version ?? t('aboutUnavailableValue')}`}
                className="selectable text-[10px] text-[rgba(200,170,120,0.8)] fira-code"
              >
                {bootstrap.bundled_bpp_version ?? t('aboutUnavailableValue')}
              </span>
            </div>
            <BootstrapProvenance resource={resource} />
          </div>
          <a
            href={bootstrap.links.github}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 border border-[rgba(214,169,84,0.24)] rounded-[3px] bg-gradient-to-b from-[rgba(200,148,55,0.12)] to-[rgba(200,148,55,0.06)] text-[rgba(236,225,202,0.88)] cinzel text-[10px] tracking-[0.12em] uppercase no-underline hover:border-[rgba(200,148,55,0.4)]"
          >
            GitHub
            <ExternalLink size={12} />
          </a>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent my-2" />

        <div className="flex flex-col gap-5">
          {groupCredits(bootstrap.credits).map((group) => (
            <div key={group.key} className="flex flex-col gap-3">
              <h4 className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.75)] uppercase m-0">
                {t(CREDIT_GROUP_LABELS[group.key] ?? 'aboutCredits')}
              </h4>
              <ul className="flex flex-col gap-1 m-0 p-0 list-none">
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

      <section className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-4">
        <h3 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] uppercase m-0">
          {t('aboutLicenses')}
        </h3>
        <ul className="flex flex-col gap-1 m-0 p-0 list-none">
          {bootstrap.licenses.map((license) => (
            <ListItem
              key={`${license.name}:${license.category}`}
              name={license.name}
              role={license.license}
              isLicense
            />
          ))}
        </ul>
      </section>

      <footer className="mt-2 flex flex-col items-center">
        <img
          src={fableVerifiedBadge}
          alt={t('aboutVerifiedBadge')}
          draggable={false}
          className="w-full max-w-[400px] h-auto select-none opacity-90"
        />
      </footer>
    </>
  );
}

function AboutBootstrapFeedback({
  resource,
  onRetry
}: {
  resource: AppBootstrapSnapshot;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (resource.phase === 'authoritative') return null;

  if (resource.phase === 'initial-loading') {
    return (
      <ProblemBanner
        tone="warning"
        message={t(
          resource.data ? 'aboutLoadingBootstrap' : 'aboutLoadingBootstrapOnly'
        )}
      />
    );
  }

  const diagnostic = resource.problem?.diagnostic
    ? formatProblemDiagnostic(resource.problem)
    : null;
  const retryAction = resource.problem ? (
    <button
      type="button"
      onClick={onRetry}
      disabled={resource.retrying}
      aria-busy={resource.retrying}
      className="underline underline-offset-2 disabled:opacity-60"
    >
      {resource.retrying ? t('aboutRetrying') : t('retry')}
    </button>
  ) : null;

  if (resource.phase === 'blocking-failure') {
    return (
      <ProblemBanner
        message={t('aboutBlockingFailure')}
        diagnostic={diagnostic}
        diagnosticLabel={t('problemDiagnostics')}
        actions={retryAction}
      />
    );
  }

  return (
    <ProblemBanner
      tone={resource.problem ? 'error' : 'warning'}
      message={
        resource.problem
          ? presentAboutProblem(resource.problem, t)
          : t('aboutFallbackPreview')
      }
      diagnostic={diagnostic}
      diagnosticLabel={t('problemDiagnostics')}
      actions={retryAction}
    />
  );
}

function BootstrapProvenance({ resource }: { resource: AppBootstrapSnapshot }) {
  const { t } = useI18n();
  const source =
    resource.source === 'native'
      ? t('aboutDataSourceNative')
      : t('aboutDataSourceFallback');
  const unavailable = resource.unavailableFields
    .map((field) => t(bootstrapFieldLabel(field)))
    .join(', ');

  return (
    <div className="flex flex-col gap-1 text-[10px] text-[rgba(200,170,120,0.68)]">
      <p className="m-0">
        {t('aboutDataSourceLabel')}:{' '}
        <span className="selectable">{source}</span>
      </p>
      {unavailable && (
        <p className="m-0">
          {t('aboutUnavailableFieldsLabel')}:{' '}
          <span className="selectable">{unavailable}</span>
        </p>
      )}
    </div>
  );
}

function bootstrapFieldLabel(field: AppBootstrapUnavailableField): MessageKey {
  switch (field) {
    case 'bundled_bpp_version':
      return 'aboutBppLabel';
  }
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
  const nameClassName = 'fira-code text-xs text-[rgba(228,216,191,0.85)]';

  return (
    <li className="flex items-center justify-between px-3 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.08)] rounded-sm hover:bg-[rgba(200,148,55,0.08)] transition-colors">
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
