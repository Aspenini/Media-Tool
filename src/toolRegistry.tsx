import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import AspectRatioRoundedIcon from '@mui/icons-material/AspectRatioRounded';
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded';
import ContentCutRoundedIcon from '@mui/icons-material/ContentCutRounded';
import RadioRoundedIcon from '@mui/icons-material/RadioRounded';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import ThreeSixtyRoundedIcon from '@mui/icons-material/ThreeSixtyRounded';
import SurroundSoundRoundedIcon from '@mui/icons-material/SurroundSoundRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import PanoramaPhotosphereRoundedIcon from '@mui/icons-material/PanoramaPhotosphereRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import PhotoSizeSelectLargeRoundedIcon from '@mui/icons-material/PhotoSizeSelectLargeRounded';
import type { ThemeMode } from './theme';

export type CategoryId = 'image' | 'audio' | 'make' | 'inspect';

export const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'image', label: 'Image', blurb: 'Scale, convert, recolor and recut pictures.' },
  { id: 'audio', label: 'Audio', blurb: 'Synthesize, degrade and move sound through space.' },
  { id: 'make', label: 'Make', blurb: 'Turn text and data into codes, tables and videos.' },
  { id: 'inspect', label: 'Inspect', blurb: 'Look inside panoramas, vectors and esoteric code.' },
];

export interface ToolDef {
  id: string;
  /** Deep-link hash — kept identical to the original app so old links still work. */
  hash: string;
  name: string;
  /** A few words, shown as the tab tooltip. */
  tagline: string;
  description: string;
  category: CategoryId;
  icon: SvgIconComponent;
  accent: string;
  /** Pin this tool to one color mode regardless of the user's preference. */
  forceMode?: ThemeMode;
  /** Swap the body font for this tool's whole workspace. */
  bodyFont?: string;
  Component: LazyExoticComponent<ComponentType>;
}

/** Tools are code-split: each one's UI and libraries load only when opened. */
function load<K extends string>(importer: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => importer().then((module) => ({ default: module[name] })));
}

