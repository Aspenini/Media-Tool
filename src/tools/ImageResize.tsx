import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SortRoundedIcon from '@mui/icons-material/SortRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RotateRightRoundedIcon from '@mui/icons-material/RotateRightRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PhotoLibraryRoundedIcon from '@mui/icons-material/PhotoLibraryRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { SendToButton } from '../components/SendToButton';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { Panel, PanelSection, Stage, Workbench, backdrop, useTool } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { ColorSwatchInput, FieldLabel, Segmented } from '../components/controls';
import { stripExtension } from '../lib/image';
import { formatBytes, formatInfo, isMagickLoaded, readSource, type OutputFormat, type SourceImage } from '../lib/imageResize';
import {
  exportImage,
  originalFormat,
  planOutput,
  SOCIAL_PRESETS,
  type FitMode,
  type ResizeMode,
  type ResizeSettings,
  type Rotation,
} from '../lib/batchResize';
import { useFileQueue } from '../hooks/useFileQueue';
import { downloadEach, fileFromUrl } from '../lib/download';
import { MONO_FONT } from '../theme';

const ACCEPT = 'image/*,.tif,.tiff,.psd,.tga,.dds';

type SaveAs = 'original' | OutputFormat;

const SAVE_AS: { value: SaveAs; label: string }[] = [
  { value: 'original', label: 'Original format' },
  { value: 'jpeg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
  { value: 'bmp', label: 'BMP' },
  { value: 'tiff', label: 'TIFF' },
];

type SortKey = 'name' | 'size' | 'pixels';

interface Result {
  url: string;
  name: string;
  bytes: number;
  width: number;
  height: number;
  missedTarget: boolean;
}

interface Item {
  id: string;
  file: File;
  status: 'loading' | 'ready' | 'error';
  source: SourceImage | null;
  rotation: Rotation;
  result: Result | null;
}

function disposeItem(item: Item) {
  if (item.source) URL.revokeObjectURL(item.source.previewUrl);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

/** Drop an item's finished export, releasing its URL. */
function withoutResult(item: Item): Item {
  if (!item.result) return item;
  URL.revokeObjectURL(item.result.url);
  return { ...item, result: null };
}

export function ImageResize() {
  const notify = useNotification();
  const tool = useTool();
  // Same file twice is allowed: you may want it at two sizes.
  const queue = useFileQueue<Item>({
    dedupe: false,
    create: (file, id) => ({ id, file, status: 'loading', source: null, rotation: 0, result: null }),
    dispose: disposeItem,
  });
  const items = queue.items;

  // Resize settings
  const [mode, setMode] = usePersistentState<ResizeMode>('mode', 'size');
  const [width, setWidth] = usePersistentState('width', '');
  const [height, setHeight] = usePersistentState('height', '');
  const [lockAspect, setLockAspect] = usePersistentState('lockAspect', true);
  const [percent, setPercent] = usePersistentState('percent', 50);
  const [presetId, setPresetId] = usePersistentState('presetId', SOCIAL_PRESETS[0].id);
  const [fit, setFit] = usePersistentState<FitMode>('fit', 'pad');
  const [fillKind, setFillKind] = usePersistentState<'transparent' | 'color'>('fillKind', 'transparent');
  const [fillColor, setFillColor] = usePersistentState('fillColor', '#ffffff');

  // Export settings
  const [exportOpen, setExportOpen] = usePersistentState('exportOpen', true);
  const [saveAs, setSaveAs] = usePersistentState<SaveAs>('saveAs', 'original');
  const [quality, setQuality] = usePersistentState('quality', 90);
  const [targetSize, setTargetSize] = usePersistentState('targetSize', '');
  const [targetUnit, setTargetUnit] = usePersistentState<'KB' | 'MB'>('targetUnit', 'KB');
  const [pixelArt, setPixelArt] = usePersistentState('pixelArt', false);

  const [progress, setProgress] = useState<number | null>(null);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  const settings = useMemo<ResizeSettings>(
    () => ({
      mode,
      width: Number(width) > 0 ? Number(width) : null,
      height: Number(height) > 0 ? Number(height) : null,
      lockAspect,
      percent,
      preset: SOCIAL_PRESETS.find((p) => p.id === presetId)?.size ?? null,
      fit,
    }),
    [mode, width, height, lockAspect, percent, presetId, fit],
  );

  const targetBytes = Number(targetSize) > 0 ? Math.round(Number(targetSize) * (targetUnit === 'MB' ? 1024 * 1024 : 1024)) : null;
  const background = fillKind === 'color' ? fillColor : null;

  // Any change to the recipe invalidates finished exports.
  const recipeKey = JSON.stringify([settings, saveAs, quality, targetBytes, pixelArt, background]);
  useEffect(() => {
    queue.updateAll(withoutResult);
  }, [recipeKey]);

  const addFiles = (files: File[]) => {
    for (const item of queue.add(files)) {
      readSource(item.file)
        .then((source) => queue.update(item.id, { source, status: 'ready' }))
        .catch(() => {
          queue.update(item.id, { status: 'error' });
          notify(`Couldn't read ${item.file.name}.`, 'error');
        });
    }
  };

  useIncomingFiles(addFiles);

  const clearAll = () => {
    queue.clear();
  };

  const sortBy = (key: SortKey) => {
    setSortAnchor(null);
    queue.sort((a, b) => {
      if (key === 'name') return a.file.name.localeCompare(b.file.name, undefined, { numeric: true });
      if (key === 'size') return b.file.size - a.file.size;
      const pa = a.source ? a.source.size.width * a.source.size.height : 0;
      const pb = b.source ? b.source.size.width * b.source.size.height : 0;
      return pb - pa;
    });
  };

  const formatFor = (file: File): OutputFormat => (saveAs === 'original' ? originalFormat(file) : saveAs);

  const ready = items.filter((i) => i.status === 'ready' && i.source);
  const busy = progress !== null;
  const needsMagick = saveAs !== 'original' && formatInfo(saveAs).needsMagick && !isMagickLoaded();
  const lossySelected = saveAs === 'original' ? ready.some((i) => formatInfo(formatFor(i.file)).lossy) : formatInfo(saveAs).lossy;
  const showFitBox = mode === 'preset' || (mode === 'size' && !lockAspect && settings.width !== null && settings.height !== null);

  const runExport = async () => {
    if (!ready.length) return;
    setProgress(0);
    const used = new Set<string>();
    const finished: Result[] = [];
    let failures = 0;
    let missed = 0;

    for (let n = 0; n < ready.length; n++) {
      const item = ready[n];
      const format = formatFor(item.file);
      const info = formatInfo(format);
      try {
        const out = await exportImage({
          source: item.source!,
          rotation: item.rotation,
          settings,
          format,
          quality: quality / 100,
          pixelArt,
          background,
          targetBytes: info.lossy ? targetBytes : null,
        });
        let name = `${stripExtension(item.file.name)}_${out.size.width}x${out.size.height}.${info.ext}`;
        for (let k = 2; used.has(name); k++) name = `${stripExtension(item.file.name)}_${out.size.width}x${out.size.height}_${k}.${info.ext}`;
        used.add(name);
        const result: Result = {
          url: URL.createObjectURL(out.blob),
          name,
          bytes: out.blob.size,
          width: out.size.width,
          height: out.size.height,
          missedTarget: !!out.missedTarget,
        };
        if (out.missedTarget) missed++;
        finished.push(result);
        queue.update(item.id, { result });
      } catch (error) {
        failures++;
        notify(`${item.file.name}: ${error instanceof Error ? error.message : 'conversion failed'}`, 'error');
      }
      setProgress(Math.round(((n + 1) / ready.length) * 100));
    }

    setProgress(null);
    // Each image saves as its own file.
    void downloadEach(finished);
    if (!failures) {
      notify(
        missed ? `Exported — ${missed} image(s) couldn't get under the target size.` : `Exported ${finished.length} image${finished.length === 1 ? '' : 's'}.`,
        missed ? 'warning' : 'success',
      );
    }
  };

  const totalBytes = items.reduce((n, i) => n + i.file.size, 0);
  const exported = items.filter((i) => i.result);

  return (
    <Workbench panelWidth={340}>
      <Panel
        footer={
          <ExportFooter
            progress={busy ? progress : null}
            primary={{
              label: ready.length > 1 ? `Export ${ready.length} images` : 'Export',
              icon: <ArrowForwardRoundedIcon />,
              iconEnd: true,
              busy,
              busyLabel: 'Exporting…',
              onClick: runExport,
              disabled: !ready.length,
            }}
            secondary={
              exported.length > 0 && {
                label: exported.length === 1 ? 'Download again' : `Download all ${exported.length} again`,
                icon: <DownloadRoundedIcon />,
                onClick: () => void downloadEach(exported.map((i) => i.result!)),
                disabled: busy,
              }
            }
            status={ready.length > 1 ? 'Each image downloads separately — allow multiple downloads if your browser asks.' : undefined}
          />
        }
      >
        {/* Queue toolbar */}
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FileButton variant="contained" multiple accept={ACCEPT} onFiles={addFiles} startIcon={<AddRoundedIcon />}>
              Add images
            </FileButton>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Sort">
              <span>
                <IconButton onClick={(e) => setSortAnchor(e.currentTarget)} disabled={items.length < 2} aria-label="Sort images">
                  <SortRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Remove all">
              <span>
                <IconButton onClick={clearAll} disabled={!items.length || busy} aria-label="Remove all images">
                  <DeleteOutlineRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Menu anchorEl={sortAnchor} open={!!sortAnchor} onClose={() => setSortAnchor(null)}>
              <MenuItem onClick={() => sortBy('name')}>Name (A–Z)</MenuItem>
              <MenuItem onClick={() => sortBy('size')}>File size (largest first)</MenuItem>
              <MenuItem onClick={() => sortBy('pixels')}>Resolution (largest first)</MenuItem>
            </Menu>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {items.length ? `${items.length} image${items.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)} · processed on your device` : 'Images never leave your browser.'}
          </Typography>
        </Box>

        {/* Resize settings */}
        <PanelSection title="Resize settings">
          <Segmented
            aria-label="Resize mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'size', label: 'By size' },
              { value: 'percent', label: 'Percentage' },
              { value: 'preset', label: 'Social media' },
            ]}
          />

          {mode === 'size' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <TextField
                  type="number"
                  label="Width"
                  placeholder="Auto"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { min: 1, step: 1 },
                    input: { endAdornment: <InputAdornment position="end">px</InputAdornment> },
                  }}
                />
                <TextField
                  type="number"
                  label="Height"
                  placeholder="Auto"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  slotProps={{
                    inputLabel: { shrink: true },
                    htmlInput: { min: 1, step: 1 },
                    input: { endAdornment: <InputAdornment position="end">px</InputAdornment> },
                  }}
                />
              </Box>
              <FormControlLabel
                control={<Checkbox checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />}
                label={<Typography variant="body2">Lock aspect ratio</Typography>}
                sx={{ mt: -0.5 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
                {settings.width === null && settings.height === null
                  ? 'Leave both blank to keep each image’s size.'
                  : lockAspect
                    ? settings.width && settings.height
                      ? 'Each image is scaled to fit inside this box.'
                      : 'The blank side follows each image’s shape.'
                    : settings.width && settings.height
                      ? 'Every image comes out exactly this size.'
                      : 'The blank side follows each image’s shape.'}
              </Typography>
            </>
          )}

          {mode === 'percent' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 2, alignItems: 'center' }}>
                <Slider value={percent} onChange={(_, v) => setPercent(v as number)} min={1} max={200} aria-label="Scale percentage" />
                <TextField
                  type="number"
                  value={percent}
                  onChange={(e) => setPercent(Math.max(1, Number(e.target.value) || 1))}
                  slotProps={{ htmlInput: { min: 1, max: 1000, 'aria-label': 'Percent' }, input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                {[25, 50, 75, 150, 200].map((p) => (
                  <Chip key={p} label={`${p}%`} onClick={() => setPercent(p)} color={percent === p ? 'primary' : 'default'} variant={percent === p ? 'filled' : 'outlined'} />
                ))}
              </Box>
            </>
          )}

          {mode === 'preset' && (
            <TextField select label="Preset" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {SOCIAL_PRESETS.map((p) => (
                <MenuItem key={p.id} value={p.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <span>{p.label}</span>
                  <Typography component="span" sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary' }}>
                    {p.size.width}×{p.size.height}
                  </Typography>
                </MenuItem>
              ))}
            </TextField>
          )}

          {showFitBox && (
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                When the shape doesn’t match
              </Typography>
              <RadioGroup value={fit} onChange={(e) => setFit(e.target.value as FitMode)}>
                <FormControlLabel value="pad" control={<Radio size="small" />} label={<Typography variant="body2">Fit — fill the gaps with a background</Typography>} />
                <Collapse in={fit === 'pad'}>
                  <RadioGroup
                    value={fillKind}
                    onChange={(e) => setFillKind(e.target.value as 'transparent' | 'color')}
                    sx={{ pl: 3.5, borderLeft: '2px solid', borderColor: 'divider', ml: 1.25 }}
                  >
                    <FormControlLabel value="transparent" control={<Radio size="small" />} label={<Typography variant="body2">Transparent</Typography>} />
                    <FormControlLabel
                      value="color"
                      control={<Radio size="small" />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2">Color</Typography>
                          <ColorSwatchInput
                            size={22}
                            value={fillColor}
                            aria-label="Background color"
                            onChange={(color) => {
                              setFillColor(color);
                              setFillKind('color');
                            }}
                          />
                        </Box>
                      }
                    />
                  </RadioGroup>
                </Collapse>
                <FormControlLabel value="crop" control={<Radio size="small" />} label={<Typography variant="body2">Crop — fill the box, trim the edges</Typography>} />
                <FormControlLabel value="stretch" control={<Radio size="small" />} label={<Typography variant="body2">Stretch — distort to fit</Typography>} />
              </RadioGroup>
            </Paper>
          )}
        </PanelSection>

        {/* Export settings */}
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            fullWidth
            variant="text"
            color="inherit"
            onClick={() => setExportOpen((v) => !v)}
            endIcon={<ExpandMoreRoundedIcon sx={{ transform: exportOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />}
            sx={{ justifyContent: 'space-between', borderRadius: 0, px: 2.5, py: 1.5 }}
            aria-expanded={exportOpen}
          >
            <Typography variant="overline" color="text.secondary">
              Export settings
            </Typography>
          </Button>
          <Collapse in={exportOpen}>
            <Box sx={{ px: 2.5, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField select label="Save image as" value={saveAs} onChange={(e) => setSaveAs(e.target.value as SaveAs)}>
                {SAVE_AS.map((f) => (
                  <MenuItem key={f.value} value={f.value}>
                    {f.label}
                    {f.value !== 'original' && formatInfo(f.value).needsMagick && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        via ImageMagick
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </TextField>
              <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                Keep the original format, or pick another. Format-only conversion lives in Convert.
              </Typography>
              {needsMagick && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                  About 5 MB downloads the first time you export this format.
                </Typography>
              )}

              <Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 1 }}>
                  <TextField
                    type="number"
                    label="Target file size (optional)"
                    value={targetSize}
                    disabled={!lossySelected && ready.length > 0}
                    onChange={(e) => setTargetSize(e.target.value)}
                    slotProps={{ htmlInput: { min: 1 } }}
                  />
                  <TextField select value={targetUnit} onChange={(e) => setTargetUnit(e.target.value as 'KB' | 'MB')} slotProps={{ htmlInput: { 'aria-label': 'Size unit' } }}>
                    <MenuItem value="KB">KB</MenuItem>
                    <MenuItem value="MB">MB</MenuItem>
                  </TextField>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  Sets a maximum output size. Works for JPG, WebP and AVIF.
                </Typography>
              </Box>

              {lossySelected && !targetBytes && (
                <Box>
                  <FieldLabel value={quality}>Quality</FieldLabel>
                  <Slider value={quality} onChange={(_, v) => setQuality(v as number)} min={1} max={100} aria-label="Quality" />
                </Box>
              )}

              <FormControlLabel
                control={<Checkbox checked={pixelArt} onChange={(e) => setPixelArt(e.target.checked)} />}
                label={
                  <Box>
                    <Typography variant="body2">Pixel art</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Keep hard edges — no smoothing
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </Collapse>
        </Box>
      </Panel>

      <Stage backdrop="plain" center={!items.length} onFiles={items.length ? addFiles : undefined} dropLabel="Drop to add images">
        {!items.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept={ACCEPT}
            icon={PhotoLibraryRoundedIcon}
            title="Drop images to resize"
            hint="Add one or a whole folder’s worth. PNG, JPG, WebP, GIF, BMP, AVIF — plus TIFF and PSD via ImageMagick."
            onFiles={addFiles}
          />
        ) : (
          <Box sx={{ width: '100%', display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', alignContent: 'start' }}>
            {items.map((item) => (
              <ImageCard
                key={item.id}
                item={item}
                output={item.source ? planOutput(item.source.size, item.rotation, settings).canvas : null}
                format={formatInfo(formatFor(item.file)).label}
                disabled={busy}
                onRotate={() => queue.update(item.id, (i) => ({ ...withoutResult(i), rotation: ((i.rotation + 90) % 360) as Rotation }))}
                onRemove={() => queue.remove(item.id)}
              />
            ))}
            <FileButton
              variant="outlined"
              multiple
              accept={ACCEPT}
              onFiles={addFiles}
              sx={{ minHeight: 200, borderRadius: 3, borderStyle: 'dashed', flexDirection: 'column', gap: 1, color: 'text.secondary' }}
            >
              <AddRoundedIcon sx={{ fontSize: 32, color: tool.accent }} />
              Add more
            </FileButton>
          </Box>
        )}
      </Stage>
    </Workbench>
  );
}

interface ImageCardProps {
  item: Item;
  output: { width: number; height: number } | null;
  format: string;
  disabled: boolean;
  onRotate: () => void;
  onRemove: () => void;
}

function ImageCard({ item, output, format, disabled, onRotate, onRemove }: ImageCardProps) {
  const { source, rotation, result } = item;
  const quarter = rotation === 90 || rotation === 270;
  // The thumbnail box is 4:3; rescale a quarter-turned image so it still fits.
  let rotateScale = 1;
  if (source && quarter) {
    const { width: w, height: h } = source.size;
    rotateScale = Math.min(4 / h, 3 / w) / Math.min(4 / w, 3 / h);
  }

  const details = source
    ? `${source.file.type || 'unknown type'} · ${source.size.width}×${source.size.height} · ${formatBytes(item.file.size)}${source.bitmap === null ? ' · decoded by ImageMagick' : ''}`
    : '';

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={(theme) => ({ position: 'relative', aspectRatio: '4 / 3', ...backdrop(theme, 'checker'), backgroundSize: '14px 14px', backgroundPosition: '0 0, 0 7px, 7px -7px, -7px 0' })}>
        {item.status === 'loading' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        )}
        {item.status === 'error' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'error.main', textAlign: 'center', p: 2 }}>
            <Box>
              <ErrorOutlineRoundedIcon />
              <Typography variant="caption" sx={{ display: 'block' }}>
                Couldn’t read this file
              </Typography>
            </Box>
          </Box>
        )}
        {source && (
          <Box
            component="img"
            src={source.previewUrl}
            alt={item.file.name}
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: `rotate(${rotation}deg) scale(${rotateScale})`,
              transition: 'transform 250ms cubic-bezier(.2,.8,.2,1)',
            }}
          />
        )}
        <Box
          sx={(theme) => ({
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            gap: 0.25,
            p: 0.25,
            borderRadius: 999,
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            backdropFilter: 'blur(6px)',
            boxShadow: 1,
          })}
        >
          <Tooltip title="Rotate 90°">
            <span>
              <IconButton size="small" onClick={onRotate} disabled={!source || disabled} aria-label="Rotate 90 degrees">
                <RotateRightRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={details || item.file.name}>
            <IconButton size="small" aria-label="Image details">
              <InfoOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove">
            <span>
              <IconButton size="small" onClick={onRemove} disabled={disabled} aria-label={`Remove ${item.file.name}`}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography variant="body2" noWrap title={item.file.name} sx={{ fontWeight: 600 }}>
          {item.file.name}
        </Typography>
        {source && output && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={`${source.size.width} × ${source.size.height}`} sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }} />
            <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Chip size="small" color="primary" label={`${output.width} × ${output.height}`} sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }} />
          </Box>
        )}
        {result ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckRoundedIcon sx={{ fontSize: 16, color: result.missedTarget ? 'warning.main' : 'success.main' }} />
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {format} · {formatBytes(result.bytes)}
              {result.missedTarget && ' · over target'}
            </Typography>
            <SendToButton kind="image" compact getFile={() => fileFromUrl(result.url, result.name)} />
            <Tooltip title={`Download ${result.name}`}>
              <IconButton size="small" component="a" href={result.url} download={result.name} aria-label={`Download ${result.name}`}>
                <DownloadRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          source && (
            <Typography variant="caption" color="text.secondary">
              {formatBytes(item.file.size)} → {format}
            </Typography>
          )
        )}
      </Box>
    </Paper>
  );
}

