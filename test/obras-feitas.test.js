const test = require('node:test');
const assert = require('node:assert');

const { createApp } = require('../app');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

const fetch = fetchComSessao;

test('marcar como concluida grava a data de conclusao', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1, status: 'concluido' }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'concluido' })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.match(update.text, /concluido_em = now\(\)/);
  } finally { await srv.close(); }
});

test('voltar a confirmados limpa a data de conclusao', async () => {
  // sem isto a obra continuava a contar como feita depois de reaberta
  const pool = stubPool(() => ({ rows: [{ id: 1, status: 'confirmado' }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmado' })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.match(update.text, /concluido_em = NULL/);
    assert.match(update.text, /confirmado_em = now\(\)/);
  } finally { await srv.close(); }
});

test('initDb cria a coluna concluido_em de forma idempotente', async () => {
  const { initDb } = require('../app');
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ/);
});

test('o estado concluido nao e aceite em campos que nao sejam status', async () => {
  // concluido_em nao esta na lista de campos editaveis: so o servidor o poe
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluido_em: '1999-01-01', nome_orcamento: 'X' })
    });
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.ok(!update.values.includes('1999-01-01'), 'a data nao pode vir do cliente');
    assert.match(update.text, /nome_orcamento = /);
  } finally { await srv.close(); }
});
