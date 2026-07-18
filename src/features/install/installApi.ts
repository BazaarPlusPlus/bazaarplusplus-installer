import { commandClient } from '../../api/commandClient';

export async function loadInstallState(gamePath?: string) {
  return commandClient.getInstallState(gamePath ?? null);
}

export async function chooseGameDirectory() {
  return commandClient.chooseGameDirectory();
}

export async function installMod(gamePath: string, compatOptIn: boolean) {
  return commandClient.installMod(gamePath, compatOptIn);
}

export async function resetBppData(gamePath: string) {
  return commandClient.resetBppData(gamePath);
}

export async function resetBepinex(gamePath: string) {
  return commandClient.resetBepinex(gamePath);
}

export async function uninstallMod(gamePath: string) {
  return commandClient.uninstallMod(gamePath);
}

export async function launchGame() {
  return commandClient.launchGame();
}
