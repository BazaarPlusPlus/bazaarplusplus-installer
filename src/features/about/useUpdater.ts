import { useEffect, useRef, useState } from 'react';
import { hasTauriRuntime } from '../../api/runtime';
import {
  claimStartupCheck,
  createUpdaterMachine,
  initialUpdaterSnapshot,
  tauriUpdaterImpl,
  type UpdaterMachine,
  type UpdaterSnapshot
} from './updater';

export type UpdaterController = UpdaterSnapshot & {
  checkNow: () => void;
  install: () => void;
  restart: () => void;
  dismiss: () => void;
};

export function useUpdaterState(): UpdaterController {
  const [snapshot, setSnapshot] = useState(initialUpdaterSnapshot);
  const machineRef = useRef<UpdaterMachine | null>(null);
  machineRef.current ??= createUpdaterMachine(tauriUpdaterImpl, setSnapshot);
  const machine = machineRef.current;

  useEffect(() => {
    if (!hasTauriRuntime()) return;
    if (!claimStartupCheck()) return;
    void machine.checkNow({ silent: true });
  }, [machine]);

  return {
    ...snapshot,
    checkNow: () => void machine.checkNow(),
    install: () => void machine.install(),
    restart: () => void machine.restart(),
    dismiss: machine.dismiss
  };
}
