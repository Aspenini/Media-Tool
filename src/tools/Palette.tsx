import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { loadImageFromFile } from '../lib/image';
import {
  getPalette,
  PALETTES,
  renderPalette,
  type ColorMatching,
  type DitheringMode,
} from '../lib/palette';

const DITHER_OPTIONS: { value: DitheringMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
  { value: 'ordered', label: 'Ordered (Bayer)' },
  { value: 'atkinson', label: 'Atkinson' },
];

const MATCHING_OPTIONS: { value: ColorMatching; label: string }[] = [
  { value: 'euclidean', label: 'Euclidean Distance' },
  { value: 'perceptual', label: 'Perceptual (luma-weighted)' },
  { value: 'manhattan', label: 'Manhattan Distance' },
];

export function Palette() {
  const notify = useNotification();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLCanvasElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [paletteId, setPaletteId] = useState('8bit');
  const [dithering, setDithering] = useState<DitheringMode>('none');
  const [matching, setMatching] = useState<ColorMatching>('euclidean');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const swatches = getPalette(paletteId).colors;

  useEffect(() => {
    if (!loaded || !imgRef.current) return;
    const img = imgRef.current;
    const result = renderPalette(img, paletteId, dithering, matching);

    const original = originalRef.current;
    if (original) {
      original.width = result.width;
      original.height = result.height;
      original.getContext('2d')?.drawImage(img, 0, 0, result.width, result.height);
    }
    const out = paletteRef.current;
    if (out) {
      out.width = result.width;
      out.height = result.height;
      out.getContext('2d')?.putImageData(result.imageData, 0, 0);
      out.toBlob((blob) => {
        if (!blob) return;
        setDownload((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), name: 'palette_image.png' };
        });
      }, 'image/png');
    }
  }, [loaded, paletteId, dithering, matching]);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify('Please select a valid image file.', 'error');
      return;
    }
    try {
      imgRef.current = await loadImageFromFile(file);
      setLoaded(true);
      notify('Image loaded successfully.', 'success');
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  return (
    <ToolShell title="Color Palette Converter" description="Apply retro color palettes (8-bit, NES, Game Boy, PICO-8, and more) to images, with optional dithering and color-matching strategies.">
      <FileDropZone accept="image/*" title="Drop an image here" hint="or click to browse" onFiles={handleFiles} />
      {loaded && (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
            <TextField select label="Color palette" value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
              {PALETTES.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Dithering" value={dithering} onChange={(e) => setDithering(e.target.value as DitheringMode)}>
              {DITHER_OPTIONS.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Color matching" value={matching} onChange={(e) => setMatching(e.target.value as ColorMatching)}>
              {MATCHING_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Selected palette ({swatches.length} colors)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {swatches.slice(0, 128).map((color, i) => (
                <Tooltip key={`${color}-${i}`} title={color} arrow>
                  <Box sx={{ width: 18, height: 18, borderRadius: 0.5, backgroundColor: color, border: '1px solid', borderColor: 'divider' }} />
                </Tooltip>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <PreviewSurface label="Original" checkered>
              <Box component="canvas" ref={originalRef} sx={{ maxWidth: '100%' }} />
            </PreviewSurface>
            <PreviewSurface label="Palette applied" checkered>
              <Box component="canvas" ref={paletteRef} sx={{ maxWidth: '100%' }} />
            </PreviewSurface>
          </Box>
          {download && <DownloadButton href={download.url} download={download.name} label="Download Converted Image" />}
        </>
      )}
    </ToolShell>
  );
}
