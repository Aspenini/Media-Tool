import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface ToolShellProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Optional content rendered at the far right of the title row. */
  action?: ReactNode;
}

export function ToolShell({ title, description, children, action }: ToolShellProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h4" component="h2" sx={{ mb: description ? 0.75 : 0 }}>
            {title}
          </Typography>
          {description && (
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760, lineHeight: 1.6 }}>
              {description}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}
