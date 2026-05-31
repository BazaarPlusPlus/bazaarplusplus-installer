import type { StreamServiceStatus } from '../../types/backend';

export interface StreamViewModelInput {
  status: StreamServiceStatus;
  loading: boolean;
  action: string | null;
  error: string | null;
}

export interface StreamViewModel {
  statusLabel: string;
  statusDetail: string;
  obsUrl: string | null;
  settingsUrl: string | null;
  canOpenOverlay: boolean;
  canOpenSettings: boolean;
  canRestart: boolean;
  isBusy: boolean;
}

export function createStreamViewModel(
  input: StreamViewModelInput
): StreamViewModel {
  const message = input.error ?? input.status.last_error;
  const isBusy = input.loading || input.action !== null;
  const running = input.status.running;
  const obsUrl = input.status.overlay_url;
  const settingsUrl = input.status.settings_url;

  if (message) {
    return {
      statusLabel: 'Overlay Error',
      statusDetail: message,
      obsUrl,
      settingsUrl,
      canOpenOverlay: false,
      canOpenSettings: false,
      canRestart: !isBusy,
      isBusy
    };
  }

  if (input.loading) {
    return {
      statusLabel: 'Overlay Starting',
      statusDetail: '正在启动本地服务',
      obsUrl,
      settingsUrl,
      canOpenOverlay: false,
      canOpenSettings: false,
      canRestart: false,
      isBusy
    };
  }

  return {
    statusLabel: running ? 'Overlay Running' : 'Overlay Idle',
    statusDetail:
      running && input.status.port
        ? `Port ${input.status.port}`
        : '服务尚未启动',
    obsUrl,
    settingsUrl,
    canOpenOverlay: running && obsUrl !== null,
    canOpenSettings: running && settingsUrl !== null,
    canRestart: !isBusy,
    isBusy
  };
}
