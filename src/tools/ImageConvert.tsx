import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SortRoundedIcon from '@mui/icons-material/SortRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
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
import { FieldLabel } from '../components/controls';
import { stripExtension } from '../lib/image';
import { formatBytes, formatInfo, isMagickLoaded, readSource, type OutputFormat, type SourceImage } from '../lib/imageResize';
import { exportImage, originalFormat, type ResizeSettings } from '../lib/batchResize';
import { useFileQueue } from '../hooks/useFileQueue';
import { downloadEach, fileFromUrl } from '../lib/download';
import { MONO_FONT } from '../theme';

const ACCEPT = 'image/*,.tif,.tiff,.psd,.tga,.dds';

const KEEP_SIZE: ResizeSettings = {
  mode: 'size',
  width: null,
  height: null,
  lockAspect: true,
  percent: 100,
  preset: null,
  fit: 'pad',
};

const SAVE_AS: { value: OutputFormat; label: string }[] = [
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
  missedTarget: boolean;
}

interface Item {
  id: string;
  file: File;
  status: 'loading' | 'ready' | 'error';
  source: SourceImage | null;
  result: Result | null;
}

function disposeItem(item: Item) {
  if (item.source) URL.revokeObjectURL(item.source.previewUrl);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

function withoutResult(item: Item): Item {
  if (!item.result) return item;
  URL.revokeObjectURL(item.result.url);
  return { ...item, result: null };
}

export function ImageConvert() {
  const notify = useNotification();
  const tool = useTool();
  const queue = useFileQueue<Item>({
    create: (file, id) => ({ id, file, status: 'loading', source: null, result: null }),
    dispose: disposeItem,
  });
  const items = queue.items;

  const [saveAs, setSaveAs] = usePersistentState<OutputFormat>('saveAs', 'png');
  const [quality, setQuality] = usePersistentState('quality', 90);
  const [targetSize, setTargetSize] = usePersistentState('targetSize', '');
  const [targetUnit, setTargetUnit] = usePersistentState<'KB' | 'MB'>('targetUnit', 'KB');

  const [progress, setProgress] = useState<number | null>(null);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  const targetBytes = Number(targetSize) > 0 ? Math.round(Number(targetSize) * (targetUnit === 'MB' ? 1024 * 1024 : 1024)) : null;

  const recipeKey = JSON.stringify([saveAs, quality, targetBytes]);
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

  const ready = items.filter((i) => i.status === 'ready' && i.source);
  const busy = progress !== null;
  const info = formatInfo(saveAs);
  const needsMagick = info.needsMagick && !isMagickLoaded();
  const lossySelected = info.lossy;

  const runExport = async () => {
    if (!ready.length) return;
    setProgress(0);
    const used = new Set<string>();
    const finished: Result[] = [];
    let failures = 0;
    let missed = 0;

    for (let n = 0; n < ready.length; n++) {
      const item = ready[n];
      try {
        const out = await exportImage({
          source: item.source!,
          rotation: 0,
          settings: KEEP_SIZE,
          format: saveAs,
          quality: quality / 100,
          pixelArt: false,
          background: null,
          targetBytes: lossySelected ? targetBytes : null,
        });
        let name = `${stripExtension(item.file.name)}.${info.ext}`;
        for (let k = 2; used.has(name); k++) name = `${stripExtension(item.file.name)}_${k}.${info.ext}`;
        used.add(name);
        const result: Result = {
          url: URL.createObjectURL(out.blob),
          name,
          bytes: out.blob.size,
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
    void downloadEach(finished);
    if (!failures) {
      notify(
        missed ? `Converted — ${missed} image(s) couldn't get under the target size.` : `Converted ${finished.length} image${finished.length === 1 ? '' : 's'}.`,
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
              label: ready.length > 1 ? `Convert ${ready.length} images` : 'Convert',
              icon: <ArrowForwardRoundedIcon />,
              iconEnd: true,
              busy,
              busyLabel: 'Converting…',
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
                <IconButton onClick={() => queue.clear()} disabled={!items.length || busy} aria-label="Remove all images">
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

        <PanelSection title="Output format">
          <TextField select label="Convert to" value={saveAs} onChange={(e) => setSaveAs(e.target.value as OutputFormat)}>
            {SAVE_AS.map((f) => (
              <MenuItem key={f.value} value={f.value}>
                {f.label}
                {formatInfo(f.value).needsMagick && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    via ImageMagick
                  </Typography>
                )}
              </MenuItem>
            ))}
          </TextField>
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
        </PanelSection>
      </Panel>

      <Stage backdrop="plain" center={!items.length} onFiles={items.length ? addFiles : undefined} dropLabel="Drop to add images">
        {!items.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept={ACCEPT}
            icon={PhotoLibraryRoundedIcon}
            title="Drop images to convert"
            hint="Same size, new format. PNG, JPG, WebP, GIF, BMP, AVIF — plus TIFF and PSD via ImageMagick."
            onFiles={addFiles}
          />
        ) : (
          <Box sx={{ width: '100%', display: 'grid', gap: 2, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', alignContent: 'start' }}>
            {items.map((item) => (
              <ConvertCard
                key={item.id}
                item={item}
                format={info.label}
                disabled={busy}
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

function ConvertCard({ item, format, disabled, onRemove }: { item: Item; format: string; disabled: boolean; onRemove: () => void }) {
  const { source, result } = item;
  const from = originalFormat(item.file);
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
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
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
        {source && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Chip size="small" label={formatInfo(from).label} sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }} />
            <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Chip size="small" color="primary" label={format} sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }} />
            <Chip size="small" label={`${source.size.width} × ${source.size.height}`} sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem' }} />
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
