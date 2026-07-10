import { invokeOrFallback } from '../../api/tauri';

export async function loadInstallState(gamePath?: string) {
  return invokeOrFallback('get_install_state', { gamePath });
}

export async function chooseGameDirectory() {
  return invokeOrFallback('choose_game_directory');
}

export async function installMod(gamePath: string, compatOptIn: boolean) {
  return invokeOrFallback('install_mod', { gamePath, compatOptIn });
}

export async function resetBppData(gamePath: string) {
  return invokeOrFallback('reset_bpp_data', { gamePath });
}

export async function resetBepinex(gamePath: string) {
  return invokeOrFallback('reset_bepinex', { gamePath });
}

export async function uninstallMod(gamePath: string) {
  return invokeOrFallback('uninstall_mod', { gamePath });
}

export async function launchGame() {
  return invokeOrFallback('launch_game');
}
