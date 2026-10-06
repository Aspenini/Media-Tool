import { describe, expect, test } from 'bun:test';
import { animatedTypeFor, frameDelaySeconds, frameIndexAt } from '../meme/framePlayer';

describe('frameDelaySeconds', () => {
  test('converts microseconds to seconds', () => {
    expect(frameDelaySeconds(40_000)).toBeCloseTo(0.04);
    expect(frameDelaySeconds(250_000)).toBeCloseTo(0.25);
  });

  test('plays zero and near-zero GIF delays at 100 ms, like browsers do', () => {
    expect(frameDelaySeconds(0)).toBeCloseTo(0.1);
    expect(frameDelaySeconds(10_000)).toBeCloseTo(0.1);
    expect(frameDelaySeconds(null)).toBeCloseTo(0.1);
    expect(frameDelaySeconds(Number.NaN)).toBeCloseTo(0.1);
  });
});

describe('frameIndexAt', () => {
  const starts = [0, 0.1, 0.3, 0.35];

  test('finds the frame showing at a time', () => {
    expect(frameIndexAt(starts, 0)).toBe(0);
    expect(frameIndexAt(starts, 0.099)).toBe(0);
    expect(frameIndexAt(starts, 0.1)).toBe(1);
    expect(frameIndexAt(starts, 0.32)).toBe(2);
    expect(frameIndexAt(starts, 0.35)).toBe(3);
  });

  test('holds the last frame past the end and the first before the start', () => {
    expect(frameIndexAt(starts, 9)).toBe(3);
    expect(frameIndexAt(starts, -1)).toBe(0);
  });

  test('copes with no frames', () => {
    expect(frameIndexAt([], 1)).toBe(0);
  });
});

describe('animatedTypeFor', () => {
  test('uses the MIME type when present', () => {
    expect(animatedTypeFor({ type: 'image/gif', name: 'x' })).toBe('image/gif');
    expect(animatedTypeFor({ type: 'image/webp', name: 'x' })).toBe('image/webp');
    expect(animatedTypeFor({ type: 'image/apng', name: 'x' })).toBe('image/png');
  });

  test('falls back to the extension for untyped files', () => {
    expect(animatedTypeFor({ type: '', name: 'party.GIF' })).toBe('image/gif');
    expect(animatedTypeFor({ type: '', name: 'loop.apng' })).toBe('image/png');
  });

  test('skips formats that never animate', () => {
    expect(animatedTypeFor({ type: 'image/jpeg', name: 'cat.jpg' })).toBeNull();
    expect(animatedTypeFor({ type: '', name: 'cat.bmp' })).toBeNull();
  });
});
