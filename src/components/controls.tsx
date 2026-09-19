import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import Slider, { type SliderProps } from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import { MONO_FONT } from '../theme';

/** Small uppercase label used above controls. */
export function FieldLabel({ children, value }: { children: ReactNode; value?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
      <Typography variant="body2" sx={{ fontWeight: 550, color: 'text.primary' }}>
        {children}
      </Typography>
      {value !== undefined && (
        <Typography component="span" sx={{ fontFamily: MONO_FONT, fontSize: '0.78rem', color: 'text.secondary' }}>
          {value}
        </Typography>
      )}
    </Box>
  );
}

interface SliderFieldProps extends Omit<SliderProps, 'value' | 'onChange'> {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  /** Formats the readout next to the label. */
  format?: (value: number) => string;
}

export function SliderField({ label, value, onChange, format = (v) => String(v), ...rest }: SliderFieldProps) {
  return (
    <Box sx={{ opacity: rest.disabled ? 0.5 : 1 }}>
      <FieldLabel value={format(value)}>{label}</FieldLabel>
      <Slider value={value} onChange={(_, v) => onChange(v as number)} sx={{ py: 1 }} {...rest} />
    </Box>
  );
}

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

interface SegmentedProps<T extends string | number> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  disabled?: boolean;
  /** Wrap options onto several rows instead of squeezing them. */
  wrap?: boolean;
  'aria-label'?: string;
}

export function Segmented<T extends string | number>({ value, onChange, options, disabled, wrap, ...aria }: SegmentedProps<T>) {
  // Many options read better as Material filter chips than as one cramped button row.
  if (wrap) {
    return (
      <Box role="radiogroup" aria-label={aria['aria-label']} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {options.map((option) => {
          const selected = option.value === value;
          const chip = (
            <Chip
              key={String(option.value)}
              role="radio"
              aria-checked={selected}
              label={option.label}
              disabled={disabled}
              color={selected ? 'primary' : 'default'}
              variant={selected ? 'filled' : 'outlined'}
              onClick={() => onChange(option.value)}
              sx={{ fontWeight: 600, minWidth: 48 }}
            />
          );
          return option.title ? (
            <Tooltip key={String(option.value)} title={option.title}>
              {chip}
            </Tooltip>
          ) : (
            chip
          );
        })}
      </Box>
    );
  }

  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      size="small"
      value={value}
      disabled={disabled}
      onChange={(_, next: T | null) => {
        if (next !== null) onChange(next);
      }}
      aria-label={aria['aria-label']}
    >
      {options.map((option) => (
        <ToggleButton key={String(option.value)} value={option.value} title={option.title} sx={{ whiteSpace: 'nowrap', px: 1 }}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

interface ChoiceCardProps {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  role?: 'radio' | 'button';
  'aria-label'?: string;
  sx?: SxProps<Theme>;
}

/** A selectable Material card (with ripple) for choices richer than a chip. */
export function ChoiceCard({ selected, onClick, disabled, children, role = 'radio', sx, ...aria }: ChoiceCardProps) {
  return (
    <ButtonBase
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-pressed={role === 'button' ? selected : undefined}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={onClick}
      focusRipple
      sx={[
        (theme) => ({
          display: 'flex',
          textAlign: 'left',
          justifyContent: 'flex-start',
          width: '100%',
          borderRadius: 3,
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.08) : 'transparent',
          opacity: disabled ? 0.45 : 1,
          transition: theme.transitions.create(['border-color', 'background-color']),
          '&:hover': { bgcolor: selected ? undefined : 'action.hover' },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </ButtonBase>
  );
}

interface SwitchRowProps {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ label, hint, checked, onChange, disabled }: SwitchRowProps) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        py: 0.25,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 550 }}>
          {label}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
            {hint}
          </Typography>
        )}
      </Box>
      <Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </Box>
  );
}

/** A compact label/value readout. */
export function Stat({ label, value, accent }: { label: ReactNode; value: ReactNode; accent?: boolean }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{ fontFamily: MONO_FONT, fontSize: '0.9rem', fontWeight: 500, color: accent ? 'primary.main' : 'text.primary' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

interface ColorSwatchInputProps {
  value: string;
  onChange: (value: string) => void;
  'aria-label': string;
  /** Show a rainbow instead of the current color (when presets already show it). */
  rainbow?: boolean;
  size?: number;
}

/** A round swatch that opens the system color picker. */
export function ColorSwatchInput({ value, onChange, rainbow, size = 28, ...aria }: ColorSwatchInputProps) {
  return (
    <Box
      component="label"
      sx={(theme) => ({
        position: 'relative',
        display: 'block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        cursor: 'pointer',
        background: rainbow ? 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' : value,
        border: '1px solid',
        borderColor: 'divider',
        '&:focus-within': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      })}
    >
      <Box
        component="input"
        type="color"
        value={value}
        aria-label={aria['aria-label']}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', p: 0, border: 0 }}
      />
    </Box>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Quick-pick swatches shown before the custom picker. */
  presets?: readonly string[];
}

/** Labeled color control: optional preset swatches plus a custom picker. */
export function ColorField({ label, value, onChange, presets }: ColorFieldProps) {
  return (
    <Box>
      <FieldLabel value={value.toUpperCase()}>{label}</FieldLabel>
      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
        {presets?.map((color) => {
          const selected = color.toLowerCase() === value.toLowerCase();
          return (
            <ButtonBase
              key={color}
              aria-label={`${label} ${color}`}
              aria-pressed={selected}
              onClick={() => onChange(color)}
              sx={(theme) => ({
                width: 28,
                height: 28,
                borderRadius: '50%',
                bgcolor: color,
                border: '1px solid',
                borderColor: 'divider',
                boxShadow: selected ? `0 0 0 2px ${theme.palette.background.paper}, 0 0 0 4px ${theme.palette.primary.main}` : 'none',
              })}
            />
          );
        })}
        <Tooltip title="Custom color">
          <span style={{ display: 'block' }}>
            <ColorSwatchInput value={value} onChange={onChange} rainbow={!!presets?.length} aria-label={`Custom ${label.toLowerCase()}`} />
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
