import { rm, mkdir, cp, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const OUT_DIR = 'dist';
const PUBLIC_DIR = 'public';
/** Precache the shell and code, but not source maps or multi-megabyte on-demand payloads. */
const PRECACHE_SKIP = /\.map$|\.wasm$|^sw\.js$|^preview\.png$/;

async function copyPublic(): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(PUBLIC_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    await cp(join(PUBLIC_DIR, entry), join(OUT_DIR, entry), { recursive: true });
  }
}

/** Every file in dist, as paths relative to the site root. */
async function listFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) found.push(...(await listFiles(full)));
    else found.push(relative(OUT_DIR, full).replace(/\\/g, '/'));
  }
  return found;
}

/** Bake the built file names into the service worker so a deploy invalidates the old cache. */
async function writeServiceWorker(): Promise<void> {
  const swPath = join(OUT_DIR, 'sw.js');
  let source: string;
  try {
    source = await readFile(swPath, 'utf8');
  } catch {
    return;
  }
  const files = await listFiles(OUT_DIR);
  const precache = files.filter((f) => !PRECACHE_SKIP.test(f)).map((f) => `./${f}`);
  const buildId = Bun.hash(precache.join('|')).toString(36);
  await writeFile(swPath, source.replace('__PRECACHE__', JSON.stringify(precache)).replace('__BUILD_ID__', buildId));
  console.log(`Service worker: ${precache.length} file(s) precached (build ${buildId}).`);
}

async function main(): Promise<void> {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const result = await Bun.build({
    entrypoints: ['index.html'],
    outdir: OUT_DIR,
    target: 'browser',
    // Keeps dynamic imports in their own chunks, so the ImageMagick glue is
    // fetched only by visitors who actually convert to a format that needs it.
    splitting: true,
    minify: true,
    sourcemap: 'linked',
    naming: {
      entry: '[dir]/[name].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
      chunk: 'assets/[name]-[hash].[ext]',
    },
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }

  await copyPublic();
  await writeServiceWorker();

  console.log(`Build complete. ${result.outputs.length} artifact(s) written to ${OUT_DIR}/`);
}

await main();
