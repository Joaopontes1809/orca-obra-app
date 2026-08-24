const test = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../app');
const { novoToken, assinaturaValida, LIMITE_ASSINATURA } = require('../contrato');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

// Uma assinatura mínima mas com o formato certo: prefixo de PNG e base64 real.
const ASSINATURA = 'data:image/png;base64,' + 'A'.repeat(200);

function jsonPost(url, corpo) {
  return globalThis.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
}

test('o codigo do contrato e longo e diferente de cada vez', () => {
  const a = novoToken();
  const b = novoToken();
  assert.notStrictEqual(a, b);
  assert.ok(a.length >= 32, 'codigo curto demais para nao ser adivinhado');
  assert.match(a, /^[A-Za-z0-9_-]+$/);
});

test('so aceita assinaturas que sejam mesmo um PNG', () => {
  assert.ok(assinaturaValida(ASSINATURA));
  assert.ok(!assinaturaValida(''));
  assert.ok(!assinaturaValida(null));
  assert.ok(!assinaturaValida('data:text/html;base64,' + 'A'.repeat(200)));
  assert.ok(!assinaturaValida('data:image/png;base64,<script>'));
  assert.ok(!assinaturaValida('data:image/png;base64,AAAA'), 'curta demais para ser um desenho');
  assert.ok(!assinaturaValida('data:image/png;base64,' + 'A'.repeat(LIMITE_ASSINATURA)));
});

