const test = require('node:test');
const assert = require('node:assert');

const { initDb } = require('../app');
const { stubPool } = require('./helpers/harness');

// Devolve um pool falso que responde como uma base de dados que já tem o
// catálogo `catalogo` gravado, e guarda o que for escrito por cima.
function poolCom(catalogo) {
  const estado = { guardado: null };
  const pool = stubPool((texto, valores) => {
    if (texto.includes('SELECT value FROM config')) return { rows: [{ value: catalogo }] };
    if (texto.includes('UPDATE config SET value')) { estado.guardado = valores[0]; return { rows: [] }; }
    if (texto.includes('SELECT 1 FROM config')) return { rows: [{ um: 1 }] };
    return { rows: [] };
  });
  return { pool, estado };
}

test('converte a mao de obra dos catalogos antigos, e a conta nao muda', async () => {
  const antigo = {
    services: [{ id: 's-piso', name: 'Pavimento', laborPercent: 90, unit: 'm²' }],
    materials: [{ id: 'm-porc', name: 'Porcelânico', serviceId: 's-piso', unit: 'm²', price: 15 }]
  };
  const { pool, estado } = poolCom(antigo);

  await initDb(pool);
  assert.ok(estado.guardado, 'esperava o catalogo ser gravado');
  // 15 EUR/m2 a 90% da 13,50 EUR/m2 — quem ja usava nao ve o valor mudar
  assert.strictEqual(estado.guardado.materials[0].laborPrice, 13.5);
});

test('a conversao nao se repete numa segunda passagem', async () => {
  const antigo = {
    services: [{ id: 's-piso', laborPercent: 90 }],
    materials: [{ id: 'm-porc', serviceId: 's-piso', price: 15 }]
  };
  const { pool, estado } = poolCom(antigo);

  await initDb(pool);
  assert.ok(estado.guardado, 'a primeira passagem devia gravar');
  estado.guardado = null;
  await initDb(pool);
  assert.strictEqual(estado.guardado, null, 'a segunda nao pode voltar a gravar');
});

test('nao mexe em materiais que ja tenham mao de obra', async () => {
  const catalogo = {
    services: [{ id: 's-piso', laborPercent: 90 }],
    materials: [
      { id: 'a', serviceId: 's-piso', price: 15, laborPrice: 22 },
      { id: 'b', serviceId: 's-piso', price: 10 }
    ]
  };
  const { pool, estado } = poolCom(catalogo);
  await initDb(pool);
  assert.strictEqual(estado.guardado.materials[0].laborPrice, 22, 'o valor escrito a mao fica intacto');
  assert.strictEqual(estado.guardado.materials[1].laborPrice, 9, 'o que faltava e preenchido');
});

test('aguenta um material sem servico correspondente', async () => {
  const catalogo = {
    services: [],
    materials: [{ id: 'orfao', serviceId: 's-que-nao-existe', price: 30 }]
  };
  const { pool, estado } = poolCom(catalogo);
  await initDb(pool);
  assert.strictEqual(estado.guardado.materials[0].laborPrice, 0, 'sem servico, mao de obra fica a zero');
});

test('aguenta um catalogo vazio ou mal formado sem rebentar', async () => {
  for (const catalogo of [{}, { materials: [] }, { services: [], materials: [] }]) {
    const { pool, estado } = poolCom(catalogo);
    await initDb(pool);
    assert.strictEqual(estado.guardado, null, 'nada para converter, nada a gravar');
  }
});
