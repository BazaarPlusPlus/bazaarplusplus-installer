import { invoke } from '@tauri-apps/api/core';
import { hasTauriRuntime } from '$lib/installer/runtime';
import type { StreamRecordSummary, StreamServiceStatus } from '$lib/types';

const idleStatus: StreamServiceStatus = {
  running: false,
  host: '127.0.0.1',
  port: null,
  overlay_url: null,
  using_fallback_port: false,
  last_error: null,
  manual_from: null,
  started_at: null,
  effective_from: null,
  max_records: 5
};

export async function getStreamServiceStatus(): Promise<StreamServiceStatus> {
  if (!hasTauriRuntime()) {
    return idleStatus;
  }

  return invoke<StreamServiceStatus>('get_stream_service_status');
}

export async function startStreamService(): Promise<StreamServiceStatus> {
  if (!hasTauriRuntime()) {
    return idleStatus;
  }

  return invoke<StreamServiceStatus>('start_stream_service');
}

export async function stopStreamService(): Promise<StreamServiceStatus> {
  if (!hasTauriRuntime()) {
    return idleStatus;
  }

  return invoke<StreamServiceStatus>('stop_stream_service');
}

export async function updateStreamServiceFilters(input: {
  manualFrom: string | null;
  maxRecords: number;
}): Promise<StreamServiceStatus> {
  if (!hasTauriRuntime()) {
    return {
      ...idleStatus,
      manual_from: input.manualFrom,
      effective_from: input.manualFrom,
      max_records: Math.max(1, input.maxRecords || idleStatus.max_records)
    };
  }

  return invoke<StreamServiceStatus>('update_stream_service_filters', {
    manualFrom: input.manualFrom,
    maxRecords: input.maxRecords
  });
}

export async function loadRecentStreamRecords(
  baseUrl: string | null
): Promise<StreamRecordSummary[]> {
  if (!baseUrl) {
    return [];
  }

  try {
    const response = await fetch(`${baseUrl}/api/records/recent`);
    if (!response.ok) {
      return [];
    }

    return (await response.json()) as StreamRecordSummary[];
  } catch {
    return [];
  }
}
