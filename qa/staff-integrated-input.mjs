import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';

const maxInputBytes = 65_536;

function page(ownerMode, route, scriptNonce) {
  const ownerLabel = ownerMode === 'login' ? 'Senha atual OWNER A' : 'Sessão existente OWNER A';
  return `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEXALVO TEST — coleta integrada</title>
<h1>NEXALVO TEST — coleta integrada</h1>
<p>Os campos são usados pelo processo local que executa a homologação. Uma única submissão.</p>
<form method="post" action="${route}" autocomplete="off">
  <p><label>Chave administrativa TEST <input name="ADMIN" type="password" maxlength="4096" required autocomplete="new-password"></label></p>
  <p><label>${ownerLabel} <input name="OWNER_A" type="password" maxlength="${ownerMode === 'login' ? 4096 : 8192}" required autocomplete="new-password"></label></p>
  <p><label>Senha atual MANAGER <input name="MANAGER" type="password" maxlength="4096" required autocomplete="new-password"></label></p>
  <p><label>Senha atual EMPLOYEE <input name="EMPLOYEE" type="password" maxlength="4096" required autocomplete="new-password"></label></p>
  <button type="submit" disabled>Confirmar coleta Auth</button>
</form>
<p role="status"></p>
<script nonce="${scriptNonce}">
  const form = document.querySelector('form');
  const button = form.querySelector('button');
  const status = document.querySelector('[role=status]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    const body = new URLSearchParams(new FormData(form));
    form.reset();
    try {
      const response = await fetch(form.action, {
        method: 'POST', body, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      status.textContent = response.ok ? 'Entrada recebida. Consulte o diário de execução.' : 'Coleta local interrompida.';
    } catch {
      status.textContent = 'Coleta local interrompida.';
    }
  });
  button.disabled = false;
</script>
</html>`;
}

async function readFields(req, ownerMode) {
  assert(req.headers['content-type'] === 'application/x-www-form-urlencoded', 'LOCAL_FORM_MEDIA_TYPE');
  const length = Number(req.headers['content-length']);
  assert(Number.isInteger(length) && length > 0 && length <= maxInputBytes, 'LOCAL_FORM_LENGTH');
  const buffer = Buffer.alloc(length);
  try {
    let offset = 0;
    for await (const chunk of req) {
      assert(offset + chunk.length <= length, 'LOCAL_FORM_LENGTH');
      chunk.copy(buffer, offset);
      offset += chunk.length;
      chunk.fill(0);
    }
    assert(offset === length, 'LOCAL_FORM_LENGTH');
    const params = new URLSearchParams(buffer.toString('utf8'));
    const fields = Object.create(null);
    for (const [field, value] of params) {
      assert(['ADMIN', 'OWNER_A', 'MANAGER', 'EMPLOYEE'].includes(field) && !Object.hasOwn(fields, field), 'LOCAL_FORM_FIELD');
      assert(value.length > 0 && value.length <= (field === 'OWNER_A' && ownerMode === 'existing' ? 8192 : 4096), 'LOCAL_FORM_VALUE');
      fields[field] = value;
    }
    assert(Object.keys(fields).length === 4, 'LOCAL_FORM_INCOMPLETE');
    return fields;
  } finally { buffer.fill(0); }
}

// Browser renders only the masked local inputs. This listener and all Auth/business requests
// live in the same Node process. There is no child, clipboard access, or token export endpoint.
export async function collectStaffInput({ ownerMode, deadline, onReady }) {
  assert(ownerMode === 'existing' || ownerMode === 'login', 'LOCAL_OWNER_MODE');
  assert(deadline > Date.now(), 'LOCAL_INPUT_DEADLINE');
  const route = '/' + randomBytes(24).toString('hex');
  const scriptNonce = randomBytes(18).toString('base64');
  let origin;
  let submitted = false;
  let received = false;
  let finish;
  let fail;
  const collected = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  collected.catch(() => {});
  const server = createServer({ requestTimeout: 20_000, headersTimeout: 10_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${scriptNonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'`);
    if (!origin || req.headers.host !== new URL(origin).host || req.url !== route) {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'GET' && !submitted) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(ownerMode, route, scriptNonce));
      return;
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || submitted || Date.now() >= deadline) {
      res.writeHead(403).end();
      return;
    }
    submitted = true;
    try {
      const fields = await readFields(req, ownerMode);
      assert(Date.now() < deadline, 'LOCAL_INPUT_DEADLINE');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
      res.end('Entrada recebida. Consulte o diário de execução.');
      received = true;
      finish(fields);
    } catch {
      res.writeHead(400, { Connection: 'close' }).end('Coleta local interrompida.');
      fail(new Error('LOCAL_INPUT_REJECTED'));
    }
  });
  server.on('error', () => fail(new Error('LOCAL_INPUT_LISTENER')));
  server.listen(0, '127.0.0.1');
  let timer;
  try {
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
    timer = setTimeout(() => fail(new Error('LOCAL_INPUT_DEADLINE')), Math.max(0, deadline - Date.now()));
    onReady(origin + route);
    return await collected;
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
    if (!received) server.closeAllConnections();
  }
}
