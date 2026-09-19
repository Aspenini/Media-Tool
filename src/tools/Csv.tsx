import { useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ExportFooter } from '../components/ExportFooter';
import { FileQueueList } from '../components/FileQueueList';
import { useFileQueue } from '../hooks/useFileQueue';
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
  const queue = useFileQueue();
  const files = queue.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [tar, setTar] = useState<{ url: string; name: string } | null>(null);

  const addFiles = (next: File[]) => {
    const csvs = next.filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv') || f.type === 'text/plain');
    if (!csvs.length) {
      notify('Those don’t look like CSV files.', 'error');
      return;
    }
    queue.add(csvs);
    setTar(null);
  };

  const current = files.find((f) => f.id === selectedId) ?? files[0];

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
        const canvas = renderCsvTable(await current.file.text());
        const blob = await canvasToPngBlob(canvas);
        if (cancelled) return;
        url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        setPreview({ url, name: `${stripExtension(current.file.name)}_table.png`, width: canvas.width, height: canvas.height });
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
        const canvas = renderCsvTable(await files[i].file.text());
        const blob = await canvasToPngBlob(canvas);
        const buf = blob ? await blob.arrayBuffer() : new ArrayBuffer(0);
        entries.push({ name: `${stripExtension(files[i].file.name)}_table.png`, data: new Uint8Array(buf) });
      } catch (e) {
        console.warn('Skipping CSV file:', files[i].file.name, e);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise((r) => setTimeout(r, 10));
    }
    setTar({ url: URL.createObjectURL(createTarBlob(entries)), name: `csv_tables_${files.length}files.tar` });
    setProgress(null);
    notify(`${entries.length} table image(s) archived.`, 'success');
  };

  const remove = (id: string) => {
    queue.remove(id);
    setTar(null);
  };

  return (
    <Workbench panelWidth={320}>
      <Panel
        footer={
          <ExportFooter
            progress={progress}
            primary={{ href: preview?.url ?? '', download: preview?.name, disabled: !preview, label: 'Download this table' }}
            secondary={
              files.length > 1 &&
              (tar
                ? { href: tar.url, download: tar.name, label: `Download all ${files.length} (TAR)` }
                : { label: `Archive all ${files.length}`, icon: <InventoryRoundedIcon />, onClick: exportAll, busy: progress !== null })
            }
          />
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
            <FileQueueList items={files} selectedId={current?.id} onSelect={setSelectedId} onRemove={remove} meta={() => null} />
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
            <img src={preview.url} alt={`Table rendered from ${current?.file.name}`} />
          </Artboard>
        ) : (
          <Typography sx={{ fontFamily: MONO_FONT, color: 'text.secondary' }}>rendering…</Typography>
        )}
      </Stage>
    </Workbench>
  );
}
