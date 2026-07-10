import { invokeOrFallback } from '../../api/tauri';

export async function ensureStreamSession() {
  // This intentionally starts the local HTTP service when it is not running.
  return invokeOrFallback('ensure_stream_session', {});
}

export async function getStreamStatus() {
  return invokeOrFallback('get_stream_status');
}
