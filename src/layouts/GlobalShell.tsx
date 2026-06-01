import { NavLink, Outlet } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Globe,
  Heart,
  MonitorPlay,
  History,
  Info,
  Download,
  X,
  QrCode,
  Coffee,
  Users
} from 'lucide-react';
import clsx from 'clsx';
import {
  AppBootstrapProvider,
  useAppBootstrap
} from '../features/about/AppBootstrapProvider';
import wechatPaySvg from '../../static/support/wechat-pay.svg';
import xiaohongshuSvg from '../../static/support/xiaohongshu.svg';

export default function GlobalShell() {
  return (
    <AppBootstrapProvider>
      <GlobalShellContent />
    </AppBootstrapProvider>
  );
}

function GlobalShellContent() {
  const [showSupport, setShowSupport] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const app = useAppBootstrap();
  const { bootstrap } = app;

  return (
    <div className="flex flex-col h-full bg-[#0b0906] text-[#e8dcc8]">
      {/* Global Header */}
      <header
        className="flex-none relative px-6 py-4 border-b border-[rgba(200,148,55,0.18)] z-20 flex flex-row items-center justify-between gap-4"
        style={{
          background:
            'linear-gradient(175deg, rgba(36,22,9,0.9), rgba(15,9,5,0.86))',
          boxShadow:
            '0 0 0 1px rgba(200,148,55,0.06) inset, 0 16px 42px rgba(0,0,0,0.42)'
        }}
      >
        {/* Background Corners - kept subtle and relative to the header box */}
        <div className="absolute top-2 left-2 text-[rgba(200,148,55,0.42)] pointer-events-none block">
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
            <path
              d="M2 2L2 16M2 2L16 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
            <circle cx="2" cy="2" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <div className="absolute top-2 right-2 text-[rgba(200,148,55,0.42)] pointer-events-none block">
          <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
            <path
              d="M38 2L38 16M38 2L24 2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="square"
            />
            <circle cx="38" cy="2" r="1.5" fill="currentColor" />
          </svg>
        </div>

        {/* Left: Brand */}
        <div className="flex items-center gap-3 z-10 ml-6">
          {/* Sigil */}
          <div
            className="text-[rgba(205,150,60,0.65)] animate-[spin_45s_linear_infinite] flex-shrink-0"
            style={{ filter: 'drop-shadow(0 0 7px rgba(205,150,60,0.22))' }}
          >
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
              <polygon
                points="22,3 41,34 3,34"
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
                opacity="0.55"
              />
              <polygon
                points="22,11 35,31 9,31"
                stroke="currentColor"
                strokeWidth="0.5"
                fill="none"
                opacity="0.3"
              />
              <circle
                cx="22"
                cy="22"
                r="5"
                stroke="currentColor"
                strokeWidth="0.8"
                fill="none"
              />
              <circle
                cx="22"
                cy="22"
                r="2"
                fill="currentColor"
                opacity="0.75"
              />
            </svg>
          </div>
          {/* Title & Subtitle */}
          <div className="flex flex-row items-baseline gap-3">
            <h1
              className="cinzel-decorative text-2xl font-bold m-0 leading-none"
              style={{
                background:
                  'linear-gradient(155deg, var(--color-gold-text) 0%, var(--color-gold-deep) 55%, var(--color-gold-text) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 10px rgba(205,150,60,0.28))'
              }}
            >
              BazaarPlusPlus
            </h1>
            <p className="m-0 italic text-[13px] text-[rgba(200,170,120,0.58)]">
              因热爱而生
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-3 z-10 justify-end mr-6">
          <div className="flex items-center gap-1 mr-2 flex">
            <a
              href={bootstrap.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 text-[rgba(200,170,120,0.6)] hover:text-[#e8c87a] transition-colors"
              title="GitHub"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                <path d="M9 18c-4.51 2-5-2-7-2" />
              </svg>
            </a>
            <a
              href={bootstrap.links.bilibili}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-8 h-8 text-[rgba(200,170,120,0.6)] hover:text-[#00a1d6] transition-colors"
              title="Bilibili"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="18" height="12" x="3" y="8" rx="3" />
                <path d="m8 4 3 4" />
                <path d="m16 4-3 4" />
                <line x1="9" y1="13" x2="9.01" y2="13" />
                <line x1="15" y1="13" x2="15.01" y2="13" />
              </svg>
            </a>
            <div className="relative group flex">
              <a
                href={bootstrap.links.xiaohongshu}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-8 h-8 text-[rgba(200,170,120,0.6)] hover:text-[#ff2442] transition-colors"
                title="小红书"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                  <path d="M8 11h8" />
                  <path d="M8 7h8" />
                </svg>
              </a>

              {/* 小红书 Hover Modal */}
              <div className="absolute top-[calc(100%+0.5rem)] left-1/2 w-[260px] bg-[#0b0906] border border-[rgba(200,148,55,0.2)] rounded-[4px] shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,198,98,0.05)] p-5 z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all duration-200 transform -translate-x-1/2 translate-y-2 group-hover:translate-y-0 flex flex-col items-center gap-4">
                {/* REDNOTE Badge */}
                <div className="border border-[rgba(255,36,66,0.5)] rounded-[2px] px-3 py-[0.15rem] text-[#ff2442] text-[0.55rem] tracking-[0.15em] font-bold bg-[rgba(255,36,66,0.04)]">
                  REDNOTE
                </div>

                {/* QR Code Container */}
                <div className="w-full aspect-square bg-[#f8f0e3] rounded-[2px] p-2 shadow-[inset_0_0_0_1px_rgba(212,160,64,0.4)] flex items-center justify-center">
                  <img
                    src={xiaohongshuSvg}
                    alt="作者小红书二维码"
                    className="w-full h-full object-contain"
                  />
                </div>

                {/* Text Content */}
                <div className="flex flex-col items-center gap-[0.15rem]">
                  <h3 className="font-bold text-[#d4a040] tracking-[0.08em] text-[1.05rem] m-0 leading-none">
                    来小红书找我
                  </h3>
                  <p className="text-[rgba(200,170,120,0.8)] text-[0.72rem] tracking-wide m-0">
                    VibeCoding 日常和碎碎念
                  </p>
                </div>
              </div>
            </div>
            <div className="w-px h-4 bg-[rgba(200,148,55,0.2)] mx-1" />
          </div>

          <button
            type="button"
            onClick={app.checkUpdates}
            disabled={app.checkingUpdate}
            className="flex items-center gap-2 px-3 h-8 border border-[rgba(200,148,55,0.24)] rounded-[2px] cinzel text-[10px] tracking-widest uppercase transition-all hover:border-[rgba(200,148,55,0.4)] disabled:opacity-60"
            style={{
              background:
                'linear-gradient(180deg, rgba(200,148,55,0.12), rgba(200,148,55,0.06))',
              color: 'rgba(228,216,191,0.82)',
              boxShadow: '0 0 0 1px rgba(255,198,98,0.08) inset'
            }}
          >
            <Download
              size={14}
              className={app.checkingUpdate ? 'animate-pulse' : ''}
            />
            <span className="inline">
              {app.checkingUpdate ? '检查中' : '检查更新'}
            </span>
          </button>
          {app.updateMessage && (
            <span
              className="max-w-36 truncate text-[10px] text-[rgba(200,170,120,0.62)]"
              title={app.updateMessage}
            >
              {app.updateMessage}
            </span>
          )}

          <div className="relative">
            <button
              className="flex items-center gap-2 px-3 h-8 border border-[rgba(200,148,55,0.24)] rounded-[2px] cinzel text-[10px] tracking-widest uppercase transition-all hover:border-[rgba(200,148,55,0.4)]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(200,148,55,0.12), rgba(200,148,55,0.06))',
                color: 'rgba(228,216,191,0.82)',
                boxShadow: '0 0 0 1px rgba(255,198,98,0.08) inset'
              }}
              onClick={() => setShowSupport(!showSupport)}
            >
              <Heart size={14} />
              <span>支持项目</span>
            </button>
            {showSupport && (
              <div className="absolute top-[calc(100%+0.5rem)] right-0 w-56 bg-[rgba(18,11,5,0.95)] backdrop-blur-md border border-[rgba(200,148,55,0.2)] rounded-sm shadow-[0_16px_40px_rgba(0,0,0,0.6)] p-1.5 z-50 flex flex-col gap-1">
                <button
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-[rgba(200,148,55,0.1)] rounded-sm text-left transition-all group"
                  onClick={() => {
                    setShowSupport(false);
                    setShowPaymentModal(true);
                  }}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-[rgba(200,148,55,0.05)] border border-[rgba(200,148,55,0.1)] group-hover:border-[rgba(200,148,55,0.3)] group-hover:bg-[rgba(200,148,55,0.15)] transition-colors text-[rgba(200,170,120,0.8)] group-hover:text-[#e8c87a]">
                    <QrCode size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[#e8dcc8] group-hover:text-[#f4ead5] transition-colors">
                      微信支付
                    </span>
                    <span className="text-[10px] text-[rgba(200,170,120,0.5)]">
                      打开收款码
                    </span>
                  </div>
                </button>

                <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.2)] to-transparent my-0.5 mx-2" />

                <a
                  href={bootstrap.links.kofi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-[rgba(200,148,55,0.1)] rounded-sm text-left transition-all group no-underline"
                  onClick={() => setShowSupport(false)}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-[rgba(200,148,55,0.05)] border border-[rgba(200,148,55,0.1)] group-hover:border-[rgba(200,148,55,0.3)] group-hover:bg-[rgba(200,148,55,0.15)] transition-colors text-[rgba(200,170,120,0.8)] group-hover:text-[#e8c87a]">
                    <Coffee size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[#e8dcc8] group-hover:text-[#f4ead5] transition-colors">
                      Ko-fi
                    </span>
                    <span className="text-[10px] text-[rgba(200,170,120,0.5)]">
                      请作者喝杯咖啡
                    </span>
                  </div>
                </a>

                <div className="h-px bg-gradient-to-r from-transparent via-[rgba(200,148,55,0.2)] to-transparent my-0.5 mx-2" />

                <a
                  href={bootstrap.links.supporter_list}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-[rgba(200,148,55,0.1)] rounded-sm text-left transition-all group no-underline"
                  onClick={() => setShowSupport(false)}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-sm bg-[rgba(200,148,55,0.05)] border border-[rgba(200,148,55,0.1)] group-hover:border-[rgba(200,148,55,0.3)] group-hover:bg-[rgba(200,148,55,0.15)] transition-colors text-[rgba(200,170,120,0.8)] group-hover:text-[#e8c87a]">
                    <Users size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-[#e8dcc8] group-hover:text-[#f4ead5] transition-colors">
                      支持者名单
                    </span>
                    <span className="text-[10px] text-[rgba(200,170,120,0.5)]">
                      查看名单
                    </span>
                  </div>
                </a>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={app.changeLocale}
            className="flex items-center justify-center w-8 h-8 border border-[rgba(200,148,55,0.24)] rounded-[2px] transition-all hover:border-[rgba(200,148,55,0.4)] flex"
            style={{
              background:
                'linear-gradient(180deg, rgba(200,148,55,0.12), rgba(200,148,55,0.06))',
              color: 'rgba(228,216,191,0.82)',
              boxShadow: '0 0 0 1px rgba(255,198,98,0.08) inset'
            }}
            title={bootstrap.locale === 'en' ? '切换中文' : 'Switch to English'}
          >
            <Globe size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail */}
        <nav className="flex-none w-48 border-r border-[rgba(200,148,55,0.18)] bg-[#0b0906] flex flex-col py-6 z-0 flex">
          <RailItem to="/" icon={<Download size={18} />} label="安装" />
          <RailItem to="/history" icon={<History size={18} />} label="战绩" />
          <RailItem
            to="/stream"
            icon={<MonitorPlay size={18} />}
            label="直播"
          />
          <RailItem to="/about" icon={<Info size={18} />} label="关于" />
        </nav>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-transparent relative">
          <div
            className="absolute inset-0 pointer-events-none opacity-5"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23g)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat'
            }}
          ></div>
          <div className="p-8 h-full w-full relative z-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
          <div className="bg-[#0b0906] border border-[rgba(200,148,55,0.18)] rounded-[4px] shadow-[0_24px_64px_rgba(0,0,0,0.5)] w-full max-w-md mx-4 relative animate-[fade-up_0.2s_ease-out]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-[rgba(200,148,55,0.15)] bg-[rgba(200,148,55,0.02)]">
              <div>
                <p className="cinzel text-[10px] tracking-[0.2em] text-[rgba(200,148,55,0.5)] uppercase m-0 mb-1">
                  BazaarPlusPlus
                </p>
                <h2 className="cinzel text-[1.1rem] text-[#e8dcc8] m-0">
                  支持项目
                </h2>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-[rgba(200,170,120,0.6)] hover:text-[#e8dcc8] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-[0.9rem] items-center text-center">
              {/* Payment Card */}
              <article
                className="relative p-3 rounded-[4px] border border-[rgba(200,148,55,0.16)] flex flex-col gap-[0.65rem] w-full max-w-[260px] shadow-[inset_0_0_0_1px_rgba(255,198,98,0.05),0_10px_32px_rgba(42,110,78,0.14)]"
                style={{
                  background:
                    'radial-gradient(circle at top, rgba(255,232,174,0.08), transparent 54%), linear-gradient(180deg, rgba(34,20,8,0.96), rgba(16,9,4,0.98))'
                }}
              >
                <div className="absolute inset-[0.45rem] border border-[rgba(255,220,155,0.05)] rounded-[2px] pointer-events-none" />

                <div className="aspect-square p-[0.8rem] rounded-[3px] bg-gradient-to-br from-[rgba(255,248,231,0.98)] to-[rgba(245,238,220,0.98)] shadow-[inset_0_0_0_1px_rgba(95,65,19,0.08),0_10px_24px_rgba(0,0,0,0.22)] relative overflow-hidden">
                  <img
                    src={wechatPaySvg}
                    alt="WePay QR Code"
                    className="w-full h-full object-contain rounded-[2px]"
                  />
                </div>

                <div className="flex flex-col gap-[0.18rem] z-10">
                  <h3 className="m-0 cinzel text-[0.82rem] tracking-[0.04em] text-[rgba(238,220,182,0.94)]">
                    微信支付
                  </h3>
                  <p className="m-0 text-[0.66rem] leading-[1.45] text-[rgba(200,170,120,0.8)]">
                    请 Bazaar++ 喝一杯
                  </p>
                </div>
              </article>

              <div className="flex flex-col gap-1 mt-2">
                <p className="m-0 text-[0.76rem] leading-[1.6] text-[rgba(214,190,146,0.76)]">
                  有你支持，Bazaar++ 会冒出更多好东西
                </p>
                <p className="m-0 text-[0.72rem] leading-[1.65] text-[rgba(240,220,184,0.82)] max-w-[28rem]">
                  如果愿意，欢迎在备注里留一个支持者 ID
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RailItem({
  to,
  icon,
  label
}: {
  to: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 px-6 py-3 cinzel tracking-widest transition-colors',
          isActive
            ? 'bg-[rgba(200,148,55,0.1)] text-[#e8c87a] border-r-2 border-[#e8c87a]'
            : 'text-[rgba(228,216,191,0.6)] hover:bg-[rgba(200,148,55,0.05)] hover:text-[#e8dcc8] border-r-2 border-transparent'
        )
      }
    >
      {icon}
      <span className="text-sm mt-0.5">{label}</span>
    </NavLink>
  );
}
