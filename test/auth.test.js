const test = require('node:test');
const assert = require('node:assert');

process.env.ADMIN_PASSWORD = 'password-de-teste';

const { createApp } = require('../app');
const auth = require('../auth');
const { stubPool, listen } = require('./helpers/harness');

function servidor() {
  return listen(createApp(stubPool(() => ({ rows: [] }))));
}

// Extrai o valor do cookie de sessão de um cabeçalho Set-Cookie.
function cookieDe(resposta) {
  const bruto = resposta.headers.get('set-cookie') || '';
  const m = bruto.match(new RegExp(auth.NOME_COOKIE + '=([^;]*)'));
  return m ? auth.NOME_COOKIE + '=' + m[1] : null;
}

async function entrar(url, password) {
  return fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
}

test('sem sessao, as rotas do painel respondem 401', async () => {
  const s = await servidor();
  try {
    for (const [metodo, caminho] of [
      ['GET', '/api/pedidos'],
      ['GET', '/api/agenda'],
      ['POST', '/api/pedidos/manual'],
      ['PATCH', '/api/pedidos/1'],
      ['DELETE', '/api/pedidos/1'],
      ['PUT', '/api/config/empresa'],
      ['POST', '/api/ai/assist-admin']
    ]) {
      const r = await fetch(s.url + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: metodo === 'GET' || metodo === 'DELETE' ? undefined : '{}'
      });
      assert.strictEqual(r.status, 401, `${metodo} ${caminho} devia ser 401`);
    }
  } finally { await s.close(); }
});

test('as rotas do formulario do cliente continuam abertas', async () => {
  const s = await servidor();
  try {
    // o cliente precisa do catalogo e de conseguir enviar o pedido
    const cfg = await fetch(s.url + '/api/config');
    assert.notStrictEqual(cfg.status, 401);

    const envio = await fetch(s.url + '/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome_cliente: 'Cliente', morada: 'Rua' })
    });
    assert.notStrictEqual(envio.status, 401);
  } finally { await s.close(); }
});

test('a pagina do cliente e os ficheiros estaticos nao exigem sessao', async () => {
  const s = await servidor();
  try {
    const p = await fetch(s.url + '/pedido');
    assert.strictEqual(p.status, 200);
    const css = await fetch(s.url + '/css/tokens.css');
    assert.strictEqual(css.status, 200);
  } finally { await s.close(); }
});

test('login com password errada devolve 401 e nao da cookie', async () => {
  const s = await servidor();
  try {
    const r = await entrar(s.url, 'password-errada');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(cookieDe(r), null);
  } finally { await s.close(); }
});

test('login com a password certa da uma sessao que abre o painel', async () => {
  const s = await servidor();
  try {
    const r = await entrar(s.url, 'password-de-teste');
    assert.strictEqual(r.status, 200);
    const cookie = cookieDe(r);
    assert.ok(cookie, 'esperava um cookie de sessao');

    const bruto = r.headers.get('set-cookie');
    assert.match(bruto, /HttpOnly/, 'o cookie tem de ser HttpOnly');
    assert.match(bruto, /SameSite=Lax/);

    const painel = await fetch(s.url + '/api/pedidos', { headers: { cookie } });
    assert.strictEqual(painel.status, 200);
  } finally { await s.close(); }
});

test('um cookie adulterado nao abre o painel', async () => {
  const s = await servidor();
  try {
    const r = await entrar(s.url, 'password-de-teste');
    const cookie = cookieDe(r);
    // mexer num caracter da assinatura tem de chegar para invalidar
    const partido = cookie.slice(0, -1) + (cookie.slice(-1) === 'A' ? 'B' : 'A');
    const painel = await fetch(s.url + '/api/pedidos', { headers: { cookie: partido } });
    assert.strictEqual(painel.status, 401);
  } finally { await s.close(); }
});

test('uma sessao expirada nao abre o painel', async () => {
  const s = await servidor();
  try {
    const expirada = auth.criarSessao().replace(/^\d+/, String(Date.now() - 1000));
    const painel = await fetch(s.url + '/api/pedidos', {
      headers: { cookie: auth.NOME_COOKIE + '=' + expirada }
    });
    assert.strictEqual(painel.status, 401);
  } finally { await s.close(); }
});

test('sair apaga o cookie', async () => {
  const s = await servidor();
  try {
    const r = await fetch(s.url + '/api/logout', { method: 'POST' });
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  } finally { await s.close(); }
});

test('GET /api/sessao diz se ha sessao', async () => {
  const s = await servidor();
  try {
    const fora = await (await fetch(s.url + '/api/sessao')).json();
    assert.strictEqual(fora.autenticado, false);
    assert.strictEqual(fora.configurado, true);

    const cookie = cookieDe(await entrar(s.url, 'password-de-teste'));
    const dentro = await (await fetch(s.url + '/api/sessao', { headers: { cookie } })).json();
    assert.strictEqual(dentro.autenticado, true);
  } finally { await s.close(); }
});

test('sem ADMIN_PASSWORD configurada nao se entra', async () => {
  const guardada = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  const s = await servidor();
  try {
    const r = await entrar(s.url, 'seja-o-que-for');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(auth.passwordCorreta(''), false);
  } finally {
    await s.close();
    process.env.ADMIN_PASSWORD = guardada;
  }
});
