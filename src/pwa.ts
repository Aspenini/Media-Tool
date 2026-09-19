/** `sw.js` and the manifest are copied to the site root, not bundled into /assets. */
const rootUrl = (file: string) => new URL(file, document.baseURI).href;

/**
 * True for a built site, false on the dev server (which bundles on the fly and
 * serves neither `sw.js` nor the manifest). A production build loads its entry
 * script from `/assets/`, which is signal enough — and keeps a stale service
 * worker from ever shadowing the dev server.
 */
function isBuiltSite(): boolean {
  return !!document.querySelector('script[src*="assets/"]');
}

/**
 * Make the app installable and available offline.
 * Only in a deployed build: the dev server has no `manifest.webmanifest` or `sw.js`.
 */
export function installPwa(): void {
  if (!isBuiltSite()) return;

  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = rootUrl('manifest.webmanifest');
    document.head.appendChild(link);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(rootUrl('sw.js'), { scope: rootUrl('./') }).catch((error: unknown) => {
        console.warn('Offline support unavailable:', error);
      });
    });
  }
}
