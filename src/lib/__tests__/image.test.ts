import { describe, expect, test } from 'bun:test';
import { canvasSizeProblem, MAX_CANVAS_SIDE } from '../image';

describe('canvasSizeProblem', () => {
  test('allows ordinary sizes', () => {
    expect(canvasSizeProblem(4096, 4096)).toBeNull();
  });
  test('rejects sides past the browser limit', () => {
    expect(canvasSizeProblem(MAX_CANVAS_SIDE + 1, 10)).toContain('per side');
  });
  test('rejects huge areas even when each side fits', () => {
    expect(canvasSizeProblem(10000, 10000)).toContain('megapixels');
  });
});
