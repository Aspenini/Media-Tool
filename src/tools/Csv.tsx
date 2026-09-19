import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { Artboard, Panel, PanelSection, Stage, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { canvasToPngBlob, renderCsvTable } from '../lib/csv';
import { createTarBlob } from '../lib/tar';
import { stripExtension } from '../lib/image';
import { MONO_FONT } from '../theme';

interface Preview {
  url: string;
  name: string;
  width: number;
  height: number;
}

export function Csv() {
  const notify = useNotification();
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [tar, setTar] = useState<{ url: string; name: string } | null>(null);

  const addFiles = (next: File[]) => {
    const csvs = next.filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv') || f.type === 'text/plain');
    if (!csvs.length) {
      notify('Those don’t look like CSV files.', 'error');
      return;
    }
    setFiles((prev) => {
      if (!prev.length) setSelected(0);
      return [...prev, ...csvs.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))];
    });
    setTar(null);
  };

  const current = files[Math.min(selected, files.length - 1)];

  // Render the selected file straight away — the stage is the preview.
  useEffect(() => {
    if (!current) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const canvas = renderCsvTable(await current.text());
        const blob = await canvasToPngBlob(canvas);
        if (cancelled) return;
        url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        setPreview({ url, name: `${stripExtension(current.name)}_table.png`, width: canvas.width, height: canvas.height });
      } catch (e) {
        if (!cancelled) notify('Error rendering CSV: ' + (e instanceof Error ? e.message : String(e)), 'error');
      }
    })();
    return () => {
      cancelled = true;
      if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    };
  }, [current, notify]);

  const exportAll = async () => {
    setTar(null);
    setProgress(0);
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const canvas = renderCsvTable(await files[i].text());
        const blob = await canvasToPngBlob(canvas);
        const buf = blob ? await blob.arrayBuffer() : new ArrayBuffer(0);
        entries.push({ name: `${stripExtension(files[i].name)}_table.png`, data: new Uint8Array(buf) });
      } catch (e) {
        console.warn('Skipping CSV file:', files[i].name, e);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise((r) => setTimeout(r, 10));
    }
    setTar({ url: URL.createObjectURL(createTarBlob(entries)), name: `csv_tables_${files.length}files.tar` });
    setProgress(null);
    notify(`${entries.length} table image(s) archived.`, 'success');
  };

  const remove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setSelected((s) => (s >= index && s > 0 ? s - 1 : s));
    setTar(null);
  };

  return (
    <Workbench panelWidth={320}>
      <Panel
        footer={
          <>
            {progress !== null && <LinearProgress variant="determinate" value={progress} />}
            <DownloadButton size="large" href={preview?.url ?? ''} download={preview?.name ?? ''} disabled={!preview} label="Download this table" />
            {files.length > 1 &&
              (tar ? (
                <DownloadButton variant="outlined" href={tar.url} download={tar.name} label={`Download all ${files.length} (TAR)`} />
              ) : (
                <Button variant="outlined" onClick={exportAll} disabled={progress !== null} startIcon={<InventoryRoundedIcon />}>
                  Archive all {files.length}
                </Button>
              ))}
          </>
        }
      >
        <ToolIntro />
        <PanelSection
          title={`Files · ${files.length}`}
          action={
            files.length > 0 && (
              <FileButton size="small" variant="outlined" multiple accept=".csv,text/csv" onFiles={addFiles} startIcon={<AddRoundedIcon />}>
                Add
              </FileButton>
            )
          }
        >
          {files.length === 0 ? (
            <FileDropZone multiple accept=".csv,text/csv" title="Choose CSV files" hint="One or many" onFiles={addFiles} />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {files.map((f, i) => {
                const active = f === current;
                return (
                  <Box
                    key={`${f.name}-${f.size}`}
                    onClick={() => setSelected(i)}
                    sx={(theme) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      pl: 1.25,
                      pr: 0.25,
                      py: 0.5,
                      borderRadius: 2,
                      cursor: 'pointer',
                      bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
                      color: active ? 'primary.main' : 'text.primary',
                      '&:hover': { bgcolor: active ? undefined : 'action.hover' },
                    })}
                  >
                    <TableChartRoundedIcon sx={{ fontSize: 16 }} />
                    <Typography variant="body2" noWrap sx={{ flex: 1, fontWeight: active ? 650 : 500 }}>
                      {f.name}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${f.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(i);
                      }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                );
              })}
            </Box>
          )}
        </PanelSection>
      </Panel>

      <Stage
        backdrop="grid"
        onFiles={files.length ? addFiles : undefined}
        dropLabel="Drop to add CSV files"
        overlay={preview && <StageTag>{preview.width}×{preview.height} · {preview.name}</StageTag>}
      >
        {!files.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept=".csv,text/csv"
            icon={TableChartRoundedIcon}
            title="Drop CSV files"
            hint="Each one becomes a clean table image. The first row is used as the header."
            onFiles={addFiles}
          />
        ) : preview ? (
          <Artboard sx={{ bgcolor: '#fff', backgroundImage: 'none' }}>
            <img src={preview.url} alt={`Table rendered from ${current?.name}`} />
          </Artboard>
        ) : (
          <Typography sx={{ fontFamily: MONO_FONT, color: 'text.secondary' }}>rendering…</Typography>
        )}
      </Stage>
    </Workbench>
  );
}
