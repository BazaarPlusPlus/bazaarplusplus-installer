import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  AppBootstrapProvider,
  useAppBootstrap
} from '../features/about/AppBootstrapProvider';
import { UpdaterProvider, useUpdater } from '../features/about/UpdaterProvider';
import { isUpdateModalPhase } from '../features/about/updater';
import { ShellHeader } from './ShellHeader';
import { ShellNavRail } from './ShellNavRail';
import { ShellPaymentModal } from './ShellPaymentModal';
import { ShellUpdateModal } from './ShellUpdateModal';

export default function GlobalShell() {
  return (
    <AppBootstrapProvider>
      <UpdaterProvider>
        <GlobalShellContent />
      </UpdaterProvider>
    </AppBootstrapProvider>
  );
}

function GlobalShellContent() {
  const [showBilibili, setShowBilibili] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const app = useAppBootstrap();
  const updater = useUpdater();

  // Close the header popovers on Escape or a click outside them — the native
  // behaviour these controlled dropdowns were missing.
  useEffect(() => {
    if (!showBilibili && !showSupport) return;
    const closeMenus = () => {
      setShowBilibili(false);
      setShowSupport(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-dropdown]')) closeMenus();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showBilibili, showSupport]);

  return (
    <div className="bpp-app flex flex-col text-[#d9d4cb]">
      <div className="bpp-app-vignette" aria-hidden="true" />
      <ShellHeader
        app={app}
        showBilibili={showBilibili}
        onToggleBilibili={() => {
          setShowBilibili((open) => !open);
          setShowSupport(false);
        }}
        showSupport={showSupport}
        onToggleSupport={() => {
          setShowSupport((open) => !open);
          setShowBilibili(false);
        }}
        onOpenPayment={() => {
          setShowSupport(false);
          setShowPaymentModal(true);
        }}
        onCloseBilibili={() => setShowBilibili(false)}
        onCloseSupport={() => setShowSupport(false)}
      />

      <div className="bpp-shell-body">
        <ShellNavRail />
        <main className="bpp-main custom-scrollbar">
          <div className="bpp-main-inner">
            <AnimatedOutlet />
          </div>
        </main>
      </div>

      {showPaymentModal && (
        <ShellPaymentModal onClose={() => setShowPaymentModal(false)} />
      )}
      {isUpdateModalPhase(updater) && <ShellUpdateModal updater={updater} />}
    </div>
  );
}

function primaryPageIndex(pathname: string): number {
  if (pathname.startsWith('/history')) return 1;
  if (pathname.startsWith('/stream')) return 2;
  if (pathname.startsWith('/about')) return 3;
  return 0;
}

function AnimatedOutlet() {
  const location = useLocation();
  const currentIndex = primaryPageIndex(location.pathname);
  const previousIndex = useRef(currentIndex);
  const direction =
    currentIndex > previousIndex.current
      ? 'forward'
      : currentIndex < previousIndex.current
        ? 'backward'
        : 'neutral';

  useEffect(() => {
    previousIndex.current = currentIndex;
  }, [currentIndex]);

  return (
    <div
      key={location.key}
      className={`bpp-route-page is-${direction}`}
      data-route-index={currentIndex}
    >
      <Outlet />
    </div>
  );
}
