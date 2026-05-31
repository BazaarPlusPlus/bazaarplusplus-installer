import { ChevronRight, Image as ImageIcon, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function History() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 w-full h-full max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 shrink-0">
        <p className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.52)] uppercase">Run History</p>
        <h2 className="cinzel text-lg tracking-wider text-[rgba(232,220,194,0.92)] uppercase m-0">战绩</h2>
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        {/* Top Summary */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <SummaryCard label="Runs" value="142" />
        <SummaryCard label="Videos" value="84" />
        <SummaryCard label="Last Run" value="05-24 19:12" isFira />
        <SummaryCard label="Win Rate" value="68%" />
      </div>

      {/* Run List */}
      <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
        <RunRow 
          hero="Vanessa" 
          time="2026-05-24 19:12" 
          result="win" 
          day={10} 
          rank="Diamond II" 
          rating={1450} 
          onClick={() => navigate('/history/run-1')}
        />
        <RunRow 
          hero="Pygmalien" 
          time="2026-05-23 21:45" 
          result="loss" 
          day={6} 
          rank="Diamond III" 
          rating={1420} 
          onClick={() => navigate('/history/run-2')}
        />
        <RunRow 
          hero="Dooley" 
          time="2026-05-22 14:30" 
          result="win" 
          day={10} 
          rank="Diamond III" 
          rating={1380} 
          onClick={() => navigate('/history/run-3')}
        />
        <RunRow 
          hero="Vanessa" 
          time="2026-05-20 09:15" 
          result="loss" 
          day={4} 
          rank="Platinum I" 
          rating={1350} 
          onClick={() => navigate('/history/run-4')}
        />
        <RunRow 
          hero="Jules" 
          time="2026-05-19 20:30" 
          result="win" 
          day={10} 
          rank="Platinum II" 
          rating={1310} 
          onClick={() => navigate('/history/run-5')}
        />
        <RunRow 
          hero="Vanessa" 
          time="2026-05-18 16:45" 
          result="win" 
          day={10} 
          rank="Platinum III" 
          rating={1280} 
          onClick={() => navigate('/history/run-6')}
        />
      </div>
    </div>
    </div>
  );
}

function SummaryCard({ label, value, isFira = false }: { label: string, value: string, isFira?: boolean }) {
  return (
    <div className="p-4 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col items-center justify-center gap-1">
      <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">{label}</span>
      <span className={`text-2xl text-[#e8c87a] ${isFira ? 'fira-code' : 'cinzel font-bold'}`}>{value}</span>
    </div>
  );
}

function RunRow({ hero, time, result, day, rank, rating, onClick }: { hero: string, time: string, result: 'win' | 'loss', day: number, rank: string, rating: number, onClick: () => void }) {
  const isWin = result === 'win';

  return (
    <div 
      onClick={onClick}
      className="group flex items-center p-3 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm hover:border-[rgba(200,148,55,0.4)] hover:bg-[rgba(200,148,55,0.04)] cursor-pointer transition-all gap-6 shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
    >
      {/* Screenshot Preview */}
      <div className="w-40 h-16 bg-[#000] border border-[rgba(200,148,55,0.2)] rounded-sm flex items-center justify-center text-[rgba(200,170,120,0.3)] group-hover:border-[rgba(200,148,55,0.5)] transition-colors overflow-hidden relative">
        <div className="absolute inset-0 opacity-20 bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.2)] to-transparent" />
        <ImageIcon size={20} />
      </div>

      {/* Info */}
      <div className="flex-1 flex items-center justify-between">
        <div className="flex flex-col gap-1 w-32">
          <span className="cinzel font-bold text-lg text-[#e8dcc8]">{hero}</span>
          <span className="fira-code text-[10px] text-[rgba(200,170,120,0.5)]">{time}</span>
        </div>

        <div className="flex items-center gap-12">
          <div className="flex flex-col gap-1 items-center w-16">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">Result</span>
            <span className={`cinzel font-bold ${isWin ? 'text-[#6dd9a0]' : 'text-[#d96d6d]'}`}>{isWin ? 'VICTORY' : 'DEFEAT'}</span>
          </div>
          
          <div className="flex flex-col gap-1 items-center w-16">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">Day</span>
            <span className="fira-code text-[#e8dcc8]">Day {day}</span>
          </div>

          <div className="flex flex-col gap-1 items-center w-24">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">Rank</span>
            <span className="text-sm text-[#e8c87a]">{rank}</span>
          </div>

          <div className="flex flex-col gap-1 items-center w-16">
            <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">Rating</span>
            <span className="fira-code text-[#e8dcc8]">{rating}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-4">
          <div className="flex items-center gap-2 text-[rgba(200,148,55,0.6)] group-hover:text-[#e8c87a] transition-colors" onClick={(e) => {
            e.stopPropagation();
            // Delete video action
          }}>
            <button className="flex items-center justify-center w-8 h-8 rounded-sm hover:bg-[rgba(255,50,50,0.1)] hover:text-[#ff4444] transition-colors text-[rgba(200,170,120,0.4)] border border-transparent hover:border-[rgba(255,50,50,0.2)]" title="删除视频">
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex items-center gap-2 text-[rgba(200,148,55,0.6)] group-hover:text-[#e8c87a] transition-colors">
            <span className="text-xs">查看详情</span>
            <ChevronRight size={16} />
          </div>
        </div>
      </div>
    </div>
  );
}
