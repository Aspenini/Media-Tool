import type { ReactNode } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PreviewSurfaceProps {
  label?: string;
  children: ReactNode;
  /** Use a checkerboard backdrop to reveal transparency. */
  checkered?: boolean;
}

export function PreviewSurface({ label, children, checkered = false }: PreviewSurfaceProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        alignItems: 'center',
        borderRadius: 3,
      }}
    >
      {label && (
        <Typography variant="overline" color="text.secondary" sx={{ alignSelf: 'flex-start' }}>
          {label}
        </Typography>
      )}
      <Box
        sx={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          borderRadius: 2,
          overflow: 'auto',
          ...(checkered && {
            backgroundColor: '#fff',
            backgroundImage:
              'linear-gradient(45deg, #d4d4d4 25%, transparent 25%), linear-gradient(-45deg, #d4d4d4 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d4 75%), linear-gradient(-45deg, transparent 75%, #d4d4d4 75%)',
            backgroundSize: '16px 16px',
            backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
          }),
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}
