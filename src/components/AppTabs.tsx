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
import logoUrl from '../../public/img/favicon.svg';
import { TOOLS, type ToolDef } from '../toolRegistry';
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
  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1.25, minHeight: 52, px: { xs: 1.5, sm: 2 } }}>
        <Box component="img" src={logoUrl} alt="" sx={{ width: 26, height: 26 }} />
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
      <Tabs
        value={TOOLS.indexOf(active)}
        onChange={(_, index: number) => onSelect(TOOLS[index])}
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
        {TOOLS.map((tool) => {
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
