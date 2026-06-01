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

export function formatRunResultLabel(result: string) {
  switch (result) {
    case 'win':
      return { label: 'VICTORY', tone: 'ok' as const };
    case 'loss':
      return { label: 'DEFEAT', tone: 'bad' as const };
    case 'abandoned':
      return { label: 'ABANDONED', tone: 'bad' as const };
    default:
      return { label: 'ACTIVE', tone: undefined };
  }
}
