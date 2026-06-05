import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { HistoryRunDetail } from '../../types/backend';
import { toErrorMessage } from '../shared/errors';
import { ensureStreamSession } from '../shared/streamSessionApi';
import { useAsyncAction } from '../shared/useAsyncAction';
import {
  deleteBattleVideo,
  loadHistoryRunDetail,
  revealBattleVideo,
  revealRunScreenshot
} from './historyApi';
import { optionalStripPreviewUrl } from './stripPreview';

export function useRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [detail, setDetail] = useState<HistoryRunDetail | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { action, error, setError, run } = useAsyncAction<string>();

  const refresh = useCallback(async () => {
    if (!runId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [session, nextDetail] = await Promise.all([
        ensureStreamSession(),
        loadHistoryRunDetail(runId)
      ]);
      setBaseUrl(session.base_url);
      setDetail(nextDetail);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [runId, setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revealScreenshot = useCallback(() => {
    if (!detail) return;
    void run('screenshot', () => revealRunScreenshot(detail.run.run_id));
  }, [detail, run]);

  const revealVideo = useCallback(
    (battleId: string, videoId?: string) => {
      void run(`video:${battleId}`, () => revealBattleVideo(battleId, videoId));
    },
    [run]
  );

  const deleteVideo = useCallback(
    (battleId: string, videoId: string) => {
      void run(`delete:${battleId}`, async () => {
        setDetail(await deleteBattleVideo(battleId, videoId));
      });
    },
    [run]
  );

  const stripUrl = optionalStripPreviewUrl(baseUrl, detail?.run.strip_url);

  return {
    runId,
    detail,
    stripUrl,
    loading,
    action,
    error,
    refresh,
    revealScreenshot,
    revealVideo,
    deleteVideo
  };
}
