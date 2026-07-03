import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type {
  BranchSwitchStatus,
  InstallState,
  SteamBranchTarget
} from '../../types/backend';

export const emptyInstallState: InstallState = {
  selected_game_path: null,
  steam_path: null,
  steam_launch_options_supported: false,
  game: {
    found: false,
    path_valid: false,
    display_version: null
  },
  mod_state: {
    installed: false,
    installed_version: null,
    bundled_version: null,
    version_matches: false
  },
  compat: {
    mode_available: false,
    forced: false,
    desired: false,
    applied: false
  },
  actions: {
    can_install: false,
    can_reinstall: false,
    can_reset_data: false,
    can_uninstall: false,
    can_launch: false
  },
  has_resettable_data: false,
  warnings: []
};

export const idleBranchSwitchStatus: BranchSwitchStatus = {
  phase: 'idle',
  target: null,
  cancelable: false,
  bytes_downloaded: null,
  bytes_to_download: null,
  progress_fraction: null,
  message: null
};

export async function loadInstallState(gamePath?: string) {
  if (!hasTauriRuntime()) {
    return emptyInstallState;
  }

  return invokeCommand('get_install_state', { gamePath });
}

export async function chooseGameDirectory() {
  if (!hasTauriRuntime()) {
    return { game_path: null };
  }

  return invokeCommand('choose_game_directory');
}

export async function installMod(gamePath: string, compatOptIn: boolean) {
  return invokeCommand('install_mod', { gamePath, compatOptIn });
}

export async function getBranchSwitchStatus() {
  if (!hasTauriRuntime()) {
    return idleBranchSwitchStatus;
  }

  return invokeCommand('get_branch_switch_status');
}

export async function switchBranch(
  gamePath: string,
  target: SteamBranchTarget,
  compatOptIn: boolean
) {
  return invokeCommand('switch_branch', { gamePath, target, compatOptIn });
}

export async function cancelBranchSwitch(): Promise<BranchSwitchStatus> {
  return invokeCommand('cancel_branch_switch');
}

export async function resetBppData(gamePath: string) {
  return invokeCommand('reset_bpp_data', { gamePath });
}

export async function uninstallMod(gamePath: string) {
  return invokeCommand('uninstall_mod', { gamePath });
}

export async function launchGame() {
  if (!hasTauriRuntime()) {
    return { ok: true };
  }

  return invokeCommand('launch_game');
}
