// Derives UI-facing display state from the raw `FfmpegDetectResult` so the
// Svelte component stays declarative — `tag` + `primaryAction` map 1:1 to
// what gets rendered.
import type { FfmpegDetectResult, FfmpegStatus } from '$lib/generated/commands';

export type FfmpegTagKind = 'ok' | 'warn' | 'danger' | 'idle';
export type FfmpegPrimaryAction =
  | 'install'
  | 'reinstall'
  | 'override_install'
  | 'repair'
  | 'platform_unsupported';

export interface FfmpegDisplay {
  status: FfmpegStatus | null;
  tag: FfmpegTagKind;
  primaryAction: FfmpegPrimaryAction;
  bundledPath: string;
}

export function selectFfmpegDisplay(input: {
  detect: FfmpegDetectResult | null;
  platformSupported: boolean;
}): FfmpegDisplay {
  if (!input.platformSupported) {
    return {
      status: input.detect?.status ?? null,
      tag: 'idle',
      primaryAction: 'platform_unsupported',
      bundledPath: input.detect?.bundled_path ?? ''
    };
  }

  const status = input.detect?.status ?? null;
  const bundledPath = input.detect?.bundled_path ?? '';

  if (!status) {
    return { status, tag: 'idle', primaryAction: 'install', bundledPath };
  }

  switch (status.kind) {
    case 'bundled':
      return { status, tag: 'ok', primaryAction: 'reinstall', bundledPath };
    case 'bundled_corrupted':
      return { status, tag: 'danger', primaryAction: 'repair', bundledPath };
    case 'system_available':
      return { status, tag: 'warn', primaryAction: 'override_install', bundledPath };
    case 'not_installed':
      return { status, tag: 'warn', primaryAction: 'install', bundledPath };
  }
}
