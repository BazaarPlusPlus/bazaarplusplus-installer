import { test, expect } from 'vitest';

import {
  buildCropStyle,
  clampCrop,
  computeCropFrameAspectRatio,
  deriveSeedRows
} from './temp-render-debug-server.mjs';

test('clampCrop keeps crop values inside normalized bounds', () => {
  const crop = clampCrop({
    left: -0.1,
    top: 0.9,
    width: 1.4,
    height: 0.5
  });

  expect(crop).toEqual({
    left: 0,
    top: 0.5,
    width: 1,
    height: 0.5
  });
});

test('buildCropStyle returns uniform scale and image-relative translation for CSS previews', () => {
  const style = buildCropStyle({
    left: 0.356,
    top: 0.308,
    width: 0.58,
    height: 0.27
  });

  expect(style.widthPercent).toBe('172.4138%');
  expect(style.translateXPercent).toBe('-35.6000%');
  expect(style.translateYPercent).toBe('-30.8000%');
});

test('computeCropFrameAspectRatio preserves the source crop proportions', () => {
  const ratio = computeCropFrameAspectRatio(
    { width: 1920, height: 1080 },
    { left: 0.356, top: 0.308, width: 0.58, height: 0.27 }
  );

  expect(ratio).toBe('3.8189');
});

test('deriveSeedRows maps source images into ordered debug records', () => {
  const rows = deriveSeedRows([
    '/Users/demo/Desktop/temp_render/b.png',
    '/Users/demo/Desktop/temp_render/a.png'
  ]);

  expect(rows.length).toBe(2);
  expect(rows[0].title).toBe('Debug Record 1');
  expect(rows[0].image_path).toBe('/Users/demo/Desktop/temp_render/a.png');
  expect(rows[1].title).toBe('Debug Record 2');
});
