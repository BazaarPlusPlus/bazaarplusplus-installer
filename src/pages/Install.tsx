import {
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useInstallPage } from '../features/install/useInstallPage';

export default function Install() {
  const page = useInstallPage();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const primaryDisabled =
    page.busy ||
    (!page.state.actions.can_install && !page.state.actions.can_reinstall);

  const confirmInstall = async () => {
    await page.install();
    setShowInstallModal(false);
    setInstallAcknowledged(false);
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full max-w-5xl mx-auto">
      <PageHeader eyebrow="Install Mode" title="安装模式" />

      <div className="grid grid-cols-12 gap-8 w-full">
        <div className="col-span-7 flex flex-col gap-6">
          <div className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-6 h-full">
            <section>
              <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">
                当前状态
              </h2>
              <div className="grid gap-3">
                <StatusCard
                  title="The Bazaar"
                  detail={
                    page.state.game.display_version ??
                    page.state.selected_game_path ??
                    '-'
                  }
                  label={page.status.gameLabel}
                  tone={page.status.gameTone}
                />
                <StatusCard
                  title="BazaarPlusPlus"
                  detail={page.status.modVersion}
                  label={page.status.modLabel}
                  tone={page.status.modTone}
                />
              </div>
            </section>

            <section className="mt-auto">
              <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">
                游戏路径
              </h2>
              <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-3 fira-code text-sm text-[#e8dcc8] mb-4 overflow-hidden">
                  <FolderOpen
                    size={16}
                    className="text-[rgba(200,170,120,0.8)] shrink-0"
                  />
                  <span
                    className="truncate"
                    title={page.state.selected_game_path ?? '未选择'}
                  >
                    {page.state.selected_game_path ??
                      '未选择 The Bazaar 安装目录'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page.busy}
                    onClick={page.chooseDirectory}
                    className="px-4 py-1.5 text-xs bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] disabled:opacity-40 transition-colors text-[#e8dcc8]"
                  >
                    重新选择
                  </button>
                  <button
                    type="button"
                    disabled={page.busy}
                    onClick={() => page.refresh()}
                    className="px-4 py-1.5 text-xs bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] disabled:opacity-40 transition-colors text-[#e8dcc8]"
                  >
                    重新检测
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="col-span-5 flex flex-col gap-6">
          <div className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-5 h-full">
            <section className="flex-1 flex flex-col">
              <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">
                安装操作
              </h2>
              <div className="flex flex-col gap-5 flex-1">
                <div className="text-center pb-2">
                  <button
                    type="button"
                    disabled={
                      !page.state.actions.can_launch || page.action === 'launch'
                    }
                    onClick={page.launch}
                    className="w-full py-4 bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] font-bold cinzel tracking-wider rounded-sm shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110 disabled:opacity-45 disabled:hover:brightness-100 transition-all flex items-center justify-center gap-2 text-lg"
                  >
                    {page.action === 'launch' ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Play size={20} fill="currentColor" />
                    )}
                    启动游戏
                  </button>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent" />

                <ul className="flex flex-col gap-2">
                  <FactItem
                    label="BazaarPlusPlus"
                    value={
                      page.state.mod_state.installed
                        ? 'Installed'
                        : 'Not Installed'
                    }
                  />
                  <FactItem
                    label="Plugin Loader"
                    value={page.state.mod_state.bundled_version ?? 'Bundled'}
                  />
                  <FactItem label=".NET Runtime" value={page.status.dotnet} />
                  <FactItem label="Game Client" value={page.status.steam} />
                </ul>

                {page.state.warnings.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {page.state.warnings.map((warning) => (
                      <p
                        key={warning.code}
                        className="m-0 flex items-start gap-2 text-xs text-[rgba(232,190,120,0.82)]"
                      >
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{warning.message}</span>
                      </p>
                    ))}
                  </div>
                )}

                {(page.error || page.message) && (
                  <p
                    className={`m-0 text-xs ${page.error ? 'text-[#d96d6d]' : 'text-[#6dd9a0]'}`}
                  >
                    {page.error ?? page.message}
                  </p>
                )}

                <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent" />

                <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                  <ActionButton
                    disabled={primaryDisabled}
                    busy={page.action === 'install'}
                    onClick={() => {
                      setShowInstallModal(true);
                      setInstallAcknowledged(false);
                    }}
                    icon={<RefreshCw size={14} />}
                    label={page.status.primaryAction}
                  />
                  <ActionButton
                    disabled={page.busy || !page.state.actions.can_repair}
                    busy={page.action === 'repair'}
                    onClick={page.repair}
                    icon={<Wrench size={14} />}
                    label="修复"
                  />
                  <ActionButton
                    disabled={page.busy || !page.state.actions.can_uninstall}
                    busy={page.action === 'uninstall'}
                    onClick={page.uninstall}
                    icon={<Trash2 size={14} />}
                    label="卸载"
                    danger
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="bg-[#0b0906] border border-[rgba(200,148,55,0.18)] rounded-[4px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] w-full max-w-md mx-4 relative animate-[fade-up_0.2s_ease-out]">
            <div className="flex justify-between items-center px-5 py-4 border-b border-[rgba(200,148,55,0.15)] bg-[rgba(200,148,55,0.02)]">
              <div className="flex items-center gap-3">
                <DownloadCloud
                  size={18}
                  className="text-[rgba(200,148,55,0.8)]"
                />
                <h2 className="cinzel text-[1.1rem] text-[#e8dcc8] m-0 tracking-wider">
                  安装 BazaarPlusPlus
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-4 p-4 border border-[rgba(200,148,55,0.14)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.04)] to-[rgba(200,148,55,0.015)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.03)]">
                <div className="flex justify-between items-center gap-4">
                  <div className="flex flex-col gap-1.5">
                    <p className="cinzel text-[10px] tracking-[0.18em] text-[rgba(216,188,123,0.8)] uppercase m-0">
                      使用教程
                    </p>
                    <p className="text-[13px] leading-relaxed text-[rgba(200,170,120,0.7)] m-0">
                      安装会写入 BazaarPlusPlus 与 BepInEx 组件。
                    </p>
                  </div>
                  <a
                    href="https://bazaarplusplus.com/tutorial"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 border border-[rgba(214,169,84,0.24)] rounded-[3px] bg-gradient-to-b from-[rgba(200,148,55,0.12)] to-[rgba(200,148,55,0.06)] text-[rgba(236,225,202,0.88)] cinzel text-[10px] tracking-[0.12em] uppercase hover:border-[rgba(200,148,55,0.4)] transition-all no-underline"
                  >
                    查看教程
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {page.state.steam_running && (
                <div className="flex items-start gap-3 p-4 border border-[rgba(232,190,120,0.24)] rounded-[4px] bg-[rgba(200,148,55,0.08)] text-[rgba(232,220,194,0.82)]">
                  <AlertCircle
                    size={16}
                    className="mt-0.5 shrink-0 text-[rgba(232,190,120,0.9)]"
                  />
                  <p className="m-0 text-[13px] leading-relaxed">
                    Steam 正在运行。安装器不会自动关闭 Steam；请先手动退出
                    Steam，再继续安装以确保启动项写入生效。
                  </p>
                </div>
              )}

              <label className="flex items-start gap-3 p-3 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.055)] to-[rgba(200,148,55,0.015)] cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={installAcknowledged}
                  onChange={(event) =>
                    setInstallAcknowledged(event.target.checked)
                  }
                />
                <span className="text-[13px] leading-relaxed text-[rgba(232,220,194,0.78)]">
                  我确认安装插件存在风险，并愿意自行承担相关责任
                </span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="px-5 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={!installAcknowledged || page.action === 'install'}
                  onClick={confirmInstall}
                  className="px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110 disabled:opacity-45 disabled:hover:brightness-100"
                >
                  {page.action === 'install' ? '安装中...' : '确认安装'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusCard({
  title,
  detail,
  label,
  tone
}: {
  title: string;
  detail: string;
  label: string;
  tone: 'ok' | 'warn';
}) {
  return (
    <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="cinzel font-bold text-[#e8dcc8]">{title}</h3>
        <p
          className="fira-code text-xs text-[rgba(200,170,120,0.5)] mt-1 truncate"
          title={detail}
        >
          {detail}
        </p>
      </div>
      <div
        className={`flex items-center gap-2 px-3 py-1 rounded-sm border text-xs shrink-0 ${tone === 'ok' ? 'text-[#6dd9a0] bg-[rgba(80,180,120,0.15)] border-[rgba(80,180,120,0.25)]' : 'text-[rgba(232,190,120,0.9)] bg-[rgba(200,148,55,0.12)] border-[rgba(200,148,55,0.24)]'}`}
      >
        {tone === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

function FactItem({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between text-sm border-b border-[rgba(200,148,55,0.08)] py-2">
      <span className="text-[rgba(200,170,120,0.5)]">{label}</span>
      <span className="fira-code text-[#e8dcc8]">{value}</span>
    </li>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  busy = false,
  danger = false
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-2 text-xs border rounded-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-40 ${
        danger
          ? 'bg-[rgba(160,50,50,0.08)] border-[rgba(190,80,80,0.2)] hover:bg-[rgba(160,50,50,0.14)] text-[rgba(232,190,190,0.9)]'
          : 'bg-[rgba(200,148,55,0.04)] border-[rgba(180,130,48,0.2)] hover:bg-[rgba(200,148,55,0.1)] text-[#e8dcc8]'
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
