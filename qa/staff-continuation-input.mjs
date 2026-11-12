import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { ACTORS } from './staff-integrated-auth.mjs';

const names = Object.keys(ACTORS);
const tokenPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function collectContinuationTokens({ deadline, onReady, onAccepted }) {
  assert(deadline > Date.now(), 'CONTINUATION_COLLECTION_EXPIRED');
  const route = '/' + randomBytes(24).toString('hex');
  const nonce = randomBytes(18).toString('base64');
  let origin, submitted = false, timer, resolve, reject;
  const received = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  received.catch(() => {});
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8">
<title>NEXALVO TEST — continuação staff</title>
<form autocomplete="off">${names.map(name => `<p><label>Access token ${name.replace('_', ' ')} <input type="password" name="${name}" required maxlength="8192" autocomplete="new-password"></label></p>`).join('')}
<button disabled>Confirmar sessões existentes</button></form><p role="status" aria-live="polite"></p>
<script nonce="${nonce}">
const form = document.querySelector('form');
const button = form.querySelector('button');
const status = document.querySelector('[role=status]');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const entries = [...new FormData(form)].map(([name, token]) => [name, token.trim()]);
  if (!entries.every(([, token]) => ${tokenPattern.toString()}.test(token))) {
    status.textContent = 'Confira o formato dos três access tokens.';
    return;
  }
  button.disabled = true;
  form.reset();
  status.textContent = 'Enviando ao coletor local…';
  try {
    const response = await fetch(location.pathname, { method: 'POST', body: JSON.stringify(Object.fromEntries(entries)),
      headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store', redirect: 'error' });
    status.textContent = response.status === 204 ? 'Tokens recebidos pelo coletor local. Aguarde a validação das identidades.' : 'O coletor recusou a entrada.';
  } catch { status.textContent = 'O recebimento local não foi confirmado.'; }
});
button.disabled = false;
</script></html>`;
  const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'`);
    if (!origin || req.headers.host !== new URL(origin).host || req.url !== route) return res.writeHead(404).end();
    if (req.method === 'GET' && !submitted) return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    if (req.method !== 'POST' || req.headers.origin !== origin || submitted || Date.now() >= deadline) return res.writeHead(403).end();
    submitted = true;
    let buffer;
    try {
      const length = Number(req.headers['content-length']);
      assert(req.headers['content-type'] === 'application/json' && Number.isInteger(length) && length > 0 && length <= 25_000);
      buffer = Buffer.alloc(length);
      let offset = 0;
      for await (const chunk of req) {
        try { assert(offset + chunk.length <= length); chunk.copy(buffer, offset); offset += chunk.length; }
        finally { chunk.fill(0); }
      }
      const tokens = JSON.parse(buffer.toString('utf8'));
      assert(offset === length && Date.now() < deadline && Object.keys(tokens).length === names.length &&
        names.every(name => typeof tokens[name] === 'string' && tokens[name].length <= 8192 && tokenPattern.test(tokens[name])));
      onAccepted();
      res.writeHead(204, { Connection: 'close' }).end();
      resolve(tokens);
    } catch {
      res.writeHead(400, { Connection: 'close' }).end();
      reject(new Error('CONTINUATION_COLLECTION_REJECTED'));
    } finally { buffer?.fill(0); }
  });
  server.on('error', () => reject(new Error('CONTINUATION_COLLECTION_LISTENER')));
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
    timer = setTimeout(() => reject(new Error('CONTINUATION_COLLECTION_EXPIRED')), Math.max(0, deadline - Date.now()));
    onReady(origin + route);
    return await received;
  } finally {
    clearTimeout(timer);
    server.close();
    if (!submitted) server.closeAllConnections();
    server.closeIdleConnections();
  }
}
