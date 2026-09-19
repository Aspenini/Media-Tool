import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import PanoramaPhotosphereRoundedIcon from '@mui/icons-material/PanoramaPhotosphereRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import PanToolRoundedIcon from '@mui/icons-material/PanToolRounded';
import { FileButton, FileDropZone, useFileDrag } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { StageDock, useTool } from '../components/Workbench';
import { Segmented } from '../components/controls';
import { loadImageObjectUrl, Viewer360Engine, type ProjectionMode } from '../lib/viewer360';
import { MONO_FONT } from '../theme';

const PROJECTIONS: { value: ProjectionMode; label: string; title: string }[] = [
  { value: 'equirectangular', label: 'Sphere', title: 'Equirectangular — the usual 2:1 full-sphere photo' },
  { value: 'cylindrical', label: 'Cylinder', title: 'Cylindrical — wraps around you, open sky and floor' },
  { value: 'cubemap', label: 'Cube strip', title: 'Six square faces in a row: +X, −X, +Y, −Y, +Z, −Z' },
];

export function Viewer360() {
  const notify = useNotification();
  const tool = useTool();
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Viewer360Engine | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const [projection, setProjection] = useState<ProjectionMode>('equirectangular');
  const [fileName, setFileName] = useState<string | null>(null);
  const [hint, setHint] = useState(false);

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

  const apply = async (file: File, mode: ProjectionMode, fresh: boolean) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      const { img, url } = await loadImageObjectUrl(file);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      if (mode === 'cubemap' && img.naturalWidth < img.naturalHeight * 5) {
        notify('Cube strips work best as six square faces in a row (about 6:1).', 'info');
      }
      engine.loadImage(img, mode);
      engine.fit();
      if (fresh) {
        setFileName(file.name);
        setHint(true);
        window.setTimeout(() => setHint(false), 2600);
      }
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

  const { active, handlers } = useFileDrag(fileName ? handleFiles : undefined);
  const Icon = tool.icon;

  return (
    <Box {...handlers} sx={{ position: 'relative', flex: 1, minHeight: { xs: '70vh', md: 0 }, bgcolor: '#050506', overflow: 'hidden', cursor: fileName ? 'grab' : 'default', '&:active': { cursor: fileName ? 'grabbing' : 'default' } }}>
      <Box ref={containerRef} sx={{ position: 'absolute', inset: 0 }} />

      {!fileName && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', p: { xs: 2, md: 6 }, background: 'radial-gradient(ellipse at center, rgba(25,195,214,0.08), transparent 65%)' }}>
          <FileDropZone
            variant="hero"
            accept="image/*"
            icon={PanoramaPhotosphereRoundedIcon}
            title="Drop a panorama"
            hint="Equirectangular 2:1 photos work best. Cylinder and cube-strip layouts are supported too."
            footer="Everything renders locally with WebGL — nothing is uploaded."
            onFiles={handleFiles}
          />
        </Box>
      )}

      {/* Title card */}
      <Box
        sx={(theme) => ({
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 5,
          display: fileName ? 'flex' : 'none',
          alignItems: 'center',
          gap: 1.25,
          pl: 1,
          pr: 0.75,
          py: 0.75,
          borderRadius: 3,
          maxWidth: 'calc(100% - 32px)',
          bgcolor: alpha(theme.palette.background.paper, 0.7),
          backdropFilter: 'blur(14px)',
          border: '1px solid',
          borderColor: 'divider',
        })}
      >
        <Icon sx={{ color: 'primary.main' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 650 }}>
            {fileName}
          </Typography>
          <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.68rem', color: 'text.secondary' }}>{PROJECTIONS.find((p) => p.value === projection)?.label.toLowerCase()} projection</Typography>
        </Box>
        <FileButton size="small" variant="outlined" accept="image/*" onFiles={handleFiles} startIcon={<FolderOpenRoundedIcon />}>
          Open
        </FileButton>
      </Box>

      {/* Drag hint */}
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 4,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: 999,
          color: '#fff',
          bgcolor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          opacity: hint ? 1 : 0,
          transition: 'opacity 500ms',
        }}
      >
        <PanToolRoundedIcon fontSize="small" />
        <Typography variant="body2">Drag to look around</Typography>
      </Box>

      {fileName && (
        <StageDock>
          <Box sx={{ width: { xs: 280, sm: 340 } }}>
            <Segmented aria-label="Projection" value={projection} onChange={handleProjection} options={PROJECTIONS} />
          </Box>
        </StageDock>
      )}

      {active && (
        <Box sx={{ position: 'absolute', inset: 12, zIndex: 20, borderRadius: 4, border: '2px dashed', borderColor: 'primary.main', bgcolor: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <Typography variant="h5" sx={{ color: '#fff' }}>
            Drop to open
          </Typography>
        </Box>
      )}
    </Box>
  );
}
