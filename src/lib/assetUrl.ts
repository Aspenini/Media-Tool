/**
 * Turn a bundler-emitted asset path (from `import x from './file.png'`) into an
 * absolute URL. Always pass imported asset paths through this before handing
 * them to the DOM (`<link href>`, `<img src>`, `fetch`).
 *
 * The two environments disagree, so both are handled:
 *  - Production emits a path relative to the chunk that references it
 *    (`./icon-<hash>.png`, with every chunk in `/assets/`). The DOM would resolve
 *    that against the page instead, which 404s — it only works against
 *    `import.meta.url`.
 *  - Bun's dev server emits a root-absolute `/_bun/asset/...` path but reports
 *    `import.meta.url` as a `file://` URL, so the page URL is the right base there.
 */
export function assetUrl(path: string): string {
  const base = import.meta.url.startsWith('http') ? import.meta.url : location.href;
  return new URL(path, base).href;
}
