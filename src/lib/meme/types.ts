import type { FramePlayer } from "./framePlayer.ts";

export type MediaKind = "image" | "video";

/** Anything that plays on a clock: a real video, or a decoded animated image. */
export type PlayableSource = HTMLVideoElement | FramePlayer;

/** `overlay` stamps captions on the media; `bar` puts one caption in a white bar above it. */
export type Placement = "overlay" | "bar";

export type TextAlign = "left" | "center" | "right";

export type CaptionSlot = "top" | "bottom";

export interface MediaAsset {
  /** Animated images are `video`: they trim, speed up and export like a muted clip. */
  kind: MediaKind;
  source: HTMLImageElement | PlayableSource;
  /** Decoded from an animated GIF, WebP, PNG or AVIF rather than a video file. */
  animated?: boolean;
  name: string;
  width: number;
  height: number;
  /** Seconds; 0 for stills. Can be Infinity for a stream whose length never resolved. */
  duration: number;
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

/** In/out points on a video, in seconds. */
export interface Trim {
  start: number;
  end: number;
}
