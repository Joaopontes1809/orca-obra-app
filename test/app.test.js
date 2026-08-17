const test = require('node:test');
const assert = require('node:assert');
const { createApp, initDb } = require('../app');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

// Estas rotas exigem sessao; o fetch local leva sempre o cookie.
const fetch = fetchComSessao;

test('GET /api/config devolve as chaves de configuração', async () => {
  const pool = stubPool(() => ({
    rows: [
      { key: 'catalogo', value: { services: [], materials: [] } },
      { key: 'empresa', value: { nome: 'Sua Construtora' } }
    ]
  }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/config`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.deepStrictEqual(body.empresa, { nome: 'Sua Construtora' });
    assert.ok(body.catalogo);
  } finally {
    await srv.close();
  }
});

test('GET /api/pedidos devolve a lista', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1, nome_cliente: 'Ana Ferreira' }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].nome_cliente, 'Ana Ferreira');
  } finally {
    await srv.close();
  }
});

test('PATCH /api/pedidos/:id grava os custos extras', async () => {
  const extras = [{ id: 'e1', nome: 'Ajudante — 2 dias', tipo: 'mao_de_obra', valor: 120 }];
  const pool = stubPool(() => ({ rows: [{ id: 3, extras }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos/3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extras })
    });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.ok(update, 'esperava um UPDATE em pedidos');
    assert.match(update.text, /extras = \$1/);
    // extras tem de ir serializado como JSON, tal como itens
    assert.strictEqual(update.values[0], JSON.stringify(extras));
  } finally {
    await srv.close();
  }
});

test('POST /api/pedidos/manual aceita um orcamento ja preenchido', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 9 }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Rui Nunes', telefone: '910222333', morada: 'Praceta Verde 3',
        nome_orcamento: 'Telhado — Rui Nunes', itens: [], extras: []
      })
    });
    assert.strictEqual(r.status, 200);
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    assert.strictEqual(insert.values[0], 'Rui Nunes');
  } finally {
    await srv.close();
  }
});

test('POST /api/pedidos/manual grava os extras, tal como os itens', async () => {
  const extras = [{ id: 'e1', nome: 'Ajudante — 1 dia', tipo: 'mao_de_obra', valor: 80 }];
  const pool = stubPool(() => ({ rows: [{ id: 10, extras }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/pedidos/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Rui Nunes', telefone: '', morada: '',
        nome_orcamento: 'Novo orçamento', itens: [], extras
      })
    });
    assert.strictEqual(r.status, 200);
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    assert.match(insert.text, /extras/);
    assert.strictEqual(insert.values.includes(JSON.stringify(extras)), true, 'os extras tem de ir serializados como JSON, tal como os itens');
  } finally {
    await srv.close();
  }
});

test('initDb cria a coluna extras de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS extras JSONB/);
});
