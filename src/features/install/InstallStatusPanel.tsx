import { CheckCircle2, FolderOpen, RefreshCw } from 'lucide-react';
import theBazaarLogoPng from '../../../static/games/the-bazaar-logo.png';
import { BrandMark } from '../../components/brand/BrandMark';
import { useI18n } from '../../i18n/LocaleProvider';
import type { useInstallPage } from './useInstallPage';

type InstallPage = ReturnType<typeof useInstallPage>;

export function InstallStatusPanel({ page }: { page: InstallPage }) {
  const { t } = useI18n();
  const gameReady = page.status.gameTone === 'ok';
  const modReady = page.status.modTone === 'ok';

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section>
        <h3 className="bpp-section-label">{t('currentStatusHeading')}</h3>
        <div className="bpp-panel overflow-hidden">
          <div className="flex min-h-[190px] items-center gap-6 p-6">
            <div className="relative flex size-[132px] shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-[rgba(220,132,24,.24)] bg-[rgba(6,10,12,.72)]">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(225,132,20,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(225,132,20,.1)_1px,transparent_1px)] [background-size:18px_18px]" />
              <div className="absolute inset-3 border border-[rgba(223,132,20,.11)]" />
              <img
                src={theBazaarLogoPng}
                alt="The Bazaar"
                draggable={false}
                className="relative size-[78px] object-contain drop-shadow-[0_0_12px_rgba(227,133,24,.24)]"
              />
            </div>

            <div className="min-w-0 flex-1">
              <h4 className="m-0 text-[24px] font-[760] tracking-[.02em] text-[#ded9d1]">
                THE BAZAAR
              </h4>
              <div
                className={`mt-3 inline-flex items-center gap-2 rounded-[2px] border px-2 py-1 text-xs ${gameReady
                  ? 'border-[rgba(82,179,107,.28)] bg-[rgba(82,179,107,.09)] text-[#59b970]'
                  : 'border-[rgba(224,132,24,.26)] bg-[rgba(224,132,24,.07)] text-[#d58a2d]'
                  }`}
              >
                <CheckCircle2 size={14} />
                {page.status.gameLabel}
              </div>
              <p
                className="selectable mt-3 truncate fira-code text-[11px] text-[#777771]"
                title={page.state.selected_game_path ?? undefined}
              >
                {page.state.selected_game_path ?? t('gamePathEmpty')}
              </p>
              <p className="mt-4 fira-code text-xs text-[#dc841d]">
                {page.state.game.display_version ?? page.status.modVersion}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 border-t border-[rgba(215,132,28,.13)] bg-[rgba(255,255,255,.008)] px-5 py-4">
            <BrandMark compact />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-bold tracking-[.03em] text-[#d8d3cb]">
                BAZAARPLUSPLUS
              </p>
              <p
                className={`mt-1 text-[11px] ${modReady ? 'text-[#55b46d]' : 'text-[#cf811e]'}`}
              >
                {page.status.modLabel} · {page.status.modVersion}
              </p>
            </div>
            <span className="bpp-version-chip">{page.status.modVersion}</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="bpp-section-label">{t('gamePathHeading')}</h3>
        <div className="flex gap-3">
          <div className="bpp-input flex min-w-0 flex-1 items-center gap-3 px-4 fira-code text-xs">
            <FolderOpen size={17} className="shrink-0 text-[#8f8a82]" />
            <span
              className="selectable truncate"
              title={page.state.selected_game_path ?? t('notSelected')}
            >
              {page.state.selected_game_path ?? t('gamePathEmpty')}
            </span>
          </div>
          <button
            type="button"
            disabled={page.busy}
            onClick={page.chooseDirectory}
            className="bpp-button bpp-button-filled shrink-0"
          >
            {t('chooseAgain')}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            disabled={page.busy}
            onClick={() => page.refresh()}
            className="bpp-button bpp-button-filled"
          >
            <RefreshCw
              size={14}
              className={page.action === 'load' ? 'animate-spin' : ''}
            />
            {t('recheck')}
          </button>
          <span
            className={`text-[11px] ${gameReady ? 'text-[#55b46d]' : 'text-[#777771]'}`}
          >
            <span className="bpp-status-dot mr-2 !size-[7px]" />
            {page.status.gameLabel}
          </span>
        </div>
      </section>
    </div>
  );
}
