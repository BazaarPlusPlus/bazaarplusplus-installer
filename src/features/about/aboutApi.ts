import { invokeOrFallback } from '../../api/tauri';

export async function loadAppBootstrap() {
  return invokeOrFallback('get_app_bootstrap');
}
