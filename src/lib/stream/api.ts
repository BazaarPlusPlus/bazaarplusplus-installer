import { invoke } from '@tauri-apps/api/core';
import { hasTauriRuntime } from '$lib/installer/runtime';
import type {
  StreamOverlayCropSettings,
  StreamOverlayCropSettingsPayload,
  StreamRecordSummary,
  StreamServiceStatus
} from '$lib/types';

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

export async function getStreamOverlayCropSettings(): Promise<StreamOverlayCropSettingsPayload> {
  if (!hasTauriRuntime()) {
    return {
      crop: {
        left: 0.342,
        top: 0.313,
        width: 0.58,
        height: 0.22
      },
      code: ''
    };
  }

  return invoke<StreamOverlayCropSettingsPayload>('get_stream_overlay_crop_settings');
}

export async function saveStreamOverlayCropSettings(
  crop: StreamOverlayCropSettings
): Promise<StreamOverlayCropSettingsPayload> {
  if (!hasTauriRuntime()) {
    return {
      crop,
      code: ''
    };
  }

  return invoke<StreamOverlayCropSettingsPayload>('save_stream_overlay_crop_settings', {
    crop
  });
}

export async function importStreamOverlayCropCode(
  code: string
): Promise<StreamOverlayCropSettingsPayload> {
  if (!hasTauriRuntime()) {
    return {
      crop: {
        left: 0.342,
        top: 0.313,
        width: 0.58,
        height: 0.22
      },
      code
    };
  }

  return invoke<StreamOverlayCropSettingsPayload>('import_stream_overlay_crop_code', {
    code
  });
}
