import Button, { type ButtonProps } from '@mui/material/Button';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';

interface DownloadButtonProps extends Omit<ButtonProps<'a'>, 'component' | 'href'> {
  href: string;
  download: string;
  label?: string;
}

export function DownloadButton({ href, download, label = 'Download', ...rest }: DownloadButtonProps) {
  return (
    <Button component="a" href={href} download={download} startIcon={<DownloadRoundedIcon />} {...rest}>
      {label}
    </Button>
  );
}
