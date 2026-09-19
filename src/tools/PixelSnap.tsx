import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { SendToButton } from '../components/SendToButton';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { Artboard, Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { FieldLabel, Segmented, Stat, SwitchRow } from '../components/controls';
import { loadImageFromFile, stripExtension } from '../lib/image';
import { fileFromUrl } from '../lib/download';
import { processPixelSnap, type PotMode, type SnapResult, type SnapSettings } from '../lib/pixelSnap';
import { MONO_FONT } from '../theme';

const PIXEL_SIZES = ['auto', '2', '4', '8', '16', '32', '64'] as const;
const COLOR_COUNTS = [2, 4, 8, 16, 32, 64, 128, 256] as const;
const OUTPUT_SIZES = ['auto', '16', '32', '64', '128', '256', '512', '1024', '2048', '4096'];
const POT_MODES: { value: PotMode; label: string; title: string }[] = [
  { value: 'balanced', label: 'Nearest', title: 'Balanced — nearest power of two' },
  { value: 'up', label: 'Up', title: 'Preserve detail — round up' },
  { value: 'down', label: 'Down', title: 'Performance — round down' },
  { value: 'grid-safe', label: 'Grid-safe', title: 'Keep the pixel grid intact' },
];

interface SnapInfo {
  pixelSize: number;
  gridWidth: number;
  gridHeight: number;
  outWidth: number;
  outHeight: number;
  usedTarget: boolean;
}

export function PixelSnap() {
  const notify = useNotification();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const fileNameRef = useRef('image');

  const [fileName, setFileName] = useState<string | null>(null);
  /** Bumped on every load so the same file dropped twice still re-runs. */
  const [version, setVersion] = useState(0);
  const [working, setWorking] = useState(false);
  const [info, setInfo] = useState<SnapInfo | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const [pixelSize, setPixelSize] = usePersistentState<string>('pixelSize', 'auto');
  const [colors, setColors] = usePersistentState('colors', 16);
  const [potMode, setPotMode] = usePersistentState<PotMode>('potMode', 'balanced');
  const [targetSize, setTargetSize] = usePersistentState('targetSize', 'auto');
  const [preserveAlpha, setPreserveAlpha] = usePersistentState('preserveAlpha', true);
  const [dither, setDither] = usePersistentState('dither', false);
  const [square, setSquare] = usePersistentState('square', false);

  const loaded = fileName !== null;

  const run = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setWorking(true);
    const settings: SnapSettings = {
      pixelSize: pixelSize === 'auto' ? 'auto' : parseInt(pixelSize, 10),
      colors,
      potMode,
      targetSize: targetSize === 'auto' ? 'auto' : parseInt(targetSize, 10),
      preserveAlpha,
      dither,
      square,
    };
    let result: SnapResult;
    try {
      result = await processPixelSnap(img, settings);
    } finally {
      setWorking(false);
    }

    const before = beforeRef.current;
    if (before) {
      before.width = result.beforeCanvas.width;
      before.height = result.beforeCanvas.height;
      before.getContext('2d')?.drawImage(result.beforeCanvas, 0, 0);
    }
    const after = afterRef.current;
    if (after) {
      after.width = result.outWidth;
      after.height = result.outHeight;
      const ctx = after.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, after.width, after.height);
        ctx.drawImage(result.outCanvas, 0, 0);
      }
    }
    setInfo({
      pixelSize: result.pixelSize,
      gridWidth: result.gridWidth,
      gridHeight: result.gridHeight,
      outWidth: result.outWidth,
      outHeight: result.outHeight,
      usedTarget: result.usedTarget,
    });
    result.outCanvas.toBlob((blob) => {
      if (!blob) return;
      setDownload((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name: `${fileNameRef.current}_snapped_${result.outWidth}x${result.outHeight}_${colors}c.png` };
      });
    }, 'image/png');
  }, [pixelSize, colors, potMode, targetSize, preserveAlpha, dither, square]);

  useEffect(() => {
    if (version > 0) void run();
  }, [version, run]);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify('Please select a valid image file.', 'error');
      return;
    }
    try {
      imgRef.current = await loadImageFromFile(file);
      fileNameRef.current = stripExtension(file.name) || 'image';
      setFileName(file.name);
      setVersion((v) => v + 1);
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  useIncomingFiles(handleFiles);

  return (
    <Workbench panelWidth={330}>
      <Panel
        footer={
          <ExportFooter
            primary={{
              href: download?.url ?? '',
              download: download?.name,
              disabled: !download,
              label: info ? `Download ${info.outWidth}×${info.outHeight} PNG` : 'Download',
              busy: working,
              busyLabel: 'Working…',
            }}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Source">
          <FileDropZone
            accept="image/*"
            title={fileName ?? 'Choose an image'}
            hint={imgRef.current && loaded ? `${imgRef.current.width} × ${imgRef.current.height}px` : 'PNG, JPG, WEBP, BMP'}
            onFiles={handleFiles}
          />
        </PanelSection>
        <PanelSection title="Grid">
          <Box>
            <FieldLabel value={pixelSize === 'auto' && info ? `detected ${info.pixelSize}px` : undefined}>Pixel size</FieldLabel>
            <Segmented
              aria-label="Pixel size"
              wrap
              value={pixelSize}
              onChange={setPixelSize}
              options={PIXEL_SIZES.map((s) => ({ value: s, label: s === 'auto' ? 'Auto' : `${s}×` }))}
            />
          </Box>
          <Box>
            <FieldLabel>Colors</FieldLabel>
            <Segmented
              aria-label="Color count"
              wrap
              value={colors}
              onChange={setColors}
              options={COLOR_COUNTS.map((c) => ({ value: c, label: String(c) }))}
            />
          </Box>
        </PanelSection>
        <PanelSection title="Power of two">
          <Segmented aria-label="Power-of-two mode" value={potMode} onChange={setPotMode} options={POT_MODES} />
          <TextField select label="Target output size" value={targetSize} onChange={(e) => setTargetSize(e.target.value)}>
            {OUTPUT_SIZES.map((s) => (
              <MenuItem key={s} value={s}>
                {s === 'auto' ? 'Auto — follow POT mode' : `${s} px`}
              </MenuItem>
            ))}
          </TextField>
        </PanelSection>
        <PanelSection title="Options">
          <SwitchRow label="Preserve transparency" checked={preserveAlpha} onChange={setPreserveAlpha} />
          <SwitchRow label="Dither colors" checked={dither} onChange={setDither} />
          <SwitchRow label="Force square output" checked={square} onChange={setSquare} />
        </PanelSection>
        {info && (
          <PanelSection title="Result">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Stat label="Pixel" value={`${info.pixelSize}px${pixelSize === 'auto' ? ' auto' : ''}`} />
              <Stat label="Grid" value={`${info.gridWidth}×${info.gridHeight}`} />
              <Stat label="Colors" value={colors} />
              <Stat label="Output" value={`${info.outWidth}×${info.outHeight}${info.usedTarget ? ' ⌖' : ''}`} accent />
            </Box>
            <SendToButton kind="image" disabled={!download} getFile={() => (download ? fileFromUrl(download.url, download.name) : null)} />
          </PanelSection>
        )}
      </Panel>

      <Stage backdrop="grid" onFiles={loaded ? handleFiles : undefined}>
        {!loaded && (
          <FileDropZone
            variant="hero"
            accept="image/*"
            icon={GridOnRoundedIcon}
            title="Drop a messy pixel image"
            hint="Upscaled screenshots, blurry sprites, JPEG-crunched art — it'll find the grid."
            onFiles={handleFiles}
          />
        )}
        <Box
          sx={{
            display: loaded ? 'grid' : 'none',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: { xs: 3, md: 4 },
            width: '100%',
            alignItems: 'center',
          }}
        >
          <Compare label="Original" caption={imgRef.current ? `${imgRef.current.width}×${imgRef.current.height}` : ''} pixelated>
            <canvas ref={beforeRef} />
          </Compare>
          <Compare label="Snapped" caption={info ? `${info.outWidth}×${info.outHeight} · ${colors} colors` : ''} pixelated accent>
            <canvas ref={afterRef} />
          </Compare>
        </Box>
      </Stage>
    </Workbench>
  );
}

function Compare({ label, caption, pixelated, accent, children }: { label: string; caption: string; pixelated?: boolean; accent?: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
        <Typography variant="overline" sx={{ color: accent ? 'primary.main' : 'text.secondary' }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary' }}>{caption}</Typography>
      </Box>
      <Artboard pixelated={pixelated} sx={{ '& > canvas': { width: '100%', maxHeight: '62vh', objectFit: 'contain' }, width: 'min(100%, 560px)' }}>
        {children}
      </Artboard>
    </Box>
  );
}
