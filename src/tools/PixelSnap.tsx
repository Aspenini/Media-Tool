import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { loadImageFromFile, stripExtension } from '../lib/image';
import { processPixelSnap, type PotMode, type SnapSettings } from '../lib/pixelSnap';

const PIXEL_SIZES = ['auto', '2', '4', '8', '16', '32', '64'];
const COLOR_COUNTS = [2, 4, 8, 16, 32, 64, 128, 256];
const OUTPUT_SIZES = ['auto', '16', '32', '64', '128', '256', '512', '1024', '2048', '4096'];
const POT_MODES: { value: PotMode; label: string }[] = [
  { value: 'balanced', label: 'Balanced (nearest)' },
  { value: 'up', label: 'Preserve Detail (round up)' },
  { value: 'down', label: 'Performance (round down)' },
  { value: 'grid-safe', label: 'Pixel Grid Safe' },
];

export function PixelSnap() {
  const notify = useNotification();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const fileNameRef = useRef('image');

  const [loaded, setLoaded] = useState(false);
  const [info, setInfo] = useState('');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const [pixelSize, setPixelSize] = useState('auto');
  const [colors, setColors] = useState(16);
  const [potMode, setPotMode] = useState<PotMode>('balanced');
  const [targetSize, setTargetSize] = useState('auto');
  const [preserveAlpha, setPreserveAlpha] = useState(true);
  const [dither, setDither] = useState(false);
  const [square, setSquare] = useState(false);

  const run = useCallback(() => {
    if (!imgRef.current) return;
    const settings: SnapSettings = {
      pixelSize: pixelSize === 'auto' ? 'auto' : parseInt(pixelSize, 10),
      colors,
      potMode,
      targetSize: targetSize === 'auto' ? 'auto' : parseInt(targetSize, 10),
      preserveAlpha,
      dither,
      square,
    };
    const result = processPixelSnap(imgRef.current, settings);

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
    setInfo(
      `Pixel size: ${result.pixelSize}px${pixelSize === 'auto' ? ' (auto)' : ''}  •  ` +
        `Internal grid: ${result.gridWidth}×${result.gridHeight}  •  Colors: ${colors}  •  ` +
        `Output: ${result.outWidth}×${result.outHeight}${result.usedTarget ? ' (target)' : ''}`,
    );
    result.outCanvas.toBlob((blob) => {
      if (!blob) return;
      setDownload((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name: `${fileNameRef.current}_snapped_${result.outWidth}x${result.outHeight}_${colors}c.png` };
      });
    }, 'image/png');
  }, [pixelSize, colors, potMode, targetSize, preserveAlpha, dither, square]);

  useEffect(() => {
    if (loaded) run();
  }, [loaded, run]);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify('Please select a valid image file.', 'error');
      return;
    }
    try {
      imgRef.current = await loadImageFromFile(file);
      fileNameRef.current = stripExtension(file.name) || 'image';
      setLoaded(true);
      notify('Image loaded. Adjust settings as needed.', 'success');
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  return (
    <ToolShell title="PixelSnap POT" description="Clean up messy pixel-style images: snap them to a consistent pixel grid, reduce the palette, and export a sharp, game-ready power-of-two PNG.">
      <FileDropZone accept="image/*" title="Drop an image here" hint="or click to browse — PNG, JPG, WEBP, BMP" onFiles={handleFiles} />
      {loaded && (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <TextField select label="Pixel size" value={pixelSize} onChange={(e) => setPixelSize(e.target.value)}>
              {PIXEL_SIZES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s === 'auto' ? 'Auto (detect)' : `${s}×`}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Colors" value={colors} onChange={(e) => setColors(Number(e.target.value))}>
              {COLOR_COUNTS.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Power-of-two mode" value={potMode} onChange={(e) => setPotMode(e.target.value as PotMode)}>
              {POT_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Target output size" value={targetSize} onChange={(e) => setTargetSize(e.target.value)}>
              {OUTPUT_SIZES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s === 'auto' ? 'Auto (use POT mode)' : `${s} px`}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <FormControlLabel control={<Checkbox checked={preserveAlpha} onChange={(e) => setPreserveAlpha(e.target.checked)} />} label="Preserve transparency" />
            <FormControlLabel control={<Checkbox checked={dither} onChange={(e) => setDither(e.target.checked)} />} label="Dither colors" />
            <FormControlLabel control={<Checkbox checked={square} onChange={(e) => setSquare(e.target.checked)} />} label="Force square output" />
          </Stack>
          <Button onClick={run} sx={{ alignSelf: 'flex-start' }}>
            Convert
          </Button>
          {info && (
            <Typography variant="body2" color="text.secondary">
              {info}
            </Typography>
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <PreviewSurface label="Original" checkered>
              <Box component="canvas" ref={beforeRef} sx={{ maxWidth: '100%' }} />
            </PreviewSurface>
            <PreviewSurface label="Snapped (POT)" checkered>
              <Box component="canvas" ref={afterRef} sx={{ maxWidth: '100%', imageRendering: 'pixelated' }} />
            </PreviewSurface>
          </Box>
          {download && <DownloadButton href={download.url} download={download.name} label="Download Snapped Image" />}
        </>
      )}
    </ToolShell>
  );
}
