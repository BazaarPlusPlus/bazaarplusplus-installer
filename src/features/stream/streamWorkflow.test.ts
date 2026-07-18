import { describe, expect, it, vi } from 'vitest';
import {
  createStreamWorkflow,
  type StreamCommandPort,
  type StreamScheduler
} from './streamWorkflow';
import {
  defaultCropSettings,
  idleStreamStatus
} from '../../api/previewDefaults';
import type {
  StreamOverlayCropSettingsPayload,
  StreamServiceStatus
} from '../../types/backend';
import { commandClient } from '../../api/commandClient';
import { createStreamCommandPort } from './streamApi';

function runningStatus(
  overrides: Partial<StreamServiceStatus> = {}
): StreamServiceStatus {
  return {
    ...idleStreamStatus,
    running: true,
    port: 17654,
    base_url: 'http://127.0.0.1:17654',
    overlay_url: 'http://127.0.0.1:17654/overlay',
    settings_url: 'http://127.0.0.1:17654/settings',
    db: { found: true, path: '/game/BazaarPlusPlusV4/bazaarplusplus.db' },
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

class FakeScheduler implements StreamScheduler {
  private nextId = 1;
  readonly intervals = new Map<number, () => void>();
  readonly timeouts = new Map<number, () => void>();

  setInterval(callback: () => void) {
    const id = this.nextId++;
    this.intervals.set(id, callback);
    return id;
  }

  clearInterval(handle: unknown) {
    this.intervals.delete(handle as number);
  }

  setTimeout(callback: () => void) {
    const id = this.nextId++;
    this.timeouts.set(id, callback);
    return id;
  }

  clearTimeout(handle: unknown) {
    this.timeouts.delete(handle as number);
  }

  fireIntervals() {
    for (const callback of [...this.intervals.values()]) callback();
  }

  fireTimeouts() {
    const callbacks = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const callback of callbacks) callback();
  }
}

function fakeCommands(
  overrides: Partial<StreamCommandPort> = {}
): StreamCommandPort {
  return {
    ensureSession: vi.fn().mockResolvedValue(runningStatus()),
    getStatus: vi.fn().mockResolvedValue(runningStatus()),
    restartSession: vi.fn().mockResolvedValue(runningStatus()),
    setWindow: vi.fn().mockResolvedValue(runningStatus()),
    loadCropSettings: vi.fn().mockResolvedValue(defaultCropSettings),
    applyCropCode: vi.fn().mockResolvedValue(defaultCropSettings),
    saveDisplayMode: vi.fn().mockResolvedValue(defaultCropSettings),
    resetCropSettings: vi.fn().mockResolvedValue(defaultCropSettings),
    ...overrides
  };
}

const copy = {
  statusError: 'Error',
  statusStarting: 'Starting',
  statusRunning: 'Running',
  statusIdle: 'Idle',
  startingDetail: 'Starting service',
  idleDetail: 'Service idle',
  portDetail: (port: number) => `Port ${port}`,
  dbConnected: 'Database connected',
  dbMissing: 'Database missing',
  windowLatest: 'Latest run',
  windowOffset: (count: number) => `${count} earlier`,
  copied: 'Copied',
  copyFailed: 'Copy failed',
  cropSaved: 'Crop saved',
  cropReset: 'Crop reset'
};

function setup(commandOverrides: Partial<StreamCommandPort> = {}) {
  const scheduler = new FakeScheduler();
  const commands = fakeCommands(commandOverrides);
  const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  const opener = { open: vi.fn().mockResolvedValue(undefined) };
  const workflow = createStreamWorkflow({
    commands,
    scheduler,
    clipboard,
    opener,
    copy
  });
  return { workflow, commands, scheduler, clipboard, opener };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('stream workflow', () => {
  it('loads status and crop settings in parallel into one derived snapshot', async () => {
    const { workflow, scheduler } = setup();

    await workflow.start();

    const snapshot = workflow.getSnapshot();
    expect(snapshot.phase).toBe('running');
    expect(snapshot.statusLabel).toBe('Running');
    expect(snapshot.statusDetail).toBe('Port 17654');
    expect(snapshot.dbLabel).toBe('Database connected');
    expect(snapshot.windowLabel).toBe('Latest run');
    expect(snapshot.cropSettings).toBe(defaultCropSettings);
    expect(snapshot.canOpenOverlay).toBe(true);
    expect(scheduler.intervals.size).toBe(1);
  });

  it('preserves successful initial data and applies stable error priority', async () => {
    const crop: StreamOverlayCropSettingsPayload = {
      ...defaultCropSettings,
      code: 'crop-ok'
    };
    const partial = setup({
      ensureSession: vi.fn().mockRejectedValue(new Error('status failed')),
      loadCropSettings: vi.fn().mockResolvedValue(crop)
    });

    await partial.workflow.start();

    expect(partial.workflow.getSnapshot().cropCode).toBe('crop-ok');
    expect(partial.workflow.getSnapshot().error).toBe('status failed');

    const allFailed = setup({
      ensureSession: vi.fn().mockRejectedValue(new Error('status first')),
      loadCropSettings: vi.fn().mockRejectedValue(new Error('crop second'))
    });
    await allFailed.workflow.start();
    expect(allFailed.workflow.getSnapshot().error).toBe('status first');
  });

  it('surfaces polling errors only at the threshold and stops after dispose', async () => {
    const getStatus = vi.fn().mockRejectedValue(new Error('poll failed'));
    const { workflow, scheduler } = setup({ getStatus });
    await workflow.start();

    scheduler.fireIntervals();
    await flush();
    scheduler.fireIntervals();
    await flush();
    expect(workflow.getSnapshot().error).toBeNull();

    scheduler.fireIntervals();
    await flush();
    expect(workflow.getSnapshot().error).toBe('poll failed');

    getStatus.mockResolvedValueOnce(runningStatus());
    scheduler.fireIntervals();
    await flush();
    expect(workflow.getSnapshot().error).toBeNull();

    workflow.dispose();
    expect(scheduler.intervals.size).toBe(0);
    scheduler.fireIntervals();
    await flush();
    expect(getStatus).toHaveBeenCalledTimes(4);
  });

  it('refreshes after restart and preserves the usable status on failure', async () => {
    const refreshed = runningStatus({ active_window_offset: 2 });
    const success = setup({
      restartSession: vi.fn().mockResolvedValue(runningStatus()),
      getStatus: vi.fn().mockResolvedValue(refreshed)
    });
    await success.workflow.start();

    expect(await success.workflow.intents.restart()).toBe(true);
    expect(success.workflow.getSnapshot().status).toBe(refreshed);

    const failure = setup({
      restartSession: vi.fn().mockRejectedValue(new Error('restart failed'))
    });
    await failure.workflow.start();
    const before = failure.workflow.getSnapshot().status;

    expect(await failure.workflow.intents.restart()).toBe(false);
    expect(failure.workflow.getSnapshot().status).toBe(before);
    expect(failure.workflow.getSnapshot().error).toBe('restart failed');
  });

  it('does not let a slow poll overwrite the restart epoch', async () => {
    const slowPoll = deferred<StreamServiceStatus>();
    const refreshed = runningStatus({ active_window_offset: 3 });
    let statusCalls = 0;
    const getStatus = vi.fn(() => {
      statusCalls += 1;
      return statusCalls === 1 ? slowPoll.promise : Promise.resolve(refreshed);
    });
    const { workflow, scheduler } = setup({ getStatus });
    await workflow.start();

    scheduler.fireIntervals();
    await flush();
    await workflow.intents.restart();
    expect(workflow.getSnapshot().status).toBe(refreshed);

    slowPoll.resolve(runningStatus({ active_window_offset: 1 }));
    await flush();
    expect(workflow.getSnapshot().status).toBe(refreshed);
  });

  it('does not let an older poll overwrite a newer poll', async () => {
    const first = deferred<StreamServiceStatus>();
    const second = deferred<StreamServiceStatus>();
    const getStatus = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { workflow, scheduler } = setup({ getStatus });
    await workflow.start();

    scheduler.fireIntervals();
    scheduler.fireIntervals();
    second.resolve(runningStatus({ active_window_offset: 2 }));
    await flush();
    first.resolve(runningStatus({ active_window_offset: 1 }));
    await flush();

    expect(workflow.getSnapshot().status.active_window_offset).toBe(2);
  });

  it('clamps window offsets and rejects conflicting actions while busy', async () => {
    const pendingWindow = deferred<StreamServiceStatus>();
    const setWindow = vi.fn(() => pendingWindow.promise);
    const { workflow } = setup({ setWindow });
    await workflow.start();

    const first = workflow.intents.moveWindow(-100);
    expect(await workflow.intents.moveWindow(1)).toBe(false);
    expect(workflow.getSnapshot().action).toBe('window');
    expect(workflow.getSnapshot().canRestart).toBe(false);
    expect(workflow.getSnapshot().canEditCrop).toBe(false);
    expect(setWindow).toHaveBeenCalledTimes(1);
    expect(setWindow).toHaveBeenCalledWith(0);

    pendingWindow.resolve(runningStatus({ active_window_offset: 0 }));
    expect(await first).toBe(true);
  });

  it('normalizes crop input and applies returned settings', async () => {
    const saved = { ...defaultCropSettings, code: 'normalized' };
    const applyCropCode = vi.fn().mockResolvedValue(saved);
    const { workflow } = setup({ applyCropCode });
    await workflow.start();

    workflow.intents.setCropCode('  input  ');
    expect(await workflow.intents.submitCropCode()).toBe(true);

    expect(applyCropCode).toHaveBeenCalledWith('input');
    expect(workflow.getSnapshot().cropSettings).toBe(saved);
    expect(workflow.getSnapshot().cropCode).toBe('normalized');
    expect(workflow.getSnapshot().feedback?.text).toBe('Crop saved');
  });

  it('applies display-mode and reset responses through the same crop state', async () => {
    const modeSettings = {
      ...defaultCropSettings,
      display_mode: 'hero' as const
    };
    const resetSettings = { ...defaultCropSettings, code: 'reset-code' };
    const saveDisplayMode = vi.fn().mockResolvedValue(modeSettings);
    const resetCropSettings = vi.fn().mockResolvedValue(resetSettings);
    const { workflow } = setup({ saveDisplayMode, resetCropSettings });
    await workflow.start();

    expect(await workflow.intents.changeDisplayMode('hero')).toBe(true);
    expect(workflow.getSnapshot().cropSettings).toBe(modeSettings);
    expect(await workflow.intents.resetCropCode()).toBe(true);
    expect(workflow.getSnapshot().cropSettings).toBe(resetSettings);
    expect(workflow.getSnapshot().cropCode).toBe('reset-code');
    expect(workflow.getSnapshot().feedback?.text).toBe('Crop reset');
  });

  it('handles copy/open outcomes and clears transient messages on schedule', async () => {
    const { workflow, scheduler, clipboard, opener } = setup();
    await workflow.start();

    expect(await workflow.intents.copyObsUrl()).toBe(true);
    expect(clipboard.writeText).toHaveBeenCalledWith(
      'http://127.0.0.1:17654/overlay'
    );
    expect(workflow.getSnapshot().feedback).toEqual({
      text: 'Copied',
      tone: 'success'
    });
    scheduler.fireTimeouts();
    expect(workflow.getSnapshot().feedback).toBeNull();

    clipboard.writeText.mockRejectedValueOnce(new Error('denied'));
    expect(await workflow.intents.copyObsUrl()).toBe(true);
    expect(workflow.getSnapshot().feedback).toEqual({
      text: 'Copy failed',
      tone: 'error'
    });

    expect(await workflow.intents.openOverlay()).toBe(true);
    expect(opener.open).toHaveBeenCalledWith('http://127.0.0.1:17654/overlay');
    opener.open.mockRejectedValueOnce(new Error('open failed'));
    expect(await workflow.intents.openSettings()).toBe(false);
    expect(workflow.getSnapshot().error).toBe('open failed');
  });

  it('ignores slow responses after disposal', async () => {
    const slow = deferred<StreamServiceStatus>();
    const { workflow, scheduler } = setup({ getStatus: () => slow.promise });
    await workflow.start();
    const before = workflow.getSnapshot();

    scheduler.fireIntervals();
    workflow.dispose();
    slow.resolve(runningStatus({ active_window_offset: 9 }));
    await flush();

    expect(workflow.getSnapshot()).toBe(before);
  });

  it('runs unchanged with generated/native-shaped and Preview semantic adapters', async () => {
    const nativeLike = {
      ensureStreamSession: vi.fn().mockResolvedValue(runningStatus()),
      getStreamStatus: vi.fn().mockResolvedValue(runningStatus()),
      restartStreamSession: vi.fn().mockResolvedValue(runningStatus()),
      setStreamWindow: vi.fn().mockResolvedValue(runningStatus()),
      getOverlaySettings: vi.fn().mockResolvedValue(defaultCropSettings),
      applyOverlayCropCode: vi.fn().mockResolvedValue(defaultCropSettings),
      saveOverlayDisplayMode: vi.fn().mockResolvedValue(defaultCropSettings),
      resetOverlayCrop: vi.fn().mockResolvedValue(defaultCropSettings)
    } satisfies Parameters<typeof createStreamCommandPort>[0];

    for (const commands of [
      createStreamCommandPort(nativeLike),
      createStreamCommandPort(commandClient)
    ]) {
      const workflow = createStreamWorkflow({
        commands,
        scheduler: new FakeScheduler(),
        clipboard: { writeText: async () => undefined },
        opener: { open: async () => undefined },
        copy
      });
      await workflow.start();
      expect(workflow.getSnapshot().phase).not.toBe('starting');
      workflow.dispose();
    }
  });
});
