import { Radio, ExternalLink, RefreshCw, Copy, Maximize, Minimize, Settings2, PlayCircle, CheckCircle2 } from 'lucide-react';

export default function Stream() {
  return (
    <div className="flex flex-col gap-6 w-full h-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 shrink-0">
        <p className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.52)] uppercase">Stream Mode</p>
        <h2 className="cinzel text-lg tracking-wider text-[rgba(232,220,194,0.92)] uppercase m-0">直播模式</h2>
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-8 relative overflow-hidden">
        
        {/* Status Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[rgba(80,180,120,0.15)] border border-[rgba(80,180,120,0.3)] text-[#6dd9a0]">
              <Radio size={16} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-[#e8dcc8] flex items-center gap-2">
                Overlay Running
              </h3>
              <p className="text-xs text-[rgba(200,170,120,0.6)] fira-code mt-0.5">Port 13248 · DB Connected</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-xs text-[#e8dcc8]">
              <ExternalLink size={14} /> 打开预览页
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-xs text-[#e8dcc8]">
              <RefreshCw size={14} /> 重启服务
            </button>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-[rgba(200,148,55,0.3)] to-transparent opacity-50" />

        {/* OBS URL */}
        <div className="flex flex-col gap-2">
          <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">OBS URL</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] overflow-hidden text-ellipsis whitespace-nowrap">
              http://127.0.0.1:13248/overlay
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-[rgba(200,148,55,0.1)] border border-[rgba(180,130,48,0.3)] rounded-sm hover:bg-[rgba(200,148,55,0.2)] transition-colors text-sm text-[#e8dcc8]">
              <Copy size={16} /> 复制
            </button>
          </div>
        </div>

        {/* 展示窗口 Control */}
        <div className="flex flex-col gap-4 bg-[rgba(200,148,55,0.02)] p-4 rounded-sm border border-[rgba(200,148,55,0.08)]">
          <div className="flex justify-between items-center">
            <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">展示窗口</label>
            <span className="text-xs text-[rgba(200,170,120,0.8)]">当前展示 8 场</span>
          </div>
          
          <div className="flex items-center justify-between">
            <button className="flex flex-col items-center gap-1 p-2 text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] transition-colors">
              <Maximize size={16} />
              <span className="text-[10px]">↑ 更多历史</span>
            </button>
            
            <div className="flex-1 px-8 flex items-center justify-center">
              <div className="w-full max-w-sm h-8 relative flex items-center">
                <div className="absolute inset-0 bg-[rgba(0,0,0,0.3)] rounded-full border border-[rgba(200,148,55,0.2)] overflow-hidden">
                  <div className="h-full w-3/4 bg-[rgba(200,148,55,0.15)] ml-auto border-l border-[rgba(200,148,55,0.4)]" />
                </div>
                <div className="absolute left-1/4 -translate-x-1/2 -top-6 text-[10px] fira-code text-[rgba(200,170,120,0.8)]">D4</div>
                <div className="absolute right-0 translate-x-1/2 -top-6 text-[10px] fira-code text-[#e8c87a] font-bold">D11</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button className="flex flex-col items-center gap-1 p-2 text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] transition-colors">
                <Minimize size={16} />
                <span className="text-[10px]">↓ 更少历史</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-2 pt-4 border-t border-[rgba(200,148,55,0.1)]">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[rgba(200,170,120,0.5)]">窗口起点</span>
              <span className="text-xs fira-code text-[#e8dcc8]">05-24 18:30</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[rgba(200,170,120,0.5)]">开播后</span>
              <span className="text-xs fira-code text-[#e8dcc8]">12 场记录</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[rgba(200,170,120,0.5)]">可向前补</span>
              <span className="text-xs fira-code text-[#e8dcc8]">4 场记录</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-[rgba(200,170,120,0.5)]">当前英雄</span>
              <span className="text-xs text-[#e8dcc8]">Vanessa</span>
            </div>
          </div>
        </div>

        {/* Overlay 配置 */}
        <div className="flex flex-col gap-4">
          <label className="cinzel text-[10px] tracking-widest text-[rgba(220,195,145,0.8)] uppercase">Overlay 配置</label>
          
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="displayMode" className="peer sr-only" defaultChecked />
              <div className="px-3 py-2 text-center text-sm border border-[rgba(180,130,48,0.3)] rounded-sm text-[rgba(228,216,191,0.6)] peer-checked:bg-[rgba(200,148,55,0.15)] peer-checked:text-[#e8c87a] peer-checked:border-[rgba(200,148,55,0.6)] transition-all">
                战斗场数
              </div>
            </label>
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="displayMode" className="peer sr-only" />
              <div className="px-3 py-2 text-center text-sm border border-[rgba(180,130,48,0.3)] rounded-sm text-[rgba(228,216,191,0.6)] peer-checked:bg-[rgba(200,148,55,0.15)] peer-checked:text-[#e8c87a] peer-checked:border-[rgba(200,148,55,0.6)] transition-all">
                完整英雄
              </div>
            </label>
            <label className="flex-1 cursor-pointer">
              <input type="radio" name="displayMode" className="peer sr-only" />
              <div className="px-3 py-2 text-center text-sm border border-[rgba(180,130,48,0.3)] rounded-sm text-[rgba(228,216,191,0.6)] peer-checked:bg-[rgba(200,148,55,0.15)] peer-checked:text-[#e8c87a] peer-checked:border-[rgba(200,148,55,0.6)] transition-all">
                半高英雄
              </div>
            </label>
          </div>

          <div className="flex gap-2 mt-2">
            <input 
              type="text" 
              placeholder="输入裁切代码..."
              defaultValue="eyJjcm9wX3giOjEwMCwiY3JvcF95IjoyMDB9"
              className="flex-1 px-3 py-2 bg-[rgba(0,0,0,0.4)] border border-[rgba(180,130,48,0.2)] rounded-sm fira-code text-sm text-[rgba(228,216,191,0.8)] focus:outline-none focus:border-[rgba(200,148,55,0.6)]"
            />
            <button className="px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-sm text-[#e8dcc8]">
              应用裁切代码
            </button>
            <button className="px-4 py-2 bg-transparent border border-transparent hover:bg-[rgba(255,255,255,0.05)] rounded-sm transition-colors text-sm text-[rgba(200,170,120,0.6)]">
              恢复默认裁切
            </button>
            <button className="px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-sm text-[#e8dcc8] flex items-center gap-2">
              <Settings2 size={16} /> 打开校准页
            </button>
          </div>
        </div>

      </div>
    </div>
    </div>
  );
}
