import { useCallback, useRef, useState, type DragEvent } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';

interface FileDropZoneProps {
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  /** Receives the dropped/selected files. */
  onFiles: (files: File[]) => void;
}

export function FileDropZone({
  accept = '*/*',
  multiple = false,
  title = 'Drop a file here',
  hint = 'or click to browse',
  onFiles,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const emit = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
    },
    [onFiles],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setActive(false);
      emit(e.dataTransfer?.files ?? null);
    },
    [emit],
  );

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setActive(false);
      }}
      onDrop={handleDrop}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        px: 3,
        py: 5,
        borderRadius: 3,
        cursor: 'pointer',
        border: '2px dashed',
        borderColor: active ? 'primary.main' : 'divider',
        backgroundColor: active
          ? theme.vars
            ? `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
            : 'action.hover'
          : 'action.hover',
        transition: theme.transitions.create(['border-color', 'background-color', 'transform']),
        transform: active ? 'scale(1.01)' : 'none',
        '&:hover': { borderColor: 'primary.main' },
      })}
    >
      <UploadFileRoundedIcon color={active ? 'primary' : 'action'} sx={{ fontSize: 38 }} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hint}
      </Typography>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = '';
        }}
      />
    </Box>
  );
}
