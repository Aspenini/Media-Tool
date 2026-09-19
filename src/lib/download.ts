/** Save a URL (blob:, data: or same-origin) to disk under `filename`. */
export function downloadUrl(url: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** Save a Blob to disk under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export type DownloadItem = { name: string } & ({ url: string } | { blob: Blob });

/** Browsers can drop downloads fired in the same tick; space them out. */
const DOWNLOAD_GAP_MS = 350;

/**
 * Save several files as separate downloads, one after another.
 * The browser may ask the user to allow multiple downloads the first time.
 */
export async function downloadEach(items: readonly DownloadItem[]): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if ('blob' in item) downloadBlob(item.blob, item.name);
    else downloadUrl(item.url, item.name);
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, DOWNLOAD_GAP_MS));
  }
}
