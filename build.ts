import { rm, mkdir, cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = 'dist';
const PUBLIC_DIR = 'public';

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

  console.log(`Build complete. ${result.outputs.length} artifact(s) written to ${OUT_DIR}/`);
}

await main();
