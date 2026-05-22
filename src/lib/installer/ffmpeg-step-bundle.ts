// Single-prop bundle passed from the install page down through
// `InstallerPageContent` → `InstallerStatusSteps` → `InstallerFfmpegStep`.
// Defined as its own type so the prop-drilling layers don't each need to
// import (and stay in sync with) every controller store individually.
import type { Readable } from 'svelte/store';
import type {
  FfmpegDetectResult,
  FfmpegInstallProgress
} from '$lib/generated/commands';
import type {
  FfmpegBusy,
  FfmpegPhase
} from './controllers/ffmpeg-controller.ts';
import type { FfmpegError } from './ffmpeg-errors.ts';

export interface FfmpegStepBundle {
  show: boolean;
  platformSupported: boolean;
  skipped: boolean;
  detect: Readable<FfmpegDetectResult | null>;
  busy: Readable<FfmpegBusy>;
  progress: Readable<FfmpegInstallProgress | null>;
  phase: Readable<FfmpegPhase>;
  error: Readable<FfmpegError | null>;
  localized: (zh: string, en: string) => string;
  onInstall: () => void | Promise<void>;
  onRepair: () => void | Promise<void>;
  onUninstall: () => void | Promise<void>;
  onSkip: () => void;
  onUnskip: () => void;
  onDismissError: () => void;
}
