import { ExternalLink } from 'lucide-react';

export default function About() {
  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12 max-w-5xl mx-auto">
      <div className="flex flex-col gap-1 shrink-0">
        <p className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.52)] uppercase">About</p>
        <h2 className="cinzel text-lg tracking-wider text-[rgba(232,220,194,0.92)] uppercase m-0">关于</h2>
      </div>

      <div className="flex flex-col gap-6 flex-1 min-h-0 w-full">
        {/* Project Section */}
      <section className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h3 className="cinzel font-bold text-lg text-[#e8c87a] m-0">BazaarPlusPlus</h3>
            <div className="flex items-center gap-3">
              <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">Version</span>
              <span className="px-2 py-0.5 bg-[rgba(80,180,120,0.15)] text-[#6dd9a0] border border-[rgba(80,180,120,0.25)] rounded-sm text-[10px] fira-code">v1.2.0</span>
              <div className="w-px h-3 bg-gradient-to-b from-transparent via-[rgba(200,170,120,0.45)] to-transparent" />
              <span className="cinzel text-[10px] tracking-widest text-[rgba(200,170,120,0.5)] uppercase">License</span>
              <span className="text-[10px] text-[rgba(200,170,120,0.5)] fira-code">MIT</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.3)] to-transparent my-2" />

        <div className="flex flex-col gap-3">
          <h4 className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.55)] uppercase m-0">致谢 Credits</h4>
          <ul className="flex flex-col gap-1 m-0 p-0 list-none">
            <ListItem name="cauyxy" role="AUTHOR" />
            <ListItem name="Trae" role="CO-CREATOR" />
            <ListItem name="Codex" role="CO-CREATOR" />
            <ListItem name="Claude Code" role="CO-CREATOR" />
            <ListItem name="BazaarHelper" role="INSPIRATION" />
            <ListItem name="BazaarPlannerMod" role="INSPIRATION" />
          </ul>
        </div>
      </section>

      {/* Licenses Section */}
      <section className="p-5 bg-[rgba(18,11,5,0.88)] border border-[rgba(180,130,48,0.13)] rounded-sm shadow-[0_6px_28px_rgba(0,0,0,0.35)] flex flex-col gap-4">
        <h3 className="cinzel text-xs tracking-widest text-[rgba(220,195,145,0.8)] uppercase m-0">Licenses</h3>
        
        <div className="flex flex-col gap-3">
          <h4 className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.55)] uppercase m-0">Key Dependencies</h4>
          <ul className="flex flex-col gap-1 m-0 p-0 list-none">
            <ListItem name="FFmpeg" role="GPL" isLicense />
            <ListItem name="BepInEx" role="LGPL-2.1" isLicense />
            <ListItem name="Source Han Sans CN" role="OFL-1.1" isLicense />
          </ul>

          <h4 className="cinzel text-[10px] tracking-widest text-[rgba(200,148,55,0.55)] uppercase m-0 mt-2">Frontend & Backend</h4>
          <ul className="flex flex-col gap-1 m-0 p-0 list-none">
            <ListItem name="React" role="MIT" isLicense />
            <ListItem name="Tauri" role="MIT" isLicense />
            <ListItem name="Tailwind CSS" role="MIT" isLicense />
          </ul>
        </div>
      </section>

    </div>
    </div>
  );
}

function ListItem({ name, role, link, isLicense = false }: { name: string, role?: string, link?: string, isLicense?: boolean }) {
  return (
    <li className="flex items-center justify-between px-3 py-2 bg-[rgba(200,148,55,0.04)] border border-[rgba(180,130,48,0.08)] rounded-sm hover:bg-[rgba(200,148,55,0.08)] transition-colors">
      <span className="fira-code text-xs text-[rgba(228,216,191,0.85)]">{name}</span>
      {role && (
        <span className={`${isLicense ? 'fira-code text-[10px]' : 'cinzel text-[10px] tracking-widest uppercase'} text-[rgba(200,170,120,0.45)]`}>
          {role}
        </span>
      )}
      {link && (
        <a href="#" className="flex items-center gap-1 text-[10px] fira-code text-[rgba(200,170,120,0.55)] hover:text-[#e8c87a] transition-colors">
          {link}
          <ExternalLink size={10} />
        </a>
      )}
    </li>
  );
}
