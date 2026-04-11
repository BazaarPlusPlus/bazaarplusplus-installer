import type { StreamServiceStatus } from '$lib/types';

export type StreamPageLocale = 'en' | 'zh';

export interface StreamPageState {
  canCopyUrl: boolean;
  canOpenPreview: boolean;
  portMessage: string;
  lifecycleMessage: string;
  effectiveFromMessage: string;
  maxRecordsMessage: string;
  effectiveStartValue: string;
  effectiveStartSource: string;
  manualStartValue: string;
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

function formatStreamDateTime(
  value: string | null,
  locale: StreamPageLocale
): string {
  if (!value) {
    return locale === 'zh' ? '未设置' : 'Not set';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');

  if (locale === 'zh') {
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  }

  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

export function createStreamPageState(
  status: StreamServiceStatus,
  locale: StreamPageLocale = 'en'
): StreamPageState {
  const isZh = locale === 'zh';
  const portTarget = `${status.host}:${status.port ?? '—'}`;
  const effectiveStart = status.manual_from ?? status.started_at;

  return {
    canCopyUrl: Boolean(status.running && status.overlay_url),
    canOpenPreview: Boolean(status.running && status.overlay_url),
    portMessage: status.running
      ? status.using_fallback_port
        ? isZh
          ? `监听地址：${portTarget}。由于主端口不可用，服务已自动切换到回退端口；如果你在 OBS 中固定过旧地址，请同步更新。`
          : `Using fallback port ${status.port}. Update OBS if you pinned the old address.`
        : isZh
          ? `监听地址：${portTarget}。`
          : `Listening on ${portTarget}.`
      : isZh
        ? '服务当前未启动。'
        : 'Service is stopped.',
    lifecycleMessage: status.running
      ? isZh
        ? '关闭窗口后，BazaarPlusPlus 会缩到系统托盘，直播服务会继续运行。'
        : 'Closing the window will hide BazaarPlusPlus to the system tray while the stream service keeps running.'
      : isZh
        ? '关闭窗口后，BazaarPlusPlus 会正常退出。'
        : 'Closing the window will exit BazaarPlusPlus normally.',
    effectiveFromMessage: status.effective_from
      ? isZh
        ? `当前会从 ${status.effective_from} 之后的记录开始展示。`
        : `Showing records from ${status.effective_from}.`
      : isZh
        ? '当前没有启用起始时间限制，会展示本地服务可读取到的全部已完成记录。'
        : 'No active time filter. Showing all completed runs available to the local service.',
    maxRecordsMessage: isZh
      ? `当前最多展示 ${status.max_records} 条记录。`
      : `Showing up to ${status.max_records} records.`,
    effectiveStartValue: formatStreamDateTime(effectiveStart, locale),
    effectiveStartSource: status.manual_from
      ? isZh
        ? '手动设置'
        : 'Manual override'
      : status.started_at
        ? isZh
          ? '本次开播时间'
          : 'Stream start time'
        : isZh
          ? '尚未确定'
          : 'Not available yet',
    manualStartValue: status.manual_from
      ? formatStreamDateTime(status.manual_from, locale)
      : isZh
        ? '未手动设置'
        : 'No manual override'
  };
}