export const TOOLS: ToolDef[] = [
  {
    id: 'scaler',
    hash: 'scaler',
    name: 'Scaler',
    tagline: 'Crisp nearest-neighbor upscaling',
    description: 'Scale images by any factor without blurring — every source pixel becomes a clean block. Made for pixel art and sprites.',
    category: 'image',
    icon: AspectRatioRoundedIcon,
    accent: '#f5a524',
    Component: load(() => import('./tools/Scaler'), 'Scaler'),
  },
  {
    id: 'imageResize',
    hash: 'resize-convert',
    name: 'Resize & Convert',
    tagline: 'Any size, any format',
    description: 'Resize to exact dimensions and convert between PNG, JPEG, WebP, AVIF, TIFF, BMP and GIF. Exotic formats load ImageMagick on demand.',
    category: 'image',
    icon: PhotoSizeSelectLargeRoundedIcon,
    accent: '#16b8a6',
    Component: load(() => import('./tools/ImageResize'), 'ImageResize'),
  },
  {
    id: 'pixelSnap',
    hash: 'pixel-snap',
    name: 'PixelSnap POT',
    tagline: 'Snap messy pixels to a grid',
    description: 'Snap pixel-style images onto a consistent grid, reduce the palette, and export a sharp power-of-two texture.',
    category: 'image',
    icon: GridOnRoundedIcon,
    accent: '#8bd346',
    Component: load(() => import('./tools/PixelSnap'), 'PixelSnap'),
  },
  {
    id: 'slicer',
    hash: 'slicer-tool',
    name: 'Diagonal Slicer',
    tagline: 'Split two images corner to corner',
    description: 'Cut two images along a diagonal and stitch the halves together — one variant, or all four at once.',
    category: 'image',
    icon: ContentCutRoundedIcon,
    accent: '#f43f6b',
    Component: load(() => import('./tools/Slicer'), 'Slicer'),
  },
  {
    id: 'palette',
    hash: 'color-palette',
    name: 'Palette Converter',
    tagline: 'Retro palettes & dithering',
    description: 'Remap an image onto classic palettes — Game Boy, PICO-8, EGA and more — with optional dithering.',
    category: 'image',
    icon: PaletteRoundedIcon,
    accent: '#b06cff',
    Component: load(() => import('./tools/Palette'), 'Palette'),
  },
  {
    id: 'audio',
    hash: 'audio-effects',
    name: 'Audio Effects',
    tagline: 'Vintage radio & bitcrush, in batch',
    description: 'Run a stack of audio files through a 1940s radio or a bitcrusher and get them back as a TAR of WAVs.',
    category: 'audio',
    icon: RadioRoundedIcon,
    accent: '#ff7a1a',
    Component: load(() => import('./tools/AudioEffects'), 'AudioEffects'),
  },
  {
    id: 'pagnai',
    hash: 'pagnai',
    name: 'PAGNAI',
    tagline: 'Procedural audio, not AI',
    description: 'Procedural Audio Generation, Not Artificial Intelligence. Build tones from raw waveforms and frequency modulation.',
    category: 'audio',
    icon: GraphicEqRoundedIcon,
    accent: '#ff4fa3',
    forceMode: 'dark',
    Component: load(() => import('./tools/Pagnai'), 'Pagnai'),
  },
  {
    id: 'audioSpinning',
    hash: 'audio-spinning',
    name: 'Audio Spinning',
    tagline: 'Orbit a sound around your head',
    description: 'A sound source circles your head in real time with HRTF panning, doppler and echo. Wear headphones.',
    category: 'audio',
    icon: ThreeSixtyRoundedIcon,
    accent: '#4cb8ff',
    Component: load(() => import('./tools/AudioSpinning'), 'AudioSpinning'),
  },
  {
    id: 'audioHamburger',
    hash: 'audio-hamburger',
    name: 'Audio Hamburger',
    tagline: 'Layer tracks in 3D space',
    description: 'Stack several tracks and place each one around your head. Drag for direction and distance, scroll for height.',
    category: 'audio',
    icon: SurroundSoundRoundedIcon,
    accent: '#f2c230',
    Component: load(() => import('./tools/AudioHamburger'), 'AudioHamburger'),
  },
  {
    id: 'qrcode',
    hash: 'qr-code',
    name: 'QR Code',
    tagline: 'Live QR codes, PNG or SVG',
    description: 'Type anything and watch the QR code build itself. Tune error correction, margin and colors, then export.',
    category: 'make',
    icon: QrCode2RoundedIcon,
    accent: '#3d7bff',
    Component: load(() => import('./tools/QrCode'), 'QrCodeTool'),
  },
  {
    id: 'csv',
    hash: 'csv-to-image',
    name: 'CSV to Image',
    tagline: 'Spreadsheets into table images',
    description: 'Render CSV files as clean table images. Drop several to batch-export them as one archive.',
    category: 'make',
    icon: TableChartRoundedIcon,
    accent: '#22b35e',
    Component: load(() => import('./tools/Csv'), 'Csv'),
  },
  {
    id: 'creditsCrawl',
    hash: 'credits-crawl',
    name: 'Credits Crawl',
    tagline: 'Roll the end credits',
    description: 'Write your credits, pick a typeface, and export a 1080p WebM of them rolling up the screen.',
    category: 'make',
    icon: MovieRoundedIcon,
    accent: '#e0b35a',
    forceMode: 'dark',
    Component: load(() => import('./tools/CreditsCrawl'), 'CreditsCrawl'),
  },
  {
    id: 'viewer360',
    hash: '360-viewer',
    name: '360° Viewer',
    tagline: 'Step inside a panorama',
    description: 'Open an equirectangular, cylindrical or cube-map panorama and look around by dragging.',
    category: 'inspect',
    icon: PanoramaPhotosphereRoundedIcon,
    accent: '#19c3d6',
    forceMode: 'dark',
    Component: load(() => import('./tools/Viewer360'), 'Viewer360'),
  },
  {
    id: 'svgDissect',
    hash: 'svg-dissect',
    name: 'SVG Dissect',
    tagline: 'Pull vector art apart',
    description: "Browse an SVG's layer tree, identify every shape, and drag elements apart to see how it was built.",
    category: 'inspect',
    icon: AccountTreeRoundedIcon,
    accent: '#7c6cff',
    Component: load(() => import('./tools/SvgDissect'), 'SvgDissect'),
  },
  {
    id: 'brainfuck',
    hash: 'brainfuck-encoder',
    name: 'Brainfuck',
    tagline: 'Encode text, run programs',
    description: 'Turn text into a Brainfuck program that prints it, or run Brainfuck code and read its output.',
    category: 'inspect',
    icon: CodeRoundedIcon,
    accent: '#3ee07a',
    forceMode: 'dark',
    bodyFont: "'Geist Mono', ui-monospace, monospace",
    Component: load(() => import('./tools/Brainfuck'), 'Brainfuck'),
  },
];

export function toolByHash(hash: string): ToolDef | null {
  return TOOLS.find((t) => t.hash === hash) ?? null;
}
