import {
  AlertCircle,
  Copy,
  ExternalLink,
  Maximize,
  Minimize,
  Radio,
  RefreshCw,
  Settings2
} from 'lucide-react';
import type { StreamOverlayDisplayMode } from '../types/backend';
import { useStreamPage } from '../features/stream/useStreamPage';

const displayModes: Array<{ value: StreamOverlayDisplayMode; label: string }> =
  [
    { value: 'current', label: '战斗场数' },
    { value: 'hero', label: '完整英雄' },
    { value: 'herohalf', label: '半高英雄' }
  ];

export default function Stream() {
  const page = useStreamPage();
  const { status, cropSettings, dbPath, viewModel } = page;
  const dbLabel = dbPath.found ? 'DB Connected' : 'DB Missing';

  return (
    <div className="flex flex-col gap-6 w-full h-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 shrink-0">
        <p className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.52)] uppercase">
          Stream Mode
        </p>
        <h2 className="cinzel text-lg tracking-wider text-[rgba(232,220,194,0.92)] uppercase m-0">
          直播模式
        </h2>
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-8 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border ${
                  viewModel.statusLabel === 'Overlay Error'
                    ? 'bg-[rgba(210,80,80,0.15)] border-[rgba(210,80,80,0.3)] text-[#d96d6d]'
                    : status.running
                      ? 'bg-[rgba(80,180,120,0.15)] border-[rgba(80,180,120,0.3)] text-[#6dd9a0]'
                      : 'bg-[rgba(200,148,55,0.1)] border-[rgba(200,148,55,0.22)] text-[#e8c87a]'
                }`}
              >
                {viewModel.statusLabel === 'Overlay Error' ? (
                  <AlertCircle size={16} />
                ) : status.running ? (
                  <Radio size={16} className="animate-pulse" />
                ) : (
                  <RefreshCw
                    size={16}
                    className={viewModel.isBusy ? 'animate-spin' : ''}
                  />
                )}
              </div>
              <div>
                <h3 className="font-bold text-[#e8dcc8] flex items-center gap-2">
                  {viewModel.statusLabel}
                </h3>
                <p className="text-xs text-[rgba(200,170,120,0.6)] fira-code mt-0.5">
                  {viewModel.statusDetail}
                  {status.running ? ` · ${dbLabel}` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!viewModel.canOpenOverlay}
                onClick={page.openOverlay}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-xs text-[#e8dcc8]"
              >
                <ExternalLink size={14} /> 打开预览页
              </button>
              <button
                type="button"
                disabled={!viewModel.canRestart}
                onClick={page.restart}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.06)] transition-colors text-xs text-[#e8dcc8]"
              >
                <RefreshCw
                  size={14}
                  className={page.action === 'restart' ? 'animate-spin' : ''}
                />
                重启服务
              </button>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-[rgba(200,148,55,0.3)] to-transparent opacity-50" />

          <div className="flex flex-col gap-2">
            <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
              OBS URL
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] overflow-hidden text-ellipsis whitespace-nowrap">
                {viewModel.obsUrl ?? '服务启动后显示 OBS Browser Source 地址'}
              </div>
              <button
                type="button"
                disabled={!viewModel.obsUrl}
                onClick={page.copyObsUrl}
                className="flex items-center gap-2 px-4 py-2 bg-[rgba(200,148,55,0.1)] border border-[rgba(180,130,48,0.3)] rounded-sm hover:bg-[rgba(200,148,55,0.2)] disabled:opacity-40 disabled:hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
              >
                <Copy size={16} /> 复制
              </button>
            </div>
            {(page.message || page.error) && (
              <p
                className={`m-0 text-xs ${
                  page.error
                    ? 'text-[#d96d6d]'
                    : 'text-[rgba(109,217,160,0.86)]'
                }`}
              >
                {page.error ?? page.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 bg-[rgba(200,148,55,0.02)] p-4 rounded-sm border border-[rgba(200,148,55,0.08)]">
            <div className="flex justify-between items-center">
              <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
                展示窗口
              </label>
              <span className="text-xs text-[rgba(200,170,120,0.8)]">
                {status.active_window_offset === 0
                  ? '当前展示最新记录'
                  : `向前补 ${status.active_window_offset} 条记录`}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <button
                type="button"
                disabled={!status.running || page.action === 'window'}
                onClick={() => page.moveWindow(1)}
                className="flex flex-col items-center gap-1 p-2 text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] disabled:opacity-40 transition-colors"
              >
                <Maximize size={16} />
                <span className="text-[10px]">↑ 更多历史</span>
              </button>

              <div className="flex-1 px-8 flex items-center justify-center">
                <div className="w-full max-w-sm h-8 relative flex items-center">
                  <div className="absolute inset-0 bg-[rgba(0,0,0,0.3)] rounded-full border border-[rgba(200,148,55,0.2)] overflow-hidden">
                    <div className="h-full w-3/4 bg-[rgba(200,148,55,0.15)] ml-auto border-l border-[rgba(200,148,55,0.4)]" />
                  </div>
                  <div className="absolute left-1/4 -translate-x-1/2 -top-6 text-[10px] fira-code text-[rgba(200,170,120,0.8)]">
                    START
                  </div>
                  <div className="absolute right-0 translate-x-1/2 -top-6 text-[10px] fira-code text-[#e8c87a] font-bold">
                    LIVE
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  !status.running ||
                  status.active_window_offset === 0 ||
                  page.action === 'window'
                }
                onClick={() => page.moveWindow(-1)}
                className="flex flex-col items-center gap-1 p-2 text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] disabled:opacity-40 transition-colors"
              >
                <Minimize size={16} />
                <span className="text-[10px]">↓ 更少历史</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-2 pt-4 border-t border-[rgba(200,148,55,0.1)]">
              <InfoMetric label="Host" value={status.host} />
              <InfoMetric
                label="Port"
                value={status.port ? String(status.port) : '-'}
              />
              <InfoMetric label="DB" value={dbLabel} />
              <InfoMetric
                label="Window"
                value={String(status.active_window_offset)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">
              Overlay 配置
            </label>

            <div className="flex gap-2">
              {displayModes.map((mode) => (
                <label key={mode.value} className="flex-1 cursor-pointer">
                  <input
                    type="radio"
                    name="displayMode"
                    className="peer sr-only"
                    checked={cropSettings.display_mode === mode.value}
                    onChange={() => page.changeDisplayMode(mode.value)}
                  />
                  <div className="px-3 py-2 text-center text-sm border border-[rgba(180,130,48,0.3)] rounded-sm text-[rgba(228,216,191,0.6)] peer-checked:bg-[rgba(200,148,55,0.15)] peer-checked:text-[#e8c87a] peer-checked:border-[rgba(200,148,55,0.6)] transition-all">
                    {mode.label}
                  </div>
                </label>
              ))}
            </div>

            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="输入裁切代码..."
                value={page.cropCode}
                onChange={(event) => page.setCropCode(event.target.value)}
                className="flex-1 min-w-0 px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] focus:outline-none focus:border-[rgba(200,148,55,0.6)]"
              />
              <button
                type="button"
                onClick={page.submitCropCode}
                disabled={page.action === 'crop'}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-sm text-[#e8dcc8]"
              >
                应用裁切代码
              </button>
              <button
                type="button"
                onClick={page.resetCropCode}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-transparent border border-transparent hover:bg-[rgba(255,255,255,0.05)] rounded-sm transition-colors text-sm text-[rgba(200,170,120,0.6)]"
              >
                恢复默认裁切
              </button>
              <button
                type="button"
                disabled={!viewModel.canOpenSettings}
                onClick={page.openSettings}
                className="shrink-0 whitespace-nowrap px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] disabled:opacity-40 transition-colors text-sm text-[#e8dcc8] flex items-center gap-2"
              >
                <Settings2 size={16} /> 打开校准页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-[rgba(200,170,120,0.5)]">{label}</span>
      <span className="text-xs fira-code text-[#e8dcc8]">{value}</span>
    </div>
  );
}
