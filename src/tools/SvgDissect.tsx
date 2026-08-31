import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import {
  describeNode,
  ElementRegistry,
  InteractionController,
  loadSvgFile,
  SvgLoadError,
  TransformStore,
  type RegistryNode,
} from '../lib/svgDissect';

interface LayerNodeProps {
  node: RegistryNode;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function LayerNode({ node, selectedId, hoveredId, onSelect, onHover }: LayerNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const details = describeNode(node, false);
  const hasChildren = node.children.length > 0;
  const active = selectedId === node.id;
  const hovered = hoveredId === node.id;

  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <Box
        title={node.label}
        onClick={() => onSelect(node.id)}
        onMouseEnter={() => onHover(node.id)}
        onMouseLeave={() => onHover(null)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 30,
          px: 0.5,
          borderRadius: 1,
          cursor: 'pointer',
          bgcolor: active ? 'action.selected' : hovered ? 'action.hover' : 'transparent',
          boxShadow: active ? 'inset 2px 0 0 var(--mui-palette-primary-main)' : 'none',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            aria-label={expanded ? 'Collapse layer group' : 'Expand layer group'}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
            sx={{ width: 24, height: 24 }}
          >
            <ChevronRightRoundedIcon
              sx={{ fontSize: 17, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
            />
          </IconButton>
        ) : (
          <Box sx={{ width: 24, flexShrink: 0 }} />
        )}
        <Typography
          component="div"
          variant="caption"
          noWrap
          sx={{ minWidth: 0, fontFamily: 'monospace', lineHeight: 1.4 }}
        >
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>
            {node.tag}
          </Box>
          {details.id && <Box component="span">#{details.id}</Box>}
          {details.classes.length > 0 && (
            <Box component="span" color="text.secondary">
              .{details.classes.join('.')}
            </Box>
          )}
        </Typography>
      </Box>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box component="ul" sx={{ m: 0, ml: 1.5, pl: 1, borderLeft: '1px solid', borderColor: 'divider' }}>
            {node.children.map((child) => (
              <LayerNode
                key={child.id}
                node={child}
                selectedId={selectedId}
                hoveredId={hoveredId}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

interface HoverCard {
  node: RegistryNode;
  x: number;
  y: number;
}

interface ContextMenuState {
  node: RegistryNode;
  x: number;
  y: number;
}

export function SvgDissect() {
  const notify = useNotification();
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const registryRef = useRef<ElementRegistry | null>(null);
  const transformsRef = useRef(new TransformStore());
  const interactionRef = useRef<InteractionController | null>(null);
  const [root, setRoot] = useState<RegistryNode | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const teardown = useCallback(() => {
    interactionRef.current?.destroy();
    interactionRef.current = null;
    registryRef.current = null;
    transformsRef.current.clear();
  }, []);

  useEffect(() => teardown, [teardown]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const registry = registryRef.current;
    const canvas = canvasRef.current;
    if (!root || !svg || !registry || !canvas) return;

    canvas.replaceChildren(svg);
    const interaction = new InteractionController(svg, registry, transformsRef.current, {
      onSelect: setSelectedId,
      onHover: setHoveredId,
      onTooltip: (node, x, y) => setHoverCard(node ? { node, x, y } : null),
      onContextMenu: (node, x, y) => {
        setHoverCard(null);
        setContextMenu({ node, x, y });
      },
    });
    interactionRef.current = interaction;

    return () => {
      interaction.destroy();
      if (interactionRef.current === interaction) interactionRef.current = null;
    };
  }, [root]);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file || (!file.type.includes('svg') && !file.name.toLowerCase().endsWith('.svg'))) {
        notify('Please select an SVG file.', 'error');
        return;
      }

      try {
        const svg = await loadSvgFile(file);
        teardown();
        const registry = new ElementRegistry(svg);
        svgRef.current = svg;
        registryRef.current = registry;
        setRoot(registry.root);
        setSelectedId(null);
        setHoveredId(null);
        setHoverCard(null);
        setContextMenu(null);
        notify(`${file.name} loaded. Hover, select, or drag any visible element.`, 'success');
      } catch (error) {
        notify(error instanceof SvgLoadError ? error.message : 'Could not load that SVG.', 'error');
      }
    },
    [notify, teardown],
  );

  const selectLayer = useCallback((id: string) => interactionRef.current?.select(id), []);
  const hoverLayer = useCallback((id: string | null) => interactionRef.current?.hover(id), []);

  const resetAll = () => {
    const registry = registryRef.current;
    if (!registry) return;
    transformsRef.current.resetAll(registry);
    notify('All element positions reset.', 'info');
  };

  const resetContextElement = () => {
    if (!contextMenu) return;
    transformsRef.current.resetElement(contextMenu.node.id, contextMenu.node.element);
    setContextMenu(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const tooltipDetails = hoverCard ? describeNode(hoverCard.node) : null;
  const menuCanReset = contextMenu ? transformsRef.current.hasMoved(contextMenu.node.id) : false;

  return (
    <ToolShell
      title="SVG Dissect"
      description="Inspect an SVG's layer tree, identify individual shapes, and drag elements apart to understand how the artwork is constructed."
      action={
        root ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button component="label" startIcon={<UploadFileRoundedIcon />}>
              Open another SVG
              <input
                type="file"
                accept=".svg,image/svg+xml"
                hidden
                onChange={(event) => {
                  void handleFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            </Button>
            <Button variant="outlined" startIcon={<RestartAltRoundedIcon />} onClick={resetAll}>
              Reset all
            </Button>
            <Tooltip title={layersOpen ? 'Hide layer panel' : 'Show layer panel'}>
              <IconButton color={layersOpen ? 'primary' : 'default'} onClick={() => setLayersOpen((value) => !value)}>
                <LayersRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        ) : undefined
      }
    >
      {!root ? (
        <FileDropZone
          accept=".svg,image/svg+xml"
          title="Drop an SVG file here"
          hint="or click to browse — the file stays in your browser"
          onFiles={(files) => void handleFiles(files)}
        />
      ) : (
        <Paper
          variant="outlined"
          sx={{ display: 'flex', height: { xs: 520, md: 660 }, minHeight: 0, overflow: 'hidden', borderRadius: 3 }}
        >
          {layersOpen && (
            <Box
              component="aside"
              aria-label="SVG layers"
              sx={{ width: { xs: 190, sm: 270 }, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}
            >
              <Typography variant="overline" color="text.secondary" sx={{ px: 1.5, py: 1 }}>
                Layers
              </Typography>
              <Divider />
              <Box sx={{ flex: 1, overflow: 'auto', p: 0.75 }}>
                <Box component="ul" sx={{ m: 0, p: 0 }}>
                  <LayerNode
                    node={root}
                    selectedId={selectedId}
                    hoveredId={hoveredId}
                    onSelect={selectLayer}
                    onHover={hoverLayer}
                  />
                </Box>
              </Box>
            </Box>
          )}
          {layersOpen && <Divider orientation="vertical" flexItem />}
          <Box
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            sx={{
              flex: 1,
              minWidth: 0,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'auto',
              p: 3,
              outline: dragActive ? '2px dashed' : 'none',
              outlineColor: 'primary.main',
              outlineOffset: -8,
              bgcolor: 'background.default',
              backgroundImage:
                'linear-gradient(45deg, rgba(127,127,127,.08) 25%, transparent 25%), linear-gradient(-45deg, rgba(127,127,127,.08) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(127,127,127,.08) 75%), linear-gradient(-45deg, transparent 75%, rgba(127,127,127,.08) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
              '& svg': { maxWidth: '100%', maxHeight: '100%', display: 'block', touchAction: 'none' },
              '& svg [data-dissect-id].dissect-hover': { outline: '2px solid #22c55e', outlineOffset: '1px' },
              '& svg [data-dissect-id].dissect-selected': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '1px' },
              '& svg [data-dissect-id].dissect-dragging': { cursor: 'grabbing' },
            }}
          >
            <Box ref={canvasRef} sx={{ display: 'contents' }} />
          </Box>
        </Paper>
      )}

      {hoverCard && tooltipDetails && (
        <Paper
          elevation={8}
          sx={{
            position: 'fixed',
            zIndex: 1500,
            pointerEvents: 'none',
            left: Math.min(hoverCard.x + 12, window.innerWidth - 220),
            top: Math.min(hoverCard.y + 12, window.innerHeight - 72),
            px: 1.25,
            py: 0.75,
            border: '1px solid',
            borderColor: 'divider',
            fontFamily: 'monospace',
          }}
        >
          <Typography variant="caption" component="div" sx={{ fontFamily: 'inherit' }}>
            <Box component="span" color="primary.main" sx={{ fontWeight: 700 }}>
              {hoverCard.node.tag}
            </Box>
            {tooltipDetails.id ? `#${tooltipDetails.id}` : ''}
            {tooltipDetails.classes.length ? ` .${tooltipDetails.classes.join('.')}` : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ fontFamily: 'inherit' }}>
            {tooltipDetails.dimensions}
          </Typography>
        </Paper>
      )}

      <Menu
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.y, left: contextMenu.x } : undefined}
      >
        <MenuItem disabled={!menuCanReset} onClick={resetContextElement}>
          Reset position
        </MenuItem>
      </Menu>
    </ToolShell>
  );
}
