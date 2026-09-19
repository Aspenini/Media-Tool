import { fontSpec, type FontOption } from "./fonts.ts";
import type { IconAtlas, TextAlign } from "./types.ts";

/** `:star:`-style inline icon tokens. Unknown ids are left alone as plain text. */
const ICON_TOKEN = /:([a-z0-9_-]+):/gi;

type Atom = { kind: "word"; text: string } | { kind: "icon"; id: string };

/** A run of atoms with no whitespace between them. Wrapping only happens between units. */
type Unit = Atom[];

/** One hard line (between newlines) as whitespace-separated units. */
type Paragraph = Unit[];

export interface PlacedToken {
  kind: "text" | "icon";
  value: string;
  x: number;
  width: number;
}

export interface TextLine {
  tokens: PlacedToken[];
  x: number;
  width: number;
}

export interface TextBlock {
  lines: TextLine[];
  empty: boolean;
  /** Wrap width; token x positions are relative to its left edge. */
  width: number;
  height: number;
  lineHeight: number;
  fontSize: number;
  iconSize: number;
  iconPad: number;
  capHeight: number;
  /** Horizontal extent actually covered by glyphs, relative to the block. */
  inkLeft: number;
  inkRight: number;
}

export interface LayoutOptions {
  ctx: CanvasRenderingContext2D;
  text: string;
  maxWidth: number;
  font: FontOption;
  fontSize: number;
  align: TextAlign;
  allCaps: boolean;
  icons: IconAtlas;
}

export const LINE_HEIGHT = 1.14;
export const ICON_SCALE = 1.1;

export function parseCaption(text: string, allCaps: boolean, icons: IconAtlas): Paragraph[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const units: Paragraph = [];
      let unit: Unit = [];
      const flush = () => {
        if (unit.length) units.push(unit);
        unit = [];
      };
      const pushText = (raw: string) => {
        const value = allCaps ? raw.toUpperCase() : raw;
        for (const chunk of value.split(/(\s+)/)) {
          if (!chunk) continue;
          if (/^\s+$/.test(chunk)) flush();
          else unit.push({ kind: "word", text: chunk });
        }
      };

      let last = 0;
      for (const match of line.matchAll(ICON_TOKEN)) {
        const id = (match[1] ?? "").toLowerCase();
        if (!icons.has(id)) continue;
        pushText(line.slice(last, match.index));
        unit.push({ kind: "icon", id });
        last = match.index + match[0].length;
      }
      pushText(line.slice(last));
      flush();
      return units;
    });
}

export function layoutText(options: LayoutOptions): TextBlock {
  const { ctx, maxWidth, font, fontSize, align, allCaps, icons } = options;
  ctx.font = fontSpec(font, fontSize);

  const lineHeight = fontSize * LINE_HEIGHT;
  const iconSize = fontSize * ICON_SCALE;
  const iconPad = fontSize * 0.05;
  const spaceWidth = ctx.measureText(" ").width;
  const capHeight = ctx.measureText("H").actualBoundingBoxAscent || fontSize * 0.72;

  const widthCache = new Map<string, number>();
  const measure = (atom: Atom): number => {
    if (atom.kind === "icon") return iconSize + iconPad * 2;
    let width = widthCache.get(atom.text);
    if (width === undefined) {
      width = ctx.measureText(atom.text).width;
      widthCache.set(atom.text, width);
    }
    return width;
  };
  const unitWidth = (unit: Unit) => unit.reduce((sum, atom) => sum + measure(atom), 0);

  const rows: Atom[][] = [];
  let row: Atom[] = [];
  let rowWidth = 0;
  const newRow = () => {
    rows.push(row);
    row = [];
    rowWidth = 0;
  };

  /** A single unit wider than the line: split it glyph by glyph instead of overflowing. */
  const hardWrap = (unit: Unit) => {
    for (const atom of unit) {
      const pieces = atom.kind === "icon" ? [atom] : Array.from(atom.text, (ch): Atom => ({ kind: "word", text: ch }));
      for (const piece of pieces) {
        const width = measure(piece);
        if (row.length && rowWidth + width > maxWidth) newRow();
        const tail = row[row.length - 1];
        if (piece.kind === "word" && tail?.kind === "word") tail.text += piece.text;
        else row.push({ ...piece });
        rowWidth += width;
      }
    }
  };

  for (const paragraph of parseCaption(options.text, allCaps, icons)) {
    for (const unit of paragraph) {
      const width = unitWidth(unit);
      const gap = row.length ? spaceWidth : 0;
      if (row.length && rowWidth + gap + width > maxWidth) newRow();
      if (!row.length && width > maxWidth) {
        hardWrap(unit);
        continue;
      }
      if (row.length) {
        row.push({ kind: "word", text: " " });
        rowWidth += spaceWidth;
      }
      row.push(...unit);
      rowWidth += width;
    }
    newRow();
  }

  let inkLeft = maxWidth;
  let inkRight = 0;
  let empty = true;

  const lines = rows.map((atoms): TextLine => {
    const tokens: PlacedToken[] = [];
    let x = 0;
    for (const atom of atoms) {
      const width = measure(atom);
      const previous = tokens[tokens.length - 1];
      if (atom.kind === "word" && previous?.kind === "text") {
        previous.value += atom.text;
        previous.width += width;
      } else {
        tokens.push({ kind: atom.kind === "icon" ? "icon" : "text", value: atom.kind === "icon" ? atom.id : atom.text, x, width });
      }
      x += width;
    }
    const offset = align === "center" ? (maxWidth - x) / 2 : align === "right" ? maxWidth - x : 0;
    for (const token of tokens) token.x += offset;
    if (tokens.length) {
      empty = false;
      inkLeft = Math.min(inkLeft, offset);
      inkRight = Math.max(inkRight, offset + x);
    }
    return { tokens, x: offset, width: x };
  });

  return {
    lines,
    empty,
    width: maxWidth,
    height: Math.max(1, lines.length) * lineHeight,
    lineHeight,
    fontSize,
    iconSize,
    iconPad,
    capHeight,
    inkLeft: empty ? 0 : inkLeft,
    inkRight: empty ? maxWidth : inkRight,
  };
}