test('gerar o contrato guarda um codigo e devolve o caminho', async () => {
  const pool = stubPool(text => {
    if (text.includes('SELECT contrato_token')) return { rows: [{ contrato_token: null }] };
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await fetchComSessao(`${srv.url}/api/pedidos/7/contrato`, { method: 'POST' });
    const corpo = await r.json();
    assert.strictEqual(r.status, 200);
    assert.ok(corpo.token);
    assert.strictEqual(corpo.caminho, '/contrato/' + corpo.token);
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos SET contrato_token'));
    assert.ok(update, 'o codigo tem de ficar gravado');
  } finally { await srv.close(); }
});

test('voltar a gerar devolve o mesmo codigo, para o link enviado nao morrer', async () => {
  const pool = stubPool(text => {
    if (text.includes('SELECT contrato_token')) return { rows: [{ contrato_token: 'codigo-ja-existente' }] };
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await fetchComSessao(`${srv.url}/api/pedidos/7/contrato`, { method: 'POST' });
    const corpo = await r.json();
    assert.strictEqual(corpo.token, 'codigo-ja-existente');
    assert.ok(!pool.calls.some(c => c.text.includes('UPDATE pedidos SET contrato_token')));
  } finally { await srv.close(); }
});

test('gerar o contrato exige sessao', async () => {
  const pool = stubPool(() => ({ rows: [{ contrato_token: null }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/api/pedidos/7/contrato`, { method: 'POST' });
    assert.strictEqual(r.status, 401);
  } finally { await srv.close(); }
});

test('o cliente ve o contrato pelo codigo, sem sessao', async () => {
  const pool = stubPool(text => {
    if (text.includes('FROM pedidos WHERE contrato_token')) {
      return { rows: [{ nome_cliente: 'Ana', telefone: '912345678', morada: 'Rua A', itens: [], contrato: null }] };
    }
    if (text.includes('FROM config')) {
      return { rows: [{ key: 'empresa', value: { nome: 'Krona' } }, { key: 'contrato', value: { titulo: 'Contrato' } }] };
    }
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/api/contrato/abc`);
    const corpo = await r.json();
    assert.strictEqual(r.status, 200);
    assert.strictEqual(corpo.cliente, 'Ana');
    assert.strictEqual(corpo.empresa, 'Krona');
    assert.strictEqual(corpo.modelo.titulo, 'Contrato');
    assert.strictEqual(corpo.assinado, false);
  } finally { await srv.close(); }
});

test('nao expoe as notas internas nem os custos extra ao cliente', async () => {
  const pool = stubPool(text => {
    if (text.includes('FROM pedidos WHERE contrato_token')) {
      return { rows: [{ nome_cliente: 'Ana', itens: [], contrato: null }] };
    }
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/api/contrato/abc`);
    const corpo = await r.json();
    assert.ok(!('observacoes_internas' in corpo));
    assert.ok(!('custos_extra' in corpo));
    // e a consulta nem sequer as vai buscar
    const consulta = pool.calls.find(c => c.text.includes('FROM pedidos WHERE contrato_token'));
    assert.ok(!/observacoes_internas|custos_extra/.test(consulta.text));
  } finally { await srv.close(); }
});

test('um codigo desconhecido da 404', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/api/contrato/nao-existe`);
    assert.strictEqual(r.status, 404);
  } finally { await srv.close(); }
});

test('assinar grava o nome, a data e o texto que estava na altura', async () => {
  const pool = stubPool(text => {
    if (text.includes('SELECT id, itens, contrato')) {
      return { rows: [{ id: 3, itens: [{ desc: 'Pintura' }], contrato: null }] };
    }
    if (text.includes("key = 'contrato'")) {
      return { rows: [{ value: { titulo: 'Contrato', clausulas: [] } }] };
    }
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await jsonPost(`${srv.url}/api/contrato/abc/assinar`, { nome: 'Ana Silva', assinatura: ASSINATURA });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos SET contrato'));
    const registo = update.values[0];
    assert.strictEqual(registo.nome, 'Ana Silva');
    assert.ok(registo.assinadoEm);
    assert.deepStrictEqual(registo.modeloAssinado, { titulo: 'Contrato', clausulas: [] });
    assert.deepStrictEqual(registo.itensAssinados, [{ desc: 'Pintura' }]);
  } finally { await srv.close(); }
});

test('nao deixa assinar duas vezes', async () => {
  const pool = stubPool(text => {
    if (text.includes('SELECT id, itens, contrato')) {
      return { rows: [{ id: 3, itens: [], contrato: { assinadoEm: '2026-01-01T00:00:00.000Z' } }] };
    }
    return { rows: [] };
  });
  const srv = await listen(createApp(pool));
  try {
    const r = await jsonPost(`${srv.url}/api/contrato/abc/assinar`, { nome: 'Outro', assinatura: ASSINATURA });
    assert.strictEqual(r.status, 409);
    assert.ok(!pool.calls.some(c => c.text.includes('UPDATE pedidos SET contrato')));
  } finally { await srv.close(); }
});

test('recusa assinar sem nome ou sem desenho', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 3, itens: [], contrato: null }] }));
  const srv = await listen(createApp(pool));
  try {
    const semNome = await jsonPost(`${srv.url}/api/contrato/abc/assinar`, { nome: '  ', assinatura: ASSINATURA });
    assert.strictEqual(semNome.status, 400);
    const semDesenho = await jsonPost(`${srv.url}/api/contrato/abc/assinar`, { nome: 'Ana', assinatura: 'xpto' });
    assert.strictEqual(semDesenho.status, 400);
    assert.ok(!pool.calls.some(c => c.text.includes('UPDATE pedidos SET contrato')));
  } finally { await srv.close(); }
});

test('a pagina crua do contrato nao e servida sem nonce', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/contrato.html`, { redirect: 'manual' });
    assert.strictEqual(r.status, 404);
  } finally { await srv.close(); }
});

test('a pagina do contrato vai com nonce e com politica de seguranca', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await globalThis.fetch(`${srv.url}/contrato/qualquer-codigo`);
    const html = await r.text();
    assert.strictEqual(r.status, 200);
    assert.match(html, /<script nonce="/);
    const politica = r.headers.get('content-security-policy');
    assert.ok(politica && politica.includes('nonce-'));
    assert.ok(!politica.includes('unsafe-inline'));
  } finally { await srv.close(); }
});
