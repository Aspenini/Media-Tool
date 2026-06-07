import Button from '@mui/material/Button';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';

interface DownloadButtonProps {
  href: string;
  download: string;
  label?: string;
  disabled?: boolean;
}

export function DownloadButton({ href, download, label = 'Download', disabled }: DownloadButtonProps) {
  return (
    <Button
      component="a"
      href={href}
      download={download}
      disabled={disabled}
      startIcon={<DownloadRoundedIcon />}
      sx={{ alignSelf: 'flex-start' }}
    >
      {label}
    </Button>
  );
}
