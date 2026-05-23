import { test, expect } from 'vitest';

import { describeFfmpegError, parseFfmpegError } from './ffmpeg-errors.ts';

const localized = (zh: string, en: string) => en || zh;

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

test('describeFfmpegError refers to the bundled archive for extract failures', () => {
  const copy = describeFfmpegError({ kind: 'extract' }, localized);
  expect(copy.body).toMatch(/bundled archive/i);
});

test('describeFfmpegError points at manual fallback for unsupported platforms', () => {
  const copy = describeFfmpegError({ kind: 'platform_unsupported' }, localized);
  expect(copy.body).toMatch(/manually/i);
});
