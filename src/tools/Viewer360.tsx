import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { loadImageObjectUrl, Viewer360Engine, type ProjectionMode } from '../lib/viewer360';

const PROJECTIONS: { value: ProjectionMode; label: string }[] = [
  { value: 'equirectangular', label: 'Equirectangular (360° sphere)' },
  { value: 'cylindrical', label: 'Cylindrical (360° horizontal band)' },
  { value: 'cubemap', label: 'Cube map strip (six faces in one row)' },
];

export function Viewer360() {
  const notify = useNotification();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Viewer360Engine | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const [projection, setProjection] = useState<ProjectionMode>('equirectangular');

  useEffect(() => {
    if (containerRef.current && !engineRef.current) {
      engineRef.current = new Viewer360Engine(containerRef.current);
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  const apply = async (file: File, mode: ProjectionMode, toast: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const { img, url } = await loadImageObjectUrl(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      if (mode === 'cubemap' && img.naturalWidth < img.naturalHeight * 5) {
        notify('Cube map strip works best with six square faces in a row (about 6:1).', 'info');
      }
      engine.loadImage(img, mode);
      engine.fit();
      if (toast) notify('360 viewer ready — drag to look around.', 'success');
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  const handleFiles = (files: File[]) => {
    fileRef.current = files[0];
    void apply(files[0], projection, true);
  };

  const handleProjection = (mode: ProjectionMode) => {
    setProjection(mode);
    if (fileRef.current) void apply(fileRef.current, mode, false);
  };

  return (
    <ToolShell title="360° Image Viewer" description="Upload a panorama and look around by dragging (or touch). Everything runs in your browser.">
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <FileDropZone accept="image/*" title="Drop a panorama image" hint="or click to browse" onFiles={handleFiles} />
        <TextField select label="Projection" value={projection} onChange={(e) => handleProjection(e.target.value as ProjectionMode)}>
          {PROJECTIONS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Typography variant="body2" color="text.secondary">
        <strong>Equirectangular</strong> is the usual 2:1 full-sphere photo. <strong>Cylindrical</strong> wraps the image around you with open sky/floor. <strong>Cube map strip</strong> expects six square faces left-to-right in OpenGL order: +X, −X, +Y, −Y, +Z, −Z.
      </Typography>
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: { xs: 320, md: 520 },
          borderRadius: 3,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          backgroundColor: '#0c1222',
        }}
      />
    </ToolShell>
  );
}
