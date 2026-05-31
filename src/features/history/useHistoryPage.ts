import { useCallback, useEffect, useMemo, useState } from 'react';
import { composeStripPreviewUrl } from '../../api/http';
import { ensureStreamSession } from '../stream/streamApi';
import type { HistoryRunList, HistoryRunRow } from '../../types/backend';
import {
  deleteRunVideos,
  emptyHistoryRunList,
  listHistoryRuns
} from './historyApi';

export function useHistoryPage() {
  const [payload, setPayload] = useState<HistoryRunList>(emptyHistoryRunList);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionRunId, setActionRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [session, list] = await Promise.all([
        ensureStreamSession('history'),
        listHistoryRuns()
      ]);
      setBaseUrl(session.base_url);
      setPayload(list);
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const deleteVideos = useCallback(async (runId: string) => {
    setActionRunId(runId);
    setError(null);
    try {
      setPayload(await deleteRunVideos(runId));
    } catch (caught) {
      setError(toMessage(caught));
    } finally {
      setActionRunId(null);
    }
  }, []);

  const previewUrl = useCallback(
    (run: HistoryRunRow) => {
      if (!baseUrl || !run.strip_url) return null;
      try {
        return composeStripPreviewUrl(baseUrl, run.strip_url);
      } catch {
        return null;
      }
    },
    [baseUrl]
  );

  const summary = useMemo(
    () => ({
      runs: String(payload.summary.runs),
      videos: String(payload.summary.videos),
      lastRun: formatDateTime(payload.summary.last_run_at_utc),
      winRate:
        payload.summary.win_rate === null
          ? '-'
          : `${Math.round(payload.summary.win_rate * 100)}%`
    }),
    [payload.summary]
  );

  return {
    payload,
    summary,
    loading,
    error,
    actionRunId,
    previewUrl,
    refresh,
    deleteVideos
  };
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
