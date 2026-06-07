import { useMemo, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Link from '@mui/material/Link';
import Divider from '@mui/material/Divider';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { getTheme, type ThemeMode } from './theme';
import { NotificationProvider } from './components/NotificationProvider';
import { AnimatedTabPanel } from './components/AnimatedTabPanel';
import { useHashTab } from './hooks/useHashTab';
import { TOOLS, TOOL_HASHES } from './toolRegistry';

const STORAGE_KEY = 'media-tool-theme';

function initialMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [active, setActive] = useHashTab(TOOL_HASHES);
  const theme = useMemo(() => getTheme(mode), [mode]);

  const toggleMode = () => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  };

  const activeTool = TOOLS[active] ?? TOOLS[0];
  const ActiveComponent = activeTool.Component;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NotificationProvider>
        <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
          <AppBar
            position="sticky"
            color="default"
            elevation={0}
            sx={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(var(--mui-palette-background-defaultChannel) / 0.78)', borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Toolbar sx={{ gap: 1.5 }}>
              <AutoAwesomeRoundedIcon color="primary" />
              <Typography variant="h6" component="h1" sx={{ fontWeight: 700, flexGrow: 1 }}>
                Aspenini Media Tool
              </Typography>
              <Tooltip title="View on GitHub">
                <IconButton component="a" href="https://github.com/Aspenini/Media-Tool" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                  <GitHubIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                <IconButton onClick={toggleMode} aria-label="Toggle color mode" color="primary">
                  {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
                </IconButton>
              </Tooltip>
            </Toolbar>
            <Tabs
              value={active}
              onChange={(_, value: number) => setActive(value)}
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              sx={{ px: { xs: 1, sm: 2 }, borderTop: '1px solid', borderColor: 'divider' }}
            >
              {TOOLS.map((tool) => (
                <Tab key={tool.id} icon={tool.icon} iconPosition="start" label={tool.label} sx={{ minHeight: 56 }} />
              ))}
            </Tabs>
          </AppBar>

          <Container maxWidth="xl" sx={{ flexGrow: 1, py: { xs: 3, md: 4 }, px: { xs: 2, md: 4 } }}>
            <AnimatedTabPanel panelKey={activeTool.id}>
              <ActiveComponent />
            </AnimatedTabPanel>
          </Container>

          <Divider />
          <Box component="footer" sx={{ py: 2.5, textAlign: 'center' }}>
            <Link href="https://github.com/Aspenini/Media-Tool" target="_blank" rel="noopener noreferrer" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
              <GitHubIcon fontSize="small" />
              <Typography variant="body2">View on GitHub</Typography>
            </Link>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              All processing happens locally in your browser — no uploads.
            </Typography>
          </Box>
        </Box>
      </NotificationProvider>
    </ThemeProvider>
  );
}
