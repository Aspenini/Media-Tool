import { Webview, SizeHint } from 'webview-bun';

const port = Number(process.env.PORT) || 3000;
const headless = process.env.MEDIA_TOOL_HEADLESS === '1';

const worker = new Worker(Bun.resolveSync('./server-worker.ts', import.meta.dir));
let started = false;

function startHeadless(hostname: string, readyPort: number): void {
  console.log(`Aspenini Media Tool running at http://${hostname}:${readyPort}`);
}

function startWindow(hostname: string, readyPort: number): void {
  const url = `http://${hostname}:${readyPort}/`;
  const webview = new Webview(false, {
    width: 1280,
    height: 840,
    hint: SizeHint.NONE,
  });

  webview.title = 'Aspenini Media Tool';
  webview.navigate(url);
  console.log(`Aspenini Media Tool → ${url}`);
  webview.run();
  worker.terminate();
}

function handleReady(hostname: string, readyPort: number): void {
  if (started) return;
  started = true;

  if (headless) {
    startHeadless(hostname, readyPort);
    return;
  }

  startWindow(hostname, readyPort);
}

worker.addEventListener('message', (event) => {
  const data = event.data as { type: string; port: number; hostname: string };
  if (data.type !== 'ready') return;
  handleReady(data.hostname, data.port);
});

worker.addEventListener('error', (event) => {
  console.error('Server worker failed:', event.message ?? event);
  process.exit(1);
});

setTimeout(() => {
  if (!started && headless) {
    handleReady('127.0.0.1', port);
  }
}, 500);
