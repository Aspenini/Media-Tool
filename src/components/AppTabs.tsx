import { useEffect, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import { APP_ICON_URL } from '../branding';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import useMediaQuery from '@mui/material/useMediaQuery';
import { CATEGORIES, TOOLS, type CategoryId, type ToolDef } from '../toolRegistry';
import type { ThemeMode } from '../theme';

const REPO_URL = 'https://github.com/Aspenini/Media-Tool';

interface AppTabsProps {
  active: ToolDef;
  onSelect: (tool: ToolDef) => void;
  mode: ThemeMode;
  onToggleMode: () => void;
}

/**
 * The app bar and tool tabs. Rendered under the app theme only — a tool's own
 * theme (accent, forced mode, fonts) never reaches it.
 */
export function AppTabs({ active, onSelect, mode, onToggleMode }: AppTabsProps) {
  // Sixteen tabs is a long scroll on a phone, so show one category at a time there.
  const narrow = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const [category, setCategory] = useState<CategoryId>(active.category);
  useEffect(() => setCategory(active.category), [active.category]);

  const shown = narrow ? TOOLS.filter((t) => t.category === category) : TOOLS;
  // A category with no open tool shows its tabs with none selected.
  const value = shown.indexOf(active);

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1.25, minHeight: 52, px: { xs: 1.5, sm: 2 } }}>
        <Box component="img" src={APP_ICON_URL} alt="" sx={{ width: 26, height: 26 }} />
        <Typography variant="h6" component="h1" sx={{ fontSize: '1.05rem', flexGrow: 1 }}>
          Aspenini Media Tool
        </Typography>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <IconButton onClick={onToggleMode} aria-label="Toggle color mode">
            {mode === 'dark' ? <LightModeRoundedIcon fontSize="small" /> : <DarkModeRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Source on GitHub">
          <IconButton component="a" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Toolbar>
      {narrow && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={category}
          onChange={(_, next: CategoryId | null) => next && setCategory(next)}
          aria-label="Tool category"
          sx={{ mx: 1, mb: 0.5, display: 'grid', gridTemplateColumns: `repeat(${CATEGORIES.length}, 1fr)` }}
        >
          {CATEGORIES.map((c) => (
            <ToggleButton key={c.id} value={c.id} sx={{ py: 0.5 }}>
              {c.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      <Tabs
        value={value === -1 ? false : value}
        onChange={(_, index: number) => onSelect(shown[index])}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Tools"
        sx={{
          minHeight: 48,
          px: { xs: 0, sm: 1 },
          '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' },
          '& .MuiTabs-scrollButtons.Mui-disabled': { opacity: 0.3 },
        }}
      >
        {shown.map((tool) => {
          const Icon = tool.icon;
          return (
            <Tab
              key={tool.id}
              icon={<Icon sx={{ fontSize: 20 }} />}
              iconPosition="start"
              label={tool.name}
              title={tool.tagline}
              id={`tab-${tool.id}`}
              aria-controls="tool-panel"
              sx={{ minHeight: 48, px: 2, gap: 0.25, '& .MuiTab-icon': { mr: 1 } }}
            />
          );
        })}
      </Tabs>
    </AppBar>
  );
}
