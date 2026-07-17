import { NavLink, useLocation } from 'react-router-dom';
import type { CSSProperties, ReactNode } from 'react';
import { Download, History, Info, MonitorPlay } from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '../i18n/LocaleProvider';
import navActivePng from '../../static/navigation/nav-active.png';

export function ShellNavRail() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const activeIndex = pathname.startsWith('/history')
    ? 1
    : pathname.startsWith('/stream')
      ? 2
      : pathname.startsWith('/about')
        ? 3
        : 0;

  return (
    <nav className="bpp-nav" aria-label="Primary navigation">
      <div
        className="bpp-nav-active-slider"
        aria-hidden="true"
        style={{ '--bpp-nav-index': activeIndex } as CSSProperties}
      >
        <img
          src={navActivePng}
          alt=""
          draggable={false}
          className="bpp-nav-active-image"
        />
        <span className="bpp-nav-active-glow" />
      </div>
      <RailItem
        to="/"
        icon={<Download size={20} />}
        label={t('navInstall')}
        secondary="INSTALL"
      />
      <RailItem
        to="/history"
        icon={<History size={20} />}
        label={t('navHistory')}
        secondary="RECORD"
      />
      <RailItem
        to="/stream"
        icon={<MonitorPlay size={20} />}
        label={t('navStream')}
        secondary="STREAM"
      />
      <RailItem
        to="/about"
        icon={<Info size={20} />}
        label={t('navAbout')}
        secondary="ABOUT"
      />
      <div className="bpp-nav-footer">
        <span>◆</span> Powered by
        <br />
        Bazaar Technology
      </div>
    </nav>
  );
}

function RailItem({
  to,
  icon,
  label,
  secondary
}: {
  to: string;
  icon: ReactNode;
  label: string;
  secondary: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx('bpp-nav-item', isActive && 'is-active')
      }
    >
      <span className="relative z-[2] flex items-center">{icon}</span>
      <span className="relative z-[2]">
        <span className="bpp-nav-primary">{label}</span>
        <span className="bpp-nav-secondary">{secondary}</span>
      </span>
    </NavLink>
  );
}
