// FFmpeg install/repair orchestrator. Mirrors the shape of `install-controller`
// — accepts API callbacks (so tests can stub them) and exposes svelte stores
// the UI binds to. The progress channel is wired via a `listenProgress` input
// so we can swap in an in-memory transport for tests.
import { writable, get } from 'svelte/store';
import type {
  FfmpegDetectResult,
  FfmpegInstallProgress
} from '$lib/generated/commands';
import { parseFfmpegError, type FfmpegError } from '../ffmpeg-errors.ts';

export type FfmpegBusy =
  | 'idle'
  | 'detecting'
  | 'installing'
  | 'uninstalling'
  | 'repairing';

export type FfmpegPhase = 'idle' | 'extracting' | 'probing' | 'complete';

export interface FfmpegProgressUnlisten {
  (): void | Promise<void>;
}

export function createFfmpegController(input: {
  detectApi: (gamePath: string) => Promise<FfmpegDetectResult>;
  installApi: (gamePath: string) => Promise<unknown>;
  uninstallApi: (gamePath: string) => Promise<unknown>;
  repairApi: (gamePath: string) => Promise<unknown>;
  listenProgress: (
    handler: (progress: FfmpegInstallProgress) => void
  ) => Promise<FfmpegProgressUnlisten>;
}) {
  const detect = writable<FfmpegDetectResult | null>(null);
  const busy = writable<FfmpegBusy>('idle');
  const progress = writable<FfmpegInstallProgress | null>(null);
  const phase = writable<FfmpegPhase>('idle');
  const error = writable<FfmpegError | null>(null);

  function recordProgress(event: FfmpegInstallProgress) {
    progress.set(event);
    const next = event.phase as FfmpegPhase;
    // The Rust side may emit phase strings we don't know about yet (forward
    // compatibility). Map unknowns back to the previous known phase rather
    // than letting the UI render garbage.
    if (next === 'extracting' || next === 'probing' || next === 'complete') {
      phase.set(next);
    }
  }

  async function withProgressChannel<T>(action: () => Promise<T>): Promise<T> {
    progress.set(null);
    phase.set('idle');
    let unlisten: FfmpegProgressUnlisten | null = null;
    try {
      unlisten = await input.listenProgress(recordProgress);
      return await action();
    } finally {
      if (unlisten) {
        try {
          await unlisten();
        } catch {
          // Listener teardown is best-effort; an error here just leaves a
          // stale listener until the tab closes — not worth surfacing.
        }
      }
    }
  }

  async function runDetect(gamePath: string) {
    if (!gamePath || get(busy) !== 'idle') return;
    busy.set('detecting');
    error.set(null);
    try {
      const result = await input.detectApi(gamePath);
      detect.set(result);
    } catch (err) {
      console.error('[ffmpeg-controller] detect failed', err);
      error.set(parseFfmpegError(err));
    } finally {
      busy.set('idle');
    }
  }

  async function runInstall(gamePath: string) {
    if (!gamePath || get(busy) !== 'idle') return;
    busy.set('installing');
    error.set(null);
    try {
      await withProgressChannel(() => input.installApi(gamePath));
      const result = await input.detectApi(gamePath);
      detect.set(result);
      phase.set('complete');
    } catch (err) {
      console.error('[ffmpeg-controller] install failed', err);
      error.set(parseFfmpegError(err));
    } finally {
      busy.set('idle');
    }
  }

  async function runUninstall(gamePath: string) {
    if (!gamePath || get(busy) !== 'idle') return;
    busy.set('uninstalling');
    error.set(null);
    try {
      await input.uninstallApi(gamePath);
      const result = await input.detectApi(gamePath);
      detect.set(result);
      progress.set(null);
      phase.set('idle');
    } catch (err) {
      console.error('[ffmpeg-controller] uninstall failed', err);
      error.set(parseFfmpegError(err));
    } finally {
      busy.set('idle');
    }
  }

  async function runRepair(gamePath: string) {
    if (!gamePath || get(busy) !== 'idle') return;
    busy.set('repairing');
    error.set(null);
    try {
      await withProgressChannel(() => input.repairApi(gamePath));
      const result = await input.detectApi(gamePath);
      detect.set(result);
      phase.set('complete');
    } catch (err) {
      console.error('[ffmpeg-controller] repair failed', err);
      error.set(parseFfmpegError(err));
    } finally {
      busy.set('idle');
    }
  }

  function clearError() {
    error.set(null);
  }

  function reset() {
    detect.set(null);
    progress.set(null);
    phase.set('idle');
    error.set(null);
  }

  return {
    detect,
    busy,
    progress,
    phase,
    error,
    runDetect,
    runInstall,
    runUninstall,
    runRepair,
    clearError,
    reset
  };
}

export const FFMPEG_INSTALL_PROGRESS_EVENT = 'ffmpeg:install:progress';
