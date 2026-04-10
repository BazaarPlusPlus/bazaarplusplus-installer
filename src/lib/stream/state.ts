import type { StreamServiceStatus } from '$lib/types';

export interface StreamPageState {
  canCopyUrl: boolean;
  canOpenPreview: boolean;
  portMessage: string;
  lifecycleMessage: string;
  effectiveFromMessage: string;
  maxRecordsMessage: string;
}

export function toDateTimeLocalValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function fromDateTimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const offsetMinutes = -parsed.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');

  return `${trimmed}:00${sign}${hours}:${minutes}`;
}

export function createStreamPageState(
  status: StreamServiceStatus
): StreamPageState {
  return {
    canCopyUrl: Boolean(status.running && status.overlay_url),
    canOpenPreview: Boolean(status.running && status.overlay_url),
    portMessage: status.running
      ? status.using_fallback_port
        ? `Using fallback port ${status.port}. Update OBS if you pinned the old address.`
        : `Listening on ${status.host}:${status.port}.`
      : 'Service is stopped.',
    lifecycleMessage: status.running
      ? 'Closing the window will hide BazaarPlusPlus to the system tray while the stream service keeps running.'
      : 'Closing the window will exit BazaarPlusPlus normally.',
    effectiveFromMessage: status.effective_from
      ? `Showing records from ${status.effective_from}.`
      : 'No active time filter yet. Starting the stream will set the current time automatically.',
    maxRecordsMessage: `Showing up to ${status.max_records} records.`
  };
}
