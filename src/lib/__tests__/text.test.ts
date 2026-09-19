import { describe, expect, test } from 'bun:test';
import { runBrainfuck, stripBrainfuck, textToBrainfuck } from '../brainfuck';
import { parseCSVLine } from '../csv';
import { formatBytes } from '../format';
import { sanitizeFileName, worldFromPan } from '../spatial';
import { parseCaption } from '../meme/layout';

describe('brainfuck', () => {
  test('encoded text runs back to the same text', () => {
    for (const text of ['Hello, world!', '', 'symbols ~!@#$%^&*()', 'line\nbreak']) {
      expect(runBrainfuck(textToBrainfuck(text)).output).toBe(text);
    }
  });

  test('ignores non-command characters', () => {
    expect(stripBrainfuck('a+b-c<d>e.f,g[h]i')).toBe('+-<>.,[]');
  });

  test('reports unbalanced brackets', () => {
    expect(runBrainfuck(']').error).toBeTruthy();
    expect(runBrainfuck('[').error).toBeTruthy();
  });

  test('stops runaway loops', () => {
    expect(runBrainfuck('+[]', { maxSteps: 1000 }).error).toBeTruthy();
  });
});

describe('parseCSVLine', () => {
  test('splits and trims cells', () => {
    expect(parseCSVLine('a, b ,c')).toEqual(['a', 'b', 'c']);
  });
  test('keeps commas inside quotes', () => {
    expect(parseCSVLine('"x, y",z')).toEqual(['x, y', 'z']);
  });
  test('unescapes doubled quotes', () => {
    expect(parseCSVLine('"say ""hi""",2')).toEqual(['say "hi"', '2']);
  });
  test('keeps empty cells', () => {
    expect(parseCSVLine('a,,c,')).toEqual(['a', '', 'c', '']);
  });
});

describe('formatBytes', () => {
  test('picks a sensible unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('spatial helpers', () => {
  test('azimuth 0 is straight ahead (negative z)', () => {
    const p = worldFromPan(0, 2, 0.5);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-2);
    expect(p.y).toBe(0.5);
  });
  test('sanitizes file names', () => {
    expect(sanitizeFileName('a:b/c?.wav', 'x')).toBe('a-b-c-');
    expect(sanitizeFileName('.wav', 'fallback')).toBe('fallback');
  });
});

describe('meme captions', () => {
  const atlas = { has: (id: string) => id === 'star', get: () => undefined };
  test('turns known :tokens: into icons and keeps unknown ones as text', () => {
    const [line] = parseCaption('a :star: b :nope:', false, atlas);
    expect(line).toEqual([
      [{ kind: 'word', text: 'a' }],
      [{ kind: 'icon', id: 'star' }],
      [{ kind: 'word', text: 'b' }],
      [{ kind: 'word', text: ':nope:' }],
    ]);
  });
  test('all caps leaves icon ids alone', () => {
    const [line] = parseCaption('hi:star:', true, atlas);
    expect(line).toEqual([[{ kind: 'word', text: 'HI' }, { kind: 'icon', id: 'star' }]]);
  });
  test('splits lines on any newline style', () => {
    expect(parseCaption('a\r\nb\rc', false, atlas)).toHaveLength(3);
  });
});
