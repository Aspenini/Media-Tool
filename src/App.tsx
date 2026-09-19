import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CssBaseline from '@mui/material/CssBaseline';
import ScopedCssBaseline from '@mui/material/ScopedCssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { APP_ACCENT, getTheme, type ThemeMode } from './theme';
import { NotificationProvider } from './components/NotificationProvider';
import { ToolProvider } from './components/Workbench';
import { ToolErrorBoundary } from './components/ToolErrorBoundary';
import { FileBridgeProvider } from './components/FileBridge';
import { AppTabs } from './components/AppTabs';
import { useHashRoute } from './hooks/useHashRoute';
import { TOOLS, toolByHash, type ToolDef } from './toolRegistry';

const STORAGE_KEY = 'media-tool-theme';

function initialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const [preferredMode, setPreferredMode] = useState<ThemeMode>(initialMode);
  const [hash, select] = useHashRoute();
  // Unknown or empty hashes open the first tab, as the original app did.
  const tool = toolByHash(hash) ?? TOOLS[0];

  // Two themes: the app bar always follows the user's preference and the app accent;
  // each tool styles only its own workspace (accent, forced mode, font).
  const appTheme = useMemo(() => getTheme({ mode: preferredMode, accent: APP_ACCENT }), [preferredMode]);
  const toolTheme = useMemo(
    () => getTheme({ mode: tool.forceMode ?? preferredMode, accent: tool.accent, bodyFont: tool.bodyFont }),
    [preferredMode, tool],
  );

  useEffect(() => {
    document.title = `${tool.name} · Aspenini Media Tool`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appTheme.palette.background.paper);
  }, [tool, appTheme]);

  useEffect(() => {
    // A file dropped outside any drop zone would otherwise navigate away from the app.
    const swallowDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', swallowDrop);
    window.addEventListener('drop', swallowDrop);
    return () => {
      window.removeEventListener('dragover', swallowDrop);
      window.removeEventListener('drop', swallowDrop);
    };
  }, []);

  const toggleMode = () => {
    setPreferredMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const selectTool = useCallback((next: ToolDef) => select(next.hash), [select]);

  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline enableColorScheme />
      <NotificationProvider>
        <FileBridgeProvider open={tool} onOpenTool={selectTool}>
          <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <AppTabs active={tool} onSelect={selectTool} mode={preferredMode} onToggleMode={toggleMode} />
            <ThemeProvider theme={toolTheme}>
              <ScopedCssBaseline
                enableColorScheme
                component="main"
                key={tool.id}
                id="tool-panel"
                role="tabpanel"
                aria-labelledby={`tab-${tool.id}`}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                  // A plain CSS fade-in; the key above restarts it on every tool switch.
                  animation: 'tool-enter 240ms cubic-bezier(0.22, 1, 0.36, 1)',
                  '@keyframes tool-enter': {
                    from: { opacity: 0, transform: 'translateY(6px)' },
                    to: { opacity: 1, transform: 'none' },
                  },
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              >
                <ToolProvider value={tool}>
                  <ToolErrorBoundary toolName={tool.name}>
                    <Suspense fallback={<ToolLoading />}>
                      <tool.Component />
                    </Suspense>
                  </ToolErrorBoundary>
                </ToolProvider>
              </ScopedCssBaseline>
            </ThemeProvider>
          </Box>
        </FileBridgeProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

function ToolLoading() {
  return (
    <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
      <CircularProgress size={28} />
    </Box>
  );
}
