import { commandClient } from '../../api/commandClient';

export async function loadAppBootstrap() {
  return commandClient.getAppBootstrap();
}
