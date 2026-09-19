import { useTheme } from '@mui/material/styles';

interface ListenerHeadProps {
  cx?: number;
  cy?: number;
  /** Head half-width in SVG units; everything else scales from it. */
  size?: number;
}

/** The listener seen from above, facing up — for spatial-audio maps drawn in SVG. */
export function ListenerHead({ cx = 50, cy = 50, size = 4 }: ListenerHeadProps) {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const stroke = size * 0.1;
  const ear = { dx: size * 1.1, rx: size * 0.22, ry: size * 0.4 };
  const nose = { base: cy - size * 1.05, tip: cy - size * 1.45, half: size * 0.3 };
  return (
    <g aria-label="Listener">
      <ellipse cx={cx} cy={cy} rx={size} ry={size * 1.15} fill={theme.palette.background.paper} stroke={ink} strokeOpacity="0.5" strokeWidth={stroke} />
      <ellipse cx={cx - ear.dx} cy={cy} rx={ear.rx} ry={ear.ry} fill={ink} fillOpacity="0.5" />
      <ellipse cx={cx + ear.dx} cy={cy} rx={ear.rx} ry={ear.ry} fill={ink} fillOpacity="0.5" />
      <path
        d={`M${cx - nose.half} ${nose.base} L${cx} ${nose.tip} L${cx + nose.half} ${nose.base}`}
        fill="none"
        stroke={ink}
        strokeOpacity="0.6"
        strokeWidth={stroke}
      />
    </g>
  );
}
