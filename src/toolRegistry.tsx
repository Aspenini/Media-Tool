import type { ComponentType, ReactElement } from 'react';
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

import { Scaler } from './tools/Scaler';
import { PixelSnap } from './tools/PixelSnap';
import { Slicer } from './tools/Slicer';
import { AudioEffects } from './tools/AudioEffects';
import { Palette } from './tools/Palette';
import { Csv } from './tools/Csv';
import { QrCodeTool } from './tools/QrCode';
import { Brainfuck } from './tools/Brainfuck';
import { Pagnai } from './tools/Pagnai';
import { AudioSpinning } from './tools/AudioSpinning';
import { AudioHamburger } from './tools/AudioHamburger';
import { CreditsCrawl } from './tools/CreditsCrawl';
import { Viewer360 } from './tools/Viewer360';

export interface ToolDef {
  id: string;
  hash: string;
  label: string;
  icon: ReactElement;
  Component: ComponentType;
}

export const TOOLS: ToolDef[] = [
  { id: 'scaler', hash: 'scaler', label: 'Scaler', icon: <AspectRatioRoundedIcon />, Component: Scaler },
  { id: 'pixelSnap', hash: 'pixel-snap', label: 'PixelSnap POT', icon: <GridOnRoundedIcon />, Component: PixelSnap },
  { id: 'slicer', hash: 'slicer-tool', label: 'Slicer Tool', icon: <ContentCutRoundedIcon />, Component: Slicer },
  { id: 'audio', hash: 'audio-effects', label: 'Audio Effects', icon: <RadioRoundedIcon />, Component: AudioEffects },
  { id: 'palette', hash: 'color-palette', label: 'Color Palette', icon: <PaletteRoundedIcon />, Component: Palette },
  { id: 'csv', hash: 'csv-to-image', label: 'CSV to Image', icon: <TableChartRoundedIcon />, Component: Csv },
  { id: 'qrcode', hash: 'qr-code', label: 'QR Code', icon: <QrCode2RoundedIcon />, Component: QrCodeTool },
  { id: 'brainfuck', hash: 'brainfuck-encoder', label: 'Brainfuck', icon: <CodeRoundedIcon />, Component: Brainfuck },
  { id: 'pagnai', hash: 'pagnai', label: 'PAGNAI', icon: <GraphicEqRoundedIcon />, Component: Pagnai },
  { id: 'audioSpinning', hash: 'audio-spinning', label: 'Audio Spinning', icon: <ThreeSixtyRoundedIcon />, Component: AudioSpinning },
  { id: 'audioHamburger', hash: 'audio-hamburger', label: 'Audio Hamburger', icon: <SurroundSoundRoundedIcon />, Component: AudioHamburger },
  { id: 'creditsCrawl', hash: 'credits-crawl', label: 'Credits Crawl', icon: <MovieRoundedIcon />, Component: CreditsCrawl },
  { id: 'viewer360', hash: '360-viewer', label: '360 Image Viewer', icon: <PanoramaPhotosphereRoundedIcon />, Component: Viewer360 },
];

export const TOOL_HASHES: readonly string[] = TOOLS.map((t) => t.hash);
