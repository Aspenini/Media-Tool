export interface FontOption {
  id: string;
  label: string;
  family: string;
  weight: number;
}

export const FONTS: FontOption[] = [
  { id: "impact", label: "Impact", family: "Impact, Anton, 'Arial Narrow Bold', sans-serif", weight: 400 },
  { id: "luckiest", label: "Luckiest Guy", family: "'Luckiest Guy', 'Comic Sans MS', sans-serif", weight: 400 },
  { id: "bangers", label: "Bangers", family: "Bangers, Impact, sans-serif", weight: 400 },
  { id: "anton", label: "Anton", family: "Anton, Impact, sans-serif", weight: 400 },
  { id: "archivo", label: "Archivo Black", family: "'Archivo Black', 'Arial Black', sans-serif", weight: 400 },
  { id: "manrope", label: "Manrope", family: "Manrope, 'Segoe UI', sans-serif", weight: 800 },
  { id: "comic", label: "Comic Sans", family: "'Comic Sans MS', 'Comic Neue', cursive", weight: 700 },
  { id: "georgia", label: "Georgia", family: "Georgia, 'Times New Roman', serif", weight: 700 },
];

export const DEFAULT_FONT = FONTS[0]!;

export function fontById(id: string): FontOption {
  return FONTS.find((font) => font.id === id) ?? DEFAULT_FONT;
}

export function fontSpec(font: FontOption, size: number): string {
  return `${font.weight} ${size}px ${font.family}`;
}

/**
 * Canvas text never triggers web-font downloads, so request every face up front.
 * `onLoaded` fires as each one lands so the preview can repaint with the real glyphs.
 */
export function preloadFonts(onLoaded: () => void): void {
  if (!("fonts" in document)) return;
  for (const font of FONTS) {
    document.fonts
      .load(fontSpec(font, 48), "AZaz09")
      .then((faces) => {
        if (faces.length) onLoaded();
      })
      .catch(() => undefined);
  }
}
