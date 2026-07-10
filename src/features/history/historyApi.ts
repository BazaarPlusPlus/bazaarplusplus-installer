import { invokeOrFallback } from '../../api/tauri';
import type { CleanupPreset } from '../../types/backend';

export async function listHistoryRuns(limit = 50) {
  return invokeOrFallback('list_history_runs', { limit });
}

export async function loadHistoryRunDetail(runId: string) {
  return invokeOrFallback('get_history_run_detail', { runId });
}

export async function revealRunScreenshot(runId: string) {
  await invokeOrFallback('reveal_run_screenshot', { runId });
}

export async function revealBattleVideo(battleId: string, videoId?: string) {
  await invokeOrFallback('reveal_battle_video', { battleId, videoId });
}

export async function deleteBattleVideo(battleId: string, videoId: string) {
  return invokeOrFallback('delete_battle_video', { battleId, videoId });
}

export async function previewScreenshotCleanup(preset: CleanupPreset) {
  return invokeOrFallback('preview_screenshot_cleanup', { preset });
}

export async function executeScreenshotCleanup(preset: CleanupPreset) {
  return invokeOrFallback('execute_screenshot_cleanup', { preset });
}

export async function previewRunDataCleanup(preset: CleanupPreset) {
  return invokeOrFallback('preview_run_data_cleanup', { preset });
}

export async function executeRunDataCleanup(preset: CleanupPreset) {
  return invokeOrFallback('execute_run_data_cleanup', { preset });
}
