import { CheckCircle2, Play, Settings, RefreshCw, FolderOpen, AlertCircle, Trash2, X, DownloadCloud, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Install() {
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installPhase, setInstallPhase] = useState<'preview' | 'installing' | 'done'>('preview');
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [installStatus, setInstallStatus] = useState('');

  useEffect(() => {
    if (installPhase === 'installing') {
      let isMounted = true;
      setInstallProgress(0);
      setInstallStatus('准备安装...');
      
      const t1 = setTimeout(() => { if(isMounted) { setInstallProgress(25); setInstallStatus('正在检测环境...'); } }, 500);
      const t2 = setTimeout(() => { if(isMounted) { setInstallProgress(60); setInstallStatus('正在解压文件...'); } }, 1500);
      const t3 = setTimeout(() => { if(isMounted) { setInstallProgress(90); setInstallStatus('正在配置运行环境...'); } }, 2500);
      const t4 = setTimeout(() => { if(isMounted) { setInstallProgress(100); setInstallStatus('安装完成！'); setInstallPhase('done'); } }, 3000);

      return () => {
        isMounted = false;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    }
  }, [installPhase]);

  const handleConfirmInstall = () => {
    setInstallPhase('installing');
  };

  return (
    <div className="flex flex-col gap-6 w-full h-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 shrink-0">
        <p className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.52)] uppercase">Install Mode</p>
        <h2 className="cinzel text-lg tracking-wider text-[rgba(232,220,194,0.92)] uppercase m-0">安装模式</h2>
      </div>

      <div className="grid grid-cols-12 gap-8 w-full">
        {/* Left Column */}
      <div className="col-span-7 flex flex-col gap-6">
        <div className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-6 h-full">
          <section>
            <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">当前状态</h2>
            <div className="grid gap-3">
              {/* Status Card: The Bazaar */}
              <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex items-center justify-between">
                <div>
                  <h3 className="cinzel font-bold text-[#e8dcc8]">The Bazaar</h3>
                  <p className="fira-code text-xs text-[rgba(200,170,120,0.5)] mt-1">Build 8921</p>
                </div>
                <div className="flex items-center gap-2 text-[#6dd9a0] bg-[rgba(80,180,120,0.15)] px-3 py-1 rounded-sm border border-[rgba(80,180,120,0.25)] text-xs">
                  <CheckCircle2 size={14} />
                  <span>游戏文件完整</span>
                </div>
              </div>

              {/* Status Card: BazaarPlusPlus */}
              <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex items-center justify-between">
                <div>
                  <h3 className="cinzel font-bold text-[#e8dcc8]">BazaarPlusPlus</h3>
                  <p className="fira-code text-xs text-[rgba(200,170,120,0.5)] mt-1">v1.2.0-beta</p>
                </div>
                <div className="flex items-center gap-2 text-[#6dd9a0] bg-[rgba(80,180,120,0.15)] px-3 py-1 rounded-sm border border-[rgba(80,180,120,0.25)] text-xs">
                  <CheckCircle2 size={14} />
                  <span>核心组件就绪</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-auto">
            <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">游戏路径</h2>
            <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3 fira-code text-sm text-[#e8dcc8] mb-4 overflow-hidden">
                <FolderOpen size={16} className="text-[rgba(200,170,120,0.8)] shrink-0" />
                <span className="truncate" title="C:\Program Files (x86)\Steam\steamapps\common\The Bazaar">C:\Program Files (x86)\Steam\steamapps\common\The Bazaar</span>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-1.5 text-xs bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-[#e8dcc8]">重新选择</button>
                <button className="px-4 py-1.5 text-xs bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-[#e8dcc8]">重新检测</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Right Column */}
      <div className="col-span-5 flex flex-col gap-6">
        <div className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-5 h-full">
          <section className="flex-1 flex flex-col">
            <h2 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] mb-3 uppercase">安装操作</h2>
            <div className="flex flex-col gap-5 flex-1">
            
            <div className="text-center pb-2">
              <button className="w-full py-4 bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] font-bold cinzel tracking-wider rounded-sm shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110 transition-all flex items-center justify-center gap-2 text-lg">
                <Play size={20} fill="currentColor" />
                启动游戏
              </button>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent" />

            <ul className="flex flex-col gap-2">
              <FactItem label="BazaarPlusPlus" value="Installed" />
              <FactItem label="Plugin Loader" value="Bundled" />
              <FactItem label=".NET Runtime" value="6.0.x / 8.0.x Ready" />
              <FactItem label="Game Client" value="Steam" />
            </ul>

            <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent" />

              <div className="grid grid-cols-2 gap-2 mt-auto pt-2">
                <ActionButton 
                  onClick={() => {
                    setShowInstallModal(true);
                    setInstallPhase('preview');
                    setInstallAcknowledged(false);
                  }} 
                  icon={<RefreshCw size={14} />} 
                  label="重新安装" 
                />
                <ActionButton icon={<Trash2 size={14} />} label="卸载" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    {/* Install Modal */}
    {showInstallModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
        <div className="bg-[#0b0906] border border-[rgba(200,148,55,0.18)] rounded-[4px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] w-full max-w-md mx-4 relative animate-[fade-up_0.2s_ease-out]">
          {/* Modal Header */}
          <div className="flex justify-between items-center px-5 py-4 border-b border-[rgba(200,148,55,0.15)] bg-[rgba(200,148,55,0.02)]">
            <div className="flex items-center gap-3">
              <DownloadCloud size={18} className="text-[rgba(200,148,55,0.8)]" />
              <h2 className="cinzel text-[1.1rem] text-[#e8dcc8] m-0 tracking-wider">安装 BazaarPlusPlus</h2>
            </div>
            <button 
              onClick={() => setShowInstallModal(false)}
              className="text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 flex flex-col gap-6">
            
            {installPhase === 'preview' ? (
              <>
                {/* Install Impact Section */}
                <div className="flex flex-col gap-4 p-4 border border-[rgba(200,148,55,0.14)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.04)] to-[rgba(200,148,55,0.015)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.03)]">
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex flex-col gap-1.5">
                      <p className="cinzel text-[10px] tracking-[0.18em] text-[rgba(216,188,123,0.8)] uppercase m-0">使用教程</p>
                      <p className="text-[13px] leading-relaxed text-[rgba(200,170,120,0.7)] m-0">
                        查看 B 站 BazaarPlusPlus 最新视频获取使用教程。
                      </p>
                    </div>
                    <a 
                      href="https://space.bilibili.com/" 
                      target="_blank" 
                      rel="noreferrer"
                      className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 border border-[rgba(214,169,84,0.24)] rounded-[3px] bg-gradient-to-b from-[rgba(200,148,55,0.12)] to-[rgba(200,148,55,0.06)] text-[rgba(236,225,202,0.88)] cinzel text-[10px] tracking-[0.12em] uppercase hover:bg-gradient-to-b hover:from-[rgba(200,148,55,0.2)] hover:to-[rgba(200,148,55,0.1)] hover:border-[rgba(200,148,55,0.4)] transition-all no-underline"
                    >
                      查看最新视频
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                {/* Acknowledge Checkbox */}
                <label className="flex items-start gap-3 p-3 border border-[rgba(200,148,55,0.18)] rounded-[4px] bg-gradient-to-b from-[rgba(200,148,55,0.055)] to-[rgba(200,148,55,0.015)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.04)] cursor-pointer group hover:-translate-y-[1px] transition-transform">
                  <div className="relative flex items-center justify-center mt-0.5">
                    <input 
                      type="checkbox" 
                      className="peer sr-only"
                      checked={installAcknowledged}
                      onChange={(e) => setInstallAcknowledged(e.target.checked)}
                    />
                    <div className={`w-4 h-4 rounded-[4px] border transition-colors flex items-center justify-center ${installAcknowledged ? 'bg-gradient-to-b from-[rgba(212,160,64,0.28)] to-[rgba(158,92,30,0.22)] border-[rgba(240,201,120,0.62)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.12),0_4px_14px_rgba(170,100,25,0.24)]' : 'bg-gradient-to-b from-[rgba(255,255,255,0.09)] to-[rgba(255,255,255,0.03)] border-[rgba(244,227,188,0.58)] shadow-[inset_0_0_0_1px_rgba(255,200,100,0.05),0_2px_10px_rgba(0,0,0,0.16)] group-hover:border-[rgba(200,148,55,0.8)]'}`}>
                      {installAcknowledged && <CheckCircle2 size={12} className="text-[#fff2ca]" />}
                    </div>
                  </div>
                  <span className="text-[13px] leading-relaxed text-[rgba(232,220,194,0.78)]">
                    我确认安装插件存在风险，并愿意自行承担相关责任
                  </span>
                </label>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    onClick={() => setShowInstallModal(false)}
                    className="px-5 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[#e8dcc8]"
                  >
                    取消
                  </button>
                  <button 
                    disabled={!installAcknowledged}
                    onClick={handleConfirmInstall}
                    className={`px-5 py-2 rounded-sm text-sm cinzel font-bold tracking-wider transition-all ${
                      installAcknowledged 
                        ? 'bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110' 
                        : 'bg-[rgba(200,148,55,0.1)] text-[rgba(200,148,55,0.4)] cursor-not-allowed border border-[rgba(200,148,55,0.2)]'
                    }`}
                  >
                    确认安装
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm text-[rgba(228,216,191,0.9)]">{installStatus}</span>
                    <span className="fira-code text-xs text-[rgba(200,148,55,0.8)]">{installProgress}%</span>
                  </div>
                  
                  {/* Progress Bar Track */}
                  <div className="h-2 w-full bg-[rgba(0,0,0,0.4)] rounded-full border border-[rgba(200,148,55,0.1)] overflow-hidden">
                    {/* Progress Bar Fill */}
                    <div 
                      className="h-full bg-gradient-to-r from-[#9e5c1e] to-[#d4a040] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(212,160,64,0.4)]"
                      style={{ width: `${installProgress}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={() => setShowInstallModal(false)}
                    disabled={installPhase === 'installing'}
                    className={`px-6 py-2 rounded-sm text-sm cinzel tracking-wider transition-all ${
                      installPhase === 'done'
                        ? 'bg-gradient-to-b from-[#d4a040] to-[#9e5c1e] text-[#0b0906] shadow-[0_0_15px_rgba(212,160,64,0.4)] hover:brightness-110 font-bold'
                        : 'bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] text-[rgba(228,216,191,0.5)] cursor-not-allowed'
                    }`}
                  >
                    {installPhase === 'done' ? '完成' : '安装中...'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </div>
  );
}

function FactItem({ label, value }: { label: string, value: string }) {
  return (
    <li className="flex justify-between items-center text-xs">
      <span className="text-[rgba(200,170,120,0.7)]">{label}</span>
      <span className="fira-code text-[#e8dcc8]">{value}</span>
    </li>
  );
}

function ActionButton({ icon, label, className = '', onClick }: { icon: React.ReactNode, label: string, className?: string, onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.1)] transition-colors text-sm text-[rgba(228,216,191,0.9)] ${className}`}>
      {icon}
      {label}
    </button>
  );
}
