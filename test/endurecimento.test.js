const test = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../app');
const auth = require('../auth');
const { reiniciar } = require('../limites');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

function servidor() {
  reiniciar();
  return listen(createApp(stubPool(() => ({ rows: [{ id: 1 }] }))));
}

function entrar(url, password) {
  return fetch(url + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
}

/* ---------------- travão nas tentativas ---------------- */

test('ao fim de varias tentativas falhadas o login fecha', async () => {
  const s = await servidor();
  try {
    let ultimo = 0;
    for (let i = 0; i < 12; i++) {
      ultimo = (await entrar(s.url, 'errada-' + i)).status;
    }
    assert.strictEqual(ultimo, 429, 'esperava 429 depois de insistir');
  } finally { await s.close(); }
});

test('a resposta bloqueada diz quanto falta esperar', async () => {
  const s = await servidor();
  try {
    let r;
    for (let i = 0; i < 12; i++) r = await entrar(s.url, 'errada');
    assert.strictEqual(r.status, 429);
    assert.ok(Number(r.headers.get('retry-after')) > 0, 'esperava Retry-After');
  } finally { await s.close(); }
});

test('acertar na password nao gasta tentativas', async () => {
  const s = await servidor();
  try {
    for (let i = 0; i < 5; i++) await entrar(s.url, 'errada');
    const bom = await entrar(s.url, process.env.ADMIN_PASSWORD);
    assert.strictEqual(bom.status, 200, 'a password certa tem de continuar a entrar');
    // e o contador foi limpo, por isso ha folga outra vez
    const depois = await entrar(s.url, 'errada');
    assert.strictEqual(depois.status, 401, 'esperava 401, nao 429');
  } finally { await s.close(); }
});

test('o envio de pedidos tem tecto', async () => {
  const s = await servidor();
  try {
    let ultimo = 0;
    for (let i = 0; i < 14; i++) {
      const r = await fetch(s.url + '/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_cliente: 'Cliente', morada: 'Rua X' })
      });
      ultimo = r.status;
    }
    assert.strictEqual(ultimo, 429, 'o formulario publico tem de ter tecto');
  } finally { await s.close(); }
});

/* ---------------- cabeçalhos ---------------- */

test('as respostas trazem os cabecalhos de seguranca', async () => {
  const s = await servidor();
  try {
    const r = await fetch(s.url + '/');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(r.headers.get('x-frame-options'), 'DENY');
    assert.match(r.headers.get('referrer-policy'), /strict-origin/);
  } finally { await s.close(); }
});

test('a CSP nao permite scripts inline soltos e usa nonce', async () => {
  const s = await servidor();
  try {
    const r = await fetch(s.url + '/');
    const csp = r.headers.get('content-security-policy');
    assert.ok(csp, 'esperava uma CSP');
    assert.match(csp, /script-src [^;]*'nonce-/, 'script-src tem de usar nonce');
    assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'nao pode permitir inline a toda a gente');
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
  } finally { await s.close(); }
});

test('cada pedido traz um nonce diferente, e o HTML traz o mesmo', async () => {
  const s = await servidor();
  try {
    const r1 = await fetch(s.url + '/');
    const html1 = await r1.text();
    const nonce1 = r1.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
    assert.ok(html1.includes('nonce="' + nonce1 + '"'), 'o HTML tem de trazer o nonce do cabecalho');
    assert.ok(!/<script(?![^>]*nonce)/.test(html1), 'nenhum <script> pode ficar sem nonce');

    const r2 = await fetch(s.url + '/');
    const nonce2 = r2.headers.get('content-security-policy').match(/'nonce-([^']+)'/)[1];
    assert.notStrictEqual(nonce1, nonce2, 'o nonce tem de mudar a cada pedido');
  } finally { await s.close(); }
});

test('os caminhos crus das paginas nao servem HTML sem nonce', async () => {
  const s = await servidor();
  try {
    for (const [caminho, destino] of [['/admin.html', '/'], ['/pedido.html', '/pedido']]) {
      const r = await fetch(s.url + caminho, { redirect: 'manual' });
      assert.strictEqual(r.status, 301, caminho + ' devia redirecionar');
      assert.strictEqual(r.headers.get('location'), destino);
    }
  } finally { await s.close(); }
});

/* ---------------- password em hash ---------------- */

test('a password guardada como hash entra, e outra qualquer nao', async () => {
  const guardadas = { texto: process.env.ADMIN_PASSWORD, hash: process.env.ADMIN_PASSWORD_HASH };
  process.env.ADMIN_PASSWORD_HASH = auth.criarHash('a-minha-password');
  delete process.env.ADMIN_PASSWORD;
  const s = await servidor();
  try {
    assert.strictEqual((await entrar(s.url, 'a-minha-password')).status, 200);
    assert.strictEqual((await entrar(s.url, 'a-minha-passworD')).status, 401);
  } finally {
    await s.close();
    process.env.ADMIN_PASSWORD = guardadas.texto;
    if (guardadas.hash) process.env.ADMIN_PASSWORD_HASH = guardadas.hash;
    else delete process.env.ADMIN_PASSWORD_HASH;
  }
});

test('o hash nao deixa recuperar a password', () => {
  const hash = auth.criarHash('segredo-qualquer');
  assert.ok(!hash.includes('segredo-qualquer'), 'a password nao pode aparecer no hash');
  assert.match(hash, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  // sal diferente a cada vez, para dois iguais nao darem o mesmo hash
  assert.notStrictEqual(auth.criarHash('igual'), auth.criarHash('igual'));
});

test('um hash mal formado recusa tudo em vez de deixar passar', () => {
  const guardadas = { texto: process.env.ADMIN_PASSWORD, hash: process.env.ADMIN_PASSWORD_HASH };
  delete process.env.ADMIN_PASSWORD;
  try {
    for (const mau of ['', 'lixo', 'scrypt$$', 'scrypt$zz$zz', 'bcrypt$aa$bb']) {
      process.env.ADMIN_PASSWORD_HASH = mau;
      assert.strictEqual(auth.passwordCorreta('seja-o-que-for'), false, 'hash "' + mau + '" devia recusar');
    }
  } finally {
    process.env.ADMIN_PASSWORD = guardadas.texto;
    if (guardadas.hash) process.env.ADMIN_PASSWORD_HASH = guardadas.hash;
    else delete process.env.ADMIN_PASSWORD_HASH;
  }
});
