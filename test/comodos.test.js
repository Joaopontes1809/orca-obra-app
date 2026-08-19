const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { createApp, initDb } = require('../app');
const { stubPool, listen } = require('./helpers/harness');

const PUBLICO = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLICO, 'pedido.html'), 'utf8')
  .replace(/<script src="\/([^"]+)"><\/script>/g, (o, f) => {
    const p = path.join(PUBLICO, f);
    return fs.existsSync(p) ? '<script>' + fs.readFileSync(p, 'utf8') + '</script>' : o;
  });

const CONFIG = {
  catalogo: {
    services: [
      { id: 's-piso', name: 'Pavimento', laborPrice: 12, unit: 'm²' },
      { id: 's-pintura', name: 'Pintura', laborPrice: 7.5, unit: 'm²' }
    ],
    materials: [
      { id: 'm-porc', name: 'Porcelânico', serviceId: 's-piso', unit: 'm²', price: 15 },
      { id: 'm-tinta', name: 'Tinta', serviceId: 's-pintura', unit: 'm²', price: 3 }
    ]
  },
  empresa: { nome: 'Krona' }
};

function carregar() {
  return new Promise(resolve => {
    const dom = new JSDOM(HTML, {
      runScripts: 'dangerously',
      url: 'http://localhost/',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.fetch = async (url) => {
          if (url === '/api/config') return { ok: true, json: async () => CONFIG };
          return { ok: false, status: 404, json: async () => ({}) };
        };
      }
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 80));
  });
}

// Escolhe divisão + serviço + quantidade e carrega em Adicionar.
function acrescentar(d, { comodo, servicoId, quantidade, outro }) {
  const selComodo = d.getElementById('f-comodo');
  selComodo.value = comodo;
  selComodo.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));
  if (outro !== undefined) d.getElementById('f-outro-comodo').value = outro;

  const selServico = d.getElementById('f-servico');
  selServico.value = servicoId;
  selServico.dispatchEvent(new d.defaultView.Event('change', { bubbles: true }));

  d.getElementById('f-qty').value = String(quantidade);
  d.getElementById('btn-add-item').click();
}

test('a caixa da IA saiu do formulario', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  assert.strictEqual(d.getElementById('ai-texto'), null);
  assert.strictEqual(d.getElementById('btn-ai-analisar'), null);
  dom.window.close();
});

test('a divisao e um menu, ao lado do tipo de trabalho', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const sel = d.getElementById('f-comodo');
  assert.ok(sel, 'esperava o menu das divisoes');
  assert.strictEqual(sel.tagName, 'SELECT', 'tem de ser um menu, como o do tipo de trabalho');

  const opcoes = [...sel.options].map(o => o.textContent.trim());
  for (const esperada of ['Sala', 'Cozinha', 'Casa de banho', 'Outro']) {
    assert.ok(opcoes.includes(esperada), 'esperava ' + esperada);
  }
  dom.window.close();
});

test('cada trabalho leva a sua divisao, e podem ser varias', async () => {
  // é este o ponto do modelo: pavimento na cozinha e pintura na casa de banho
  // no mesmo pedido, cada um com a sua divisão
  const dom = await carregar();
  const d = dom.window.document;

  acrescentar(d, { comodo: 'Cozinha', servicoId: 's-piso', quantidade: 10 });
  acrescentar(d, { comodo: 'Casa de banho', servicoId: 's-pintura', quantidade: 8 });

  const linhas = [...d.querySelectorAll('#f-items .item')];
  assert.strictEqual(linhas.length, 2, 'esperava dois trabalhos na lista');

  const etiquetas = [...d.querySelectorAll('#f-items .etiqueta-comodo')].map(e => e.textContent.trim());
  assert.deepStrictEqual(etiquetas, ['Cozinha', 'Casa de banho']);
  dom.window.close();
});

test('"Outro" abre um campo, e o que se escreve fica na divisao do item', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const campo = d.getElementById('campo-outro-comodo');

  assert.ok(campo.classList.contains('hidden'), 'o campo comeca escondido');

  acrescentar(d, { comodo: 'Outro', servicoId: 's-piso', quantidade: 5, outro: 'Despensa' });

  assert.ok(!campo.classList.contains('hidden'), 'escolher Outro tem de abrir o campo');
  const etiqueta = d.querySelector('#f-items .etiqueta-comodo');
  assert.ok(etiqueta, 'esperava o trabalho na lista');
  assert.strictEqual(etiqueta.textContent.trim(), 'Despensa', 'o texto escrito vira a divisao do item');
  dom.window.close();
});

test('sair de "Outro" esconde e limpa o campo', async () => {
  const dom = await carregar();
  const d = dom.window.document;
  const sel = d.getElementById('f-comodo');

  sel.value = 'Outro';
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.getElementById('f-outro-comodo').value = 'Sótão';

  sel.value = 'Sala';
  sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

  assert.ok(d.getElementById('campo-outro-comodo').classList.contains('hidden'));
  assert.strictEqual(d.getElementById('f-outro-comodo').value, '', 'o campo tem de ser limpo');
  dom.window.close();
});

/* ---------------- servidor ---------------- */

test('o servidor guarda a divisao de cada item', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [
          { id: 'a', quantity: 10, unitPrice: 15, comodo: 'Cozinha' },
          { id: 'b', quantity: 8, unitPrice: 3, comodo: 'Casa de banho' }
        ],
        comodos: ['Cozinha', 'Casa de banho']
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const itens = JSON.parse(insert.values[8]);
    assert.strictEqual(itens[0].comodo, 'Cozinha');
    assert.strictEqual(itens[1].comodo, 'Casa de banho');
    assert.deepStrictEqual(JSON.parse(insert.values[9]), ['Cozinha', 'Casa de banho']);
  } finally { await srv.close(); }
});

test('a divisao do item tambem e saneada: vem de fora', async () => {
  const pool = stubPool(() => ({ rows: [{ id: 1 }] }));
  const srv = await listen(createApp(pool));
  try {
    await fetch(`${srv.url}/api/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_cliente: 'Cliente', morada: 'Rua X',
        itens: [{ id: 'a', quantity: 1, comodo: '<img src=x onerror=alert(1)>' + 'y'.repeat(500) }]
      })
    });
    const insert = pool.calls.find(c => c.text.includes('INSERT INTO pedidos'));
    const guardado = JSON.parse(insert.values[8])[0];
    assert.ok(guardado.comodo.length <= 60, 'o nome da divisao tem de ser cortado');
  } finally { await srv.close(); }
});

test('initDb cria a coluna comodos de forma idempotente', async () => {
  const pool = stubPool(() => ({ rows: [{ ok: 1 }] }));
  await initDb(pool);
  const sql = pool.calls.map(c => c.text).join('\n');
  assert.match(sql, /ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comodos JSONB/);
});
