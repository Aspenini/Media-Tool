export type MediaKind = "image" | "video";

/** `overlay` stamps captions on the media; `bar` puts one caption in a white bar above it. */
export type Placement = "overlay" | "bar";

export type TextAlign = "left" | "center" | "right";

export type CaptionSlot = "top" | "bottom";

export interface MediaAsset {
  kind: MediaKind;
  source: HTMLImageElement | HTMLVideoElement;
  name: string;
  width: number;
  height: number;
  /** Blob URL owned by this asset (revoked on dispose), or a static URL. */
  url: string;
}

export interface InlineIcon {
  id: string;
  label: string;
  /** URL usable in an <img> tag for the tray. */
  src: string;
  image: HTMLImageElement;
  custom: boolean;
}

export interface TextStyle {
  fontId: string;
  /** Font size as a percentage of the media width. */
  sizePct: number;
  fill: string;
  stroke: string;
  /** Outline thickness as a fraction of the font size. */
  strokeWidth: number;
  align: TextAlign;
  allCaps: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IconAtlas {
  get(id: string): HTMLImageElement | undefined;
  has(id: string): boolean;
}
