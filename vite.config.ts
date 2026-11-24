// @node: F1.0
// @node: F1.5
// @node: F2.4
import { Readable } from 'node:stream';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

type Handler = (request: Request, env: Record<string, string | undefined>) => Promise<Response>;

/** Routes served by the dev plugin: each entry maps a URL prefix to a module file and handler export name. */
const API_ROUTES: Array<{ path: string; module: string; handler: string; stream?: boolean }> = [
  { path: '/api/repo',       module: '/api/repo.ts',       handler: 'handleRepoRequest', stream: true },
  { path: '/api/assistant',  module: '/api/assistant.ts',  handler: 'handleAssistantRequest' },
];

/**
 * Dev-only: serves API routes from their TypeScript source inside the Vite dev server, so
 * `npm run dev` works without the Vercel CLI. Each route converts the Node request into a Web
 * `Request`, bridges the Web `Response` back, and aborts upstream work when the browser
 * disconnects. Not part of the production build (`apply: 'serve'`).
 */
function apiDevPlugin(): Plugin {
  return {
    name: 'patchbay-api-dev',
    apply: 'serve',
    configureServer(server) {
      // Server-side only: .env values go to the handler, never to the client bundle.
      const env = { ...loadEnv(server.config.mode, server.config.envDir || server.config.root, ''), ...process.env };

      for (const route of API_ROUTES) {
        server.middlewares.use(route.path, (req, res) => {
          void (async () => {
            const controller = new AbortController();
            res.on('close', () => { if (!res.writableFinished) controller.abort(); });
            try {
              const mod = (await server.ssrLoadModule(route.module)) as Record<string, Handler>;
              const url = `http://${req.headers.host ?? 'localhost'}${req.originalUrl ?? req.url ?? route.path}`;
              const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
              const init: RequestInit & { duplex?: 'half' } = {
                method: req.method ?? 'GET',
                headers: req.headers as Record<string, string>,
                signal: controller.signal,
              };
              if (hasBody) {
                init.body = Readable.toWeb(req) as unknown as ReadableStream;
                init.duplex = 'half';
              }
              const response = await mod[route.handler]!(new Request(url, init), env);
              res.statusCode = response.status;
              response.headers.forEach((value, name) => res.setHeader(name, value));
              res.flushHeaders();
              if (!response.body) { res.end(); return; }
              Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream).pipe(res);
            } catch (error) {
              console.error(`[${route.path} dev] unexpected failure: ${error instanceof Error ? error.name : 'unknown'}`);
              if (!res.headersSent) {
                res.statusCode = 500;
                res.setHeader('content-type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ error: { code: 'upstream_failure', message: 'Unexpected server error.' } }));
              } else { res.end(); }
            }
          })();
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
