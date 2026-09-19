import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, StageDock, ToolIntro, Workbench } from '../components/Workbench';
import { Stat } from '../components/controls';
import {
  describeNode,
  ElementRegistry,
  InteractionController,
  loadSvgFile,
  SvgLoadError,
  TransformStore,
  type RegistryNode,
} from '../lib/svgDissect';
import { MONO_FONT } from '../theme';

interface LayerNodeProps {
  node: RegistryNode;
  depth: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function LayerNode({ node, depth, selectedId, hoveredId, onSelect, onHover }: LayerNodeProps) {
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
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          minHeight: 28,
          pl: depth * 1.5,
          pr: 1,
          borderRadius: 1.5,
          cursor: 'pointer',
          color: active ? 'primary.main' : 'text.primary',
          bgcolor: active ? alpha(theme.palette.primary.main, 0.14) : hovered ? 'action.hover' : 'transparent',
          '&:hover': { bgcolor: active ? undefined : 'action.hover' },
        })}
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
            sx={{ width: 22, height: 22, color: 'text.secondary' }}
          >
            <ChevronRightRoundedIcon sx={{ fontSize: 16, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
          </IconButton>
        ) : (
          <Box sx={{ width: 22, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.secondary', opacity: 0.5 }} />
          </Box>
        )}
        <Typography component="div" noWrap sx={{ minWidth: 0, fontFamily: MONO_FONT, fontSize: '0.76rem', lineHeight: 1.4 }}>
          <Box component="span" sx={{ fontWeight: 600, color: active ? 'primary.main' : 'text.primary' }}>
            {node.tag}
          </Box>
          {details.id && (
            <Box component="span" sx={{ color: 'primary.main', opacity: 0.85 }}>
              #{details.id}
            </Box>
          )}
          {details.classes.length > 0 && (
            <Box component="span" color="text.secondary">
              .{details.classes.join('.')}
            </Box>
          )}
          {hasChildren && (
            <Box component="span" color="text.secondary" sx={{ ml: 0.75, opacity: 0.6 }}>
              {node.children.length}
            </Box>
          )}
        </Typography>
      </Box>
      {hasChildren && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {node.children.map((child) => (
              <LayerNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} hoveredId={hoveredId} onSelect={onSelect} onHover={onHover} />
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

function countNodes(node: RegistryNode): number {
  return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
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
  const [fileName, setFileName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(true);
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
        setFileName(file.name);
        setSelectedId(null);
        setHoveredId(null);
        setHoverCard(null);
        setContextMenu(null);
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

  const tooltipDetails = hoverCard ? describeNode(hoverCard.node) : null;
  const menuCanReset = contextMenu ? transformsRef.current.hasMoved(contextMenu.node.id) : false;
  const selectedNode = selectedId ? registryRef.current?.get(selectedId) : undefined;
  const selectedDetails = selectedNode ? describeNode(selectedNode) : null;
  const showPanel = !root || layersOpen;

  return (
    <Workbench panelWidth={showPanel ? 300 : 0}>
      {showPanel && (
        <Panel>
          {!root ? (
            <ToolIntro />
          ) : (
            <>
              <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="overline" color="text.secondary">
                    Layers · {countNodes(root)}
                  </Typography>
                  <Typography noWrap sx={{ fontWeight: 650, fontSize: '0.9rem' }} title={fileName}>
                    {fileName}
                  </Typography>
                </Box>
              </Box>
              <Box component="ul" sx={{ m: 0, px: 1, pb: 2, flex: 1, overflowY: 'auto', minHeight: 200 }}>
                <LayerNode node={root} depth={0} selectedId={selectedId} hoveredId={hoveredId} onSelect={selectLayer} onHover={hoverLayer} />
              </Box>
              {selectedNode && selectedDetails && (
                <PanelSection title="Selected">
                  <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', wordBreak: 'break-all' }}>
                    <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      &lt;{selectedNode.tag}&gt;
                    </Box>
                    {selectedDetails.id && ` #${selectedDetails.id}`}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <Stat label="Box" value={selectedDetails.dimensions} />
                    <Stat label="Children" value={selectedNode.children.length} />
                  </Box>
                  {selectedDetails.classes.length > 0 && <Stat label="Classes" value={selectedDetails.classes.join(' ')} />}
                </PanelSection>
              )}
            </>
          )}
        </Panel>
      )}

      <Stage
        backdrop="checker"
        onFiles={root ? (files) => void handleFiles(files) : undefined}
        dropLabel="Drop to open another SVG"
        overlay={
          root && (
            <StageDock position="top">
              <Tooltip title={layersOpen ? 'Hide layers' : 'Show layers'}>
                <IconButton size="small" color={layersOpen ? 'primary' : 'default'} onClick={() => setLayersOpen((v) => !v)} aria-label="Toggle layers panel">
                  <LayersRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reset all positions">
                <IconButton size="small" onClick={resetAll} aria-label="Reset all positions">
                  <RestartAltRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <FileButton size="small" variant="text" accept=".svg,image/svg+xml" onFiles={(files) => void handleFiles(files)} startIcon={<FolderOpenRoundedIcon />}>
                Open
              </FileButton>
              <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', color: 'text.secondary', pr: 1, display: { xs: 'none', sm: 'block' } }}>
                drag shapes · right-click to reset one
              </Typography>
            </StageDock>
          )
        }
        sx={{
          '& svg': { maxWidth: '100%', maxHeight: '100%', display: 'block', touchAction: 'none' },
          '& svg [data-dissect-id].dissect-hover': { outline: '2px solid #22c55e', outlineOffset: '1px' },
          '& svg [data-dissect-id].dissect-selected': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '1px' },
          '& svg [data-dissect-id].dissect-dragging': { cursor: 'grabbing' },
        }}
      >
        {!root ? (
          <FileDropZone
            variant="hero"
            accept=".svg,image/svg+xml"
            icon={AccountTreeRoundedIcon}
            title="Drop an SVG to dissect"
            hint="Hover to identify shapes, drag them apart, and browse the full layer tree."
            onFiles={(files) => void handleFiles(files)}
          />
        ) : (
          <Box sx={{ flex: 1, width: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pt: 5 }}>
            <Box ref={canvasRef} sx={{ display: 'contents' }} />
          </Box>
        )}
      </Stage>

      {hoverCard && tooltipDetails && (
        <Box
          sx={{
            position: 'fixed',
            zIndex: 1500,
            pointerEvents: 'none',
            left: Math.min(hoverCard.x + 14, window.innerWidth - 220),
            top: Math.min(hoverCard.y + 14, window.innerHeight - 72),
            px: 1.25,
            py: 0.75,
            borderRadius: 2,
            bgcolor: '#17171b',
            color: '#f1f1f3',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 10px 30px -8px rgba(0,0,0,0.6)',
            fontFamily: MONO_FONT,
            fontSize: '0.75rem',
            lineHeight: 1.5,
          }}
        >
          <Box component="span" sx={{ color: 'primary.light', fontWeight: 700 }}>
            {hoverCard.node.tag}
          </Box>
          {tooltipDetails.id ? `#${tooltipDetails.id}` : ''}
          {tooltipDetails.classes.length ? ` .${tooltipDetails.classes.join('.')}` : ''}
          <Box sx={{ color: 'rgba(255,255,255,0.55)' }}>{tooltipDetails.dimensions}</Box>
        </Box>
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
    </Workbench>
  );
}
