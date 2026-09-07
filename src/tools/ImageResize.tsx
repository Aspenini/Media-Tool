import { useCallback, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import TransformRoundedIcon from '@mui/icons-material/TransformRounded';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { stripExtension } from '../lib/image';
import {
  OUTPUT_FORMATS,
  convertImage,
  formatBytes,
  formatInfo,
  heightForWidth,
  isMagickLoaded,
  readSource,
  widthForHeight,
  type Engine,
  type OutputFormat,
  type SourceImage,
} from '../lib/imageResize';

const SCALE_PRESETS = [0.25, 0.5, 2] as const;

interface ResultState {
  url: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  engine: Engine;
  /** Captured at conversion time: the controls above may have moved on since. */
  label: string;
  pixelArt: boolean;
}

export function ImageResize() {
  const notify = useNotification();
  const [source, setSource] = useState<SourceImage | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [lockAspect, setLockAspect] = useState(true);
  const [format, setFormat] = useState<OutputFormat>('png');
  const [quality, setQuality] = useState(90);
  const [pixelArt, setPixelArt] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);

  // Object URLs are revoked through refs so cleanup never depends on stale state.
  const sourceUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    },
    [],
  );

  const clearResult = useCallback(() => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    resultUrlRef.current = null;
    setResult(null);
  }, []);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    clearResult();
    setStatus('Reading image…');
    try {
      const next = await readSource(file);
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = next.previewUrl;
      setSource(next);
      setWidth(String(next.size.width));
      setHeight(String(next.size.height));
    } catch {
      notify('Could not read that image.', 'error');
    } finally {
      setStatus(null);
    }
  };

  const handleWidth = (value: string) => {
    setWidth(value);
    const parsed = Number(value);
    if (lockAspect && source && Number.isFinite(parsed) && parsed > 0) {
      setHeight(String(heightForWidth(source.size, parsed)));
    }
  };

  const handleHeight = (value: string) => {
    setHeight(value);
    const parsed = Number(value);
    if (lockAspect && source && Number.isFinite(parsed) && parsed > 0) {
      setWidth(String(widthForHeight(source.size, parsed)));
    }
  };

  const applyScale = (factor: number) => {
    if (!source) return;
    setWidth(String(Math.max(1, Math.round(source.size.width * factor))));
    setHeight(String(Math.max(1, Math.round(source.size.height * factor))));
  };

  const info = formatInfo(format);
  const targetWidth = Number(width);
  const targetHeight = Number(height);
  const dimensionsValid =
    Number.isFinite(targetWidth) && targetWidth > 0 && Number.isFinite(targetHeight) && targetHeight > 0;

  const handleConvert = async () => {
    if (!source || !dimensionsValid) {
      notify('Please choose an image and enter positive dimensions.', 'error');
      return;
    }
    setStatus(info.needsMagick && !isMagickLoaded() ? 'Loading the ImageMagick engine…' : 'Converting…');
    try {
      const output = await convertImage({
        source,
        target: { width: targetWidth, height: targetHeight },
        format,
        quality: quality / 100,
        pixelArt,
      });
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
      const url = URL.createObjectURL(output.blob);
      resultUrlRef.current = url;
      setResult({
        url,
        name: `${stripExtension(source.file.name)}_${output.size.width}x${output.size.height}.${info.ext}`,
        width: output.size.width,
        height: output.size.height,
        bytes: output.blob.size,
        engine: output.engine,
        label: info.label,
        pixelArt,
      });
      notify(`Converted to ${info.label} with ${output.engine === 'magick' ? 'ImageMagick' : 'the canvas engine'}.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Conversion failed.', 'error');
    } finally {
      setStatus(null);
    }
  };

  const busy = status !== null;
  const showMagickHint = info.needsMagick && !isMagickLoaded();
  const sizeDelta =
    result && source ? result.bytes - source.file.size : null;

  return (
    <ToolShell
      title="Image Resize & Convert"
      description="Resize an image to any dimensions and convert between formats. PNG, JPEG and WebP are handled instantly by the browser; TIFF, BMP and GIF load ImageMagick on demand."
    >
      <FileDropZone
        accept="image/*,.tif,.tiff,.psd,.tga,.dds"
        title={source ? source.file.name : 'Drop an image here'}
        hint="or click to browse — PNG, JPG, WEBP, GIF, BMP, AVIF, TIFF, PSD"
        onFiles={handleFiles}
      />

      {source && (
        <Typography variant="body2" color="text.secondary">
          Source: {source.size.width} × {source.size.height} · {formatBytes(source.file.size)}
          {source.bitmap === null && ' · decoded by ImageMagick'}
        </Typography>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          type="number"
          label="Width (px)"
          value={width}
          onChange={(e) => handleWidth(e.target.value)}
          disabled={!source}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          sx={{ maxWidth: 160 }}
        />
        <Tooltip title={lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}>
          <span>
            <IconButton
              onClick={() => setLockAspect((prev) => !prev)}
              disabled={!source}
              color={lockAspect ? 'primary' : 'default'}
              aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            >
              {lockAspect ? <LinkRoundedIcon /> : <LinkOffRoundedIcon />}
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          type="number"
          label="Height (px)"
          value={height}
          onChange={(e) => handleHeight(e.target.value)}
          disabled={!source}
          slotProps={{ htmlInput: { min: 1, step: 1 } }}
          sx={{ maxWidth: 160 }}
        />
        <Stack direction="row" spacing={1}>
          {SCALE_PRESETS.map((factor) => (
            <Button
              key={factor}
              variant="outlined"
              size="small"
              disabled={!source}
              onClick={() => applyScale(factor)}
            >
              {factor * 100}%
            </Button>
          ))}
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          select
          label="Output format"
          value={format}
          onChange={(e) => setFormat(e.target.value as OutputFormat)}
          sx={{ minWidth: 180, maxWidth: 220 }}
        >
          {OUTPUT_FORMATS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        {info.lossy && (
          <Box sx={{ minWidth: 220 }}>
            <Typography variant="caption" color="text.secondary">
              Quality — {quality}
            </Typography>
            <Slider
              value={quality}
              onChange={(_, value) => setQuality(value as number)}
              min={1}
              max={100}
              step={1}
            />
          </Box>
        )}
        <FormControlLabel
          control={<Checkbox checked={pixelArt} onChange={(e) => setPixelArt(e.target.checked)} />}
          label="Pixel art (no smoothing)"
        />
      </Stack>

      {showMagickHint && (
        <Alert severity="info">
          {info.label} is produced by ImageMagick — about 5 MB downloads the first time you convert, then
          stays cached for the rest of the session.
        </Alert>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Button
          onClick={handleConvert}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <TransformRoundedIcon />}
          disabled={!source || !dimensionsValid || busy}
        >
          {busy ? 'Working…' : 'Resize & Convert'}
        </Button>
        {status && (
          <Typography variant="body2" color="text.secondary">
            {status}
          </Typography>
        )}
      </Stack>

      <PreviewSurface label="Result" checkered>
        {result && (
          <Box
            component="img"
            src={result.url}
            alt="Converted result"
            sx={{
              maxWidth: '100%',
              display: 'block',
              imageRendering: result.pixelArt ? 'pixelated' : 'auto',
            }}
          />
        )}
      </PreviewSurface>

      {result && (
        <>
          <Typography variant="body2" color="text.secondary">
            {result.width} × {result.height} · {formatBytes(result.bytes)}
            {sizeDelta !== null && sizeDelta !== 0 && (
              <> · {sizeDelta < 0 ? `${formatBytes(-sizeDelta)} smaller` : `${formatBytes(sizeDelta)} larger`}</>
            )}{' '}
            · {result.engine === 'magick' ? 'ImageMagick' : 'canvas'}
          </Typography>
          <DownloadButton href={result.url} download={result.name} label={`Download ${result.label}`} />
        </>
      )}
    </ToolShell>
  );
}
