import {
  ChevronRight,
  Image as ImageIcon,
  RefreshCw,
  Swords,
  UserRound,
  Video
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { LoadingPanel } from '../components/ui/LoadingPanel';
import { PageShell } from '../components/ui/PageShell';
import {
  formatDateTime,
  formatRunResultLabel,
  toneColorClass
} from '../features/history/format';
import { StorageCleanupCard } from '../features/history/StorageCleanupCard';
import { useHistoryPage } from '../features/history/useHistoryPage';
import { useI18n } from '../i18n/LocaleProvider';
import type { HistoryRunRow } from '../types/backend';

export default function History() {
  const page = useHistoryPage();
  const { t } = useI18n();

  return (
    <PageShell
      eyebrow="History"
      title={t('historyTitle')}
      className="bpp-history-page"
      action={
        <button
          type="button"
          onClick={page.refresh}
          disabled={page.loading}
          className="bpp-button"
        >
          <RefreshCw size={16} className={page.loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      }
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
        <div className="bpp-history-summary-grid">
          <SummaryCard
            icon={<Swords size={26} strokeWidth={1.75} />}
            label={t('historySummaryRuns')}
            value={page.summary.runs}
            detail={t('historySummaryRunsDescription')}
          />
          <SummaryCard
            icon={<Video size={26} strokeWidth={1.75} />}
            label={t('historySummaryVideos')}
            value={page.summary.videos}
            detail={t('historySummaryVideosDescription')}
          />
          <SummaryCard
            icon={
              <>
                <UserRound size={25} strokeWidth={1.75} />
                <span className="bpp-history-win-mark" />
              </>
            }
            label={t('historySummaryWinRate')}
            value={page.summary.winRate}
            detail={
              page.payload.summary.win_rate === null
                ? t('historySummaryWinRateUnavailable')
                : t('historySummaryWinRateDescription')
            }
          />
        </div>

        <StorageCleanupCard onCompleted={page.refresh} />

        {page.error && <ErrorBanner message={page.error} />}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-2 custom-scrollbar">
          {page.loading ? (
            <LoadingPanel label={t('historyLoading')} />
          ) : page.payload.runs.length === 0 ? (
            <div className="bpp-panel flex h-48 items-center justify-center text-[#777871]">
              {t('noLocalRuns')}
            </div>
          ) : (
            page.payload.runs.map((run: HistoryRunRow) => (
              <RunRow
                key={run.run_id}
                run={run}
                previewUrl={page.previewUrl(run)}
              />
            ))
          )}
        </div>
      </div>
    </PageShell>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="bpp-history-summary-card">
      <div className="bpp-history-stat-orbit" aria-hidden="true">
        <span className="bpp-history-stat-tick is-top" />
        <span className="bpp-history-stat-tick is-bottom" />
        <span className="bpp-history-stat-glyph">{icon}</span>
      </div>
      <div className="bpp-history-stat-copy">
        <span className="bpp-history-stat-label">{label}</span>
        <strong className="bpp-history-stat-value fira-code">{value}</strong>
        <span className="bpp-history-stat-detail">{detail}</span>
      </div>
    </div>
  );
}

function RunRow({
  run,
  previewUrl
}: {
  run: HistoryRunRow;
  previewUrl: string | null;
}) {
  const { t } = useI18n();
  const result = formatRunResultLabel(run.result);
  const detailPath = `/history/${encodeURIComponent(run.run_id)}`;

  return (
    <Link to={detailPath} className="bpp-history-run-card group">
      <div className="bpp-history-run-preview">
        {previewUrl ? (
          // Rounded server crop dimensions can differ slightly from 2000:470.
          // Cover intentionally stays full-bleed; the outline no longer changes
          // this image viewport or adds another layer of crop.
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="bpp-history-run-preview-image"
          />
        ) : (
          <>
            <span className="bpp-history-run-preview-empty" />
            <ImageIcon size={19} />
          </>
        )}
      </div>

      <div className="bpp-history-run-data">
        <div className="bpp-history-run-heading">
          <div className="bpp-history-run-identity">
            <span className="bpp-history-run-hero cinzel">{run.hero}</span>
            <span className="bpp-history-run-date fira-code">
              {formatDateTime(run.started_at_utc)}
            </span>
          </div>

          <span
            className={`bpp-history-run-result ${toneColorClass(result.tone)}`}
          >
            {t(result.key)}
          </span>

          <span className="bpp-history-run-detail">
            <span>{t('viewDetail')}</span>
            <ChevronRight size={14} />
          </span>
        </div>

        <div className="bpp-history-run-metrics">
          <Metric
            label={t('runMetricProgress')}
            value={`${run.victories ?? 0} / ${run.final_day ?? '-'}`}
            fira
          />
          <Metric
            label={t('runStatRank')}
            value={run.final_player_rank ?? '-'}
            gold
          />
          <Metric
            label={t('runStatRating')}
            value={
              run.final_player_rating === null
                ? '-'
                : String(run.final_player_rating)
            }
            fira
          />
        </div>
      </div>
    </Link>
  );
}

function Metric({
  label,
  value,
  gold = false,
  fira = false
}: {
  label: string;
  value: string;
  gold?: boolean;
  fira?: boolean;
}) {
  return (
    <div className="bpp-history-run-metric">
      <span className="bpp-history-run-metric-label cinzel">{label}</span>
      <span
        className={`bpp-history-run-metric-value ${fira ? 'fira-code' : 'cinzel'} ${gold ? 'is-gold' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
