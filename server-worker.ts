import { file } from 'bun';
import { distRoutes } from './dist-routes.ts';

const port = Number(process.env.PORT) || 3000;

const server = Bun.serve({
  port,
  hostname: '127.0.0.1',
  development: false,
  fetch(req) {
    const pathname = new URL(req.url).pathname;
    const route = distRoutes[pathname === '/' ? '/index.html' : pathname];
    if (!route) {
      return new Response('Not Found', { status: 404 });
    }

    return new Response(file(route.file), {
      headers: { 'Content-Type': route.type },
    });
  },
});

postMessage({ type: 'ready', port: server.port, hostname: server.hostname });
