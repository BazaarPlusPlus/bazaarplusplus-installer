import type { MessageKey } from '../../i18n/messages';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
});

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

export function formatRunResultLabel(result: string): {
  key: MessageKey;
  tone: 'ok' | 'bad' | undefined;
} {
  switch (result) {
    case 'win':
      return { key: 'runResultVictory', tone: 'ok' };
    case 'loss':
      return { key: 'runResultDefeat', tone: 'bad' };
    case 'abandoned':
      return { key: 'runResultAbandoned', tone: undefined };
    default:
      return { key: 'runResultActive', tone: undefined };
  }
}

export function formatBattleResult(result: string): {
  key: MessageKey;
  tone: 'ok' | 'bad' | undefined;
} {
  switch (result) {
    case 'win':
      return { key: 'battleResultWin', tone: 'ok' };
    case 'loss':
      return { key: 'battleResultLoss', tone: 'bad' };
    default:
      return { key: 'battleResultNeutral', tone: undefined };
  }
}

export function formatRunStatusKey(status: string): MessageKey {
  switch (status) {
    case 'completed':
      return 'runStatusCompleted';
    case 'abandoned':
      return 'runStatusAbandoned';
    default:
      return 'runStatusActive';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 MB';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
