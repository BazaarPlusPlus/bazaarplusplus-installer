import type {
  StreamOverlayCropSettingsPayload,
  StreamOverlayDisplayMode,
  StreamServiceStatus
} from '../../types/backend';
import {
  defaultCropSettings,
  idleStreamStatus
} from '../../api/previewDefaults';
import { toErrorMessage } from '../shared/errors';

export type StreamAction =
  | 'restart'
  | 'copy'
  | 'open_overlay'
  | 'open_settings'
  | 'crop'
  | 'display_mode'
  | 'window';

export type StreamPagePhase = 'error' | 'starting' | 'running' | 'idle';
export type StreamFeedbackTone = 'success' | 'error';

export interface StreamCommandPort {
  ensureSession(): Promise<StreamServiceStatus>;
  getStatus(): Promise<StreamServiceStatus>;
  restartSession(): Promise<StreamServiceStatus>;
  setWindow(offset: number): Promise<StreamServiceStatus>;
  loadCropSettings(): Promise<StreamOverlayCropSettingsPayload>;
  applyCropCode(code: string): Promise<StreamOverlayCropSettingsPayload>;
  saveDisplayMode(
    displayMode: StreamOverlayDisplayMode
  ): Promise<StreamOverlayCropSettingsPayload>;
  resetCropSettings(): Promise<StreamOverlayCropSettingsPayload>;
}

export interface StreamScheduler {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface StreamClipboard {
  writeText(value: string): Promise<void>;
}

export interface StreamOpener {
  open(url: string): Promise<void>;
}

export interface StreamWorkflowCopy {
  statusError: string;
  statusStarting: string;
  statusRunning: string;
  statusIdle: string;
  startingDetail: string;
  idleDetail: string;
  portDetail(port: number): string;
  dbConnected: string;
  dbMissing: string;
  windowLatest: string;
  windowOffset(count: number): string;
  copied: string;
  copyFailed: string;
  cropSaved: string;
  cropReset: string;
}

export interface StreamPageSnapshot {
  status: StreamServiceStatus;
  cropSettings: StreamOverlayCropSettingsPayload;
  cropCode: string;
  phase: StreamPagePhase;
  statusLabel: string;
  statusDetail: string;
  dbLabel: string;
  windowLabel: string;
  action: StreamAction | null;
  error: string | null;
  feedback: { text: string; tone: StreamFeedbackTone } | null;
  obsUrl: string | null;
  settingsUrl: string | null;
  isBusy: boolean;
  canOpenOverlay: boolean;
  canCopyObsUrl: boolean;
  canOpenSettings: boolean;
  canRestart: boolean;
  canMoveMoreHistory: boolean;
  canMoveLessHistory: boolean;
  canEditCrop: boolean;
}

export interface StreamWorkflowIntents {
  restart(): Promise<boolean>;
  copyObsUrl(): Promise<boolean>;
  openOverlay(): Promise<boolean>;
  openSettings(): Promise<boolean>;
  changeDisplayMode(displayMode: StreamOverlayDisplayMode): Promise<boolean>;
  setCropCode(value: string): void;
  submitCropCode(): Promise<boolean>;
  resetCropCode(): Promise<boolean>;
  moveWindow(delta: number): Promise<boolean>;
}

export interface StreamWorkflow {
  getSnapshot(): StreamPageSnapshot;
  subscribe(listener: () => void): () => void;
  start(): Promise<void>;
  dispose(): void;
  readonly intents: StreamWorkflowIntents;
}

interface StreamWorkflowPorts {
  commands: StreamCommandPort;
  scheduler: StreamScheduler;
  clipboard: StreamClipboard;
  opener: StreamOpener;
  copy: StreamWorkflowCopy;
}

interface MutableState {
  status: StreamServiceStatus;
  cropSettings: StreamOverlayCropSettingsPayload;
  cropCode: string;
  loading: boolean;
  action: StreamAction | null;
  actionError: string | null;
  statusLoadError: string | null;
  cropLoadError: string | null;
  pollError: string | null;
  transient: { text: string; tone: StreamFeedbackTone } | null;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_FAILURE_THRESHOLD = 3;
const TRANSIENT_MESSAGE_MS = 3_000;

class DefaultStreamWorkflow implements StreamWorkflow {
  private readonly listeners = new Set<() => void>();
  private state: MutableState = {
    status: idleStreamStatus,
    cropSettings: defaultCropSettings,
    cropCode: defaultCropSettings.code,
    loading: true,
    action: null,
    actionError: null,
    statusLoadError: null,
    cropLoadError: null,
    pollError: null,
    transient: null
  };
  private snapshot: StreamPageSnapshot;
  private started = false;
  private disposed = false;
  private lifecycleEpoch = 0;
  private statusEpoch = 0;
  private latestPollRequest = 0;
  private latestSuccessfulPollRequest = 0;
  private consecutivePollFailures = 0;
  private intervalHandle: unknown = null;
  private messageTimeoutHandle: unknown = null;

