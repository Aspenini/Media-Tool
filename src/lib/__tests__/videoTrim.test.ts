import { describe, expect, test } from 'bun:test';
import { clampRange, formatCompactTime, formatTimecode, parseTimecode, trimmedName, MIN_TRIM_SECONDS } from '../videoTrim';

describe('formatTimecode', () => {
  test('formats minutes and tenths', () => {
    expect(formatTimecode(0)).toBe('0:00.0');
    expect(formatTimecode(5)).toBe('0:05.0');
    expect(formatTimecode(65.2)).toBe('1:05.2');
  });

  test('includes hours when needed', () => {
    expect(formatTimecode(3723.14)).toBe('1:02:03.1');
  });
});

describe('formatCompactTime', () => {
  test('uses seconds below one minute', () => {
    expect(formatCompactTime(12.5)).toBe('12.5s');
  });

  test('uses minutes after that', () => {
    expect(formatCompactTime(65)).toBe('1m05.0s');
  });
});

describe('parseTimecode', () => {
  test('reads mm:ss, h:mm:ss, and bare seconds', () => {
    expect(parseTimecode('1:23')).toBe(83);
    expect(parseTimecode('1:23.5')).toBe(83.5);
    expect(parseTimecode('1:02:03')).toBe(3723);
    expect(parseTimecode('12.5')).toBe(12.5);
  });

  test('rejects empty or broken values', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('1:')).toBeNull();
    expect(parseTimecode('-3')).toBeNull();
    expect(parseTimecode('nope')).toBeNull();
  });
});

describe('clampRange', () => {
  test('keeps a valid range', () => {
    expect(clampRange(1, 4, 10)).toEqual({ start: 1, end: 4 });
  });

  test('clamps to the duration', () => {
    expect(clampRange(-2, 99, 10)).toEqual({ start: 0, end: 10 });
  });

  test('enforces a minimum span', () => {
    const { start, end } = clampRange(5, 5, 10);
    expect(end - start).toBeCloseTo(MIN_TRIM_SECONDS);
    expect(start).toBe(5);
  });

  test('pulls the start back when the end is against the wall', () => {
    const { start, end } = clampRange(10, 10, 10);
    expect(end).toBe(10);
    expect(start).toBeCloseTo(10 - MIN_TRIM_SECONDS);
  });

  test('zero duration collapses', () => {
    expect(clampRange(1, 2, 0)).toEqual({ start: 0, end: 0 });
  });
});

describe('trimmedName', () => {
  test('keeps the base name and stamps the range', () => {
    expect(trimmedName('holiday.mp4', 0, 12.5, 'webm')).toBe('holiday_0.0s-12.5s.webm');
  });
});
