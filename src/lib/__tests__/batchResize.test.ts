import { describe, expect, test } from 'bun:test';
import { originalFormat, planOutput, rotatedSize, type ResizeSettings } from '../batchResize';

const base: ResizeSettings = { mode: 'size', width: null, height: null, lockAspect: true, percent: 50, preset: null, fit: 'pad' };
const src = { width: 3840, height: 2160 };

describe('planOutput', () => {
  test('keeps the size when both sides are blank', () => {
    expect(planOutput(src, 0, base).canvas).toEqual(src);
  });

  test('derives the missing side from the aspect ratio', () => {
    expect(planOutput(src, 0, { ...base, width: 240 }).canvas).toEqual({ width: 240, height: 135 });
    expect(planOutput(src, 0, { ...base, height: 135 }).canvas).toEqual({ width: 240, height: 135 });
  });

  test('locked with both sides fits inside the box', () => {
    expect(planOutput(src, 0, { ...base, width: 240, height: 345 }).canvas).toEqual({ width: 240, height: 135 });
  });

  test('unlocked pad centers the image in the exact box', () => {
    const plan = planOutput(src, 0, { ...base, width: 240, height: 345, lockAspect: false });
    expect(plan.canvas).toEqual({ width: 240, height: 345 });
    expect(plan.draw).toEqual({ x: 0, y: 105, width: 240, height: 135 });
  });

  test('unlocked crop covers the box', () => {
    const { draw } = planOutput(src, 0, { ...base, width: 240, height: 345, lockAspect: false, fit: 'crop' });
    expect(draw.height).toBe(345);
    expect(draw.width).toBeGreaterThan(240);
    expect(draw.x).toBeLessThan(0);
  });

  test('stretch fills the box exactly', () => {
    const { draw } = planOutput(src, 0, { ...base, width: 240, height: 345, lockAspect: false, fit: 'stretch' });
    expect(draw).toEqual({ x: 0, y: 0, width: 240, height: 345 });
  });

  test('percent scales both sides', () => {
    expect(planOutput(src, 0, { ...base, mode: 'percent', percent: 25 }).canvas).toEqual({ width: 960, height: 540 });
  });

  test('quarter rotations swap the source sides first', () => {
    expect(rotatedSize(src, 90)).toEqual({ width: 2160, height: 3840 });
    expect(planOutput(src, 90, { ...base, width: 216 }).canvas).toEqual({ width: 216, height: 384 });
  });

  test('never produces a zero-sized canvas', () => {
    expect(planOutput({ width: 1000, height: 1 }, 0, { ...base, width: 10 }).canvas.height).toBe(1);
  });
});

describe('originalFormat', () => {
  const file = (name: string, type = '') => new File([], name, { type });
  test('keeps writable formats and falls back to PNG', () => {
    expect(originalFormat(file('a.jpg', 'image/jpeg'))).toBe('jpeg');
    expect(originalFormat(file('a.JPEG'))).toBe('jpeg');
    expect(originalFormat(file('a.webp'))).toBe('webp');
    expect(originalFormat(file('a.tif'))).toBe('tiff');
    expect(originalFormat(file('a.psd'))).toBe('png');
  });
});
