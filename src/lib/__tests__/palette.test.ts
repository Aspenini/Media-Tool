import { describe, expect, test } from 'bun:test';
import { getPalette, PALETTES } from '../palette';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('palettes', () => {
  test('every color is a valid hex triplet', () => {
    for (const p of PALETTES) for (const c of p.colors) expect(c).toMatch(HEX);
  });

  test('palettes are deterministic (no random fill)', async () => {
    const again = await import(`../palette?fresh=${Date.now()}`);
    for (const p of PALETTES) expect(again.getPalette(p.id).colors).toEqual(p.colors);
  });

  test('3-3-2 RGB has 256 distinct colors from black to white', () => {
    const c = getPalette('8bit').colors;
    expect(c).toHaveLength(256);
    expect(new Set(c).size).toBe(256);
    expect(c[0]).toBe('#000000');
    expect(c[255]).toBe('#FFFFFF');
  });

  test('VGA default palette matches the BIOS layout', () => {
    const c = getPalette('vga').colors;
    expect(c).toHaveLength(256);
    expect(c.slice(0, 16)).toEqual(getPalette('ega').colors);
    expect(c[16]).toBe('#000000');
    expect(c[31]).toBe('#FFFFFF');
    expect(c[32]).toBe('#0000FF');
    expect(c[40]).toBe('#FF0000');
    expect(c[48]).toBe('#00FF00');
    expect(c.slice(248)).toEqual(Array(8).fill('#000000'));
  });

  test('NES has no duplicate entries and its label matches its size', () => {
    const nes = getPalette('nes');
    expect(new Set(nes.colors).size).toBe(nes.colors.length);
    expect(nes.label).toContain(`${nes.colors.length} colors`);
  });
});
