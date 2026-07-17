import { ChevronRight, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
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
      action={
        <button
          type="button"
          onClick={page.refresh}
          disabled={page.loading}
          className="bpp-button"
        >
          <RefreshCw size={14} className={page.loading ? 'animate-spin' : ''} />
          {t('refresh')}
        </button>
      }
    >
      <div className="flex min-h-0 w-full flex-1 flex-col gap-5">
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <SummaryCard
            label={t('historySummaryRuns')}
            value={page.summary.runs}
          />
          <SummaryCard
            label={t('historySummaryVideos')}
            value={page.summary.videos}
          />
          <SummaryCard
            label={t('historySummaryWinRate')}
            value={page.summary.winRate}
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
  label,
  value,
  isFira = false
}: {
  label: string;
  value: string;
  isFira?: boolean;
}) {
  return (
    <div className="bpp-panel relative flex min-h-[82px] flex-col items-center justify-center gap-1 overflow-hidden p-4 before:absolute before:inset-y-3 before:left-0 before:w-[2px] before:bg-[#d47b16]">
      <span className="text-[9px] uppercase tracking-[.14em] text-[#6c6c67]">
        {label}
      </span>
      <span
        className={`text-2xl text-[#df851b] ${isFira ? 'fira-code' : 'font-bold'}`}
      >
        {value}
      </span>
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
    <Link
      to={detailPath}
      className="bpp-panel group grid grid-cols-[11rem_minmax(0,1fr)_7rem_5rem_4rem_5rem_auto] items-center gap-5 p-3 text-inherit no-underline transition-all hover:border-[rgba(230,137,22,.42)] hover:bg-[rgba(222,128,17,.035)] max-[1040px]:grid-cols-[9rem_minmax(0,1fr)_6rem_4rem_4rem_auto]"
    >
      <div className="relative flex aspect-[2000/470] w-44 shrink-0 items-center justify-center overflow-hidden rounded-[2px] bg-[#030506] text-[#56544f] outline outline-1 outline-[rgba(211,130,26,.19)] transition-colors group-hover:outline-[rgba(230,137,22,.46)] max-[1040px]:w-36">
        {previewUrl ? (
          // Rounded server crop dimensions can differ slightly from 2000:470.
          // Cover intentionally stays full-bleed; the outline no longer changes
          // this image viewport or adds another layer of crop.
          <img
            src={previewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <>
            <div className="absolute inset-0 opacity-20 bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.2)] to-transparent" />
            <ImageIcon size={20} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0">
        <span className="cinzel font-bold text-lg text-[#e8dcc8] truncate">
          {run.hero}
        </span>
        <span className="fira-code text-[10px] text-[rgba(200,170,120,0.8)] truncate">
          {formatDateTime(run.started_at_utc)}
        </span>
      </div>

      <span
        className={`font-bold text-sm whitespace-nowrap ${toneColorClass(
          result.tone
        )}`}
      >
        {t(result.key)}
      </span>

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
      <div className="max-[1040px]:hidden">
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

      <div className="flex items-center gap-1 text-[rgba(200,170,120,0.55)] group-hover:text-[#e8c87a] transition-colors whitespace-nowrap">
        <span className="cinzel text-[10px] tracking-widest uppercase">
          {t('viewDetail')}
        </span>
        <ChevronRight size={14} />
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
    <div className="flex flex-col gap-1 items-end text-right">
      <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.8)] uppercase">
        {label}
      </span>
      <span
        className={`text-sm ${fira ? 'fira-code' : 'cinzel'} ${
          gold ? 'text-[#e8c87a]' : 'text-[#e8dcc8]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
