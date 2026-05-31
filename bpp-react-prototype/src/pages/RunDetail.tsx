import { ArrowLeft, Image as ImageIcon, Video, FileQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RunDetail() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 h-full overflow-hidden pb-8 max-w-5xl mx-auto w-full">
      {/* Top Bar */}
      <button 
        onClick={() => navigate('/history')}
        className="flex items-center gap-2 text-[rgba(200,170,120,0.8)] hover:text-[#e8c87a] transition-colors w-fit cinzel text-sm tracking-wider uppercase"
      >
        <ArrowLeft size={16} />
        返回战绩列表
      </button>

      {/* Run Summary Card */}
      <div className="p-6 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-6">
        
        <div className="flex justify-between items-start">
          <div className="flex flex-col gap-1">
            <h2 className="cinzel-decorative text-2xl font-bold text-[#e8dcc8] m-0">Vanessa <span className="text-[rgba(200,170,120,0.5)]">· Run CLIII</span></h2>
            <div className="flex items-center gap-3 fira-code text-xs text-[rgba(200,170,120,0.6)]">
              <span>Player cauyxy</span>
              <span>•</span>
              <span>Ranked</span>
              <span>•</span>
              <span>2026-05-24 18:30 - 19:12</span>
              <span>•</span>
              <span className="text-[#6dd9a0]">Completed</span>
            </div>
          </div>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-sm text-[#e8dcc8]">
            <ImageIcon size={16} /> 打开截图位置
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-12 border-t border-[rgba(200,148,55,0.1)] pt-5">
          <StatBlock label="胜 / 负" value="10 / 2" />
          <StatBlock label="结束日" value="Day 10" />
          <StatBlock label="最终段位" value="Diamond II" isText />
          <StatBlock label="最终评分" value="1450" />
        </div>

        {/* Horizontal Screenshot Strip */}
        <div className="w-full h-24 bg-[#000] border border-[rgba(200,148,55,0.2)] rounded-sm flex items-center justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-[rgba(20,10,5,0.8)] via-transparent to-[rgba(20,10,5,0.8)] z-10" />
          <div className="flex gap-1 w-full h-full opacity-30">
            {/* Mocking a strip of items */}
            {Array.from({ length: 15 }).map((_, i) => (
              <div key={i} className="h-full w-12 bg-[rgba(200,148,55,0.2)] border-r border-[rgba(200,148,55,0.1)] flex-none" />
            ))}
          </div>
          <span className="absolute z-20 text-[rgba(200,170,120,0.5)] flex items-center gap-2 cinzel tracking-widest text-xs uppercase">
            <ImageIcon size={16} /> End of Run Screenshot
          </span>
        </div>
      </div>

      {/* Battle Ledger */}
      <div className="flex-1 flex flex-col bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] overflow-hidden">
        
        {/* Table Header */}
        <div className="grid grid-cols-7 gap-4 px-6 py-3 border-b border-[rgba(200,148,55,0.15)] bg-[rgba(200,148,55,0.02)] cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.6)] uppercase">
          <div>Day</div>
          <div>Result</div>
          <div>Opponent Hero</div>
          <div>Opponent Player</div>
          <div>Rank</div>
          <div>Rating</div>
          <div className="text-right">Video</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          <BattleRow day={1} result="win" oppHero="Dooley" oppPlayer="PlayerOne" rank="Diamond III" rating={1420} hasVideo />
          <BattleRow day={2} result="win" oppHero="Pygmalien" oppPlayer="Shadow" rank="Diamond III" rating={1425} hasVideo />
          <BattleRow day={3} result="loss" oppHero="Vanessa" oppPlayer="Light" rank="Diamond II" rating={1440} hasVideo={false} />
          <BattleRow day={4} result="win" oppHero="Jules" oppPlayer="Fire" rank="Diamond II" rating={1435} hasVideo />
          <BattleRow day={5} result="win" oppHero="Dooley" oppPlayer="Water" rank="Diamond II" rating={1442} hasVideo />
          <BattleRow day={6} result="win" oppHero="Vanessa" oppPlayer="Earth" rank="Diamond II" rating={1445} hasVideo />
          <BattleRow day={7} result="loss" oppHero="Pygmalien" oppPlayer="Wind" rank="Diamond I" rating={1460} hasVideo />
          <BattleRow day={8} result="win" oppHero="Jules" oppPlayer="Thunder" rank="Diamond II" rating={1448} hasVideo />
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, value, isText = false }: { label: string, value: string, isText?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">{label}</span>
      <span className={`text-xl text-[#e8c87a] ${isText ? 'cinzel font-bold' : 'fira-code'}`}>{value}</span>
    </div>
  );
}

function BattleRow({ day, result, oppHero, oppPlayer, rank, rating, hasVideo }: { day: number, result: 'win' | 'loss', oppHero: string, oppPlayer: string, rank: string, rating: number, hasVideo: boolean }) {
  const isWin = result === 'win';
  
  return (
    <div className="grid grid-cols-7 gap-4 px-6 py-4 border-b border-[rgba(200,148,55,0.05)] items-center relative group hover:bg-[rgba(200,148,55,0.03)] transition-colors">
      
      {/* Watermark */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.02] flex items-center justify-center">
        <span className="cinzel-decorative text-8xl font-bold text-[#e8c87a]">{oppHero}</span>
      </div>

      <div className="fira-code text-sm text-[rgba(228,216,191,0.8)] relative z-10">Day {day}</div>
      <div className={`cinzel font-bold text-xs relative z-10 ${isWin ? 'text-[#6dd9a0]' : 'text-[#d96d6d]'}`}>{isWin ? 'WIN' : 'LOSS'}</div>
      <div className="text-sm text-[#e8dcc8] relative z-10">{oppHero}</div>
      <div className="fira-code text-sm text-[rgba(200,170,120,0.8)] relative z-10">{oppPlayer}</div>
      <div className="text-sm text-[#e8c87a] relative z-10">{rank}</div>
      <div className="fira-code text-sm text-[rgba(228,216,191,0.8)] relative z-10">{rating}</div>
      
      <div className="flex justify-end relative z-10">
        {hasVideo ? (
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(200,148,55,0.06)] border border-[rgba(180,130,48,0.2)] rounded-sm hover:bg-[rgba(200,148,55,0.12)] transition-colors text-xs text-[#e8dcc8]">
            <Video size={14} /> 打开视频位置
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[rgba(200,170,120,0.4)] cursor-not-allowed">
            <FileQuestion size={14} /> 无视频
          </span>
        )}
      </div>
    </div>
  );
}
