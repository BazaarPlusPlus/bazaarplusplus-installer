import {
  ArrowLeft,
  FileQuestion,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Video
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { HistoryBattleRow } from '../types/backend';
import { useRunDetailPage } from '../features/history/useRunDetailPage';
import { formatDateTime } from '../features/history/format';
import { useI18n } from '../i18n/LocaleProvider';

export default function RunDetail() {
  const navigate = useNavigate();
  const page = useRunDetailPage();
  const detail = page.detail;
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6 h-full overflow-hidden pb-8 max-w-5xl mx-auto w-full">
      <button
        type="button"
        onClick={() => navigate('/history')}
        className="flex items-center gap-2 text-[rgba(200,170,120,0.8)] hover:text-[#e8c87a] transition-colors w-fit cinzel text-sm tracking-wider uppercase"
      >
        <ArrowLeft size={16} />
        {t('runDetailBack')}
      </button>

      {page.loading ? (
        <div className="flex items-center justify-center h-64 text-[rgba(200,170,120,0.65)] gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span>{t('runDetailLoading')}</span>
        </div>
      ) : !detail ? (
        <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm text-[rgba(200,170,120,0.7)]">
          {page.error ?? t('runDetailNotFound')}
        </div>
      ) : (
        <>
          {page.error && (
            <p className="m-0 px-4 py-3 border border-[rgba(217,109,109,0.28)] bg-[rgba(217,109,109,0.08)] text-[#d96d6d] text-sm">
              {page.error}
            </p>
          )}

          <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1 min-w-0">
                <h2 className="cinzel-decorative text-2xl font-bold text-[#e8dcc8] m-0 truncate">
                  {detail.run.hero}
                  <span className="text-[rgba(200,170,120,0.5)]">
                    {' '}
                    · {detail.run.result.toUpperCase()}
                  </span>
                </h2>
                <div className="flex flex-wrap items-center gap-3 fira-code text-xs text-[rgba(200,170,120,0.6)]">
                  <span>Player {detail.run.player_name ?? '-'}</span>
                  <span>•</span>
                  <span>{detail.run.game_mode}</span>
                  <span>•</span>
                  <span>
                    {formatDateTime(detail.run.started_at_utc)} -{' '}
                    {formatDateTime(detail.run.ended_at_utc)}
                  </span>
                  <span>•</span>
                  <span
                    className={
                      detail.run.result === 'win'
                        ? 'text-[#6dd9a0]'
                        : 'text-[#d96d6d]'
                    }
                  >
                    {detail.run.status}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  !detail.run.screenshot_id || page.action === 'screenshot'
                }
                onClick={page.revealScreenshot}
                className="flex items-center gap-2 px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-sm text-[#e8dcc8]"
              >
                <ImageIcon size={16} /> {t('openScreenshotLocation')}
              </button>
            </div>

            <div className="flex gap-12 border-t border-[rgba(200,148,55,0.1)] pt-5">
              <StatBlock
                label={t('statWinLoss')}
                value={`${detail.run.victories ?? '-'} / ${detail.run.losses ?? '-'}`}
              />
              <StatBlock
                label={t('statFinalDay')}
                value={
                  detail.run.final_day ? `Day ${detail.run.final_day}` : '-'
                }
              />
              <StatBlock
                label={t('statFinalRank')}
                value={detail.run.final_player_rank ?? '-'}
                isText
              />
              <StatBlock
                label={t('statFinalRating')}
                value={
                  detail.run.final_player_rating === null
                    ? '-'
                    : String(detail.run.final_player_rating)
                }
              />
            </div>

            <div className="w-full h-24 bg-[#000] border border-[rgba(200,148,55,0.2)] rounded-sm flex items-center justify-center relative overflow-hidden group">
              {page.stripUrl ? (
                <img
                  src={page.stripUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-r from-[rgba(20,10,5,0.8)] via-transparent to-[rgba(20,10,5,0.8)] z-10" />
                  <span className="absolute z-20 text-[rgba(200,170,120,0.5)] flex items-center gap-2 cinzel tracking-widest text-xs uppercase">
                    <ImageIcon size={16} /> End of Run Screenshot
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] overflow-hidden">
            <div className="grid grid-cols-7 gap-4 px-6 py-3 border-b border-[rgba(200,148,55,0.15)] bg-[rgba(200,148,55,0.02)] cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.6)] uppercase">
              <div>Day</div>
              <div>Result</div>
              <div>Opponent Hero</div>
              <div>Opponent Player</div>
              <div>Rank</div>
              <div>Rating</div>
              <div className="text-right">Video</div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {detail.battles.length === 0 ? (
                <div className="px-6 py-8 text-sm text-[rgba(200,170,120,0.55)]">
                  {t('noLocalBattles')}
                </div>
              ) : (
                detail.battles.map((battle) => (
                  <BattleRow
                    key={battle.battle_id}
                    battle={battle}
                    page={page}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatBlock({
  label,
  value,
  isText = false
}: {
  label: string;
  value: string;
  isText?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">
        {label}
      </span>
      <span
        className={`text-xl text-[#e8c87a] ${isText ? 'cinzel font-bold' : 'fira-code'}`}
      >
        {value}
      </span>
    </div>
  );
}

function BattleRow({
  battle,
  page
}: {
  battle: HistoryBattleRow;
  page: ReturnType<typeof useRunDetailPage>;
}) {
  const { t } = useI18n();
  const isWin = battle.result === 'win';
  const videoAction = page.action === `video:${battle.battle_id}`;
  const deleteAction = page.action === `delete:${battle.battle_id}`;

  return (
    <div className="grid grid-cols-7 gap-4 px-6 py-4 border-b border-[rgba(200,148,55,0.05)] items-center relative group hover:bg-[rgba(200,148,55,0.03)] transition-colors">
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.02] flex items-center justify-center">
        <span className="cinzel-decorative text-8xl font-bold text-[#e8c87a]">
          {battle.opponent_hero ?? '-'}
        </span>
      </div>

      <div className="fira-code text-sm text-[rgba(228,216,191,0.8)] relative z-10">
        {battle.day ? `Day ${battle.day}` : '-'}
      </div>
      <div
        className={`cinzel font-bold text-xs relative z-10 ${isWin ? 'text-[#6dd9a0]' : 'text-[#d96d6d]'}`}
      >
        {battle.result.toUpperCase()}
      </div>
      <div className="text-sm text-[#e8dcc8] relative z-10">
        {battle.opponent_hero ?? '-'}
      </div>
      <div className="fira-code text-sm text-[rgba(200,170,120,0.8)] relative z-10">
        {battle.opponent_name ?? '-'}
      </div>
      <div className="text-sm text-[#e8c87a] relative z-10">
        {battle.opponent_rank ?? '-'}
      </div>
      <div className="fira-code text-sm text-[rgba(228,216,191,0.8)] relative z-10">
        {battle.opponent_rating === null ? '-' : battle.opponent_rating}
      </div>

      <div className="flex justify-end gap-2 relative z-10">
        {battle.video ? (
          <>
            <button
              type="button"
              disabled={videoAction}
              onClick={() =>
                page.revealVideo(battle.battle_id, battle.video?.video_id)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-xs text-[#e8dcc8]"
            >
              {videoAction ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Video size={14} />
              )}
              {t('openVideoLocation')}
            </button>
            <button
              type="button"
              disabled={deleteAction}
              onClick={() =>
                battle.video &&
                page.deleteVideo(battle.battle_id, battle.video.video_id)
              }
              className="flex items-center justify-center size-8 rounded-sm hover:bg-[rgba(255,50,50,0.1)] hover:text-[#ff4444] disabled:opacity-40 transition-colors text-[rgba(200,170,120,0.45)]"
              aria-label={t('deleteVideo')}
            >
              {deleteAction ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgba(200,170,120,0.4)] cursor-not-allowed">
            <FileQuestion size={14} /> {t('noVideo')}
          </span>
        )}
      </div>
    </div>
  );
}
