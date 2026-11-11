import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

export async function collectOwnerToken({ deadline, onReady }) {
  const route = '/' + randomBytes(24).toString('hex');
  const nonce = randomBytes(18).toString('base64');
  let origin, submitted = false, timer, resolve, reject;
  const collected = new Promise((pass, fail) => { resolve = pass; reject = fail; });
  collected.catch(() => {});
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>NEXALVO TEST — recuperação R1–R4</title><h1>Recuperação staff no TEST</h1>
<form autocomplete="off"><label>Access token da sessão existente OWNER A
<input name="token" type="password" required maxlength="8192" autocomplete="new-password"></label>
<button disabled>Confirmar sessão existente</button></form><p role="status"></p>
<script nonce="${nonce}">
const form = document.querySelector('form');
const button = document.querySelector('button');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  const body = new FormData(form).get('token');
  form.reset();
  let message = 'Coleta interrompida.';
  try {
    const response = await fetch(location.pathname, {method:'POST',body,credentials:'omit',cache:'no-store',redirect:'error'});
    if (response.ok) message = 'Entrada recebida. Aguarde a conferência da sessão.';
  } catch {}
  document.querySelector('[role=status]').textContent = message;
});
button.disabled = false;
</script></html>`;
  const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`);
    if (!origin || req.headers.host !== new URL(origin).host || req.url !== route) return res.writeHead(404).end();
    if (req.method === 'GET' && !submitted) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    if (req.method !== 'POST' || req.headers.origin !== origin || submitted || Date.now() >= deadline) return res.writeHead(403).end();
    submitted = true;
    const length = Number(req.headers['content-length']);
    let buffer;
    try {
      assert(req.headers['content-type'] === 'text/plain;charset=UTF-8' && Number.isInteger(length) && length > 0 && length <= 8192);
      buffer = Buffer.alloc(length);
      let offset = 0;
      for await (const chunk of req) {
        try { assert(offset + chunk.length <= length); chunk.copy(buffer, offset); offset += chunk.length; }
        finally { chunk.fill(0); }
      }
      const token = buffer.toString('utf8');
      assert(offset === length && Date.now() < deadline && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token));
      res.writeHead(204, { Connection: 'close' }).end();
      resolve(token);
    } catch {
      res.writeHead(400, { Connection: 'close' }).end();
      reject(new Error('OWNER_COLLECTION_REJECTED'));
    } finally { buffer?.fill(0); }
  });
  server.on('error', () => reject(new Error('OWNER_COLLECTION_LISTENER')));
  try {
    assert(deadline > Date.now());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
    timer = setTimeout(() => reject(new Error('OWNER_COLLECTION_EXPIRED')), Math.max(0, deadline - Date.now()));
    onReady(origin + route);
    return await collected;
  } finally {
    clearTimeout(timer);
    server.close();
    if (!submitted) server.closeAllConnections();
    server.closeIdleConnections();
  }
}
