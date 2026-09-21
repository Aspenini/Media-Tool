import { describe, expect, test } from 'bun:test';
import { toolByHash } from '../../toolRegistry';

describe('toolByHash', () => {
  test('resolves the new resize hash and the old resize-convert alias', () => {
    expect(toolByHash('resize')?.id).toBe('imageResize');
    expect(toolByHash('resize-convert')?.id).toBe('imageResize');
    expect(toolByHash('resize')?.name).toBe('Resize');
  });

  test('resolves convert and video trimmer', () => {
    expect(toolByHash('convert')?.id).toBe('imageConvert');
    expect(toolByHash('video-trim')?.id).toBe('videoTrim');
  });
});
