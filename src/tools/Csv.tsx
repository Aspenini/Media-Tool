import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TableChartRoundedIcon from '@mui/icons-material/TableChartRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { SendToButton } from '../components/SendToButton';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ExportFooter } from '../components/ExportFooter';
import { FileQueueList } from '../components/FileQueueList';
import { useFileQueue } from '../hooks/useFileQueue';
import { useNotification } from '../components/NotificationProvider';
import { Artboard, Panel, PanelSection, Stage, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { canvasToPngBlob, renderCsvTable } from '../lib/csv';
import { downloadEach, fileFromUrl, type DownloadItem } from '../lib/download';
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

  const addFiles = (next: File[]) => {
    const csvs = next.filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv') || f.type === 'text/plain');
    if (!csvs.length) {
      notify('Those don’t look like CSV files.', 'error');
      return;
    }
    queue.add(csvs);
  };

  useIncomingFiles(addFiles);

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

  const downloadAll = async () => {
    setProgress(0);
    const tables: DownloadItem[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const blob = await canvasToPngBlob(renderCsvTable(await files[i].file.text()));
        if (blob) tables.push({ blob, name: `${stripExtension(files[i].file.name)}_table.png` });
      } catch (e) {
        notify(`${files[i].file.name}: ${e instanceof Error ? e.message : "couldn't be rendered"}`, 'error');
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise((r) => setTimeout(r, 10));
    }
    setProgress(null);
    await downloadEach(tables);
  };

  const remove = (id: string) => queue.remove(id);

  return (
    <Workbench panelWidth={320}>
      <Panel
        footer={
          <ExportFooter
            progress={progress}
            primary={{ href: preview?.url ?? '', download: preview?.name, disabled: !preview, label: 'Download this table' }}
            secondary={
              files.length > 1 && {
                label: `Download all ${files.length} tables`,
                icon: <DownloadRoundedIcon />,
                onClick: () => void downloadAll(),
                busy: progress !== null,
                busyLabel: 'Rendering…',
              }
            }
            status={files.length > 1 ? 'Click a file to preview it. Each table downloads as its own PNG.' : undefined}
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
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Artboard sx={{ bgcolor: '#fff', backgroundImage: 'none' }}>
              <img src={preview.url} alt={`Table rendered from ${current?.file.name}`} />
            </Artboard>
            <SendToButton kind="image" getFile={() => fileFromUrl(preview.url, preview.name)} />
          </Box>
        ) : (
          <Typography sx={{ fontFamily: MONO_FONT, color: 'text.secondary' }}>rendering…</Typography>
        )}
      </Stage>
    </Workbench>
  );
}
