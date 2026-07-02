import { invokeCommand } from '../../api/tauri';
import { hasTauriRuntime } from '../../api/runtime';
import type {
  CleanupPreset,
  HistoryRunDetail,
  HistoryRunList
} from '../../types/backend';

export const emptyHistoryRunList: HistoryRunList = {
  summary: {
    runs: 0,
    videos: 0,
    last_run_at_utc: null,
    win_rate: null
  },
  runs: []
};

export async function listHistoryRuns(limit = 50) {
  if (!hasTauriRuntime()) {
    return emptyHistoryRunList;
  }

  return invokeCommand('list_history_runs', { limit });
}

export async function loadHistoryRunDetail(
  runId: string
): Promise<HistoryRunDetail | null> {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('get_history_run_detail', { runId });
}

export async function revealRunScreenshot(runId: string) {
  if (!hasTauriRuntime()) {
    return;
  }

  await invokeCommand('reveal_run_screenshot', { runId });
}

export async function revealBattleVideo(battleId: string, videoId?: string) {
  if (!hasTauriRuntime()) {
    return;
  }

  await invokeCommand('reveal_battle_video', { battleId, videoId });
}

export async function deleteBattleVideo(battleId: string, videoId: string) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('delete_battle_video', { battleId, videoId });
}

export async function previewScreenshotCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('preview_screenshot_cleanup', { preset });
}

export async function executeScreenshotCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('execute_screenshot_cleanup', { preset });
}

export async function previewRunDataCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('preview_run_data_cleanup', { preset });
}

export async function executeRunDataCleanup(preset: CleanupPreset) {
  if (!hasTauriRuntime()) {
    return null;
  }

  return invokeCommand('execute_run_data_cleanup', { preset });
}
