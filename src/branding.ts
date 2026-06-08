import faviconSvg from '../public/img/favicon.svg';
import faviconIco from '../public/img/favicon.ico';
import faviconPng from '../public/img/favicon.png';

/** Bundled SVG URL — crisp at any size (header logo, primary tab icon). */
export const brandIconSvg = faviconSvg;

/** Install favicon links in document head (works in dev + production builds). */
export function installDocumentIcons(): void {
  document.querySelectorAll('link[data-brand-icon]').forEach((node) => node.remove());

  const svg = document.createElement('link');
  svg.rel = 'icon';
  svg.type = 'image/svg+xml';
  svg.href = faviconSvg;
  svg.setAttribute('data-brand-icon', '');

  const ico = document.createElement('link');
  ico.rel = 'icon';
  ico.type = 'image/x-icon';
  ico.sizes = 'any';
  ico.href = faviconIco;
  ico.setAttribute('data-brand-icon', '');

  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = faviconPng;
  apple.setAttribute('data-brand-icon', '');

  document.head.append(svg, ico, apple);
}
