import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type { InstallState } from '../../types/backend';

export const emptyInstallState: InstallState = {
  selected_game_path: null,
  steam_path: null,
  steam_running: false,
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
  runtime: {
    dotnet_version: null,
    dotnet_ok: false
  },
  actions: {
    can_install: false,
    can_reinstall: false,
    can_repair: false,
    can_uninstall: false,
    can_launch: false
  },
  warnings: []
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

export async function installMod(gamePath: string) {
  return invokeCommand('install_mod', { gamePath, skipSteamShutdown: true });
}

export async function repairMod(gamePath: string) {
  return invokeCommand('repair_mod', { gamePath });
}

export async function uninstallMod(gamePath: string) {
  return invokeCommand('uninstall_mod', { gamePath });
}

export async function launchGame(gamePath?: string) {
  if (!hasTauriRuntime()) {
    return { ok: true };
  }

  return invokeCommand('launch_game', { gamePath });
}
