import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button, { type ButtonProps } from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import type { SvgIconComponent } from '@mui/icons-material';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';

interface FileDropZoneProps {
  accept?: string;
  multiple?: boolean;
  title?: ReactNode;
  hint?: ReactNode;
  /** `hero` fills its container as the tool's empty state; `compact` is a slim row for side panels. */
  variant?: 'hero' | 'compact';
  icon?: SvgIconComponent;
  /** Extra content under the hero call to action (format notes, etc.). */
  footer?: ReactNode;
  onFiles: (files: File[]) => void;
}

/**
 * Tracks drag-over state for any element, ignoring child enter/leave noise.
 * Events stop here, so a drop zone nested in a droppable stage handles files once.
 */
export function useFileDrag(onFiles: ((files: File[]) => void) | undefined) {
  const depth = useRef(0);
  const [active, setActive] = useState(false);

  const handlers = {
    onDragEnter: (e: DragEvent) => {
      if (!onFiles || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current += 1;
      setActive(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!onFiles || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e: DragEvent) => {
      if (!onFiles) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    },
    onDrop: (e: DragEvent) => {
      if (!onFiles) return;
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFiles(files);
    },
  };

  return { active, handlers };
}

export function FileDropZone({
  accept = '*/*',
  multiple = false,
  title = 'Drop a file here',
  hint = 'or click to browse',
  variant = 'compact',
  icon: Icon = UploadRoundedIcon,
  footer,
  onFiles,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const emit = useCallback(
    (files: File[]) => {
      if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    },
    [onFiles, multiple],
  );
  const { active, handlers } = useFileDrag(emit);
  const hero = variant === 'hero';

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={typeof title === 'string' ? title : 'Choose file'}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      {...handlers}
      sx={(theme) => ({
        position: 'relative',
        display: 'flex',
        flexDirection: hero ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: hero ? 'center' : 'left',
        gap: hero ? 2 : 1.5,
        width: '100%',
        ...(hero ? { flex: 1, alignSelf: 'stretch', minHeight: 300, p: 4 } : { px: 1.5, py: 1.25 }),
        borderRadius: hero ? 4 : 2.5,
        cursor: 'pointer',
        border: '1.5px dashed',
        borderColor: active ? 'primary.main' : 'divider',
        backgroundColor: active ? alpha(theme.palette.primary.main, 0.08) : hero ? 'transparent' : 'action.hover',
        transition: 'border-color 160ms, background-color 160ms',
        outline: 'none',
        '&:hover, &:focus-visible': { borderColor: alpha(theme.palette.primary.main, 0.7) },
        '&:hover .drop-icon, &:focus-visible .drop-icon': { transform: 'translateY(-2px)' },
      })}
    >
      <Box
        className="drop-icon"
        sx={(theme) => ({
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          width: hero ? 72 : 36,
          height: hero ? 72 : 36,
          borderRadius: hero ? 5 : 2,
          color: 'primary.main',
          backgroundColor: alpha(theme.palette.primary.main, active ? 0.2 : 0.12),
          transition: 'transform 200ms cubic-bezier(.2,.8,.2,1), background-color 160ms',
          transform: active ? 'scale(1.08)' : 'none',
        })}
      >
        <Icon sx={{ fontSize: hero ? 34 : 20 }} />
      </Box>
      <Box sx={{ minWidth: 0, flex: hero ? 'none' : 1 }}>
        <Typography
          variant={hero ? 'h5' : 'body2'}
          component="div"
          noWrap={!hero}
          sx={{ fontWeight: hero ? undefined : 600 }}
        >
          {active ? 'Release to drop' : title}
        </Typography>
        <Typography
          variant={hero ? 'body2' : 'caption'}
          color="text.secondary"
          component="div"
          noWrap={!hero}
          sx={{ mt: hero ? 0.75 : 0 }}
        >
          {hint}
        </Typography>
      </Box>
      {hero && (
        <Button tabIndex={-1} size="large" startIcon={<UploadRoundedIcon />} sx={{ mt: 1, pointerEvents: 'none' }}>
          Choose {multiple ? 'files' : 'a file'}
        </Button>
      )}
      {hero && footer && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ maxWidth: 440 }}>
          {footer}
        </Typography>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          emit(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </Box>
  );
}

interface FileButtonProps extends Omit<ButtonProps<'label'>, 'onChange' | 'component'> {
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

/** A button that opens the file picker — for "replace" / "add more" actions. */
export function FileButton({ accept = '*/*', multiple = false, onFiles, children, ...rest }: FileButtonProps) {
  return (
    <Button component="label" {...rest}>
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </Button>
  );
}
