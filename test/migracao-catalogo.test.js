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

test('a mao de obra dos materiais sobe para o servico, pela media', async () => {
  // modelo intermedio: cada material tinha o seu valor de mao de obra
  const catalogo = {
    services: [{ id: 's-piso', name: 'Pavimento', unit: 'm²' }],
    materials: [
      { id: 'm-porc', serviceId: 's-piso', price: 15, laborPrice: 13.5 },
      { id: 'm-ceram', serviceId: 's-piso', price: 8, laborPrice: 7.2 }
    ]
  };
  const { pool, estado } = poolCom(catalogo);

  await initDb(pool);
  assert.ok(estado.guardado, 'esperava o catalogo ser gravado');
  // (13,50 + 7,20) / 2 = 10,35
  assert.strictEqual(estado.guardado.services[0].laborPrice, 10.35);
  // e os materiais deixam de a ter
  estado.guardado.materials.forEach(m =>
    assert.strictEqual(m.laborPrice, undefined, 'o material nao pode guardar mao de obra'));
});

test('sem valores nos materiais, usa a percentagem antiga do servico', async () => {
  // modelo mais antigo ainda: percentagem no servico, nada nos materiais
  const catalogo = {
    services: [{ id: 's-piso', name: 'Pavimento', laborPercent: 90, unit: 'm²' }],
    materials: [{ id: 'm-porc', serviceId: 's-piso', price: 20 }]
  };
  const { pool, estado } = poolCom(catalogo);

  await initDb(pool);
  // 90% de 20 = 18
  assert.strictEqual(estado.guardado.services[0].laborPrice, 18);
  assert.strictEqual(estado.guardado.services[0].laborPercent, undefined, 'a percentagem tem de sair');
});

test('a conversao nao se repete numa segunda passagem', async () => {
  const catalogo = {
    services: [{ id: 's-piso', laborPercent: 90 }],
    materials: [{ id: 'm-porc', serviceId: 's-piso', price: 15, laborPrice: 13.5 }]
  };
  const { pool, estado } = poolCom(catalogo);

  await initDb(pool);
  assert.ok(estado.guardado, 'a primeira passagem devia gravar');
  estado.guardado = null;
  await initDb(pool);
  assert.strictEqual(estado.guardado, null, 'a segunda nao pode voltar a gravar');
});

test('nao mexe em servicos que ja tenham o valor definido', async () => {
  const catalogo = {
    services: [
      { id: 'a', laborPrice: 25 },
      { id: 'b', laborPercent: 50 }
    ],
    materials: [{ id: 'm', serviceId: 'b', price: 10 }]
  };
  const { pool, estado } = poolCom(catalogo);
  await initDb(pool);
  assert.strictEqual(estado.guardado.services[0].laborPrice, 25, 'o valor escrito a mao fica intacto');
  assert.strictEqual(estado.guardado.services[1].laborPrice, 5, '50% de 10');
});

test('aguenta um servico sem materiais nenhuns', async () => {
  const catalogo = {
    services: [{ id: 'orfao', laborPercent: 80 }],
    materials: []
  };
  const { pool, estado } = poolCom(catalogo);
  await initDb(pool);
  assert.strictEqual(estado.guardado.services[0].laborPrice, 0, 'sem materiais, fica a zero');
});

test('aguenta um catalogo vazio ou mal formado sem rebentar', async () => {
  for (const catalogo of [{}, { materials: [] }, { services: [], materials: [] }]) {
    const { pool, estado } = poolCom(catalogo);
    await initDb(pool);
    assert.strictEqual(estado.guardado, null, 'nada para converter, nada a gravar');
  }
});
