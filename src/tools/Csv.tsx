import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { canvasToPngBlob, renderCsvTable } from '../lib/csv';
import { createTarBlob } from '../lib/tar';
import { stripExtension } from '../lib/image';

export function Csv() {
  const notify = useNotification();
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [single, setSingle] = useState<{ url: string; name: string } | null>(null);
  const [tar, setTar] = useState<{ url: string; name: string } | null>(null);

  const generate = async () => {
    if (!files.length) {
      notify('Please select one or more CSV files.', 'error');
      return;
    }
    setSingle(null);
    setTar(null);

    if (files.length === 1) {
      setProgress(0);
      try {
        const text = await files[0].text();
        const canvas = renderCsvTable(text);
        const blob = await canvasToPngBlob(canvas);
        const url = blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
        setSingle({ url, name: `${stripExtension(files[0].name)}_table.png` });
        notify('CSV image ready.', 'success');
      } catch (e) {
        notify('Error processing CSV: ' + (e instanceof Error ? e.message : String(e)), 'error');
      } finally {
        setProgress(null);
      }
      return;
    }

    setProgress(0);
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const text = await files[i].text();
        const canvas = renderCsvTable(text);
        const blob = await canvasToPngBlob(canvas);
        const buf = blob ? await blob.arrayBuffer() : new ArrayBuffer(0);
        entries.push({ name: `${stripExtension(files[i].name)}_table.png`, data: new Uint8Array(buf) });
      } catch (e) {
        console.warn('Skipping CSV file:', files[i].name, e);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
      await new Promise((r) => setTimeout(r, 10));
    }
    const tarBlob = createTarBlob(entries);
    setTar({ url: URL.createObjectURL(tarBlob), name: `csv_tables_${files.length}files.tar` });
    setProgress(null);
    notify('CSV images ready. Archive prepared.', 'success');
  };

  return (
    <ToolShell title="CSV to Image" description="Convert CSV data into styled table images. Select multiple files to batch-export them as a single TAR archive.">
      <FileDropZone accept=".csv" multiple title="Drop CSV files here" hint="or click to browse — one or many .csv files" onFiles={setFiles} />
      {files.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {files.map((f) => (
            <Chip key={f.name} label={f.name} size="small" />
          ))}
        </Stack>
      )}
      <Button onClick={generate} disabled={!files.length || progress !== null} sx={{ alignSelf: 'flex-start' }}>
        Generate
      </Button>
      {progress !== null && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Processing… {progress}%
          </Typography>
          <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} />
        </Box>
      )}
      {single && (
        <>
          <PreviewSurface label="Table">
            <Box component="img" src={single.url} alt="CSV table" sx={{ maxWidth: '100%', borderRadius: 2, background: '#fff' }} />
          </PreviewSurface>
          <DownloadButton href={single.url} download={single.name} label="Download Table as Image" />
        </>
      )}
      {tar && <DownloadButton href={tar.url} download={tar.name} label="Download All (TAR)" />}
    </ToolShell>
  );
}
