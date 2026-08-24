const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { createApp, initDb } = require('../app');
const { stubPool, listen, fetchComSessao } = require('./helpers/harness');

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

// As contas do painel vivem dentro do <script> da página. Em vez de montar o
// DOM inteiro, extraímos as funções do dinheiro e corremo-las directamente:
// é aqui que um erro custa dinheiro de verdade.
function contas() {
  const corpo = ADMIN.match(/function calcExtras\(p\)\{[\s\S]*?function calcFalta\(p\)\{[\s\S]*?\n\}/)[0];
  const calcTotals = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'shared.js'), 'utf8');
  // eslint-disable-next-line no-new-func
  return new Function(calcTotals + '\n' + corpo + '\nreturn { calcDespesas, calcNaMao, calcPago, calcExtras, calcFalta };')();
}

test('a despesa desconta do dinheiro que ja entrou', () => {
  const { calcDespesas, calcNaMao } = contas();
  const p = {
    pagamentos: [{ valor: 1000 }],
    despesas: [{ valor: 250 }, { valor: 100 }]
  };
  assert.strictEqual(calcDespesas(p), 350);
  assert.strictEqual(calcNaMao(p), 650);
});

test('sem nada recebido, o que esta na mao fica negativo', () => {
  const { calcNaMao } = contas();
  const p = { pagamentos: [], despesas: [{ valor: 80 }, { valor: 45.5 }] };
  assert.strictEqual(calcNaMao(p), -125.5);
});

test('a despesa nao mexe no que o cliente tem a pagar', () => {
  const { calcFalta, calcExtras } = contas();
  // 100 de material, 100 de mão de obra, 50 de custo adicional, 0 recebido
  const p = {
    itens: [{ quantity: 10, unitPrice: 10, laborUnitPrice: 10 }],
    extras: [{ valor: 50 }],
    despesas: [{ valor: 400 }],
    pagamentos: []
  };
  assert.strictEqual(calcExtras(p), 50);
  assert.strictEqual(calcFalta(p), 250, 'a despesa nao pode aumentar a divida do cliente');
});

test('valores estragados nas despesas contam como zero', () => {
  const { calcDespesas } = contas();
  const p = { despesas: [{ valor: 'muito' }, { valor: null }, { valor: '12,5' }, { valor: 30 }] };
  // '12,5' é lido como 12 pelo parseFloat; o que interessa é não dar NaN
  assert.ok(Number.isFinite(calcDespesas(p)));
  assert.strictEqual(calcDespesas(p), 42);
});

test('o painel guarda e devolve as despesas', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1, despesas: [{ nome: 'Tinta', valor: 40 }] }] }));
  const srv = await listen(createApp(pool));
  try {
    const r = await fetchComSessao(`${srv.url}/api/pedidos/1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ despesas: [{ nome: 'Tinta', valor: 40 }] })
    });
    assert.strictEqual(r.status, 200);
    const update = pool.calls.find(c => c.text.includes('UPDATE pedidos'));
    assert.match(update.text, /despesas = \$\d/);
    assert.strictEqual(typeof update.values[0], 'string', 'a lista vai como JSON, não como objecto solto');
    assert.deepStrictEqual(JSON.parse(update.values[0]), [{ nome: 'Tinta', valor: 40 }]);
  } finally { await srv.close(); }
});

test('initDb cria a coluna das despesas de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [] }));
  await initDb(pool);
  const criacao = pool.calls.find(c => c.text.includes('ADD COLUMN IF NOT EXISTS despesas'));
  assert.ok(criacao, 'a coluna tem de ser criada em bases antigas');
});

test('o painel mostra as despesas e o que fica na mao', () => {
  assert.match(ADMIN, /id="ed-despesas"/);
  assert.match(ADMIN, /id="ed-add-despesa"/);
  assert.match(ADMIN, /id="ed-tot-despesas"/);
  assert.match(ADMIN, /id="ed-tot-mao-cheia"/);
  // o valor negativo tem de se ver como negativo
  assert.match(ADMIN, /classList\.toggle\('negativo', naMao < 0\)/);
});
