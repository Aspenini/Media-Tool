import { createContext, useContext, type ReactNode } from 'react';
import Box, { type BoxProps } from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha, type Theme } from '@mui/material/styles';
import type { ToolDef } from '../toolRegistry';
import { useFileDrag } from './FileDropZone';

/* ------------------------------------------------------------------ *
 * Tool context — lets any part of a tool read its own definition.
 * ------------------------------------------------------------------ */

const ToolContext = createContext<ToolDef | null>(null);
export const ToolProvider = ToolContext.Provider;

export function useTool(): ToolDef {
  const tool = useContext(ToolContext);
  if (!tool) throw new Error('useTool must be used inside a tool workspace');
  return tool;
}

/* ------------------------------------------------------------------ *
 * Backdrops
 * ------------------------------------------------------------------ */

export type Backdrop = 'checker' | 'dots' | 'grid' | 'plain' | 'void';

export function backdrop(theme: Theme, kind: Backdrop) {
  const dark = theme.palette.mode === 'dark';
  switch (kind) {
    case 'checker': {
      const a = dark ? '#1b1b1f' : '#ffffff';
      const b = dark ? '#232328' : '#e9e8e4';
      return {
        backgroundColor: a,
        backgroundImage: `linear-gradient(45deg, ${b} 25%, transparent 25%), linear-gradient(-45deg, ${b} 25%, transparent 25%), linear-gradient(45deg, transparent 75%, ${b} 75%), linear-gradient(-45deg, transparent 75%, ${b} 75%)`,
        backgroundSize: '20px 20px',
        backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
      };
    }
    case 'dots':
      return {
        backgroundColor: theme.palette.background.default,
        backgroundImage: `radial-gradient(${dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.11)'} 1px, transparent 1px)`,
        backgroundSize: '18px 18px',
      };
    case 'grid': {
      const line = dark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.055)';
      return {
        backgroundColor: theme.palette.background.default,
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
      };
    }
    case 'void':
      return { backgroundColor: '#050506' };
    default:
      return { backgroundColor: theme.palette.background.default };
  }
}

/* ------------------------------------------------------------------ *
 * Workbench: a side panel of controls next to a main stage.
 * ------------------------------------------------------------------ */

interface WorkbenchProps {
  panelWidth?: number;
  children: ReactNode;
}

/**
 * Two-area layout: the settings panel always sits on the left, the stage on the
 * right. Put a `<Panel>` and a `<Stage>` inside; their grid areas place them.
 * On phones the stage stacks above the panel.
 */
export function Workbench({ panelWidth = 340, children }: WorkbenchProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: `${panelWidth}px minmax(0, 1fr)` },
        gridTemplateAreas: { xs: '"stage" "panel"', md: '"panel stage"' },
        gridTemplateRows: { xs: 'auto auto', md: 'minmax(0, 1fr)' },
      }}
    >
      {children}
    </Box>
  );
}

interface PanelProps {
  children: ReactNode;
  /** Pinned to the bottom of the panel (primary actions). */
  footer?: ReactNode;
}

export function Panel({ children, footer }: PanelProps) {
  return (
    <Box
      component="aside"
      sx={{
        gridArea: 'panel',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderColor: 'divider',
        borderStyle: 'solid',
        borderWidth: { xs: '1px 0 0 0', md: '0 1px 0 0' },
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: { md: 'auto' }, display: 'flex', flexDirection: 'column' }}>{children}</Box>
      {footer && (
        <Box
          sx={{
            p: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            position: { xs: 'sticky', md: 'static' },
            bottom: 0,
            bgcolor: 'background.paper',
            zIndex: 2,
          }}
        >
          {footer}
        </Box>
      )}
    </Box>
  );
}

interface PanelSectionProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Remove the divider above this section. */
  flush?: boolean;
  grow?: boolean;
}

export function PanelSection({ title, action, children, flush, grow }: PanelSectionProps) {
  return (
    <Box
      sx={{
        px: 2.5,
        py: 2.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        borderTop: flush ? 0 : '1px solid',
        borderColor: 'divider',
        ...(grow && { flex: 1, minHeight: 0 }),
      }}
    >
      {(title || action) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: 24 }}>
          <Typography variant="overline" color="text.secondary">
            {title}
          </Typography>
          {action}
        </Box>
      )}
      {children}
    </Box>
  );
}

