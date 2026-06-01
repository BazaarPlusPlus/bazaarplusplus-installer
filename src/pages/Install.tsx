import { useState } from 'react';
import { PageShell } from '../components/ui/PageShell';
import { InstallActionsPanel } from '../features/install/InstallActionsPanel';
import { InstallConfirmModal } from '../features/install/InstallConfirmModal';
import { InstallStatusPanel } from '../features/install/InstallStatusPanel';
import { useInstallPage } from '../features/install/useInstallPage';

export default function Install() {
  const page = useInstallPage();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const primaryMode: 'install' | 'reinstall' | 'launch' = !page.state.mod_state
    .installed
    ? 'install'
    : page.state.mod_state.version_matches
      ? 'launch'
      : 'reinstall';

  const openInstallModal = () => {
    setShowInstallModal(true);
    setInstallAcknowledged(false);
  };

  const confirmInstall = async () => {
    await page.install();
    setShowInstallModal(false);
    setInstallAcknowledged(false);
  };

  return (
    <PageShell eyebrow="Install" title="安装">
      <div className="grid grid-cols-12 gap-8 w-full">
        <InstallStatusPanel page={page} />
        <InstallActionsPanel
          page={page}
          primaryMode={primaryMode}
          onOpenInstallModal={openInstallModal}
        />
      </div>

      {showInstallModal && (
        <InstallConfirmModal
          page={page}
          installAcknowledged={installAcknowledged}
          onAcknowledgedChange={setInstallAcknowledged}
          onClose={() => setShowInstallModal(false)}
          onConfirm={confirmInstall}
        />
      )}
    </PageShell>
  );
}
