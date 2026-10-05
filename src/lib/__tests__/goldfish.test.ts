import { describe, expect, test } from 'bun:test';
import { GOLDFISH_BLEND, GOLDFISH_GRADE, shouldBlendFrames } from '../meme/goldfish';

describe('goldfish grade', () => {
  test('pushes saturation and contrast', () => {
    expect(GOLDFISH_GRADE).toContain('saturate(');
    expect(GOLDFISH_GRADE).toContain('contrast(');
  });

  test('keeps the motion blend in a visible but not doubled range', () => {
    expect(GOLDFISH_BLEND).toBeGreaterThan(0.2);
    expect(GOLDFISH_BLEND).toBeLessThan(0.5);
  });
});

describe('shouldBlendFrames', () => {
  test('blends the next frame of a shot', () => {
    expect(shouldBlendFrames(1, 1.04)).toBe(true);
    expect(shouldBlendFrames(1, 1.249)).toBe(true);
  });

  test('does not blend a repeated frame, a seek, or a loop', () => {
    expect(shouldBlendFrames(1, 1)).toBe(false);
    expect(shouldBlendFrames(1, 1.0004)).toBe(false);
    expect(shouldBlendFrames(1, 1.5)).toBe(false);
    expect(shouldBlendFrames(2, 0.1)).toBe(false);
    expect(shouldBlendFrames(Number.NaN, 1)).toBe(false);
  });
});
