import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { HistoryRunDetail } from '../../types/backend';
import { toErrorMessage } from '../shared/errors';
import { ensureStreamSession } from '../stream/streamApi';
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
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        ensureStreamSession('history'),
        loadHistoryRunDetail(runId)
      ]);
      setBaseUrl(session.base_url);
      setDetail(nextDetail);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (name: string, task: () => Promise<void>) => {
      setAction(name);
      setError(null);
      try {
        await task();
      } catch (caught) {
        setError(toErrorMessage(caught));
      } finally {
        setAction(null);
      }
    },
    []
  );

  const revealScreenshot = useCallback(() => {
    if (!detail) return;
    void runAction('screenshot', () => revealRunScreenshot(detail.run.run_id));
  }, [detail, runAction]);

  const revealVideo = useCallback(
    (battleId: string, videoId?: string) => {
      void runAction(`video:${battleId}`, () =>
        revealBattleVideo(battleId, videoId)
      );
    },
    [runAction]
  );

  const deleteVideo = useCallback(
    (battleId: string, videoId: string) => {
      void runAction(`delete:${battleId}`, async () => {
        const nextDetail = await deleteBattleVideo(battleId, videoId);
        setDetail(nextDetail);
      });
    },
    [runAction]
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