  readonly intents: StreamWorkflowIntents = {
    restart: () => this.restart(),
    copyObsUrl: () => this.copyObsUrl(),
    openOverlay: () => this.openOverlay(),
    openSettings: () => this.openSettings(),
    changeDisplayMode: (displayMode) => this.changeDisplayMode(displayMode),
    setCropCode: (value) => this.setCropCode(value),
    submitCropCode: () => this.submitCropCode(),
    resetCropCode: () => this.resetCropCode(),
    moveWindow: (delta) => this.moveWindow(delta)
  };

  constructor(private readonly ports: StreamWorkflowPorts) {
    this.snapshot = this.deriveSnapshot();
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async start() {
    if (this.started) return;
    this.started = true;
    this.disposed = false;
    const lifecycle = ++this.lifecycleEpoch;
    this.state.loading = true;
    this.state.action = null;
    this.state.actionError = null;
    this.state.statusLoadError = null;
    this.state.cropLoadError = null;
    this.state.pollError = null;
    this.consecutivePollFailures = 0;
    this.clearTransient();
    this.publish();
    const epoch = ++this.statusEpoch;
    const [statusResult, cropResult] = await Promise.allSettled([
      this.ports.commands.ensureSession(),
      this.ports.commands.loadCropSettings()
    ]);
    if (!this.isCurrentLifecycle(lifecycle)) return;

    if (statusResult.status === 'fulfilled' && epoch === this.statusEpoch) {
      this.state.status = statusResult.value;
      this.state.statusLoadError = null;
    } else if (statusResult.status === 'rejected') {
      this.state.statusLoadError = toErrorMessage(statusResult.reason);
    }

    if (cropResult.status === 'fulfilled') {
      this.applyCropSettings(cropResult.value);
      this.state.cropLoadError = null;
    } else {
      this.state.cropLoadError = toErrorMessage(cropResult.reason);
    }

    this.state.loading = false;
    this.publish();
    this.intervalHandle = this.ports.scheduler.setInterval(
      () => void this.poll(),
      POLL_INTERVAL_MS
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.started = false;
    this.lifecycleEpoch += 1;
    this.statusEpoch += 1;
    this.latestPollRequest += 1;
    this.state.action = null;
    if (this.intervalHandle !== null) {
      this.ports.scheduler.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.clearMessageTimer();
    this.listeners.clear();
  }

  private async poll() {
    if (this.disposed || this.state.action !== null) return;
    const lifecycle = this.lifecycleEpoch;
    const epoch = this.statusEpoch;
    const request = ++this.latestPollRequest;
    try {
      const status = await this.ports.commands.getStatus();
      if (
        !this.isCurrentLifecycle(lifecycle) ||
        epoch !== this.statusEpoch ||
        request !== this.latestPollRequest
      )
        return;
      this.state.status = status;
      this.state.statusLoadError = null;
      this.state.pollError = null;
      this.latestSuccessfulPollRequest = request;
      this.consecutivePollFailures = 0;
      this.publish();
    } catch (caught) {
      if (
        !this.isCurrentLifecycle(lifecycle) ||
        epoch !== this.statusEpoch ||
        request < this.latestSuccessfulPollRequest
      )
        return;
      this.consecutivePollFailures += 1;
      if (this.consecutivePollFailures >= POLL_FAILURE_THRESHOLD) {
        this.state.pollError = toErrorMessage(caught);
        this.publish();
      }
    }
  }

  private restart() {
    return this.runAction(
      'restart',
      async (lifecycle) => {
        await this.ports.commands.restartSession();
        const status = await this.ports.commands.getStatus();
        if (!this.isCurrentLifecycle(lifecycle)) return;
        this.state.status = status;
        this.state.statusLoadError = null;
        this.state.pollError = null;
        this.consecutivePollFailures = 0;
      },
      { invalidateStatus: true }
    );
  }

  private copyObsUrl() {
    return this.runAction(
      'copy',
      async (lifecycle) => {
        const url = this.state.status.overlay_url;
        if (!url) return;
        try {
          await this.ports.clipboard.writeText(url);
          if (this.isCurrentLifecycle(lifecycle)) {
            this.showTransient(this.ports.copy.copied, 'success');
          }
        } catch {
          if (this.isCurrentLifecycle(lifecycle)) {
            this.showTransient(this.ports.copy.copyFailed, 'error');
          }
        }
      },
      { clearTransient: true }
    );
  }

  private openOverlay() {
    return this.runAction('open_overlay', async () => {
      const url = this.state.status.overlay_url;
      if (url) await this.ports.opener.open(url);
    });
  }

  private openSettings() {
    return this.runAction('open_settings', async () => {
      const url = this.state.status.settings_url;
      if (url) await this.ports.opener.open(url);
    });
  }

  private changeDisplayMode(displayMode: StreamOverlayDisplayMode) {
    return this.runAction('display_mode', async (lifecycle) => {
      const settings = await this.ports.commands.saveDisplayMode(displayMode);
      if (!this.isCurrentLifecycle(lifecycle)) return;
      this.applyCropSettings(settings, false);
      this.state.cropLoadError = null;
    });
  }

  private setCropCode(value: string) {
    if (this.disposed) return;
    this.state.cropCode = value;
    this.publish();
  }

  private submitCropCode() {
    return this.runAction(
      'crop',
      async (lifecycle) => {
        const settings = await this.ports.commands.applyCropCode(
          this.state.cropCode.trim()
        );
        if (!this.isCurrentLifecycle(lifecycle)) return;
        this.applyCropSettings(settings);
        this.state.cropLoadError = null;
        this.showTransient(this.ports.copy.cropSaved, 'success');
      },
      { clearTransient: true }
    );
  }

  private resetCropCode() {
    return this.runAction(
      'crop',
      async (lifecycle) => {
        const settings = await this.ports.commands.resetCropSettings();
        if (!this.isCurrentLifecycle(lifecycle)) return;
        this.applyCropSettings(settings);
        this.state.cropLoadError = null;
        this.showTransient(this.ports.copy.cropReset, 'success');
      },
      { clearTransient: true }
    );
  }

  private moveWindow(delta: number) {
    return this.runAction(
      'window',
      async (lifecycle) => {
        const offset = Math.max(
          0,
          Math.trunc(this.state.status.active_window_offset + delta)
        );
        const status = await this.ports.commands.setWindow(offset);
        if (!this.isCurrentLifecycle(lifecycle)) return;
        this.state.status = status;
        this.state.statusLoadError = null;
        this.state.pollError = null;
      },
      { invalidateStatus: true }
    );
  }

  private async runAction(
    action: StreamAction,
    task: (lifecycle: number) => Promise<void>,
    options: { clearTransient?: boolean; invalidateStatus?: boolean } = {}
  ) {
    if (this.disposed || this.state.action !== null) return false;
    const lifecycle = this.lifecycleEpoch;
    this.state.action = action;
    this.state.actionError = null;
    if (options.invalidateStatus) {
      this.statusEpoch += 1;
      this.latestPollRequest += 1;
    }
    if (options.clearTransient) this.clearTransient();
    this.publish();

    try {
      await task(lifecycle);
      return true;
    } catch (caught) {
      if (this.isCurrentLifecycle(lifecycle)) {
        this.state.actionError = toErrorMessage(caught);
      }
      return false;
    } finally {
      if (this.isCurrentLifecycle(lifecycle)) {
        this.state.action = null;
        this.publish();
      }
    }
  }

  private applyCropSettings(
    settings: StreamOverlayCropSettingsPayload,
    updateCode = true
  ) {
    this.state.cropSettings = settings;
    if (updateCode) this.state.cropCode = settings.code;
  }

  private showTransient(text: string, tone: StreamFeedbackTone) {
    const lifecycle = this.lifecycleEpoch;
    this.clearMessageTimer();
    this.state.transient = { text, tone };
    this.messageTimeoutHandle = this.ports.scheduler.setTimeout(() => {
      this.messageTimeoutHandle = null;
      if (!this.isCurrentLifecycle(lifecycle)) return;
      this.state.transient = null;
      this.publish();
    }, TRANSIENT_MESSAGE_MS);
    this.publish();
  }

  private clearTransient() {
    this.clearMessageTimer();
    this.state.transient = null;
  }

  private clearMessageTimer() {
    if (this.messageTimeoutHandle === null) return;
    this.ports.scheduler.clearTimeout(this.messageTimeoutHandle);
    this.messageTimeoutHandle = null;
  }

  private currentError() {
    return (
      this.state.actionError ??
      this.state.statusLoadError ??
      this.state.cropLoadError ??
      this.state.pollError ??
      this.state.status.last_error
    );
  }

  private isCurrentLifecycle(lifecycle: number) {
    return !this.disposed && lifecycle === this.lifecycleEpoch;
  }

  private deriveSnapshot(): StreamPageSnapshot {
    const error = this.currentError();
    const isBusy = this.state.loading || this.state.action !== null;
    const phase: StreamPagePhase = error
      ? 'error'
      : this.state.loading
        ? 'starting'
        : this.state.status.running
          ? 'running'
          : 'idle';
    const statusLabel =
      phase === 'error'
        ? this.ports.copy.statusError
        : phase === 'starting'
          ? this.ports.copy.statusStarting
          : phase === 'running'
            ? this.ports.copy.statusRunning
            : this.ports.copy.statusIdle;
    const statusDetail = error
      ? error
      : phase === 'starting'
        ? this.ports.copy.startingDetail
        : phase === 'running' && this.state.status.port !== null
          ? this.ports.copy.portDetail(this.state.status.port)
          : this.ports.copy.idleDetail;
    const controlsAvailable = !isBusy && error === null;
    const running = this.state.status.running;

    return {
      status: this.state.status,
      cropSettings: this.state.cropSettings,
      cropCode: this.state.cropCode,
      phase,
      statusLabel,
      statusDetail,
      dbLabel: this.state.status.db.found
        ? this.ports.copy.dbConnected
        : this.ports.copy.dbMissing,
      windowLabel:
        this.state.status.active_window_offset === 0
          ? this.ports.copy.windowLatest
          : this.ports.copy.windowOffset(
              this.state.status.active_window_offset
            ),
      action: this.state.action,
      error,
      feedback: error ? { text: error, tone: 'error' } : this.state.transient,
      obsUrl: this.state.status.overlay_url,
      settingsUrl: this.state.status.settings_url,
      isBusy,
      canOpenOverlay:
        controlsAvailable && running && this.state.status.overlay_url !== null,
      canCopyObsUrl: !isBusy && this.state.status.overlay_url !== null,
      canOpenSettings:
        controlsAvailable && running && this.state.status.settings_url !== null,
      canRestart: !isBusy,
      canMoveMoreHistory: !isBusy && running,
      canMoveLessHistory:
        !isBusy && running && this.state.status.active_window_offset > 0,
      canEditCrop: !isBusy
    };
  }

  private publish() {
    if (this.disposed) return;
    this.snapshot = this.deriveSnapshot();
    for (const listener of this.listeners) listener();
  }
}

export function createStreamWorkflow(
  ports: StreamWorkflowPorts
): StreamWorkflow {
  return new DefaultStreamWorkflow(ports);
}
