const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createApp, DEFAULT_CATALOG } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

// shared.js corre no browser; carregamo-lo aqui para testar as contas.
const contexto = { window: {}, document: {}, fetch: async () => ({}) };
vm.createContext(contexto);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'shared.js'), 'utf8'), contexto);
const { calcItem, calcTotals } = contexto;

test('a mao de obra sai do valor por unidade do material', () => {
  // 22 m2 de porcelanato: material 15/m2, mao de obra 22/m2
  const c = calcItem({ quantity: 22, unitPrice: 15, laborUnitPrice: 22 });
  assert.strictEqual(c.materialCost, 330);
  assert.strictEqual(c.laborCost, 484);
  assert.strictEqual(c.total, 814);
});

test('sem valor por unidade, recua para a percentagem do servico', () => {
  // itens antigos, e itens sem material escolhido, so tem laborPercent
  const c = calcItem({ quantity: 22, unitPrice: 15, laborPercent: 90 });
  assert.strictEqual(c.materialCost, 330);
  assert.strictEqual(c.laborCost, 297);
  assert.strictEqual(c.total, 627);
});

test('mao de obra a zero e diferente de mao de obra por definir', () => {
  // zero quer mesmo dizer zero, e nao "usa a percentagem"
  const zero = calcItem({ quantity: 10, unitPrice: 5, laborUnitPrice: 0, laborPercent: 90 });
  assert.strictEqual(zero.laborCost, 0);
  assert.strictEqual(zero.total, 50);

  const porDefinir = calcItem({ quantity: 10, unitPrice: 5, laborUnitPrice: null, laborPercent: 90 });
  assert.strictEqual(porDefinir.laborCost, 45);
});

test('o valor por unidade ganha a percentagem quando ambos existem', () => {
  const c = calcItem({ quantity: 2, unitPrice: 100, laborUnitPrice: 10, laborPercent: 500 });
  assert.strictEqual(c.laborCost, 20, 'devia usar 2 x 10, nao 500% de 200');
});

test('valores em falta ou disparatados nao produzem NaN', () => {
  for (const it of [{}, { quantity: 'abc', unitPrice: 'x' }, { quantity: null }, null]) {
    const c = calcItem(it);
    assert.ok(Number.isFinite(c.total), 'total tem de ser um numero: ' + JSON.stringify(it));
    assert.ok(Number.isFinite(c.materialCost));
    assert.ok(Number.isFinite(c.laborCost));
  }
});

test('calcTotals soma material e mao de obra em separado', () => {
  const t = calcTotals([
    { quantity: 22, unitPrice: 15, laborUnitPrice: 22 },
    { quantity: 10, unitPrice: 3, laborUnitPrice: 7.5 }
  ]);
  assert.strictEqual(t.material, 330 + 30);
  assert.strictEqual(t.labor, 484 + 75);
  assert.strictEqual(t.total, t.material + t.labor);
});

test('o catalogo por omissao traz mao de obra em todos os materiais', () => {
  for (const m of DEFAULT_CATALOG.materials) {
    assert.ok(typeof m.laborPrice === 'number' && m.laborPrice > 0,
      m.name + ' devia ter laborPrice');
  }
});

test('o servidor guarda o valor de mao de obra do item', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [{ id: 'a', quantity: 22, unitPrice: 15, laborUnitPrice: 22 }]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardado = JSON.parse(insert.values[8])[0];
    assert.strictEqual(guardado.laborUnitPrice, 22);
  } finally { await srv.close(); }
});

test('o servidor distingue mao de obra ausente de mao de obra a zero', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [
          { id: 'sem', quantity: 1, unitPrice: 10, laborPercent: 50 },
          { id: 'zero', quantity: 1, unitPrice: 10, laborUnitPrice: 0 }
        ]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardados = JSON.parse(insert.values[8]);
    assert.strictEqual(guardados[0].laborUnitPrice, null, 'ausente tem de ficar null');
    assert.strictEqual(guardados[1].laborUnitPrice, 0, 'zero tem de ficar zero');
  } finally { await srv.close(); }
});
