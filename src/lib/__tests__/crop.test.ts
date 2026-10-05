import { describe, expect, test } from 'bun:test';
import { cropPixels, dragCrop, fitAspect, FULL_CROP, isFullCrop, MIN_CROP } from '../meme/crop';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('cropPixels', () => {
  test('null crop covers the whole source', () => {
    expect(cropPixels(null, 640, 480)).toEqual({ x: 0, y: 0, w: 640, h: 480 });
  });

  test('rounds and stays inside the source', () => {
    expect(cropPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 101, 99)).toEqual({ x: 25, y: 50, w: 51, h: 49 });
  });
});

describe('isFullCrop', () => {
  test('recognises null and the full rect', () => {
    expect(isFullCrop(null)).toBe(true);
    expect(isFullCrop(FULL_CROP)).toBe(true);
    expect(isFullCrop({ x: 0.1, y: 0, w: 0.9, h: 1 })).toBe(false);
  });
});

describe('fitAspect', () => {
  test('square crop centred on a 16:9 frame', () => {
    const crop = fitAspect(FULL_CROP, 1, 1600, 900);
    close(crop.h, 1);
    close(crop.w * 1600, crop.h * 900);
    close(crop.x, (1 - crop.w) / 2);
  });

  test('stays centred on the current crop, clamped to the media', () => {
    const crop = fitAspect({ x: 0.8, y: 0, w: 0.2, h: 1 }, 1, 1600, 900);
    close(crop.x + crop.w, 1);
    close(crop.w * 1600, crop.h * 900);
  });

  test('matching aspect keeps the full frame', () => {
    const crop = fitAspect(FULL_CROP, 16 / 9, 1600, 900);
    close(crop.w, 1);
    close(crop.h, 1);
  });
});

describe('dragCrop', () => {
  const box = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };

  test('move is clamped to the media', () => {
    expect(dragCrop(box, 'move', 0.9, -0.9, null, 100, 100)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  test('free corner drag moves only that corner', () => {
    const next = dragCrop(box, 'se', 0.1, 0.2, null, 100, 100);
    close(next.x, 0.2);
    close(next.y, 0.2);
    close(next.w, 0.6);
    close(next.h, 0.7);
  });

  test('free edges cannot cross or shrink below the minimum', () => {
    const next = dragCrop(box, 'w', 0.9, 0, null, 100, 100);
    close(next.w, MIN_CROP);
    close(next.x + next.w, 0.7);
  });

  test('locked corner keeps the pixel aspect and the opposite corner', () => {
    const start = fitAspect(box, 1, 200, 100);
    const next = dragCrop(start, 'nw', -0.05, -0.05, 1, 200, 100);
    close((next.w * 200) / (next.h * 100), 1);
    close(next.x + next.w, start.x + start.w);
    close(next.y + next.h, start.y + start.h);
  });

  test('locked edge grows around the centre line and stays inside', () => {
    const next = dragCrop(box, 'e', 0.5, 0, 1, 100, 100);
    close(next.w, next.h);
    expect(next.y).toBeGreaterThanOrEqual(0);
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9);
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9);
    close(next.x, 0.2);
  });
});
