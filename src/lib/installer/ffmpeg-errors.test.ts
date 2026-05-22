import { test, expect } from 'vitest';

import { describeFfmpegError, parseFfmpegError } from './ffmpeg-errors.ts';

const localized = (zh: string, en: string) => en || zh;

test('parseFfmpegError maps the bare network prefix', () => {
  expect(parseFfmpegError('bpp_ffmpeg_network_failure')).toEqual({
    kind: 'network',
    detail: undefined
  });
});

test('parseFfmpegError captures network detail after the colon', () => {
  expect(
    parseFfmpegError('bpp_ffmpeg_network_failure:manifest fetch failed: 500')
  ).toEqual({
    kind: 'network',
    detail: 'manifest fetch failed: 500'
  });
});

test('parseFfmpegError detects checksum mismatch regardless of detail', () => {
  expect(parseFfmpegError('bpp_ffmpeg_invalid_checksum')).toEqual({
    kind: 'checksum'
  });
  expect(
    parseFfmpegError('bpp_ffmpeg_invalid_checksum:expected abc got def')
  ).toEqual({ kind: 'checksum' });
});

test('parseFfmpegError detects probe and extract failures', () => {
  expect(parseFfmpegError('bpp_ffmpeg_extract_failed:bad zip')).toEqual({
    kind: 'extract',
    detail: 'bad zip'
  });
  expect(parseFfmpegError('bpp_ffmpeg_probe_failed:timeout')).toEqual({
    kind: 'probe',
    detail: 'timeout'
  });
});

test('parseFfmpegError reports the unsupported platform code', () => {
  expect(parseFfmpegError('bpp_ffmpeg_platform_unsupported')).toEqual({
    kind: 'platform_unsupported'
  });
});

test('parseFfmpegError preserves unknown plain-text errors', () => {
  expect(parseFfmpegError(new Error('something weird'))).toEqual({
    kind: 'unknown',
    message: 'something weird'
  });
});

test('describeFfmpegError returns retry copy for network failures', () => {
  const copy = describeFfmpegError({ kind: 'network' }, localized);
  expect(copy.title).toMatch(/Download failed/);
  expect(copy.retryLabel.toLowerCase()).toMatch(/retry/);
});

test('describeFfmpegError points at manual fallback for unsupported platforms', () => {
  const copy = describeFfmpegError(
    { kind: 'platform_unsupported' },
    localized
  );
  expect(copy.body).toMatch(/manually/i);
});
