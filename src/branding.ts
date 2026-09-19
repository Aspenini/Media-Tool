import iconIco from '../public/img/icon.ico';
import iconPng from '../public/img/icon.png';
import { assetUrl } from './lib/assetUrl';

/** The app icon, as a URL the DOM can use in both dev and production. */
export const APP_ICON_URL = assetUrl(iconPng);

/** Install favicon links in document head (works in dev + production builds). */
export function installDocumentIcons(): void {
  document.querySelectorAll('link[data-brand-icon]').forEach((node) => node.remove());

  const ico = document.createElement('link');
  ico.rel = 'icon';
  ico.type = 'image/x-icon';
  ico.sizes = 'any';
  ico.href = assetUrl(iconIco);
  ico.setAttribute('data-brand-icon', '');

  const png = document.createElement('link');
  png.rel = 'icon';
  png.type = 'image/png';
  png.href = APP_ICON_URL;
  png.setAttribute('data-brand-icon', '');

  const apple = document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = APP_ICON_URL;
  apple.setAttribute('data-brand-icon', '');

  document.head.append(ico, png, apple);
}
