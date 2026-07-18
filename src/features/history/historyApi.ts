import { commandClient } from '../../api/commandClient';
import type { CleanupPreset } from '../../types/backend';

export async function listHistoryRuns(limit = 50) {
  return commandClient.listHistoryRuns(null, limit);
}

export async function loadHistoryRunDetail(runId: string) {
  return commandClient.getHistoryRunDetail(null, runId);
}

export async function revealRunScreenshot(runId: string) {
  await commandClient.revealRunScreenshot(null, runId);
}

export async function revealBattleVideo(battleId: string, videoId?: string) {
  await commandClient.revealBattleVideo(null, battleId, videoId ?? null);
}

export async function deleteBattleVideo(battleId: string, videoId: string) {
  return commandClient.deleteBattleVideo(null, battleId, videoId);
}

export async function previewScreenshotCleanup(preset: CleanupPreset) {
  return commandClient.previewScreenshotCleanup(null, preset);
}

export async function executeScreenshotCleanup(preset: CleanupPreset) {
  return commandClient.executeScreenshotCleanup(null, preset);
}

export async function previewRunDataCleanup(preset: CleanupPreset) {
  return commandClient.previewRunDataCleanup(null, preset);
}

export async function executeRunDataCleanup(preset: CleanupPreset) {
  return commandClient.executeRunDataCleanup(null, preset);
}