/** The tool's name and description, for the top of its panel. */
export function ToolIntro({ children }: { children?: ReactNode }) {
  const tool = useTool();
  const Icon = tool.icon;
  return (
    <Box sx={{ px: 2.5, pt: 2.75, pb: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={(theme) => ({
            width: 34,
            height: 34,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            color: theme.palette.primary.contrastText,
            bgcolor: 'primary.main',
            boxShadow: `0 6px 18px -6px ${alpha(theme.palette.primary.main, 0.7)}`,
          })}
        >
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Typography variant="h5" component="h1">
          {tool.name}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
        {tool.description}
      </Typography>
      {children}
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 * Stage: the main canvas area.
 * ------------------------------------------------------------------ */

interface StageProps extends Omit<BoxProps, 'onDrop'> {
  backdrop?: Backdrop;
  /** Accept files dropped anywhere on the stage (e.g. to replace the current image). */
  onFiles?: (files: File[]) => void;
  dropLabel?: string;
  /** Center children within the stage. */
  center?: boolean;
  /** Absolutely positioned overlays (docks, corner labels). */
  overlay?: ReactNode;
}

export function Stage({ backdrop: kind = 'dots', onFiles, dropLabel = 'Drop to replace', center = true, overlay, children, sx, ...rest }: StageProps) {
  const { active, handlers } = useFileDrag(onFiles);
  return (
    <Box
      {...handlers}
      {...rest}
      sx={[
        (theme) => ({
          gridArea: 'stage',
          position: 'relative',
          minWidth: 0,
          minHeight: { xs: '58vh', md: 0 },
          display: 'flex',
          flexDirection: 'column',
          ...backdrop(theme, kind),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          ...(center && { alignItems: 'center', justifyContent: 'safe center' }),
          p: { xs: 2, md: 4 },
        }}
      >
        {children}
      </Box>
      {overlay}
      {active && (
        <Box
          sx={(theme) => ({
            position: 'absolute',
            inset: 12,
            zIndex: 20,
            borderRadius: 4,
            border: '2px dashed',
            borderColor: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.12),
            backdropFilter: 'blur(3px)',
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          })}
        >
          <Typography variant="h5">{dropLabel}</Typography>
        </Box>
      )}
    </Box>
  );
}

/** A floating pill toolbar pinned to the bottom (or top) of a stage. */
export function StageDock({ children, position = 'bottom' }: { children: ReactNode; position?: 'top' | 'bottom' }) {
  return (
    <Box
      sx={(theme) => ({
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        [position]: 16,
        zIndex: 10,
        maxWidth: 'calc(100% - 24px)',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        justifyContent: 'center',
        p: 0.75,
        borderRadius: 3.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: alpha(theme.palette.background.raised, 0.86),
        backdropFilter: 'blur(14px) saturate(1.4)',
        boxShadow: theme.palette.mode === 'dark' ? '0 12px 40px -8px rgba(0,0,0,0.7)' : '0 12px 32px -10px rgba(0,0,0,0.25)',
      })}
    >
      {children}
    </Box>
  );
}

/** A small mono caption pinned to a stage corner. */
export function StageTag({ children, corner = 'top-left' }: { children: ReactNode; corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) {
  const [v, h] = corner.split('-') as ['top' | 'bottom', 'left' | 'right'];
  return (
    <Typography
      variant="overline"
      sx={(theme) => ({
        position: 'absolute',
        [v]: 14,
        [h]: 16,
        zIndex: 5,
        px: 1,
        py: 0.25,
        borderRadius: 1.5,
        color: 'text.secondary',
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(8px)',
        pointerEvents: 'none',
      })}
    >
      {children}
    </Typography>
  );
}

/** Frame for an image/canvas on a stage: soft shadow, keeps pixels crisp when asked. */
export function Artboard({ children, pixelated, sx }: { children: ReactNode; pixelated?: boolean; sx?: BoxProps['sx'] }) {
  return (
    <Box
      sx={[
        (theme) => ({
          lineHeight: 0,
          maxWidth: '100%',
          boxShadow: theme.palette.mode === 'dark' ? '0 24px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)' : '0 24px 50px -24px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)',
          '& > canvas, & > img': { maxWidth: '100%', height: 'auto', display: 'block', imageRendering: pixelated ? 'pixelated' : 'auto' },
          ...backdrop(theme, 'checker'),
          backgroundSize: '12px 12px',
          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
