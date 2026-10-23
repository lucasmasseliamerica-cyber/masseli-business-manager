// Owned loopback-only Vite child. No Auth/session/admin configuration or DB calls.
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { STOCK_HOST } from './stock-journey-core.mjs';

async function main() {
  const nonce = process.env.NEXALVO_C1_SERVER_NONCE;
  if (!/^[a-f0-9]{64}$/.test(nonce || '') || process.env.VITE_SUPABASE_URL !== `https://${STOCK_HOST}`) process.exit(2);
  const { createServer } = await import('vite');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const server = await createServer({ root, configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
    clearScreen: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 4189, strictPort: true, hmr: false },
    plugins: [{ name: 'nexalvo-c1-private-health', enforce: 'pre', configureServer(vite) {
      vite.middlewares.use('/__nexalvo_c1_health', (request, response) => {
        if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
        response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ kind: 'NEXALVO_C1_VITE', nonce }));
      });
    } }],
  });
  let closing = false;
  const close = async () => { if (closing) return; closing = true; try { await server.close(); } finally { process.exit(0); } };
  process.once('SIGINT', close); process.once('SIGTERM', close);
  await server.listen();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => process.exit(2));
