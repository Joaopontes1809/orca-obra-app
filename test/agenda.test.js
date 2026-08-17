const test = require('node:test');
const assert = require('node:assert');
const { createApp, initDb } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

test('initDb cria a tabela agenda de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS agenda/);
  assert.match(sql, /pedido_id\s+INTEGER REFERENCES pedidos\(id\) ON DELETE SET NULL/);
});

test('GET /api/agenda devolve os eventos', async () => {
  const pool = stubPool(() => ({
    rows: [{ id: 1, titulo: 'Visita Ana', data: '2026-08-20', tipo: 'visita', pedidoId: 3, nota: null }]
  }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`);
    assert.strictEqual(r.status, 200);
    const body = await r.json();
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].titulo, 'Visita Ana');
  } finally {
    await srv.close();
  }
});

test('GET /api/agenda devolve pedidoId em camelCase e data como texto', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda`);
    const select = pool.calls.find(c => c.text.includes('FROM agenda'));
    assert.ok(select, 'esperava um SELECT em agenda');
    // o frontend le ev.pedidoId e trata ev.data como 'YYYY-MM-DD'
    assert.match(select.text, /pedido_id AS "pedidoId"/);
    assert.match(select.text, /to_char\(data, 'YYYY-MM-DD'\) AS data/);
    assert.match(select.text, /ORDER BY data ASC/);
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda cria um evento', async () => {
  const criado = { id: 5, titulo: 'Visita Pedro', data: '2026-08-25', tipo: 'visita', pedidoId: null, nota: null };
  const pool = stubPool(() => ({ rows: [criado] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Visita Pedro', data: '2026-08-25', tipo: 'visita' })
    });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), criado);
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO agenda'));
    assert.deepStrictEqual(insert.values, ['Visita Pedro', '2026-08-25', 'visita', null, null]);
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda recusa evento sem titulo', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: '2026-08-25' })
    });
    assert.strictEqual(r.status, 400);
    assert.ok(!pool.calls.some(c => c.text.includes('INSERT INTO agenda')));
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda recusa evento sem data', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Sem data' })
    });
    assert.strictEqual(r.status, 400);
  } finally {
    await srv.close();
  }
});

test('POST /api/agenda assume tipo "outro" por omissao', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 6 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Obra', data: '2026-09-01' })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO agenda'));
    assert.strictEqual(insert.values[2], 'outro');
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id atualiza so os campos enviados', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5, titulo: 'Visita adiada', data: '2026-08-27' }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Visita adiada', data: '2026-08-27' })
    });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.match(update.text, /titulo = \$1/);
    assert.match(update.text, /data = \$2/);
    assert.ok(!update.text.includes('tipo ='), 'tipo nao foi enviado, nao deve ser tocado');
    assert.deepStrictEqual(update.values, ['Visita adiada', '2026-08-27', '5']);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id mapeia pedidoId para a coluna pedido_id', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: 7 })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.match(update.text, /pedido_id = \$1/);
    assert.strictEqual(update.values[0], 7);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id converte pedidoId vazio em null', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 5 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/agenda/5`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedidoId: '' })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE agenda'));
    assert.strictEqual(update.values[0], null);
  } finally {
    await srv.close();
  }
});

test('PATCH /api/agenda/:id devolve 404 se o evento nao existir', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/999`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo: 'Nao existe' })
    });
    assert.strictEqual(r.status, 404);
  } finally {
    await srv.close();
  }
});

test('DELETE /api/agenda/:id apaga o evento', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetch(`${srv.url}/api/agenda/5`, { method: 'DELETE' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(await r.json(), { ok: true });
    const del = pool.calls.find(c => c.text.includes('DELETE FROM agenda'));
    assert.deepStrictEqual(del.values, ['5']);
  } finally {
    await srv.close();
  }
});
